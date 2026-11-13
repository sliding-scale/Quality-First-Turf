/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { STARTER_DISCLAIMERS, checkDisclaimer, sameTitle } from "../../convex/crm/lib/disclaimers";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";
import { full, quoteWorld } from "./quoteSeed";

describe("disclaimer rules", () => {
  it("needs a title and wording, within the limits", () => {
    expect(checkDisclaimer({ title: "Payment", text: "Due on completion." })).toBeNull();
    expect(checkDisclaimer({ title: " ", text: "x" })).toMatch(/title/i);
    expect(checkDisclaimer({ title: "x", text: "  " })).toMatch(/wording/i);
    expect(checkDisclaimer({ title: "x".repeat(121), text: "x" })).toMatch(/too long/);
    expect(checkDisclaimer({ title: "x", text: "x".repeat(3001) })).toMatch(/too long/);
  });

  it("tells titles apart ignoring case and spaces, and the starter set has none repeated", () => {
    expect(sameTitle(" Warranty ", "warranty")).toBe(true);
    expect(new Set(STARTER_DISCLAIMERS.map((d) => d.title.toLowerCase())).size).toBe(STARTER_DISCLAIMERS.length);
    expect(STARTER_DISCLAIMERS.every((d) => checkDisclaimer(d) === null)).toBe(true);
  });
});

describe("the disclaimer library", () => {
  it("adds the starter set once, and deleting them all does not bring them back", async () => {
    const w = await seeded();
    expect((await w.sales.query(api.crm.disclaimers.list, { businessId: w.qft })).seeded).toBe(false);
    await w.sales.mutation(api.crm.disclaimers.ensureDefaults, { businessId: w.qft, now: 1 });
    await w.sales.mutation(api.crm.disclaimers.ensureDefaults, { businessId: w.qft, now: 2 });
    const lib = await w.sales.query(api.crm.disclaimers.list, { businessId: w.qft });
    expect(lib.seeded).toBe(true);
    expect(lib.items).toHaveLength(STARTER_DISCLAIMERS.length);
    for (const d of lib.items) await w.admin.mutation(api.crm.disclaimers.remove, { id: d.id });
    await w.sales.mutation(api.crm.disclaimers.ensureDefaults, { businessId: w.qft, now: 3 });
    expect((await w.sales.query(api.crm.disclaimers.list, { businessId: w.qft })).items).toHaveLength(0);
  });

  it("does not turn on or blank the default contract text when it adds the starters", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.disclaimers.ensureDefaults, { businessId: w.qft, now: 1 });
    const text = await w.sales.query(api.crm.quotes.contractDefault, { businessId: w.qft });
    expect(text.length).toBeGreaterThan(10);
  });

  it("lets Admins and the Office team change it, and nobody else", async () => {
    const w = await seeded();
    const id = await w.admin.mutation(api.crm.disclaimers.save, { businessId: w.qft, title: "Gate code", text: "Call first.", now: 1 });
    await w.admin.mutation(api.crm.disclaimers.save, { businessId: w.qft, id, title: "Gate codes", text: "Call first, please.", now: 2 });
    const { items } = await w.admin.query(api.crm.disclaimers.list, { businessId: w.qft });
    expect(items.find((i) => i.id === id)).toMatchObject({ title: "Gate codes", text: "Call first, please." });
    const office = await signedInAs(w.base, { key: "office-1", roles: ["office"], businessIds: [w.qft], name: "Olga Office" });
    await office.mutation(api.crm.disclaimers.save, { businessId: w.qft, title: "From the office", text: "Hello.", now: 3 });
    await expect(w.sales.mutation(api.crm.disclaimers.save, { businessId: w.qft, title: "Nope", text: "x", now: 3 })).rejects.toThrow(/Admin or the Office/);
    await expect(w.pm.mutation(api.crm.disclaimers.remove, { id })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.disclaimers.list, { businessId: w.qft })).rejects.toThrow();
    await expect(w.admin.mutation(api.crm.disclaimers.save, { businessId: w.qft, title: " gate codes ", text: "dup", now: 4 })).rejects.toThrow(/already/);
  });
});

describe("attaching disclaimers to a quote", () => {
  it("keeps a copy on the quote, shows it on the client's link, and survives changes to the library", async () => {
    const w = await quoteWorld();
    const id = await w.admin.mutation(api.crm.disclaimers.save, { businessId: w.qft, title: "Warranty", text: "One year.", now: 1 });
    await w.sales.mutation(api.crm.quoteDraft.save, { id: w.quoteId, ...full(), disclaimers: [{ title: "Warranty", text: "One year." }, { title: "Weather", text: "Rain delays." }] });
    expect((await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))?.disclaimers).toEqual([{ title: "Warranty", text: "One year." }, { title: "Weather", text: "Rain delays." }]);
    await w.admin.mutation(api.crm.disclaimers.save, { businessId: w.qft, id, title: "Warranty", text: "Two years.", now: 2 });
    await w.admin.mutation(api.crm.disclaimers.remove, { id });
    expect((await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))?.disclaimers[0].text).toBe("One year.");
  });

  it("leaves them alone when a save does not mention them, and copies them when a quote is copied", async () => {
    const w = await quoteWorld();
    await w.sales.mutation(api.crm.quoteDraft.save, { id: w.quoteId, ...full(), disclaimers: [{ title: "Warranty", text: "One year." }] });
    await w.sales.mutation(api.crm.quoteDraft.save, { id: w.quoteId, ...full() });
    expect((await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))?.disclaimers).toHaveLength(1);
    const copy = await w.sales.mutation(api.crm.quoteDraft.duplicate, { id: w.quoteId });
    expect((await w.sales.query(api.crm.quotes.get, { id: copy }))?.disclaimers).toEqual([{ title: "Warranty", text: "One year." }]);
    await w.sales.mutation(api.crm.quoteDraft.save, { id: w.quoteId, ...full(), disclaimers: [] });
    expect((await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))?.disclaimers).toEqual([]);
  });

  it("refuses an empty one, the same one twice, or too many", async () => {
    const w = await quoteWorld();
    const save = (disclaimers: { title: string; text: string }[]) => w.sales.mutation(api.crm.quoteDraft.save, { id: w.quoteId, ...full(), disclaimers });
    await expect(save([{ title: "A", text: " " }])).rejects.toThrow(/wording/);
    await expect(save([{ title: "A", text: "x" }, { title: " a ", text: "y" }])).rejects.toThrow(/once/);
    await expect(save(Array.from({ length: 21 }, (_, i) => ({ title: `T${i}`, text: "x" })))).rejects.toThrow(/up to 20/);
  });
});
