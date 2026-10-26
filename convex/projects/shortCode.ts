import type { MutationCtx } from "../_generated/server";

// No 0/O/1/I/L so a code can be read aloud over the phone without confusion.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const codeLength = 6;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < codeLength; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function newShortCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomCode();
    const taken = await ctx.db
      .query("projects")
      .withIndex("by_shortCode", (q) => q.eq("shortCode", code))
      .first();
    if (taken === null) return code;
  }
  throw new Error("Could not allocate a project code. Try again.");
}
