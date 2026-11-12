import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/* Photos and voice notes on a note (clients, projects, requests). The browser uploads each file to Convex storage first, then sends
   the storage ids with the note. Here the files are checked again (type and size) and stored on the note as a small list. */

export const noteFilesArg = v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() })));

export type NoteAttachment = { storageId: Id<"_storage">; kind: "image" | "audio"; name: string; contentType: string; size: number };


export const MAX_NOTE_FILES = 10;
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_AUDIO = 25 * 1024 * 1024;

/** Looks at what was really uploaded. Anything that is not an image or audio, or is too big, is refused. (A refused upload cannot be
 *  deleted here: the error undoes the whole call, so a refused file stays in storage unreferenced.) */
export async function checkNoteFiles(ctx: MutationCtx, files: { storageId: Id<"_storage">; name: string }[] | undefined): Promise<NoteAttachment[]> {
  const list = files ?? [];
  if (list.length > MAX_NOTE_FILES) {
    throw new ConvexError(`A note can have up to ${MAX_NOTE_FILES} files.`);
  }
  const out: NoteAttachment[] = [];
  for (const f of list) {
    const meta = await ctx.db.system.get("_storage", f.storageId);
    if (meta === null) throw new ConvexError("A file was not uploaded. Try again.");
    const type = (meta.contentType ?? "").toLowerCase();
    const kind = type.startsWith("image/") ? "image" : type.startsWith("audio/") || type === "video/webm" ? "audio" : null;
    if (kind === null) {
      throw new ConvexError("Only photos and voice notes can be added to a note.");
    }
    if (meta.size > (kind === "image" ? MAX_IMAGE : MAX_AUDIO)) {
      throw new ConvexError(kind === "image" ? "A photo can be at most 15 MB." : "A voice note can be at most 25 MB.");
    }
    out.push({ storageId: f.storageId, kind, name: f.name.trim().slice(0, 200) || (kind === "image" ? "Photo" : "Voice note"), contentType: type, size: meta.size });
  }
  return out;
}

/** The attachments as the screen needs them: a link to each file instead of its storage id. */
export async function attachmentLinks(ctx: QueryCtx, list: NoteAttachment[] | undefined) {
  const out: { kind: "image" | "audio"; name: string; contentType: string; url: string }[] = [];
  for (const a of list ?? []) {
    const url = await ctx.storage.getUrl(a.storageId);
    if (url) out.push({ kind: a.kind, name: a.name, contentType: a.contentType, url });
  }
  return out;
}

export async function deleteNoteFiles(ctx: MutationCtx, list: NoteAttachment[] | undefined) {
  for (const a of list ?? []) await ctx.storage.delete(a.storageId);
}
