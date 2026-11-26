/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const store = (w: Awaited<ReturnType<typeof seeded>>, type: string, bytes = 100) =>
  w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }))) as Promise<Id<"_storage">>;

describe("the opportunity page", () => {
  it("shows the project, its client and stage, and nothing to confirm before a quote is approved", async () => {
    const w = await seeded({ stage: "New Request" });
    const o = await w.sales.query(api.crm.opportunityPage.overview, { id: w.project });
    expect(o).toMatchObject({ code: "TST-001", title: "Test turf", stage: "New Request", group: "Requests", confirmed: null, contract: { state: "noquote" }, deposit: { required: false } });
    expect(o?.stages[0]).toBe("New Request");
    expect(o?.client.name).toBeTruthy();
  });

  it("confirms the services from the approved, signed quote", async () => {
    const w = await seeded();
    await signedQuote(w);
    const o = await w.sales.query(api.crm.opportunityPage.overview, { id: w.project });
    expect(o?.confirmed).toMatchObject({ number: 1, status: "Approved", lines: [{ name: "Turf", quantity: 2, totalCents: 100000 }] });
    expect(o?.contract.state).toBe("signed");
    const list = await w.sales.query(api.crm.opportunityPage.quotes, { id: w.project });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ number: 1, status: "Approved" });
  });

  it("keeps files on the project, lists them with the signed contract, and removes them", async () => {
    const w = await seeded();
    const id = await w.sales.mutation(api.crm.opportunityPage.addFile, { id: w.project, storageId: await store(w, "application/pdf"), name: "Site plan.pdf", kind: "plan", now: 5 });
    await w.sales.mutation(api.crm.opportunityPage.addFile, { id: w.project, storageId: await store(w, "image/jpeg"), name: "Yard.jpg", kind: "photo", now: 6 });
    let files = await w.sales.query(api.crm.opportunityPage.files, { id: w.project });
    expect(files.map((f) => f.name)).toEqual(["Yard.jpg", "Site plan.pdf"]);
    expect(files[1]).toMatchObject({ source: "uploaded", kind: "plan", by: "Sam Sales" });
    expect(files[0].url).toBeTruthy();
    await w.sales.mutation(api.crm.opportunityPage.removeFile, { fileId: files[1].fileId! });
    files = await w.sales.query(api.crm.opportunityPage.files, { id: w.project });
    expect(files.map((f) => f.name)).toEqual(["Yard.jpg"]);
    expect(id).toBeTruthy();
  });

  it("refuses files that are not a PDF or image, are too big, or come from someone who cannot edit", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.opportunityPage.addFile, { id: w.project, storageId: await store(w, "text/plain"), name: "x.txt", kind: "other", now: 1 })).rejects.toThrow(/PDF or an image/);
    await expect(w.sales.mutation(api.crm.opportunityPage.addFile, { id: w.project, storageId: await store(w, "application/pdf", 26 * 1024 * 1024), name: "big.pdf", kind: "plan", now: 1 })).rejects.toThrow(/25 MB/);
    await expect(w.pm.mutation(api.crm.opportunityPage.addFile, { id: w.project, storageId: await store(w, "application/pdf"), name: "a.pdf", kind: "plan", now: 1 })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.opportunityPage.files, { id: w.project })).rejects.toThrow();
  });

  it("puts stage moves, notes and quote events on one timeline, newest first", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Schedule Onsite Consultation", now: 100 });
    await w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "Call about the gate", files: [] });
    const timeline = await w.sales.query(api.crm.opportunityPage.activity, { id: w.project });
    expect(timeline.map((t) => t.kind)).toEqual(expect.arrayContaining(["created", "stage", "note"]));
    expect(timeline.find((t) => t.kind === "stage")).toMatchObject({ title: "Moved to Schedule Onsite Consultation", who: "Sam Sales" });
    expect([...timeline].sort((a, b) => b.at - a.at)).toEqual(timeline);
  });

  it("says when a project has no site visit behind it", async () => {
    const w = await seeded();
    expect(await w.sales.query(api.crm.opportunityPage.visit, { id: w.project })).toMatchObject({ available: false });
  });
});
