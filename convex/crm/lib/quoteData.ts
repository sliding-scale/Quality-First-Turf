import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** A quote with its lines, its notes and every photo or file stored for it (D-056). Used when a quote is deleted, and when its client is. */
export async function deleteQuote(ctx: MutationCtx, quote: Doc<"quotes">) {
  const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(500);
  const notes = await ctx.db.query("quoteNotes").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(500);
  const files = [quote.introImageId, quote.signatureImageId, ...lines.map((l) => l.imageId), ...notes.map((n) => n.attachmentId)];
  for (const l of lines) await ctx.db.delete(l._id);
  for (const n of notes) await ctx.db.delete(n._id);
  await ctx.db.delete(quote._id);
  for (const file of files) if (file) await ctx.storage.delete(file);
}
