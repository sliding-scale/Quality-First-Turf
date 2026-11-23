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

describe("saving a visit", () => {
  it("keeps the areas and photos, and stamps the date only when the visit is completed", async () => {
    const w = await seeded();
    const photo = await image(w);
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "Dog in yard", areas: [area({ photoIds: [photo] })], complete: false, now: 1000 });
    let v = await w.sales.query(api.crm.opportunityVisit.get, { id: w.project });
    expect(v).toMatchObject({ source: "crm", notes: "Dog in yard", visitedAt: null });
    expect(v.areas).toHaveLength(1);
    expect(v.areas[0]).toMatchObject({ label: "Front lawn", length: 20, width: 10 });
    expect(v.areas[0].photos[0].url).toBeTruthy();
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "Dog in yard", areas: [area({ photoIds: [photo] })], complete: true, now: 2000 });
    v = await w.sales.query(api.crm.opportunityVisit.get, { id: w.project });
    expect(v.visitedAt).toBe(2000);
  });

  it("is for people who may edit the project, and not for another business", async () => {
    const w = await seeded();
    await expect(w.pm.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [], complete: false, now: 1 })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [], complete: false, now: 1 })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.opportunityVisit.get, { id: w.project })).rejects.toThrow();
    await expect(w.pm.query(api.crm.opportunityVisit.get, { id: w.project })).resolves.toMatchObject({ source: "none", canEdit: false });
  });

  it("refuses a photo that is not an image, a missing photo, and bad areas, and saves nothing", async () => {
    const w = await seeded();
    const notImage = (await w.base.run((ctx) => ctx.storage.store(new Blob(["hi"], { type: "text/plain" })))) as Id<"_storage">;
    await expect(w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area({ photoIds: [notImage] })], complete: false, now: 1 })).rejects.toThrow(/image/i);
    await expect(w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area({ label: "" })], complete: false, now: 1 })).rejects.toThrow(/name/i);
    expect((await w.sales.query(api.crm.opportunityVisit.get, { id: w.project })).source).toBe("none");
  });

  it("is recorded in the client's activity history", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area()], complete: true, now: 5 });
    const list = await w.sales.query(api.crm.clientActivity.list, { clientId: w.clientId });
    expect(list.some((e) => e.title === "Site visit completed" && e.detail.includes("1 work area"))).toBe(true);
  });
});

describe("starting from the customer form", () => {
  it("shows the form's work areas until the first save, then the CRM's own", async () => {
    const w = await seeded();
    await withForm(w);
    const before = await w.sales.query(api.crm.opportunityVisit.get, { id: w.project });
    expect(before.source).toBe("form");
    expect(before.areas.map((a) => a.label)).toEqual(["Back yard"]);
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "x", areas: before.areas.map((a) => ({ id: a.id, label: a.label, service: a.service, installType: a.installType, length: a.length, width: a.width, quantity: a.quantity, notes: a.notes, photoIds: a.photos.map((p) => p.id) })), complete: false, now: 1 });
    const after = await w.sales.query(api.crm.opportunityVisit.get, { id: w.project });
    expect(after.source).toBe("crm");
    expect(after.areas.map((a) => a.label)).toEqual(["Back yard"]);
    expect(after.areas[0].photos).toHaveLength(1);
  });

  it("deletes a removed photo only when the customer form is not using it", async () => {
    const w = await seeded();
    const formPhoto = await withForm(w);
    const own = await image(w);
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area({ photoIds: [own, formPhoto] })], complete: false, now: 1 });
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area({ photoIds: [] })], complete: false, now: 2 });
    expect(await w.base.run((ctx) => ctx.storage.getUrl(own))).toBeNull();
    expect(await w.base.run((ctx) => ctx.storage.getUrl(formPhoto))).not.toBeNull();
  });

  it("is what the quote and the takeoff read, in place of the form's areas", async () => {
    const w = await seeded();
    await withForm(w);
    const opp = (await w.base.run((ctx) => ctx.db.get(w.project)))!;
    expect((await w.base.run((ctx) => workAreasOf(ctx, opp)))!.map((a) => a.label)).toEqual(["Back yard"]);
    await w.sales.mutation(api.crm.opportunityVisit.save, { id: w.project, notes: "", areas: [area({ label: "Side yard" })], complete: false, now: 1 });
    expect((await w.base.run((ctx) => workAreasOf(ctx, opp)))!.map((a) => a.label)).toEqual(["Side yard"]);
  });
});
