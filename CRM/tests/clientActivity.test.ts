/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { changedClientFields } from "../../convex/crm/lib/activity";
import { seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const input = (over: Record<string, string> = {}) => ({
  type: "homeowner" as const, first: "Ada", last: "Lovelace", company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "", ...over,
});

describe("which client fields changed", () => {
  it("names the labels of what differs and ignores what is the same", () => {
    const before = { name: "Ada", phone: "(555) 123-4567", email: "a@b.com", city: "Reno", notes: "" };
    expect(changedClientFields(before, { ...before })).toEqual([]);
    expect(changedClientFields(before, { ...before, phone: "(555) 000-1111", city: "Sparks" })).toEqual(["Phone", "City"]);
  });
});

describe("the client's own activity", () => {
  it("records created, edited (field names only), tags and archived, newest first", async () => {
    const w = await seeded();
    const id = await w.sales.mutation(api.crm.clients.create, { businessId: w.qft, ...input() });
    await w.sales.mutation(api.crm.clients.update, { id, businessId: w.qft, ...input({ phone: "5551234567", city: "Reno" }) });
    await w.sales.mutation(api.crm.clients.setTags, { id, tags: [] });
    await w.sales.mutation(api.crm.clients.archive, { ids: [id] });
    const list = await w.sales.query(api.crm.clientActivity.list, { clientId: id });
    const titles = list.map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining(["Client created", "Client details edited", "Tags changed", "Client archived"]));
    const edited = list.find((e) => e.title === "Client details edited")!;
    expect(edited.detail).toBe("Changed: Phone, City");
    expect(edited.detail).not.toContain("555");
    expect(edited.who).toBe("Sam Sales");
    expect(list.map((e) => e.at)).toEqual([...list.map((e) => e.at)].sort((a, b) => b - a));
  });

  it("does not log an edit that changed nothing", async () => {
    const w = await seeded();
    const id = await w.sales.mutation(api.crm.clients.create, { businessId: w.qft, ...input() });
    await w.sales.mutation(api.crm.clients.update, { id, businessId: w.qft, ...input() });
    expect((await w.sales.query(api.crm.clientActivity.list, { clientId: id })).map((e) => e.title)).toEqual(["Client created"]);
  });

  it("is removed with the client, and cannot be read by another business or by a stranger", async () => {
    const w = await seeded();
    const id = await w.sales.mutation(api.crm.clients.create, { businessId: w.qft, ...input() });
    expect(await w.outsider.query(api.crm.clientActivity.list, { clientId: id })).toEqual([]);
    await w.sales.mutation(api.crm.clients.remove, { ids: [id] });
    const left = await w.base.run((ctx) => ctx.db.query("activities").collect());
    expect(left.filter((a) => a.clientId === id)).toHaveLength(0);
  });
});

describe("the merged timeline", () => {
  it("adds notes, the request, its stage moves and quote events, each only for someone who may see them", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "Call after 5pm" });
    await signedQuote(w);
    const all = await w.sales.query(api.crm.clientActivity.list, { clientId: w.clientId });
    expect(all.some((e) => e.kind === "note" && e.detail.includes("Call after 5pm"))).toBe(true);
    expect(all.some((e) => e.kind === "request" && e.title.startsWith("Request created"))).toBe(true);
    expect(all.some((e) => e.kind === "quote")).toBe(true);

    // An Admin takes away this person's Quotes access: quote events disappear, the rest stays.
    await w.base.run(async (ctx) => {
      const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Sam Sales")!;
      await ctx.db.patch(u._id, { permissions: { quotes: "none" } });
    });
    const limited = await w.sales.query(api.crm.clientActivity.list, { clientId: w.clientId });
    expect(limited.some((e) => e.kind === "quote")).toBe(false);
    expect(limited.some((e) => e.kind === "note")).toBe(true);
  });
});
