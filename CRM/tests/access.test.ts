/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { adminOf, signedInAs, strangerIn } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const today = new Date().setHours(0, 0, 0, 0);
const listArgs = { status: "All", type: "All", search: "", sortKey: "lastActivity", dir: "desc", page: 1, size: 10 } as const;
const requestArgs = { status: "All", from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today, page: 1, size: 10 } as const;

async function world() {
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  delete process.env.CRM_BOOTSTRAP_ADMIN_EMAILS;
  const base = convexTest(schema, modules);
  await base.mutation(internal.crm.seed.run, {});
  const admin = await adminOf(base);
  const businesses = await admin.query(api.crm.businesses.list, {});
  return { base, admin, qft: businesses[0]._id, patios: businesses[2]._id };
}

const rejects = async (p: Promise<unknown>, message: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to be rejected").not.toBeNull();
  expect(String(err instanceof ConvexError ? err.data : err.message)).toMatch(message);
};

describe("signing in", () => {
  let w: Awaited<ReturnType<typeof world>>;
  beforeEach(async () => { w = await world(); });

  it("rejects every call from someone who is not signed in", async () => {
    await rejects(w.base.query(api.crm.businesses.list, {}), /Not signed in/);
    await rejects(w.base.query(api.crm.clients.list, { businessId: w.qft, ...listArgs }), /Not signed in/);
    await rejects(w.base.query(api.crm.requests.list, { businessId: w.qft, ...requestArgs }), /Not signed in/);
    await rejects(w.base.mutation(api.crm.users.claim, {}), /Not signed in/);
    expect(await w.base.query(api.crm.users.me, {})).toEqual({ state: "signedOut" });
  });

  it("gives nothing to someone who signed up in Clerk but was never invited", async () => {
    const stranger = strangerIn(w.base);
    await rejects(stranger.query(api.crm.businesses.list, {}), /No access/);
    await rejects(stranger.query(api.crm.clients.list, { businessId: w.qft, ...listArgs }), /No access/);
    expect(await stranger.query(api.crm.users.me, {})).toMatchObject({ state: "unclaimed" });
    expect(await stranger.mutation(api.crm.users.claim, {})).toBe("none");
    await rejects(stranger.query(api.crm.businesses.list, {}), /No access/); // claiming without an invite changed nothing
  });

  it("lets an invited person in by their verified email, whatever its case, and only once", async () => {
    await w.admin.mutation(api.crm.users.invite, { email: "Pat.Smith@Example.com", name: "Pat Smith", roles: ["sales"], businessIds: [w.qft] });
    const pat = strangerIn(w.base, "pat-clerk", "pat.smith@example.COM");
    expect(await pat.mutation(api.crm.users.claim, {})).toBe("active");
    expect(await pat.mutation(api.crm.users.claim, {})).toBe("active"); // calling again is fine
    const me = await pat.query(api.crm.users.me, {});
    expect(me).toMatchObject({ state: "active", user: { name: "Pat Smith", roles: ["sales"], isAdmin: false } });
    expect((await pat.query(api.crm.clients.list, { businessId: w.qft, ...listArgs })).total).toBeGreaterThan(0);
    // The same email from a different Clerk account cannot take over the row.
    expect(await strangerIn(w.base, "someone-else", "pat.smith@example.com").mutation(api.crm.users.claim, {})).toBe("none");
  });

  it("does not trust an email Clerk has not verified", async () => {
    await w.admin.mutation(api.crm.users.invite, { email: "val@example.com", name: "Val", roles: ["office"], businessIds: [w.qft] });
    const unverified = w.base.withIdentity({ issuer: "https://clerk.test", subject: "val", email: "val@example.com", emailVerified: false });
    expect(await unverified.mutation(api.crm.users.claim, {})).toBe("unverified");
  });

  it("says so when the sign-in token carries no email at all", async () => {
    const noEmail = w.base.withIdentity({ issuer: "https://clerk.test", subject: "no-email", name: "No Email" });
    expect(await noEmail.mutation(api.crm.users.claim, {})).toBe("noEmail");
    expect(await noEmail.query(api.crm.users.me, {})).toMatchObject({ state: "unclaimed", email: "" });
  });

  it("makes admin@qualityfirstturf.com the first Admin, with every business, and nobody else", async () => {
    const first = strangerIn(w.base, "first", "Admin@QualityFirstTurf.com");
    expect(await first.mutation(api.crm.users.claim, {})).toBe("active");
    expect(await first.query(api.crm.users.me, {})).toMatchObject({ state: "active", user: { isAdmin: true, roles: ["admin"] } });
    expect((await first.query(api.crm.businesses.list, {})).length).toBe(3);
    expect((await first.query(api.crm.users.list, {})).rows.length).toBeGreaterThan(0);
    expect(await strangerIn(w.base, "imposter", "administrator@qualityfirstturf.com").mutation(api.crm.users.claim, {})).toBe("none");
  });

  it("can add more first Admins through the environment variable", async () => {
    process.env.CRM_BOOTSTRAP_ADMIN_EMAILS = "boss@example.com, Owner@Example.com";
    expect(await strangerIn(w.base, "boss", "boss@example.com").mutation(api.crm.users.claim, {})).toBe("active");
    expect(await strangerIn(w.base, "owner", "owner@example.com").mutation(api.crm.users.claim, {})).toBe("active");
    delete process.env.CRM_BOOTSTRAP_ADMIN_EMAILS;
  });

  it("shuts out a deactivated person straight away, and lets them back when reactivated", async () => {
    const pat = await signedInAs(w.base, { key: "pat", roles: ["sales"], businessIds: [w.qft], name: "Pat" });
    const id = (await w.admin.query(api.crm.users.list, {})).rows.find((u) => u.name === "Pat")!._id;
    await w.admin.mutation(api.crm.users.update, { id, active: false, name: "Pat", roles: ["sales"], businessIds: [w.qft] });
    await rejects(pat.query(api.crm.businesses.list, {}), /No access/);
    expect(await pat.query(api.crm.users.me, {})).toMatchObject({ state: "deactivated" });
    expect(await pat.mutation(api.crm.users.claim, {})).toBe("deactivated");
    await w.admin.mutation(api.crm.users.update, { id, active: true, name: "Pat", roles: ["sales"], businessIds: [w.qft] });
    expect((await pat.query(api.crm.businesses.list, {})).length).toBe(1);
  });
});

describe("roles and businesses", () => {
  let w: Awaited<ReturnType<typeof world>>;
  beforeEach(async () => { w = await world(); });

  const newClient = (businessId: typeof w.qft) => ({
    businessId, type: "homeowner", first: "Test", last: "Person", company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "",
  }) as const;

  it("Sales and Office Team can change clients and add notes; Project Managers can only look", async () => {
    for (const roles of [["sales"], ["office"]] as const) {
      const user = await signedInAs(w.base, { key: roles[0], roles: [...roles], businessIds: [w.qft] });
      const id = await user.mutation(api.crm.clients.create, newClient(w.qft));
      await user.mutation(api.crm.clients.addNote, { clientId: id, text: "hello" });
    }
    const pm = await signedInAs(w.base, { key: "pm", roles: ["pm"], businessIds: [w.qft] });
    expect((await pm.query(api.crm.clients.list, { businessId: w.qft, ...listArgs })).total).toBeGreaterThan(0);
    expect((await pm.query(api.crm.requests.list, { businessId: w.qft, ...requestArgs })).total).toBeGreaterThan(0);
    const some = (await pm.query(api.crm.clients.list, { businessId: w.qft, ...listArgs })).rows[0];
    await rejects(pm.mutation(api.crm.clients.create, newClient(w.qft)), /view this but not change/);
    await rejects(pm.mutation(api.crm.clients.addNote, { clientId: some._id, text: "no" }), /view this but not change/);
    await rejects(pm.mutation(api.crm.clients.update, { id: some._id, ...newClient(w.qft) }), /view this but not change/);
  });

  it("a person with several roles gets the most any of them allows", async () => {
    const both = await signedInAs(w.base, { key: "both", roles: ["pm", "sales"], businessIds: [w.qft] });
    await expect(both.mutation(api.crm.clients.create, newClient(w.qft))).resolves.toBeTruthy();
  });

  it("keeps a person inside their own businesses, on every kind of call", async () => {
    const patiosOnly = await signedInAs(w.base, { key: "pat", roles: ["sales"], businessIds: [w.patios] });
    expect((await patiosOnly.query(api.crm.businesses.list, {})).map((b) => b._id)).toEqual([w.patios]);
    expect((await patiosOnly.query(api.crm.clients.list, { businessId: w.patios, ...listArgs })).total).toBeGreaterThan(0);

    await rejects(patiosOnly.query(api.crm.clients.list, { businessId: w.qft, ...listArgs }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.clients.stats, { businessId: w.qft, today }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.requests.list, { businessId: w.qft, ...requestArgs }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.requests.stats, { businessId: w.qft, today }), /No access to this business/);
    await rejects(patiosOnly.mutation(api.crm.clients.create, newClient(w.qft)), /No access to this business/);

    // A client in another business looks like it does not exist, and its projects and notes stay shut.
    const qftClient = (await w.admin.query(api.crm.clients.list, { businessId: w.qft, ...listArgs })).rows[0];
    expect(await patiosOnly.query(api.crm.clients.get, { id: qftClient._id })).toBeNull();
    await rejects(patiosOnly.query(api.crm.projects.byClient, { clientId: qftClient._id }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.clients.notes, { clientId: qftClient._id }), /No access to this business/);
    await rejects(patiosOnly.mutation(api.crm.clients.addNote, { clientId: qftClient._id, text: "x" }), /No access to this business/);
  });

  it("moving a client to another business needs the editor role in both", async () => {
    const patiosOnly = await signedInAs(w.base, { key: "pat", roles: ["sales"], businessIds: [w.patios] });
    const mine = (await patiosOnly.query(api.crm.clients.list, { businessId: w.patios, ...listArgs })).rows[0];
    await rejects(patiosOnly.mutation(api.crm.clients.update, { id: mine._id, ...newClient(w.qft) }), /No access to this business/);
  });

  it("an Admin works in every business without being listed in any", async () => {
    expect((await w.admin.query(api.crm.businesses.list, {})).length).toBe(3);
    expect((await w.admin.query(api.crm.clients.list, { businessId: w.patios, ...listArgs })).total).toBeGreaterThan(0);
  });
});

describe("managing users", () => {
  let w: Awaited<ReturnType<typeof world>>;
  beforeEach(async () => { w = await world(); });
  const input = (over: object = {}) => ({ email: "new.person@example.com", name: "New Person", roles: ["sales"] as ("sales")[], businessIds: [w.qft], ...over });

  it("only an Admin can see, invite or change users", async () => {
    const sales = await signedInAs(w.base, { key: "sales", roles: ["sales"], businessIds: [w.qft] });
    await rejects(sales.query(api.crm.users.list, {}), /Only an Admin/);
    await rejects(sales.mutation(api.crm.users.invite, input()), /Only an Admin/);
    const target = (await w.admin.query(api.crm.users.list, {})).rows[0];
    await rejects(sales.mutation(api.crm.users.update, { id: target._id, active: true, name: "x", roles: ["admin"], businessIds: [] }), /Only an Admin/);
  });

  it("an Admin invites someone, who then shows as invited", async () => {
    await w.admin.mutation(api.crm.users.invite, input());
    const row = (await w.admin.query(api.crm.users.list, {})).rows.find((u) => u.email === "new.person@example.com");
    expect(row).toMatchObject({ status: "invited", roles: ["sales"], name: "New Person", businessIds: [w.qft] });
  });

  it("searches, sorts and pages the team on the server", async () => {
    for (const [name, email] of [["Ann Lee", "ann@example.com"], ["Bob Ray", "bob@sample.org"], ["Cy Dun", "cy@example.com"], ["Di Fox", "di@example.com"]] as const) {
      await w.admin.mutation(api.crm.users.invite, input({ name, email }));
    }
    const everyone = await w.admin.query(api.crm.users.list, {});
    expect(everyone.total).toBe(5); // four invited plus the Admin
    expect((await w.admin.query(api.crm.users.list, { search: "EXAMPLE.com" })).rows.map((u) => u.name).sort()).toEqual(["Ann Lee", "Cy Dun", "Di Fox", "Sal"]); // Sal is the test Admin, whose address is also @example.com
    expect((await w.admin.query(api.crm.users.list, { search: "bob ray" })).total).toBe(1);
    expect((await w.admin.query(api.crm.users.list, { search: "nobody here" })).total).toBe(0);

    const desc = await w.admin.query(api.crm.users.list, { sortKey: "name", dir: "desc" });
    expect(desc.rows.map((u) => u.name)).toEqual([...desc.rows.map((u) => u.name)].sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase())));

    const byStatus = await w.admin.query(api.crm.users.list, { sortKey: "status", dir: "asc" });
    expect(byStatus.rows[0].status).toBe("active"); // the Admin first, then the invited

    const first = await w.admin.query(api.crm.users.list, { size: 2, page: 1 });
    const last = await w.admin.query(api.crm.users.list, { size: 2, page: 99 });
    expect(first.rows).toHaveLength(2);
    expect(last).toMatchObject({ total: 5, page: 3 });
    expect(last.rows).toHaveLength(1);
  });

  it("checks what it is given", async () => {
    await rejects(w.admin.mutation(api.crm.users.invite, input({ email: "nope" })), /valid email/);
    await rejects(w.admin.mutation(api.crm.users.invite, input({ name: "   " })), /name/);
    await rejects(w.admin.mutation(api.crm.users.invite, input({ roles: [] })), /at least one role/);
    await rejects(w.admin.mutation(api.crm.users.invite, input({ businessIds: [] })), /at least one business/);
    await w.admin.mutation(api.crm.users.invite, input({ roles: ["admin"], businessIds: [], email: "boss2@example.com" })); // an Admin needs no business list
    await w.admin.mutation(api.crm.users.invite, input());
    await rejects(w.admin.mutation(api.crm.users.invite, input({ email: "NEW.person@example.com" })), /already a user/);
  });

  it("never leaves the CRM without an active Admin, and never lets an Admin lock themselves out", async () => {
    const me = (await w.admin.query(api.crm.users.list, {})).rows.find((u) => u.roles.includes("admin"))!;
    await rejects(w.admin.mutation(api.crm.users.update, { id: me._id, active: false, name: me.name, roles: ["admin"], businessIds: [] }), /cannot remove your own Admin/);
    await rejects(w.admin.mutation(api.crm.users.update, { id: me._id, active: true, name: me.name, roles: ["sales"], businessIds: [w.qft] }), /cannot remove your own Admin/);
    // With a second Admin, the first can be changed by them.
    const second = await signedInAs(w.base, { key: "second", roles: ["admin"], name: "Second" });
    await second.mutation(api.crm.users.update, { id: me._id, active: true, name: me.name, roles: ["sales"], businessIds: [w.qft] });
    // And now the second is the last one.
    const secondRow = (await second.query(api.crm.users.list, {})).rows.find((u) => u.name === "Second")!;
    await rejects(second.mutation(api.crm.users.update, { id: secondRow._id, active: false, name: "Second", roles: ["admin"], businessIds: [] }), /cannot remove your own Admin|at least one active Admin/);
  });
});
