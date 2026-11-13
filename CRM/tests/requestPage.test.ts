/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOW, seeded } from "./pipelineSeed";

/* The request page's Product / Service lines and On-site assessment (the assessment is a consultation on the Schedule). */

const line = (over: Partial<{ name: string; description: string; quantity: number; unitPriceCents: number }> = {}) => ({ name: "Turf install", description: "", quantity: 2, unitPriceCents: 150_00, ...over });

describe("request lines", () => {
  it("saves lines, drops blank rows, and reads them back", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.requests.setLines, { id: w.project, lines: [line(), { name: "", description: "", quantity: 1, unitPriceCents: 0 }] });
    const r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r?.lines).toEqual([line()]);
  });

  it("rejects a line with no name, a zero quantity or a negative price", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.requests.setLines, { id: w.project, lines: [line({ name: " ", unitPriceCents: 500 })] })).rejects.toThrow();
    await expect(w.sales.mutation(api.crm.requests.setLines, { id: w.project, lines: [line({ quantity: 0 })] })).rejects.toThrow();
    await expect(w.sales.mutation(api.crm.requests.setLines, { id: w.project, lines: [line({ unitPriceCents: -1 })] })).rejects.toThrow();
  });

  it("lets only an editor in the business change them", async () => {
    const w = await seeded();
    await expect(w.pm.mutation(api.crm.requests.setLines, { id: w.project, lines: [line()] })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.requests.setLines, { id: w.project, lines: [line()] })).rejects.toThrow();
  });

  it("creates a request with lines", async () => {
    const w = await seeded();
    const id = await w.sales.mutation(api.crm.requests.create, { businessId: w.qft, clientId: w.clientId, title: "Patio", lines: [line()] });
    expect((await w.sales.query(api.crm.requests.get, { id, today: NOW }))?.lines).toEqual([line()]);
  });
});

describe("request assessment", () => {
  it("shows the consultation booked for the request, with its instructions", async () => {
    const w = await seeded();
    expect((await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW }))?.assessment).toBeNull();
    await w.sales.mutation(api.crm.schedule.book, {
      businessId: w.qft, type: "consultation", title: "Test turf", start: NOW + 86_400_000, end: NOW + 86_400_000 + 3_600_000, assigneeIds: [],
      opportunityId: w.project, notes: "Gate code 1234", now: NOW,
    });
    const r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r?.assessment).toMatchObject({ start: NOW + 86_400_000, anytime: false, status: "upcoming", instructions: "Gate code 1234" });
    expect(r?.assessmentAt).toBe(NOW + 86_400_000);
  });
});

describe("request update", () => {
  it("changes the title and service details separately, and keeps the search text in step", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.requests.update, { id: w.project, details: "  Gate on the left  " });
    let r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r).toMatchObject({ details: "Gate on the left", title: "Test turf" });
    await w.sales.mutation(api.crm.requests.update, { id: w.project, title: " Zebra Meadow " });
    r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r).toMatchObject({ title: "Zebra Meadow", details: "Gate on the left" });
    const found = await w.sales.query(api.crm.requests.list, { businessId: w.qft, status: "All", from: null, to: null, search: "Zebra", sortKey: "requestedAt", dir: "desc", today: NOW, page: 1, size: 10 });
    expect(found.rows.map((x) => x.id)).toContain(w.project);
    await w.sales.mutation(api.crm.requests.update, { id: w.project, details: "" });
    expect((await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW }))?.details).toBe("");
  });

  it("refuses an empty title and anyone who cannot edit", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.requests.update, { id: w.project, title: "  " })).rejects.toThrow();
    await expect(w.pm.mutation(api.crm.requests.update, { id: w.project, title: "X" })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.requests.update, { id: w.project, title: "X" })).rejects.toThrow();
  });
});
