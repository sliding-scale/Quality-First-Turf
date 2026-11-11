/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { zonedToMs } from "../../convex/crm/lib/schedule";
import { NOW, seeded } from "./pipelineSeed";

const TZ = "America/Los_Angeles";
export const at = (d: number, h: number, min = 0) => zonedToMs(2026, 11, d, h, min, TZ); // Nov 2026: the 10th is a Tuesday

async function world() {
  const w = await seeded();
  const people = await w.admin.query(api.crm.pipeline.people, { businessId: w.qft });
  const sam = people.find((p) => p.name === "Sam Sales")!.id as Id<"users">;
  const adminId = people.find((p) => p.name === "Sal")!.id as Id<"users">;
  return { ...w, sam, adminId };
}
const base = { anytime: false, notes: "", now: NOW } as const;
const window = (qft: Id<"businesses">, d = 10) => ({ businessId: qft, from: at(d, 0), to: at(d + 1, 0), types: [], assigneeIds: [], statuses: [], now: NOW });

describe("booking and double-booking", () => {
  it("books an item and reads it back", async () => {
    const { sales, qft, sam } = await world();
    const id = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "  Follow-up at the Lees  ", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] });
    const got = await sales.query(api.crm.schedule.range, window(qft));
    expect(got.items.map((i) => [i.id, i.title, i.kind])).toEqual([[id, "Follow-up at the Lees", "visit"]]);
  });

  it("allows bookings that touch and refuses one minute of overlap, naming the person and the clash", async () => {
    const { sales, qft, sam } = await world();
    const b = (type: "visit" | "event", s: number, e: number) => sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type, title: "X", start: s, end: e, assigneeIds: [sam] });
    await b("visit", at(10, 10), at(10, 11));
    await b("event", at(10, 11), at(10, 12)); // touching is fine
    await expect(b("visit", at(10, 10, 59), at(10, 11, 30))).rejects.toThrow(/Sam Sales is busy with "X"/);
  });

  it("lets different people share a time, and reminders never block", async () => {
    const { sales, admin, qft, sam, adminId } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "A", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] });
    await admin.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "B", start: at(10, 10), end: at(10, 11), assigneeIds: [adminId] });
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "reminder", title: "R", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] });
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "C", start: at(10, 11), end: at(10, 12), assigneeIds: [sam] });
  });

  it("treats a repeating event as busy every time it repeats", async () => {
    const { sales, qft, sam } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "Team call", start: at(2, 9), end: at(2, 10), assigneeIds: [sam], repeat: "weekly" });
    await expect(
      sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "Clash", start: at(16, 9, 30), end: at(16, 10, 30), assigneeIds: [sam] }),
    ).rejects.toThrow(/busy with "Team call"/);
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "Fine", start: at(17, 9, 30), end: at(17, 10, 30), assigneeIds: [sam] });
  });

  it("does not count an item as clashing with its own old time when it is moved", async () => {
    const { sales, qft, sam } = await world();
    const id = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "A", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] });
    await sales.mutation(api.crm.schedule.update, { id, start: at(10, 10, 30), end: at(10, 11, 30), now: NOW });
    const got = await sales.query(api.crm.schedule.range, window(qft));
    expect(got.items[0].start).toBe(at(10, 10, 30));
  });

  it("refuses an empty or long title, a backwards time, and someone outside the business", async () => {
    const { sales, base: db, qft, sam } = await world();
    const b = (over: Record<string, unknown>) =>
      sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "T", start: at(10, 10), end: at(10, 11), assigneeIds: [sam], ...over } as never);
    await expect(b({ title: "   " })).rejects.toThrow(/title/i);
    await expect(b({ title: "x".repeat(201) })).rejects.toThrow(/title/i);
    await expect(b({ start: at(10, 11), end: at(10, 10) })).rejects.toThrow(/end/i);
    const olive = await db.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Olive Outsider")!._id);
    await expect(b({ assigneeIds: [olive] })).rejects.toThrow(/not on this business/);
  });

  it("refuses a Project Manager and a person from another business", async () => {
    const { pm, outsider, qft, sam } = await world();
    const args = { ...base, businessId: qft, type: "visit", title: "T", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] } as const;
    await expect(pm.mutation(api.crm.schedule.book, args)).rejects.toThrow();
    await expect(outsider.mutation(api.crm.schedule.book, args)).rejects.toThrow();
    await expect(outsider.query(api.crm.schedule.range, window(qft))).rejects.toThrow();
  });

  it("moves a project to Onsite Consultation only when a consultation is booked from the right stage", async () => {
    const { sales, base: db, qft, sam, project } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "consultation", title: "Walk the yard", start: at(10, 9), end: at(10, 10), assigneeIds: [sam], opportunityId: project });
    expect((await db.run((ctx) => ctx.db.get(project)))?.stage).toBe("New Request"); // not at the scheduling stage: unchanged
    await db.run((ctx) => ctx.db.patch(project, { stage: "Schedule Onsite Consultation" }));
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "consultation", title: "Walk the yard", start: at(11, 9), end: at(11, 10), assigneeIds: [sam], opportunityId: project });
    expect((await db.run((ctx) => ctx.db.get(project)))?.stage).toBe("Onsite Consultation");
    const history = await sales.query(api.crm.pipeline.history, { id: project });
    expect(history[0]).toMatchObject({ from: "Schedule Onsite Consultation", to: "Onsite Consultation" });
  });

  it("changes status and assignment, and removes an item", async () => {
    const { sales, admin, qft, sam, adminId } = await world();
    const id = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "E", start: at(10, 10), end: at(10, 11), assigneeIds: [sam] });
    await sales.mutation(api.crm.schedule.setStatus, { id, status: "completed" });
    await sales.mutation(api.crm.schedule.assign, { id, assigneeIds: [sam, adminId], now: NOW });
    let got = await admin.query(api.crm.schedule.range, window(qft));
    expect(got.items[0]).toMatchObject({ status: "completed", assigneeIds: [sam, adminId] });
    await sales.mutation(api.crm.schedule.remove, { id });
    got = await admin.query(api.crm.schedule.range, window(qft));
    expect(got.items).toHaveLength(0);
  });
});
