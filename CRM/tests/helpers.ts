import type { TestConvex } from "convex-test";
import { vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

type T = TestConvex<typeof schema>;
type Role = "admin" | "sales" | "office" | "pm";

const ISSUER = "https://clerk.test";

/** Adds an active user (as if they had been invited and had signed in) and returns a test handle that is signed in as them. */
export async function signedInAs(
  t: T,
  who: { key: string; roles: Role[]; businessIds?: Id<"businesses">[]; email?: string; name?: string },
) {
  const email = who.email ?? `${who.key}@example.com`;
  await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: who.name ?? who.key,
      roles: who.roles,
      businessIds: who.businessIds ?? [],
      status: "active",
      tokenIdentifier: `${ISSUER}|${who.key}`,
    }),
  );
  return t.withIdentity({ issuer: ISSUER, subject: who.key, name: who.name ?? who.key, email, emailVerified: true });
}

/** A signed-in identity with no user row at all: someone who signed up in Clerk but was never invited. */
export function strangerIn(t: T, key = "stranger", email = "stranger@example.com") {
  return t.withIdentity({ issuer: ISSUER, subject: key, name: key, email, emailVerified: true });
}

const admins = new WeakMap<object, ReturnType<T["withIdentity"]>>();

/** One Admin per test database, created on first use. */
export async function adminOf(t: T) {
  let a = admins.get(t);
  if (!a) {
    a = await signedInAs(t, { key: "admin-test", roles: ["admin"], name: "Sal" });
    admins.set(t, a);
  }
  return a;
}

/* ---- A pretend Clerk, so invitation tests never touch the real one ---- */

export type FakeClerk = {
  /** Every call the backend made, in order. */
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  invitations: Map<string, { email: string; status: "pending" | "revoked"; redirectUrl: unknown }>;
  /** Clerk logins that already exist. */
  users: { id: string; email: string }[];
  /** Return a Response to make a call fail; return undefined to let it through. */
  failWhen?: (method: string, path: string) => Response | undefined;
};

const clerkError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ errors: [{ code, message, long_message: message }] }), { status });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Replaces `fetch` with a small imitation of the parts of Clerk's Backend API the CRM uses, with the error codes the real one gives. */
export function fakeClerk(): FakeClerk {
  process.env.CLERK_SECRET_KEY = "sk_test_fake";
  process.env.CRM_APP_URL = "https://crm.test";
  const state: FakeClerk = { calls: [], invitations: new Map(), users: [] };
  let counter = 0;

  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/v1/, "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    state.calls.push({ method, path, body });
    const failed = state.failWhen?.(method, path);
    if (failed) return failed;

    if (method === "POST" && path === "/invitations") {
      const email = String(body?.email_address);
      if (state.users.some((u) => u.email === email)) return clerkError(422, "form_identifier_exists", "That email address is taken. Please try another.");
      if ([...state.invitations.values()].some((i) => i.email === email && i.status === "pending")) return clerkError(400, "duplicate_record", "duplicate invitation");
      const id = `inv_${++counter}`;
      state.invitations.set(id, { email, status: "pending", redirectUrl: body?.redirect_url });
      return ok({ object: "invitation", id, email_address: email, status: "pending", expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    }
    const revoke = path.match(/^\/invitations\/([^/]+)\/revoke$/);
    if (method === "POST" && revoke) {
      const found = state.invitations.get(revoke[1]);
      if (!found) return clerkError(404, "resource_not_found", "not found");
      if (found.status === "revoked") return clerkError(400, "invitation_already_revoked", "Invitation is already revoked.");
      found.status = "revoked";
      return ok({ id: revoke[1], status: "revoked" });
    }
    if (method === "GET" && path === "/users") {
      // Like the real thing: only the plain `email_address` filter works; it returns everyone if the filter is not understood.
      const wanted = url.searchParams.get("email_address");
      const rows = wanted === null ? state.users : state.users.filter((u) => u.email === wanted);
      return ok(rows.map((u) => ({ id: u.id, email_addresses: [{ email_address: u.email }] })));
    }
    const user = path.match(/^\/users\/([^/]+)$/);
    if (method === "DELETE" && user) {
      const at = state.users.findIndex((u) => u.id === user[1]);
      if (at < 0) return clerkError(404, "resource_not_found", "not found");
      state.users.splice(at, 1);
      return ok({ id: user[1], deleted: true });
    }
    return clerkError(500, "unexpected", `The fake Clerk does not know ${method} ${path}`);
  });
  return state;
}
