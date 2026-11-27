/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { checkVisit, workAreasOf } from "../../convex/crm/lib/visitData";
import { seeded } from "./pipelineSeed";

type W = Awaited<ReturnType<typeof seeded>>;
const image = (w: W, bytes = 100) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }))) as Promise<Id<"_storage">>;
const area = (over: Record<string, unknown> = {}) => ({ id: "a1", label: "Front lawn", service: "Artificial Grass Installation", installType: "Standard", length: 20, width: 10, quantity: null, notes: "", photoIds: [] as Id<"_storage">[], ...over });

/** A customer-form project behind the test project, with one work area and one photo, as the forms app leaves it. */
async function withForm(w: W) {
  const photo = await image(w);
  await w.base.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      status: "discovery saved", firstName: "Form", lastName: "Customer", phone: "", email: "", street1: "1 St", street2: "", city: "Temecula", state: "CA", zip: "92592",
      services: ["Artificial Grass Installation"], products: [], addOns: [], answers: [], notes: "From the form", measurements: [],
      jobberClientId: null, jobberQuoteId: null, missingMapping: null, integrationError: null, shortCode: "FRM1",
    });
    await ctx.db.insert("workAreas", { projectId, label: "Back yard", length: 30, width: 15, quantity: null, notes: "slope", photoIds: [photo], service: "Artificial Grass Installation" });
    await ctx.db.patch(w.project, { sourceProjectId: projectId });
  });
  return photo;
}

describe("the visit rules", () => {
  it("accepts an empty visit and refuses what cannot be a work area", () => {
    expect(checkVisit({ notes: "", areas: [] })).toBeNull();
    expect(checkVisit({ notes: "x".repeat(3001), areas: [] })).toMatch(/too long/);
    expect(checkVisit({ notes: "", areas: Array.from({ length: 31 }, (_, i) => area({ id: `a${i}` })) })).toMatch(/30/);
    expect(checkVisit({ notes: "", areas: [area({ label: "  " })] })).toMatch(/name/i);
    expect(checkVisit({ notes: "", areas: [area({ length: -1 })] })).toMatch(/length/i);
    expect(checkVisit({ notes: "", areas: [area({ width: 0 })] })).toMatch(/width/i);
    expect(checkVisit({ notes: "", areas: [area({ length: 5, width: null })] })).toMatch(/both/i);
    expect(checkVisit({ notes: "", areas: [area({ length: null, width: null, quantity: 0 })] })).toMatch(/quantity/i);
    expect(checkVisit({ notes: "", areas: [area({ id: "x" }), area({ id: "x" })] })).toMatch(/twice|duplicate/i);
    expect(checkVisit({ notes: "", areas: [area({ length: null, width: null, quantity: 3 })] })).toBeNull();
  });
});

/** Books the project's consultation (or a follow-up) and returns its Schedule id, the key of that visit's sheet. */
const book = (w: W, type: "consultation" | "visit" = "consultation", start = 1_900_000_000_000) =>
  w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type, title: type, start, end: start + 3_600_000, assigneeIds: [], opportunityId: w.project, now: 1 });
const tab = async (w: W) => (await w.sales.query(api.crm.opportunityVisit.tab, { id: w.project }))!;
const save = (w: W, eventId: Id<"calendarEvents">, areas: ReturnType<typeof area>[], over: { complete?: boolean; approve?: boolean } = {}) =>
  w.sales.mutation(api.crm.opportunityVisit.saveSheet, { id: w.project, eventId, areas, complete: over.complete ?? false, approve: over.approve, now: 1000 });
const labels = (v: { areas: { label: string }[] }) => v.areas.map((a) => a.label);
const projectAreas = async (w: W) => {
  const opp = (await w.base.run((ctx) => ctx.db.get(w.project)))!;
  return (await w.base.run((ctx) => workAreasOf(ctx, opp)))!.map((a) => a.label);
};

describe("saving a visit", () => {
  it("keeps the areas and photos, and marks the visit done only when it is completed", async () => {
    const w = await seeded();
    const event = await book(w);
    const photo = await image(w);
    await save(w, event, [area({ photoIds: [photo] })]);
    let [v] = (await tab(w)).visits;
    expect(v).toMatchObject({ saved: true, completedAt: null, status: "upcoming" });
    expect(v.areas[0].photos).toHaveLength(1);
    await save(w, event, [area({ photoIds: [photo] })], { complete: true });
    [v] = (await tab(w)).visits;
    expect(v).toMatchObject({ completedAt: 1000, status: "completed" });
  });

  it("gives each visit its own areas, a new one starting from the visit before it", async () => {
    const w = await seeded();
    const first = await book(w);
    await save(w, first, [area({ label: "Back yard" })]);
    const second = await book(w, "visit", 1_900_100_000_000);
    expect((await tab(w)).visits.map(labels)).toEqual([["Back yard"], ["Back yard"]]);
    await save(w, second, [area({ label: "Back yard" }), area({ id: "a2", label: "Side yard" })]);
    expect((await tab(w)).visits.map(labels)).toEqual([["Back yard"], ["Back yard", "Side yard"]]);
    expect(await projectAreas(w)).toEqual(["Back yard", "Side yard"]);
  });

  it("keeps what an earlier unsaved visit showed, and drafts a quote from the latest visit only", async () => {
    const w = await seeded();
    await withForm(w);
    const first = await book(w);
    const second = await book(w, "visit", 1_900_100_000_000);
    await save(w, second, [area({ label: "Side yard" })]);
    expect((await tab(w)).visits.map(labels)).toEqual([["Back yard"], ["Side yard"]]);
    expect(await projectAreas(w)).toEqual(["Side yard"]);
    // Saving the earlier one again leaves the quote on the latest, and it cannot be approved for a quote.
    await save(w, first, [area({ label: "Front yard" })]);
    expect(await projectAreas(w)).toEqual(["Side yard"]);
    await expect(save(w, first, [area({ label: "Front yard" })], { approve: true })).rejects.toThrow(/latest visit/);
    await save(w, second, [area({ label: "Side yard" })], { approve: true });
    expect((await tab(w)).visits[1].status).toBe("completed");
    // A later visit that was lost does not count.
    const third = await book(w, "visit", 1_900_200_000_000);
    await w.sales.mutation(api.crm.schedule.setStatus, { id: third, status: "lost" });
    await save(w, second, [area({ label: "Side yard" })], { approve: true });
  });

  it("saves the notes on their own without losing the customer form's areas", async () => {
    const w = await seeded();
    await withForm(w);
    await book(w);
    await w.sales.mutation(api.crm.opportunityVisit.saveNotes, { id: w.project, notes: "Dog in yard", now: 5 });
    const t = await tab(w);
    expect(t.notes).toBe("Dog in yard");
    expect(t.visits.map(labels)).toEqual([["Back yard"]]);
  });

  it("refuses people who may not edit, a photo that is not an image, a nameless area and a visit of another project", async () => {
    const w = await seeded();
    const event = await book(w);
    await expect(w.pm.mutation(api.crm.opportunityVisit.saveSheet, { id: w.project, eventId: event, areas: [], complete: false, now: 1 })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.opportunityVisit.saveSheet, { id: w.project, eventId: event, areas: [], complete: false, now: 1 })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.opportunityVisit.tab, { id: w.project })).rejects.toThrow();
    await expect(w.pm.query(api.crm.opportunityVisit.tab, { id: w.project })).resolves.toMatchObject({ canEdit: false });
    const notImage = await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(10)], { type: "text/plain" })));
    await expect(save(w, event, [area({ photoIds: [notImage] })])).rejects.toThrow(/image/i);
    await expect(save(w, event, [area({ label: "" })])).rejects.toThrow(/name/i);
    const loose = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "event", title: "x", start: 2_000_000_000_000, end: 2_000_003_600_000, assigneeIds: [], now: 1 });
    await expect(save(w, loose, [])).rejects.toThrow(/no longer on the Schedule/);
  });

  it("is recorded in the client's activity history", async () => {
    const w = await seeded();
    await save(w, await book(w), [area()], { complete: true });
    const list = await w.sales.query(api.crm.clientActivity.list, { clientId: w.clientId });
    expect(list.some((e) => e.title === "Site visit completed" && e.detail.includes("1 work area"))).toBe(true);
  });
});

describe("starting from the customer form", () => {
  it("shows the form's work areas, photos included, until a visit is saved", async () => {
    const w = await seeded();
    await withForm(w);
    const event = await book(w);
    let [v] = (await tab(w)).visits;
    expect(v.saved).toBe(false);
    expect(labels(v)).toEqual(["Back yard"]);
    expect(v.areas[0].photos).toHaveLength(1);
    await save(w, event, [area({ label: "Back yard", photoIds: v.areas[0].photos.map((p) => p.id) })]);
    [v] = (await tab(w)).visits;
    expect(v.saved).toBe(true);
    expect(v.areas[0].photos).toHaveLength(1);
  });

  it("deletes a removed photo only when nothing else uses it", async () => {
    const w = await seeded();
    const formPhoto = await withForm(w);
    const own = await image(w);
    const first = await book(w);
    await save(w, first, [area({ photoIds: [own, formPhoto] })]);
    const second = await book(w, "visit", 1_900_100_000_000);
    await save(w, second, [area({ photoIds: [] })]);
    // The first visit still shows it.
    expect(await w.base.run((ctx) => ctx.storage.getUrl(own))).not.toBeNull();
    await save(w, first, [area({ photoIds: [] })]);
    expect(await w.base.run((ctx) => ctx.storage.getUrl(own))).toBeNull();
    expect(await w.base.run((ctx) => ctx.storage.getUrl(formPhoto))).not.toBeNull();
  });

  it("is what the quote and the takeoff read until a visit is saved", async () => {
    const w = await seeded();
    await withForm(w);
    expect(await projectAreas(w)).toEqual(["Back yard"]);
    await save(w, await book(w), [area({ label: "Side yard" })]);
    expect(await projectAreas(w)).toEqual(["Side yard"]);
  });
});
