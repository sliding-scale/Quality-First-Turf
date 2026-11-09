/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { verifySvix } from "../../convex/crm/lib/svix";
import { adminOf, fakeClerk, signedInAs, strangerIn } from "./helpers";

/* Team invitations (D-055): Clerk emails the link, it works for 7 days, an Admin can cancel, re-send or remove, and Clerk is kept in
   step. Clerk itself is pretend here (see fakeClerk in helpers.ts); the real one was exercised by hand on the dev instance. */

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const DAY = 24 * 60 * 60 * 1000;

async function world() {
  const clerk = fakeClerk();
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  delete process.env.CRM_BOOTSTRAP_ADMIN_EMAILS;
  delete process.env.CLERK_WEBHOOK_SECRET;
  const base = convexTest(schema, modules);
  await base.mutation(internal.crm.seed.run, {});
  const admin = await adminOf(base);
  const qft = (await admin.query(api.crm.businesses.list, {}))[0]._id;
  return { base, admin, qft, clerk };
}
type World = Awaited<ReturnType<typeof world>>;

const rejects = async (p: Promise<unknown>, message: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to be rejected").not.toBeNull();
  expect(String(err instanceof ConvexError ? err.data : err.message)).toMatch(message);
};

const invite = (w: World, over: object = {}) =>
  w.admin.action(api.crm.invitations.send, { email: "pat@example.com", name: "Pat Smith", roles: ["sales"], businessIds: [w.qft], ...over });
const rowOf = async (w: World, email: string) => (await w.admin.query(api.crm.users.list, { includeDeleted: true })).rows.find((u) => u.email === email);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sending an invitation", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("adds the person as invited and asks Clerk to email them a 7-day link back to the CRM", async () => {
    const before = Date.now();
    const sent = await invite(w, { email: "Pat@Example.com" });
    expect(sent).toMatchObject({ sent: true });

    const call = w.clerk.calls.find((c) => c.method === "POST" && c.path === "/invitations");
    expect(call?.body).toMatchObject({ email_address: "pat@example.com", redirect_url: "https://crm.test/accept-invite", notify: true, ignore_existing: false, expires_in_days: 7 });

    const row = await rowOf(w, "pat@example.com");
    expect(row).toMatchObject({ status: "invited", name: "Pat Smith", roles: ["sales"], businessIds: [w.qft], invitedBy: "admin-test@example.com", clerkInvitationId: "inv_1" });
    expect(row!.invitationExpiresAt!).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(row!.invitationExpiresAt!).toBeLessThanOrEqual(Date.now() + 7 * DAY + 1000);
  });

  it("uses the address of the Admin's browser when the CRM's address is not configured", async () => {
    delete process.env.CRM_APP_URL;
    await invite(w, { origin: "http://localhost:3000/some/page?x=1" });
    expect(w.clerk.calls.find((c) => c.path === "/invitations")?.body).toMatchObject({ redirect_url: "http://localhost:3000/accept-invite" });
    await rejects(invite(w, { email: "other@example.com", origin: "javascript:alert(1)" }), /address/i);
    await rejects(invite(w, { email: "other@example.com", origin: undefined }), /address/i);
  });

  it("lets the invited person in when they accept and sign in, once", async () => {
    await invite(w);
    const pat = strangerIn(w.base, "pat-clerk", "pat@example.com");
    expect(await pat.mutation(api.crm.users.claim, {})).toBe("active");
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "active", tokenIdentifier: "https://clerk.test|pat-clerk" });
  });

  it("takes the person back out when Clerk refuses, so nobody is left half-invited", async () => {
    w.clerk.failWhen = (method, path) => (method === "POST" && path === "/invitations" ? new Response(JSON.stringify({ errors: [{ code: "x", message: "Clerk is down", long_message: "Clerk is down" }] }), { status: 500 }) : undefined);
    await rejects(invite(w), /could not be sent: Clerk is down/);
    expect(await rowOf(w, "pat@example.com")).toBeUndefined();
    w.clerk.failWhen = undefined;
    await expect(invite(w)).resolves.toMatchObject({ sent: true }); // and they can simply be invited again
  });

  it("does not add anyone when the Clerk secret key is missing", async () => {
    delete process.env.CLERK_SECRET_KEY;
    await rejects(invite(w), /secret key is missing/);
    expect(await rowOf(w, "pat@example.com")).toBeUndefined();
  });

  it("says so, and sends nothing, when the email already has a Clerk login", async () => {
    w.clerk.users.push({ id: "user_old", email: "pat@example.com" });
    expect(await invite(w)).toEqual({ sent: false, reason: "hasAccount" });
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "invited" });
    expect((await rowOf(w, "pat@example.com"))!.clerkInvitationId).toBeUndefined();
    expect(await strangerIn(w.base, "old", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("active"); // they sign in with the login they have
  });

  it("refuses an email that is already on the team, and bad input, without calling Clerk", async () => {
    await invite(w);
    const calls = w.clerk.calls.length;
    await rejects(invite(w), /already a user/);
    await rejects(invite(w, { email: "nope" }), /valid email/);
    await rejects(invite(w, { email: "x@example.com", roles: [] }), /at least one role/);
    expect(w.clerk.calls.length).toBe(calls + 0); // the first rejection happened in the database, before any Clerk call
  });

  it("is for Admins only", async () => {
    const sales = await signedInAs(w.base, { key: "sales", roles: ["sales"], businessIds: [w.qft] });
    await rejects(sales.action(api.crm.invitations.send, { email: "a@example.com", name: "A", roles: ["sales"], businessIds: [w.qft] }), /Only an Admin/);
    await rejects(w.base.action(api.crm.invitations.send, { email: "a@example.com", name: "A", roles: ["sales"], businessIds: [w.qft] }), /Not signed in/);
    const row = (await w.admin.query(api.crm.users.list, {})).rows[0];
    await rejects(sales.action(api.crm.invitations.resend, { id: row._id }), /Only an Admin/);
    await rejects(sales.action(api.crm.invitations.cancel, { id: row._id }), /Only an Admin/);
    await rejects(sales.action(api.crm.invitations.deleteMember, { id: row._id }), /Only an Admin/);
    expect(w.clerk.calls).toHaveLength(0);
  });
});

describe("an invitation that runs out or is cancelled", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("expires after 7 days: the row shows Expired, the Clerk link is cancelled, and signing in no longer works", async () => {
    vi.useFakeTimers();
    await invite(w);
    vi.advanceTimersByTime(6 * DAY);
    await w.base.finishInProgressScheduledFunctions();
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "invited" });

    vi.advanceTimersByTime(2 * DAY);
    await w.base.finishInProgressScheduledFunctions();
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired" });
    expect(w.clerk.invitations.get("inv_1")?.status).toBe("revoked");

    // Even someone who has a Clerk login for that email gets nothing from an expired invitation.
    expect(await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("none");
  });

  it("also refuses a late sign-in if the timer has not run yet", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.base.run((ctx) => ctx.db.patch(id, { invitationExpiresAt: Date.now() - 1000 }));
    expect(await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("none");
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired" });
  });

  it("cancelling makes the link stop working and shows Expired", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.admin.action(api.crm.invitations.cancel, { id });
    expect(w.clerk.invitations.get("inv_1")?.status).toBe("revoked");
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired" });
    expect(await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("none");
    await rejects(w.admin.action(api.crm.invitations.cancel, { id }), /no pending invitation/);
  });

  it("does not cancel anything in the CRM when Clerk cannot be reached", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    w.clerk.failWhen = () => new Response("down", { status: 503 });
    await rejects(w.admin.action(api.crm.invitations.cancel, { id }), /could not be cancelled/);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "invited" }); // still pending, as the link in Clerk still works
  });

  it("cannot cancel the invitation of someone who has already signed in", async () => {
    await invite(w);
    await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {});
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await rejects(w.admin.action(api.crm.invitations.cancel, { id }), /no pending invitation/);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "active" });
  });

  it("a new invitation replaces an expired or cancelled one, and the old timer cannot expire it", async () => {
    vi.useFakeTimers();
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.admin.action(api.crm.invitations.cancel, { id });
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired" });

    vi.advanceTimersByTime(3 * DAY);
    expect(await w.admin.action(api.crm.invitations.resend, { id })).toMatchObject({ sent: true });
    const row = await rowOf(w, "pat@example.com");
    expect(row).toMatchObject({ status: "invited", clerkInvitationId: "inv_2" });

    vi.advanceTimersByTime(5 * DAY); // past the FIRST invitation's 7 days, well inside the second's
    await w.base.finishInProgressScheduledFunctions();
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "invited", clerkInvitationId: "inv_2" });
    expect(w.clerk.invitations.get("inv_2")?.status).toBe("pending");

    expect(await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("active");
  });

  it("re-sending to a still-pending invitation cancels the old link first (Clerk allows only one)", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.admin.action(api.crm.invitations.resend, { id });
    expect(w.clerk.invitations.get("inv_1")?.status).toBe("revoked");
    expect(w.clerk.invitations.get("inv_2")?.status).toBe("pending");
  });

  it("shows a failed re-send as Expired, because the old link is already gone", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    w.clerk.failWhen = (method, path) => (method === "POST" && path === "/invitations" ? new Response("down", { status: 503 }) : undefined);
    await rejects(w.admin.action(api.crm.invitations.resend, { id }), /could not be sent/);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired" });
  });

  it("will not re-send to someone who has signed in, or who is turned off", async () => {
    await invite(w);
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.base.run((ctx) => ctx.db.patch(id, { status: "deactivated" }));
    await rejects(w.admin.action(api.crm.invitations.resend, { id }), /Turn on their access first/);
    await w.base.run((ctx) => ctx.db.patch(id, { status: "active", tokenIdentifier: "https://clerk.test|pat" }));
    await rejects(w.admin.action(api.crm.invitations.resend, { id }), /already signed in/);
  });

  it("keeps an expired person expired when an Admin edits them, and sorts them after the invited", async () => {
    await invite(w);
    await invite(w, { email: "lee@example.com", name: "Lee" });
    const pat = (await rowOf(w, "pat@example.com"))!;
    await w.admin.action(api.crm.invitations.cancel, { id: pat._id });
    await w.admin.mutation(api.crm.users.update, { id: pat._id, active: true, name: "Pat S", roles: ["office"], businessIds: [w.qft] });
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "expired", name: "Pat S" });
    const order = (await w.admin.query(api.crm.users.list, { sortKey: "status", dir: "asc" })).rows.map((u) => u.status);
    expect(order).toEqual(["active", "invited", "expired"]);
  });
});

describe("deleting a person (the row is kept)", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("cancels an invited person's pending invitation, deletes any Clerk login, and marks them deleted without removing the row", async () => {
    await invite(w);
    w.clerk.users.push({ id: "user_pat", email: "pat@example.com" }); // created by hand in Clerk's dashboard
    const id = (await rowOf(w, "pat@example.com"))!._id;
    expect(await w.admin.action(api.crm.invitations.deleteMember, { id })).toEqual({ clerkAccountsDeleted: 1 });
    expect(w.clerk.invitations.get("inv_1")?.status).toBe("revoked");
    expect(w.clerk.users).toHaveLength(0);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "deleted", name: "Pat Smith", email: "pat@example.com", roles: ["sales"], deletedBy: "admin-test@example.com" });
    expect((await rowOf(w, "pat@example.com"))!.deletedAt).toBeGreaterThan(0);
  });

  it("deletes a signed-in person's Clerk account (found from their sign-in) and ends their sales-form session", async () => {
    await invite(w);
    await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {});
    w.clerk.users.push({ id: "pat-clerk", email: "pat@example.com" });
    await w.base.run(async (ctx) => {
      await ctx.db.insert("salesSessions", { token: "hash-1", expiresAt: Date.now() + DAY, email: "pat@example.com", name: "Pat" });
      await ctx.db.insert("salesSessions", { token: "hash-2", expiresAt: Date.now() + DAY, email: "someone.else@example.com", name: "Else" });
    });
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.admin.action(api.crm.invitations.deleteMember, { id });
    expect(w.clerk.users).toHaveLength(0);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "deleted", tokenIdentifier: "https://clerk.test|pat-clerk" }); // kept as it was
    const sessions = await w.base.run((ctx) => ctx.db.query("salesSessions").collect());
    expect(sessions.map((s) => s.token)).toEqual(["hash-2"]);
  });

  it("never deletes a Clerk login that merely shares part of the email, or that the lookup returned by mistake", async () => {
    await invite(w);
    w.clerk.users.push({ id: "user_other", email: "other@example.com" }, { id: "user_pat", email: "pat@example.com" });
    await w.admin.action(api.crm.invitations.deleteMember, { id: (await rowOf(w, "pat@example.com"))!._id });
    expect(w.clerk.users.map((u) => u.id)).toEqual(["user_other"]);
  });

  it("keeps the person if Clerk fails, so Clerk and the CRM never disagree", async () => {
    await invite(w);
    w.clerk.users.push({ id: "user_pat", email: "pat@example.com" });
    w.clerk.failWhen = (method) => (method === "DELETE" ? new Response("down", { status: 503 }) : undefined);
    await rejects(w.admin.action(api.crm.invitations.deleteMember, { id: (await rowOf(w, "pat@example.com"))!._id }), /could not be deleted in Clerk/);
    expect(await rowOf(w, "pat@example.com")).toBeDefined();
  });

  it("hides deleted people from the team list unless asked, and they cannot sign in or be edited", async () => {
    await invite(w);
    await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {});
    const id = (await rowOf(w, "pat@example.com"))!._id;
    const pat = strangerIn(w.base, "pat-clerk", "pat@example.com");
    await w.admin.action(api.crm.invitations.deleteMember, { id });

    expect((await w.admin.query(api.crm.users.list, {})).rows.map((u) => u.email)).not.toContain("pat@example.com");
    expect((await w.admin.query(api.crm.users.list, { includeDeleted: true })).rows.map((u) => u.email)).toContain("pat@example.com");
    await rejects(pat.query(api.crm.businesses.list, {}), /No access/);
    expect(await pat.mutation(api.crm.users.claim, {})).toBe("deactivated");
    await rejects(w.admin.mutation(api.crm.users.update, { id, active: true, name: "Pat", roles: ["sales"], businessIds: [w.qft] }), /Restore them first/);
    await rejects(w.admin.action(api.crm.invitations.deleteMember, { id }), /already deleted/);
    await rejects(w.admin.action(api.crm.invitations.send, { email: "PAT@example.com", name: "Pat", roles: ["sales"], businessIds: [w.qft] }), /Restore/);
  });

  it("restores a deleted person by sending a new invitation, and they sign in again with a new login", async () => {
    await invite(w);
    await strangerIn(w.base, "pat-clerk", "pat@example.com").mutation(api.crm.users.claim, {});
    const id = (await rowOf(w, "pat@example.com"))!._id;
    await w.admin.action(api.crm.invitations.deleteMember, { id });

    expect(await w.admin.action(api.crm.invitations.resend, { id })).toMatchObject({ sent: true });
    const row = await rowOf(w, "pat@example.com");
    expect(row).toMatchObject({ status: "invited", name: "Pat Smith" });
    expect(row!.tokenIdentifier).toBeUndefined();
    expect(row!.deletedAt).toBeUndefined();
    expect(await strangerIn(w.base, "pat-new-login", "pat@example.com").mutation(api.crm.users.claim, {})).toBe("active");
    expect((await w.admin.query(api.crm.users.list, {})).rows.map((u) => u.email)).toContain("pat@example.com");
  });

  it("does not delete anything from the database: the row count is the same after a delete", async () => {
    await invite(w);
    await invite(w, { email: "lee@example.com", name: "Lee" });
    const count = () => w.base.run(async (ctx) => (await ctx.db.query("users").collect()).length);
    const before = await count();
    await w.admin.action(api.crm.invitations.deleteMember, { id: (await rowOf(w, "pat@example.com"))!._id });
    expect(await count()).toBe(before);
  });

  it("will not delete yourself, the built-in Admin, or leave the CRM without an Admin", async () => {
    const me = (await w.admin.query(api.crm.users.list, {})).rows.find((u) => u.email === "admin-test@example.com")!;
    await rejects(w.admin.action(api.crm.invitations.deleteMember, { id: me._id }), /cannot delete yourself/);

    await strangerIn(w.base, "first", "admin@qualityfirstturf.com").mutation(api.crm.users.claim, {});
    const builtIn = (await rowOf(w, "admin@qualityfirstturf.com"))!;
    await rejects(w.admin.action(api.crm.invitations.deleteMember, { id: builtIn._id }), /built-in Admin/);
    expect(w.clerk.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("Clerk tells the CRM when a login is deleted (the row is kept)", () => {
  let w: World;
  const secretBytes = new Uint8Array(24).map((_, i) => i * 7 + 3);
  const secret = "whsec_" + btoa(String.fromCharCode(...secretBytes));

  async function sign(body: string, opts: { id?: string; timestamp?: number; key?: string } = {}) {
    const id = opts.id ?? "msg_1";
    const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
    const raw = atob((opts.key ?? secret).slice(6));
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(raw, (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
    return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1," + btoa(String.fromCharCode(...mac)) };
  }
  const post = async (body: string, headers: Record<string, string>) =>
    w.base.fetch("/clerk/webhook", { method: "POST", body, headers });

  beforeEach(async () => {
    w = await world();
    process.env.CLERK_WEBHOOK_SECRET = secret;
  });

  it("marks the matching team member deleted when user.deleted arrives, and ignores people it does not know", async () => {
    const pat = await signedInAs(w.base, { key: "user_pat", roles: ["sales"], businessIds: [w.qft], email: "pat@example.com", name: "Pat" });
    expect(await pat.query(api.crm.businesses.list, {})).toHaveLength(1);

    const gone = JSON.stringify({ type: "user.deleted", data: { id: "user_pat", deleted: true, object: "user" } });
    expect((await post(gone, await sign(gone))).status).toBe(200);
    expect(await rowOf(w, "pat@example.com")).toMatchObject({ status: "deleted", deletedBy: "Clerk" });
    await rejects(pat.query(api.crm.businesses.list, {}), /No access/);

    const unknown = JSON.stringify({ type: "user.deleted", data: { id: "user_nobody", deleted: true } });
    expect((await post(unknown, await sign(unknown, { id: "msg_2" }))).status).toBe(200);
    expect((await w.admin.query(api.crm.users.list, {})).total).toBe(1); // only the test Admin is left
  });

  it("ignores other events", async () => {
    await signedInAs(w.base, { key: "user_pat", roles: ["sales"], businessIds: [w.qft], email: "pat@example.com", name: "Pat" });
    const body = JSON.stringify({ type: "user.updated", data: { id: "user_pat" } });
    expect((await post(body, await sign(body))).status).toBe(200);
    expect(await rowOf(w, "pat@example.com")).toBeDefined();
  });

  it("keeps the last active Admin even if their Clerk login was deleted", async () => {
    const body = JSON.stringify({ type: "user.deleted", data: { id: "admin-test", deleted: true } });
    expect((await post(body, await sign(body))).status).toBe(200);
    expect(await rowOf(w, "admin-test@example.com")).toBeDefined();
  });

  it("refuses anything not signed by Clerk", async () => {
    await signedInAs(w.base, { key: "user_pat", roles: ["sales"], businessIds: [w.qft], email: "pat@example.com", name: "Pat" });
    const body = JSON.stringify({ type: "user.deleted", data: { id: "user_pat" } });
    expect((await post(body, {})).status).toBe(401);
    const other = "whsec_" + btoa("a-different-secret-entirely");
    expect((await post(body, await sign(body, { key: other }))).status).toBe(401);
    expect((await post(body, await sign(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401); // too old to be genuine
    expect((await post(body + " ", await sign(body))).status).toBe(401); // changed after signing
    expect(await rowOf(w, "pat@example.com")).toBeDefined();
  });

  it("says it is not set up when there is no signing secret", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const body = JSON.stringify({ type: "user.deleted", data: { id: "x" } });
    expect((await post(body, await sign(body))).status).toBe(503);
  });

  it("checks signatures the way Svix does", async () => {
    const body = "{}";
    const good = await sign(body);
    const h = (over: Partial<Record<string, string | null>> = {}) => ({ id: good["svix-id"], timestamp: good["svix-timestamp"], signatures: good["svix-signature"], ...over });
    const now = Number(good["svix-timestamp"]);
    expect(await verifySvix(secret, h(), body, now)).toBe(true);
    expect(await verifySvix(secret, h({ signatures: "v1,AAAA " + good["svix-signature"] }), body, now)).toBe(true); // while a secret is being rotated there are several
    expect(await verifySvix(secret, h({ signatures: "v2," + good["svix-signature"].slice(3) }), body, now)).toBe(false);
    expect(await verifySvix(secret, h({ id: null }), body, now)).toBe(false);
    expect(await verifySvix("not base64 !!", h(), body, now)).toBe(false);
    expect(await verifySvix(secret, h(), body, now + 301)).toBe(false);
  });
});
