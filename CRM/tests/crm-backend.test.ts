/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { adminOf } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const DAY = 24 * 60 * 60 * 1000;
const today = new Date().setHours(0, 0, 0, 0);

const listArgs = { status: "Leads and Active", type: "All", search: "", sortKey: "lastActivity", dir: "desc", page: 1, size: 10 } as const;
const requestArgs = { status: "All", from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today, page: 1, size: 10 } as const;

async function seeded() {
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  const base = convexTest(schema, modules);
  await base.mutation(internal.crm.seed.run, {});
  const t = await adminOf(base);
  const businesses = await t.query(api.crm.businesses.list, {});
  return { t, base, businesses, qft: businesses[0]._id, patios: businesses[2]._id };
}

describe("seed switch", () => {
  it("refuses to load sample data unless the dev switch is on", async () => {
    delete process.env.CRM_ALLOW_SAMPLE_DATA;
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.crm.seed.run, {})).rejects.toThrow(/dev deployment/);
  });
});

describe("seed", () => {
  it("loads three businesses and does nothing the second time", async () => {
    const { t, businesses } = await seeded();
    expect(businesses.map((b) => b.name)).toEqual(["Quality First Turf", "Quality First Turf Construction", "Quality First Patios"]);
    await expect(t.mutation(internal.crm.seed.run, {})).resolves.toMatch(/Already seeded/);
  });

  it("reset empties every CRM table", async () => {
    const { t } = await seeded();
    await t.mutation(internal.crm.seed.reset, {});
    expect(await t.query(api.crm.businesses.list, {})).toEqual([]);
  });
});

describe("clients", () => {
  let ctx: Awaited<ReturnType<typeof seeded>>;
  beforeEach(async () => { ctx = await seeded(); });

  it("lists one page of a business, newest activity first, without archived clients", async () => {
    const r = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs });
    expect(r.rows).toHaveLength(10);
    expect(r.total).toBeGreaterThan(10);
    expect(r.rows.every((c) => c.status !== "archived")).toBe(true);
    expect(r.rows.every((c) => c.businessId === ctx.qft)).toBe(true);
    const times = r.rows.map((c) => c.lastActivityAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("keeps each business's list separate (D-031)", async () => {
    const a = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, status: "All", size: 100 });
    const b = await ctx.t.query(api.crm.clients.list, { businessId: ctx.patios, ...listArgs, status: "All", size: 100 });
    const ids = new Set(a.rows.map((c) => c._id));
    expect(b.rows.some((c) => ids.has(c._id))).toBe(false);
    expect(a.total + b.total).toBeLessThan(98);
  });

  it("filters by status and by type", async () => {
    const archived = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, status: "Archived", size: 100 });
    expect(archived.rows.length).toBeGreaterThan(0);
    expect(archived.rows.every((c) => c.status === "archived")).toBe(true);
    const leads = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, status: "Leads", size: 100 });
    expect(leads.rows.every((c) => c.status === "lead")).toBe(true);
    const contractors = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, type: "contractor", size: 100 });
    expect(contractors.rows.every((c) => c.type === "contractor")).toBe(true);
  });

  it("sorts by name, and searches", async () => {
    const byName = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, sortKey: "name", dir: "asc", size: 100 });
    const names = byName.rows.map((c) => c.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    const found = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, search: "Thompson" });
    expect(found.rows.map((c) => c.name)).toContain("Michael & Sarah Thompson");
    const none = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, search: "zzzzqqq" });
    expect(none.total).toBe(0);
  });

  it("clamps an out-of-range page to the last one", async () => {
    const r = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, page: 999 });
    expect(r.page).toBe(Math.ceil(r.total / 10));
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("counts the stat cards without archived clients", async () => {
    const s = await ctx.t.query(api.crm.clients.stats, { businessId: ctx.qft, today });
    const all = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, status: "Leads and Active", size: 100 });
    expect(s.total).toBe(all.total);
    expect(s.newLeads).toBeLessThanOrEqual(s.newClients);
  });

  it("creates a client from the form fields, with the display name worked out by the server", async () => {
    const id = await ctx.t.mutation(api.crm.clients.create, {
      businessId: ctx.qft, type: "contractor", first: "Ana", last: "Ruiz", company: "Ruiz Pavers", phone: "9515550123", email: "ana@example.com",
      street1: "1 Main St", street2: "", city: "Temecula", state: "CA", zip: "92592", notes: "",
    });
    const c = await ctx.t.query(api.crm.clients.get, { id });
    expect(c).toMatchObject({ name: "Ruiz Pavers", contactName: "Ana Ruiz", phone: "(951) 555-0123", status: "lead", businessId: ctx.qft });
    const found = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs, search: "Ruiz" });
    expect(found.rows.map((r) => r._id)).toContain(id);
  });

  it("rejects bad input on the server, whatever the form did", async () => {
    type Input = {
      businessId: Id<"businesses">; type: "homeowner" | "contractor"; first: string; last: string; company: string; phone: string;
      email: string; street1: string; street2: string; city: string; state: string; zip: string; notes: string;
    };
    const base: Input = { businessId: ctx.qft, type: "homeowner", first: "Al", last: "Bo", company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "" };
    const fails = async (patch: Partial<Input>, message: RegExp) => {
      const err = await ctx.t.mutation(api.crm.clients.create, { ...base, ...patch }).catch((e) => e);
      expect(err).toBeInstanceOf(ConvexError);
      expect(String(err.data)).toMatch(message);
    };
    await fails({ first: "", last: "" }, /first name, last name or company/);
    await fails({ phone: "123" }, /10-digit/);
    await fails({ email: "nope" }, /valid email/);
    await fails({ zip: "925" }, /5-digit ZIP/);
    await fails({ state: "ZZ" }, /state/i);
  });

  it("moving a client to another business moves its projects with it", async () => {
    const page = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs });
    const c = page.rows[0];
    const [first, ...rest] = c.contactName.split(" ");
    await ctx.t.mutation(api.crm.clients.update, {
      id: c._id, businessId: ctx.patios, type: c.type, first, last: rest.join(" "), company: c.company, phone: c.phone, email: c.email,
      street1: c.street1, street2: c.street2, city: c.city, state: c.state, zip: c.zip, notes: c.notes,
    });
    const projects = await ctx.t.query(api.crm.projects.byClient, { clientId: c._id });
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.businessId === ctx.patios)).toBe(true);
  });

  it("stores notes newest first and ignores empty ones; a bad id is not found", async () => {
    const page = await ctx.t.query(api.crm.clients.list, { businessId: ctx.qft, ...listArgs });
    const clientId = page.rows[0]._id;
    await ctx.t.mutation(api.crm.clients.addNote, { clientId, text: "first" });
    await ctx.t.mutation(api.crm.clients.addNote, { clientId, text: "second" });
    await expect(ctx.t.mutation(api.crm.clients.addNote, { clientId, text: "   " })).rejects.toThrow();
    const notes = await ctx.t.query(api.crm.clients.notes, { clientId });
    expect(notes.map((n) => n.text)).toEqual(["second", "first"]);
    expect(notes[0].author).toBe("Sal");
    expect(await ctx.t.query(api.crm.clients.get, { id: "not-an-id" })).toBeNull();
  });
});

describe("requests", () => {
  let ctx: Awaited<ReturnType<typeof seeded>>;
  beforeEach(async () => { ctx = await seeded(); });

  it("lists Sales projects as requests, with a status worked out from the stage", async () => {
    const r = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, size: 100 });
    expect(r.total).toBeGreaterThan(0);
    const times = r.rows.map((x) => x.requestedAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const row of r.rows) {
      const expected = row.stage === "Closed Lost" ? "Lost" : row.stage === "New Request" ? ["New", "Overdue"] : row.stage.includes("Consultation") ? "Consultation" : "Converted";
      expect(expected).toContain(row.status);
    }
  });

  it("filters by status, by date range and by search", async () => {
    const converted = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, status: "Converted", size: 100 });
    expect(converted.total).toBeGreaterThan(0);
    expect(converted.rows.every((r) => r.status === "Converted")).toBe(true);

    const recent = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, from: today - 7 * DAY, size: 100 });
    const all = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, size: 100 });
    expect(recent.total).toBeLessThan(all.total);
    expect(recent.rows.every((r) => r.requestedAt >= today - 7 * DAY)).toBe(true);

    const searched = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, search: "Thompson" });
    expect(searched.rows.map((r) => r.client.name)).toContain("Michael & Sarah Thompson");
  });

  it("counts every status in the overview, adding up to all of the business's requests", async () => {
    const stats = await ctx.t.query(api.crm.requests.stats, { businessId: ctx.qft, today });
    const all = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs, size: 100 });
    expect(Object.keys(stats.counts).sort()).toEqual(["Consultation", "Converted", "Lost", "New", "Overdue"]);
    expect(Object.values(stats.counts).reduce((a, b) => a + b, 0)).toBe(all.total);
    expect(stats.conversionRate).toBeGreaterThanOrEqual(0);
    expect(stats.conversionRate).toBeLessThanOrEqual(100);
  });

  it("agrees with the client page: the same project shows the same stage", async () => {
    const r = await ctx.t.query(api.crm.requests.list, { businessId: ctx.qft, ...requestArgs });
    const row = r.rows[0];
    const projects = await ctx.t.query(api.crm.projects.byClient, { clientId: row.clientId as Id<"clients"> });
    expect(projects.find((p) => p._id === row.id)?.stage).toBe(row.stage);
  });
});
