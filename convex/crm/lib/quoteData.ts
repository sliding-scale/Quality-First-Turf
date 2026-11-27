import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** A quote with its lines, its notes and every photo or file stored for it (D-056). Used when a quote is deleted, and when its client is. */
export async function deleteQuote(ctx: MutationCtx, quote: Doc<"quotes">) {
  const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(500);
  const notes = await ctx.db.query("quoteNotes").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(500);
  const attached = await ctx.db.query("quoteAttachments").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(200);
  const files = [quote.introImageId, quote.signatureImageId, ...lines.map((l) => l.imageId), ...attached.map((a) => a.storageId), ...notes.map((n) => n.attachmentId), ...notes.flatMap((n) => (n.attachments ?? []).map((a) => a.storageId))];
  for (const a of attached) await ctx.db.delete(a._id);
  for (const l of lines) await ctx.db.delete(l._id);
  for (const n of notes) await ctx.db.delete(n._id);
  await ctx.db.delete(quote._id);
  for (const file of files) if (file) await ctx.storage.delete(file);
}
