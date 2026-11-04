import type { MutationCtx, QueryCtx } from "../_generated/server";

const sessionMs = 14 * 24 * 60 * 60 * 1000;

export function sessionExpiry(): number {
  return Date.now() + sessionMs;
}

/** Tokens are stored as SHA-256 hashes so a database read never reveals a usable token. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Queries must not read the clock, so they rely on the scheduled expiry mutation
 * (and the hourly purge cron) to delete old sessions. Mutations pass `checkClock`.
 */
export async function activeSalesSession(
  ctx: QueryCtx | MutationCtx,
  token: string,
  checkClock = false,
) {
  if (token.length < 32) return null;
  const hashed = await hashToken(token);
  const session = await ctx.db
    .query("salesSessions")
    .withIndex("by_token", (q) => q.eq("token", hashed))
    .unique();
  if (session === null) return null;
  if (checkClock && session.expiresAt <= Date.now()) return null;
  return session;
}
