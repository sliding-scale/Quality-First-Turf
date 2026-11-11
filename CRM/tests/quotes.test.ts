/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { quoteTotals } from "../../convex/crm/lib/quoteMath";
import { DAY_MS } from "../../convex/crm/lib/stages";
import schema from "../../convex/schema";
import { adminOf, signedInAs } from "./helpers";

/* Quotes (D-056): the list, its filters and figures, one quote's page, who may see them, and the import that put the first one in. */

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const TODAY = Date.UTC(2026, 10, 8); // Nov 8, 2026: the "today" the backend is told about
const rejects = async (p: Promise<unknown>, message: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to be rejected").not.toBeNull();
  expect(String(err instanceof ConvexError ? err.data : err.message)).toMatch(message);
};

const base = { status: "All", from: null, to: null, salesperson: null, search: "", sortKey: "createdAt", dir: "desc" } as const;

async function world() {
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  const t = convexTest(schema, modules);
  await t.mutation(internal.crm.seed.run, {});
  const admin = await adminOf(t);
  const [qft, , patios] = (await admin.query(api.crm.businesses.list, {})).map((b) => b._id);
  const slug = (await admin.query(api.crm.businesses.list, {})).find((b) => b._id === qft)!.slug;
  const clientId = await admin.mutation(api.crm.clients.create, {
    businessId: qft, type: "homeowner", first: "Quinn", last: "Quotable", company: "", phone: "9095550100", email: "quinn@example.com",
    street1: "12 Test Lane", street2: "", city: "San Jacinto", state: "CA", zip: "92582", notes: "",
  });
  const clientName = (await t.run((ctx) => ctx.db.get(clientId)))!.name;
  return { t, admin, qft, patios, slug, clientId, clientName };
}
type World = Awaited<ReturnType<typeof world>>;

const line = (name: string, cents: number, over: object = {}) => ({ name, description: `${name} description`, quantity: 1, unitPriceCents: cents, optional: false, selected: true, ...over });

function quoteArgs(w: World, over: object = {}) {
  return {
    businessSlug: w.slug, clientName: w.clientName, number: 1, title: "Patio", status: "Draft" as const, salesperson: "Office Manager",
    createdAt: TODAY - 20 * DAY_MS, introHeading: "Intro", introText: "Intro text", clientMessage: "Hello", contract: "Terms", depositPercent: 10,
    lines: [line("Pavers", 480000), line("Wall", 220000), line("Steps", 65000, { optional: true }), line("Lights", 38000, { optional: true, selected: false })],
    notes: [],
    ...over,
  };
}
const add = (w: World, over: object = {}) => w.t.mutation(internal.crm.quoteImport.importQuote, quoteArgs(w, over));

describe("quote money", () => {
  it("adds up only the lines that are in the quote, in whole cents", () => {
    const lines = [
      { quantity: 1, unitPriceCents: 480000, optional: false, selected: true },
      { quantity: 1, unitPriceCents: 65000, optional: true, selected: true },
      { quantity: 1, unitPriceCents: 38000, optional: true, selected: false }, // not ticked: not included
    ];
    expect(quoteTotals(lines, 10, 0)).toEqual({ subtotalCents: 545000, discountCents: 0, taxCents: 0, totalCents: 545000, depositCents: 54500, depositCollectedCents: 0, depositOutstandingCents: 54500 });
    expect(quoteTotals(lines, 10, 54500).depositOutstandingCents).toBe(0);
    expect(quoteTotals(lines, 10, 99999).depositOutstandingCents).toBe(0); // never negative
    expect(quoteTotals([{ quantity: 3, unitPriceCents: 3333, optional: false, selected: true }], 33, 0)).toMatchObject({ totalCents: 9999, depositCents: 3300 });
  });
});

describe("importing a quote", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("stores the quote with its lines, notes and total, and links the client", async () => {
    const r = await add(w);
    expect(r).toMatchObject({ totalCents: 765000, lines: 4, notes: 0 });
    const quote = await w.t.run((ctx) => ctx.db.get(r.quoteId));
    expect(quote).toMatchObject({ number: 1, title: "Patio", status: "Draft", clientId: w.clientId, totalCents: 480000 + 220000 + 65000 });
  });

  it("refuses a number that is already taken, an unknown client, and a request the client does not have", async () => {
    await add(w);
    await rejects(add(w), /already exists/);
    await rejects(add(w, { number: 2, clientName: "Nobody At All" }), /exactly one client/);
    await rejects(add(w, { number: 3, requestCode: "NOPE-123" }), /no request with the code/);
    await rejects(add(w, { number: 4, lines: [] }), /at least one line/);
    await rejects(add(w, { number: 5, businessSlug: "no-such-business" }), /No business/);
  });
});

describe("the quotes list", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
    await add(w, { number: 1, title: "Patio & Retaining Wall", status: "Converted", sentAt: TODAY - 20 * DAY_MS, convertedAt: TODAY - 19 * DAY_MS, createdAt: TODAY - 21 * DAY_MS });
    await add(w, { number: 2, title: "Turf front yard", status: "Draft", salesperson: "Sal", createdAt: TODAY - 5 * DAY_MS, lines: [line("Turf", 150000)] });
    await add(w, { number: 3, title: "Pergola", status: "Awaiting response", salesperson: "Sal", sentAt: TODAY - 45 * DAY_MS, createdAt: TODAY - 46 * DAY_MS, lines: [line("Pergola", 900000)] });
  });
  const list = (over: object = {}) => w.admin.query(api.crm.quotes.list, { businessId: w.qft, ...base, page: 1, size: 10, ...over });

  it("lists them newest first, with the client, property and total", async () => {
    const r = await list();
    expect(r.total).toBe(3);
    expect(r.rows.map((x) => x.number)).toEqual([2, 1, 3]);
    expect(r.rows[1]).toMatchObject({ clientName: w.clientName, property: "12 Test Lane, San Jacinto, CA 92582", totalCents: 765000, status: "Converted" });
  });

  it("filters by status, salesperson and created date, and they combine", async () => {
    expect((await list({ status: "Draft" })).rows.map((x) => x.number)).toEqual([2]);
    expect((await list({ salesperson: "Sal" })).rows.map((x) => x.number)).toEqual([2, 3]);
    expect((await list({ salesperson: "Office Manager" })).rows.map((x) => x.number)).toEqual([1]);
    expect((await list({ from: TODAY - 30 * DAY_MS, to: TODAY })).rows.map((x) => x.number)).toEqual([2, 1]);
    expect((await list({ salesperson: "Sal", status: "Awaiting response", from: TODAY - 60 * DAY_MS })).rows.map((x) => x.number)).toEqual([3]);
    expect((await list({ status: "Archived" })).total).toBe(0);
  });

  it("searches by title, client and number", async () => {
    expect((await list({ search: "pergola" })).rows.map((x) => x.number)).toEqual([3]);
    expect((await list({ search: "Quotable" })).total).toBe(3);
    expect((await list({ search: "nothing like this" })).total).toBe(0);
  });

  it("sorts and pages on the server", async () => {
    expect((await list({ sortKey: "total", dir: "desc" })).rows.map((x) => x.number)).toEqual([3, 1, 2]);
    expect((await list({ sortKey: "number", dir: "asc" })).rows.map((x) => x.number)).toEqual([1, 2, 3]);
    expect((await list({ sortKey: "status", dir: "asc" })).rows.map((x) => x.status)).toEqual(["Draft", "Awaiting response", "Converted"]);
    const page2 = await list({ size: 2, page: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(page2).toMatchObject({ total: 3, page: 2 });
  });

  it("names the salespeople on this business's quotes, once each", async () => {
    expect(await w.admin.query(api.crm.quotes.salespeople, { businessId: w.qft })).toEqual(["Office Manager", "Sal"]);
    expect(await w.admin.query(api.crm.quotes.salespeople, { businessId: w.patios })).toEqual([]);
  });

  it("counts statuses, and sent, converted and conversion for the past 30 days against the 30 before", async () => {
    const s = await w.admin.query(api.crm.quotes.stats, { businessId: w.qft, today: TODAY });
    expect(s.counts).toEqual({ Draft: 1, "Awaiting response": 1, "Changes requested": 0, Approved: 0, Rejected: 0, Converted: 1, Archived: 0 });
    expect(s.sent).toEqual({ count: 1, cents: 765000, countBefore: 1 }); // #1 now, #3 in the 30 days before
    expect(s.converted).toEqual({ count: 1, cents: 765000, countBefore: 0 });
    expect(s.conversionRate).toBe(100); // one sent, and it was converted
    expect(s.conversionRateBefore).toBe(0); // #3 was sent and never converted
  });
});

describe("one quote", () => {
  let w: World;
  let id: Id<"quotes">;
  beforeEach(async () => {
    w = await world();
    const file = (text: string) => w.t.run((ctx) => ctx.storage.store(new Blob([text])));
    const r = await add(w, {
      status: "Converted", signedBy: "May", signedAt: TODAY, approvedAt: TODAY, sentAt: TODAY - DAY_MS, depositCollectedCents: 72700, depositCollectedAt: TODAY,
      introImageId: await file("hero"), signatureImageId: await file("sig"),
      lines: [line("Pavers", 480000, { imageId: await file("p") }), line("Steps", 65000, { optional: true }), line("Lights", 38000, { optional: true, selected: false })],
      notes: [{ text: "Signed copy", author: "Jobber", createdAt: TODAY, attachmentId: await file("pdf"), attachmentName: "signed.pdf" }],
    });
    id = r.quoteId;
  });

  it("gives the page everything: client, lines with picture addresses, notes, and totals worked out from the lines", async () => {
    // Break the stored total on purpose: the page must still show what the lines add up to.
    await w.t.run((ctx) => ctx.db.patch(id, { totalCents: 1 }));
    const q = (await w.admin.query(api.crm.quotes.get, { id }))!;
    expect(q).toMatchObject({ number: 1, status: "Converted", signedBy: "May", salesperson: "Office Manager", client: { name: w.clientName, email: "quinn@example.com" } });
    expect(q.totals).toEqual({ subtotalCents: 545000, discountCents: 0, taxCents: 0, totalCents: 545000, depositCents: 54500, depositCollectedCents: 72700, depositOutstandingCents: 0 });
    expect(q.lines.map((l) => [l.name, l.optional, l.selected])).toEqual([["Pavers", false, true], ["Steps", true, true], ["Lights", true, false]]);
    expect(q.lines[0].imageUrl).toMatch(/^https?:/);
    expect(q.introImageUrl).toMatch(/^https?:/);
    expect(q.signatureUrl).toMatch(/^https?:/);
    expect(q.notes).toMatchObject([{ author: "Jobber", text: "Signed copy", attachmentName: "signed.pdf" }]);
    expect(q.notes[0].attachmentUrl).toMatch(/^https?:/);
  });

  it("is null for a quote that does not exist", async () => {
    await w.t.run((ctx) => ctx.db.delete(id));
    expect(await w.admin.query(api.crm.quotes.get, { id })).toBeNull();
  });
});

describe("who can see quotes", () => {
  let w: World;
  let id: Id<"quotes">;
  beforeEach(async () => {
    w = await world();
    id = (await add(w)).quoteId;
  });

  it("is closed to anyone not signed in, and to people from another business", async () => {
    await rejects(w.t.query(api.crm.quotes.list, { businessId: w.qft, ...base, page: 1, size: 10 }), /Not signed in/);
    await rejects(w.t.query(api.crm.quotes.get, { id }), /Not signed in/);
    const patiosOnly = await signedInAs(w.t, { key: "pat", roles: ["sales"], businessIds: [w.patios] });
    await rejects(patiosOnly.query(api.crm.quotes.list, { businessId: w.qft, ...base, page: 1, size: 10 }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.quotes.stats, { businessId: w.qft, today: TODAY }), /No access to this business/);
    await rejects(patiosOnly.query(api.crm.quotes.salespeople, { businessId: w.qft }), /No access to this business/);
    expect(await patiosOnly.query(api.crm.quotes.get, { id })).toBeNull(); // looks like it does not exist
  });

  it("can be read by every role that can see the business, including Project Managers", async () => {
    const pm = await signedInAs(w.t, { key: "pm", roles: ["pm"], businessIds: [w.qft] });
    expect((await pm.query(api.crm.quotes.list, { businessId: w.qft, ...base, page: 1, size: 10 })).total).toBe(1);
    expect(await pm.query(api.crm.quotes.get, { id })).not.toBeNull();
  });
});

describe("deleting a client who has quotes", () => {
  it("counts them, deletes them with their lines, notes and stored files, and leaves other clients' quotes alone", async () => {
    const w = await world();
    const file = (text: string) => w.t.run((ctx) => ctx.storage.store(new Blob([text])));
    const hero = await file("hero");
    const pdf = await file("pdf");
    const sig = await file("sig");
    await add(w, { introImageId: hero, signatureImageId: sig, notes: [{ text: "n", author: "Jobber", createdAt: TODAY, attachmentId: pdf, attachmentName: "a.pdf" }] });

    const otherId = await w.admin.mutation(api.crm.clients.create, {
      businessId: w.qft, type: "homeowner", first: "Other", last: "Person", company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "",
    });
    const otherName = (await w.t.run((ctx) => ctx.db.get(otherId)))!.name;
    await add(w, { number: 2, clientName: otherName });

    expect(await w.admin.query(api.crm.clients.deletePreview, { ids: [w.clientId] })).toMatchObject({ quotes: 1 });
    await w.admin.mutation(api.crm.clients.remove, { ids: [w.clientId] });

    const left = await w.t.run(async (ctx) => ({
      quotes: (await ctx.db.query("quotes").collect()).map((q) => q.number),
      lines: (await ctx.db.query("quoteLineItems").collect()).length,
      notes: (await ctx.db.query("quoteNotes").collect()).length,
      hero: await ctx.storage.getUrl(hero),
      pdf: await ctx.storage.getUrl(pdf),
      sig: await ctx.storage.getUrl(sig),
    }));
    expect(left.quotes).toEqual([2]);
    expect(left.lines).toBe(4); // only the other client's four lines remain
    expect(left.notes).toBe(0);
    expect(left.hero).toBeNull();
    expect(left.pdf).toBeNull();
    expect(left.sig).toBeNull();
  });
});

describe("deleting a quote", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });
  const file = (text: string) => w.t.run((ctx) => ctx.storage.store(new Blob([text])));

  it("deletes the quote with its lines, notes and stored files, and leaves other quotes alone", async () => {
    const hero = await file("hero");
    const sig = await file("sig");
    const pdf = await file("pdf");
    const first = await add(w, { number: 1, introImageId: hero, signatureImageId: sig, notes: [{ text: "n", author: "Jobber", createdAt: TODAY, attachmentId: pdf, attachmentName: "a.pdf" }] });
    await add(w, { number: 2 });

    expect(await w.admin.mutation(api.crm.quotes.remove, { id: first.quoteId })).toBe(1);

    const left = await w.t.run(async (ctx) => ({
      quotes: (await ctx.db.query("quotes").collect()).map((q) => q.number),
      lines: (await ctx.db.query("quoteLineItems").collect()).length,
      notes: (await ctx.db.query("quoteNotes").collect()).length,
      files: [await ctx.storage.getUrl(hero), await ctx.storage.getUrl(sig), await ctx.storage.getUrl(pdf)],
    }));
    expect(left.quotes).toEqual([2]);
    expect(left.lines).toBe(4); // only quote 2's four lines remain
    expect(left.notes).toBe(0);
    expect(left.files).toEqual([null, null, null]);
    expect(await w.admin.query(api.crm.quotes.get, { id: first.quoteId })).toBeNull();
    await rejects(w.admin.mutation(api.crm.quotes.remove, { id: first.quoteId }), /no longer exists/);
  });

  it("is for people who may edit in that business: Sales and Office can, Project Managers and other businesses cannot", async () => {
    const q = await add(w);
    await rejects(w.t.mutation(api.crm.quotes.remove, { id: q.quoteId }), /Not signed in/);
    const pm = await signedInAs(w.t, { key: "pm", roles: ["pm"], businessIds: [w.qft] });
    await rejects(pm.mutation(api.crm.quotes.remove, { id: q.quoteId }), /view this but not change/);
    const patiosOnly = await signedInAs(w.t, { key: "pat", roles: ["sales"], businessIds: [w.patios] });
    await rejects(patiosOnly.mutation(api.crm.quotes.remove, { id: q.quoteId }), /No access to this business/);
    expect(await w.admin.query(api.crm.quotes.get, { id: q.quoteId })).not.toBeNull(); // none of that changed anything

    const sales = await signedInAs(w.t, { key: "sales", roles: ["sales"], businessIds: [w.qft] });
    await expect(sales.mutation(api.crm.quotes.remove, { id: q.quoteId })).resolves.toBe(1);
  });
});
