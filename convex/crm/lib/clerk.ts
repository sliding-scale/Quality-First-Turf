import { ConvexError } from "convex/values";
import { env } from "../../_generated/server";

/* The CRM's calls to Clerk's Backend API (D-055): send, cancel and look up invitations, and delete accounts. Only actions use this
   (it needs `fetch` and the secret key). Every call returns a result instead of throwing, so the caller decides what a failure means;
   the one exception is a missing key, which stops the whole action with a clear message. Checked against the dev instance on
   2026-11-07; the error codes below are what Clerk really answered. */

const API = "https://api.clerk.com/v1";

/** How long an invitation link works. Sent to Clerk, and also enforced by the CRM itself (see invitations.ts `expire`). */
export const INVITE_DAYS = 7;
export const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

export type ClerkFailure = { ok: false; status: number; code: string; message: string };
export type ClerkResult<T> = { ok: true; status: number; body: T } | ClerkFailure;

function secretKey(): string {
  const key = env.CLERK_SECRET_KEY;
  if (!key) throw new ConvexError("Invitations are not set up on this server yet: the Clerk secret key is missing.");
  return key;
}

/** Stops with a clear message when the secret key is missing, before anything has been changed. */
export function assertConfigured() {
  secretKey();
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<ClerkResult<T>> {
  const key = secretKey();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach Clerk. Try again in a moment." };
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (an outage page, say): the status below is still reported.
  }
  if (res.ok) return { ok: true, status: res.status, body: json as T };
  const first = (json as { errors?: { code?: string; message?: string; long_message?: string }[] } | null)?.errors?.[0];
  return { ok: false, status: res.status, code: first?.code ?? "error", message: first?.long_message ?? first?.message ?? `Clerk answered ${res.status}.` };
}

/** Emails the person a link that opens `redirectUrl`, where they create a password and are signed in. */
export async function createInvitation(email: string, redirectUrl: string) {
  const r = await call<{ id: string; expires_at?: number }>("POST", "/invitations", {
    email_address: email,
    redirect_url: redirectUrl,
    notify: true,
    ignore_existing: false,
    expires_in_days: INVITE_DAYS,
  });
  if (!r.ok) return r;
  return { ok: true as const, status: r.status, body: { id: r.body.id, expiresAt: r.body.expires_at ?? Date.now() + INVITE_MS } };
}

/** True when the link no longer works: just revoked, already revoked, or not there any more. A real failure comes back as a message. */
export async function revokeInvitation(id: string): Promise<{ done: true } | { done: false; message: string }> {
  const r = await call<unknown>("POST", `/invitations/${encodeURIComponent(id)}/revoke`);
  if (r.ok || r.status === 404 || r.code === "invitation_already_revoked") return { done: true };
  // Anything else that is a 4xx other than a bad key means Clerk no longer has it pending (accepted, say): nothing left to cancel.
  if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403 && r.status !== 429) return { done: true };
  return { done: false, message: r.message };
}

/**
 * The Clerk accounts that own this email. Clerk ignores the bracketed form of the filter (it returned everyone), so the plain form is
 * used, and the answer is checked again here: an account is only returned if it really lists this email.
 */
export async function findUserIds(email: string): Promise<{ ok: true; ids: string[] } | { ok: false; message: string }> {
  const r = await call<{ id: string; email_addresses?: { email_address?: string }[] }[]>("GET", `/users?limit=10&email_address=${encodeURIComponent(email)}`);
  if (!r.ok) return { ok: false, message: r.message };
  const wanted = email.trim().toLowerCase();
  const ids = (Array.isArray(r.body) ? r.body : [])
    .filter((u) => (u.email_addresses ?? []).some((e) => (e.email_address ?? "").trim().toLowerCase() === wanted))
    .map((u) => u.id);
  return { ok: true, ids };
}

/** Deletes a Clerk account, which also ends all of its sessions. An account that is already gone counts as deleted. */
export async function deleteUser(id: string): Promise<{ done: true } | { done: false; message: string }> {
  const r = await call<unknown>("DELETE", `/users/${encodeURIComponent(id)}`);
  if (r.ok || r.status === 404) return { done: true };
  return { done: false, message: r.message };
}

/** The part of a token identifier after the issuer, which is Clerk's user id. */
export function clerkUserIdOf(tokenIdentifier: string): string {
  return tokenIdentifier.slice(tokenIdentifier.lastIndexOf("|") + 1);
}

/** Where an invitation link should return to: the CRM's own address from the environment, else the Admin's browser address. */
export function acceptUrl(browserOrigin: string | undefined): string {
  const fromEnv = env.CRM_APP_URL?.trim();
  const base = fromEnv || browserOrigin;
  let origin: URL;
  try {
    origin = new URL(base ?? "");
  } catch {
    throw new ConvexError("Could not work out the CRM's address for the invitation link. Reload the page and try again.");
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") throw new ConvexError("The CRM's address is not valid.");
  return `${origin.origin}/accept-invite`;
}
