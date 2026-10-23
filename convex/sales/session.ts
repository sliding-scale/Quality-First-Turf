import type { MutationCtx, QueryCtx } from "../_generated/server";

const sessionMs = 14 * 24 * 60 * 60 * 1000;

export function sessionExpiry(): number {
  return Date.now() + sessionMs;
}

export async function activeSalesSession(ctx: QueryCtx | MutationCtx, token: string) {
  if (token.length < 32) return null;
  const session = await ctx.db
    .query("salesSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (session === null || session.expiresAt <= Date.now()) return null;
  return session;
}
