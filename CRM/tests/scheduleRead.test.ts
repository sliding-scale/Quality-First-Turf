/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { zonedToMs } from "../../convex/crm/lib/schedule";
import { NOW, seeded } from "./pipelineSeed";

const TZ = "America/Los_Angeles";
const at = (d: number, h: number, min = 0) => zonedToMs(2026, 11, d, h, min, TZ);
const base = { anytime: false, notes: "", now: NOW } as const;

async function world() {
  const w = await seeded();
  const people = await w.admin.query(api.crm.pipeline.people, { businessId: w.qft });
  const sam = people.find((p) => p.name === "Sam Sales")!.id as Id<"users">;
  const adminId = people.find((p) => p.name === "Sal")!.id as Id<"users">;
  return { ...w, sam, adminId };
}
const read = (qft: Id<"businesses">, over: Record<string, unknown> = {}) => ({ businessId: qft, from: at(9, 0), to: at(16, 0), types: [], assigneeIds: [], statuses: [], now: NOW, ...over }) as never;

describe("reading the calendar", () => {
  it("returns an item that crosses midnight for a window covering only its second day", async () => {
    const { sales, qft, sam } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "Late job", start: at(10, 22), end: at(11, 2), assigneeIds: [sam] });
    const got = await sales.query(api.crm.schedule.range, read(qft, { from: at(11, 0), to: at(12, 0) }));
    expect(got.items.map((i) => i.title)).toEqual(["Late job"]);
  });

  it("expands a weekly repeat into one item per week inside the window, each with its own key", async () => {
    const { sales, qft, sam } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "Call", start: at(2, 9), end: at(2, 10), assigneeIds: [sam], repeat: "weekly" });
    const got = await sales.query(api.crm.schedule.range, read(qft, { from: at(1, 0), to: at(22, 0) }));
    expect(got.items).toHaveLength(3);
    expect(new Set(got.items.map((i) => i.key)).size).toBe(3);
    expect((await sales.query(api.crm.schedule.range, read(qft, { from: at(1, 0), to: at(2, 0) }))).items).toHaveLength(0);
  });

  it("filters by type, by person (including Unassigned) and by status, with Overdue worked out from now", async () => {
    const { sales, qft, sam } = await world();
    const mk = (type: "visit" | "reminder", title: string, assigneeIds: Id<"users">[], s: number) =>
      sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type, title, start: s, end: s + 3_600_000, assigneeIds });
    await mk("visit", "Mine", [sam], at(10, 9));
    await mk("reminder", "Nobody", [], at(10, 10));
    const done = await mk("visit", "Done", [sam], at(10, 13));
    await sales.mutation(api.crm.schedule.setStatus, { id: done, status: "completed" });
    const titles = async (over: Record<string, unknown>) => (await sales.query(api.crm.schedule.range, read(qft, { from: at(10, 0), to: at(11, 0), ...over }))).items.map((i) => i.title).sort();
    expect(await titles({})).toEqual(["Done", "Mine", "Nobody"]);
    expect(await titles({ types: ["reminder"] })).toEqual(["Nobody"]);
    expect(await titles({ assigneeIds: ["unassigned"] })).toEqual(["Nobody"]);
    expect(await titles({ assigneeIds: [sam] })).toEqual(["Done", "Mine"]);
    expect(await titles({ statuses: ["completed"] })).toEqual(["Done"]);
    expect(await titles({ now: at(10, 12), statuses: ["overdue"] })).toEqual(["Mine", "Nobody"]);
    expect(await titles({ now: at(10, 12), statuses: ["upcoming"] })).toEqual([]);
  });

  it("shows scheduled tasks but not unscheduled ones", async () => {
    const { sales, admin, qft, project } = await world();
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "Unscheduled task" });
    const scheduled = await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "Call the client" });
    await sales.mutation(api.crm.opportunityTasks.setTime, { taskId: scheduled, startAt: at(10, 14), endAt: at(10, 15) });
    const got = await admin.query(api.crm.schedule.range, read(qft, { from: at(10, 0), to: at(11, 0) }));
    expect(got.items.map((i) => [i.title, i.kind])).toEqual([["Call the client", "task"]]);
    await sales.mutation(api.crm.opportunityTasks.setTime, { taskId: scheduled, startAt: null, endAt: null });
    expect((await admin.query(api.crm.schedule.range, read(qft, { from: at(10, 0), to: at(11, 0) }))).items).toHaveLength(0);
    await expect(sales.mutation(api.crm.opportunityTasks.setTime, { taskId: scheduled, startAt: at(10, 15), endAt: at(10, 14) })).rejects.toThrow(/end/i);
    await expect(sales.mutation(api.crm.opportunityTasks.setTime, { taskId: scheduled, startAt: at(10, 15), endAt: null })).rejects.toThrow();
  });

  it("shows a task ticked off on the Tasks page as completed on the calendar", async () => {
    const { sales, admin, qft, project } = await world();
    const t = await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "Send the plan" });
    await sales.mutation(api.crm.opportunityTasks.setTime, { taskId: t, startAt: at(10, 14), endAt: at(10, 15) });
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: t, done: true });
    const got = await admin.query(api.crm.schedule.range, read(qft, { from: at(10, 0), to: at(11, 0) }));
    expect(got.items[0]).toMatchObject({ kind: "task", status: "completed" });
  });
});

describe("unscheduled, availability and settings", () => {
  it("lists a project waiting for a consultation until one is booked", async () => {
    const { sales, base: db, qft, sam, project } = await world();
    await db.run((ctx) => ctx.db.patch(project, { stage: "Schedule Onsite Consultation" }));
    let list = await sales.query(api.crm.schedule.unscheduled, { businessId: qft, sort: "oldest" });
    expect(list.some((r) => r.kind === "request" && r.opportunityId === project)).toBe(true);
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "consultation", title: "Walk", start: at(10, 9), end: at(10, 10), assigneeIds: [sam], opportunityId: project });
    list = await sales.query(api.crm.schedule.unscheduled, { businessId: qft, sort: "oldest" });
    expect(list.some((r) => r.opportunityId === project)).toBe(false);
  });

  it("lists tasks with no time, oldest or newest first", async () => {
    const { sales, base: db, qft, project } = await world();
    const first = await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "first" });
    const second = await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "second" });
    await db.run(async (ctx) => { await ctx.db.patch(first, { createdAt: 1000 }); await ctx.db.patch(second, { createdAt: 2000 }); });
    const oldest = (await sales.query(api.crm.schedule.unscheduled, { businessId: qft, sort: "oldest" })).filter((r) => r.kind === "task");
    const newest = (await sales.query(api.crm.schedule.unscheduled, { businessId: qft, sort: "newest" })).filter((r) => r.kind === "task");
    expect(oldest.map((r) => r.title)).toEqual(["first", "second"]);
    expect(newest.map((r) => r.title)).toEqual(["second", "first"]);
  });

  it("reports busy times, repeats included, and the working hours", async () => {
    const { sales, qft, sam } = await world();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "Standup", start: at(2, 9), end: at(2, 10), assigneeIds: [sam], repeat: "weekdays" });
    const av = await sales.query(api.crm.schedule.availability, { businessId: qft, userIds: [sam], from: at(9, 0), to: at(14, 0) });
    expect(av.busy).toHaveLength(5);
    expect(av.hours).toEqual({ days: [1, 2, 3, 4, 5], startMin: 480, endMin: 1020 });
  });

  it("saves working hours and refuses nonsense", async () => {
    const { sales, qft } = await world();
    await sales.mutation(api.crm.schedule.saveSettings, { businessId: qft, days: [1, 2, 3, 4, 5, 6], startMin: 420, endMin: 1080 });
    expect(await sales.query(api.crm.schedule.settings, { businessId: qft })).toEqual({ days: [1, 2, 3, 4, 5, 6], startMin: 420, endMin: 1080 });
    await expect(sales.mutation(api.crm.schedule.saveSettings, { businessId: qft, days: [], startMin: 420, endMin: 1080 })).rejects.toThrow(/day/i);
    await expect(sales.mutation(api.crm.schedule.saveSettings, { businessId: qft, days: [1], startMin: 600, endMin: 600 })).rejects.toThrow(/end/i);
    await expect(sales.mutation(api.crm.schedule.saveSettings, { businessId: qft, days: [7], startMin: 420, endMin: 1080 })).rejects.toThrow(/day/i);
  });

  it("is closed to a person from another business", async () => {
    const { outsider, qft } = await world();
    await expect(outsider.query(api.crm.schedule.unscheduled, { businessId: qft, sort: "oldest" })).rejects.toThrow();
    await expect(outsider.query(api.crm.schedule.settings, { businessId: qft })).rejects.toThrow();
  });
});

describe("reschedule and reassign", () => {
  it("shifts several items and reassigns them together", async () => {
    const { sales, qft, sam, adminId } = await world();
    const a = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "A", start: at(10, 9), end: at(10, 10), assigneeIds: [sam] });
    const b = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "B", start: at(10, 11), end: at(10, 12), assigneeIds: [sam] });
    await sales.mutation(api.crm.schedule.bulkReschedule, { businessId: qft, ids: [a, b], shiftMs: 24 * 3_600_000, assigneeIds: [adminId], now: NOW });
    const got = await sales.query(api.crm.schedule.range, read(qft, { from: at(11, 0), to: at(12, 0) }));
    expect(got.items.map((i) => [i.title, i.assigneeIds])).toEqual([["A", [adminId]], ["B", [adminId]]]);
  });

  it("changes nothing at all when one item would clash", async () => {
    const { sales, qft, sam } = await world();
    const a = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "A", start: at(10, 9), end: at(10, 10), assigneeIds: [sam] });
    const b = await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "visit", title: "B", start: at(10, 11), end: at(10, 12), assigneeIds: [sam] });
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "event", title: "Blocker", start: at(11, 11), end: at(11, 12), assigneeIds: [sam] });
    await expect(sales.mutation(api.crm.schedule.bulkReschedule, { businessId: qft, ids: [a, b], shiftMs: 24 * 3_600_000, now: NOW })).rejects.toThrow(/busy with "Blocker"/);
    const got = await sales.query(api.crm.schedule.range, read(qft, { from: at(10, 0), to: at(11, 0) }));
    expect(got.items.map((i) => i.title).sort()).toEqual(["A", "B"]);
    await expect(sales.mutation(api.crm.schedule.bulkReschedule, { businessId: qft, ids: [], shiftMs: 1, now: NOW })).rejects.toThrow(/at least one/i);
  });
});

describe("the pipeline card knows its consultation", () => {
  it("carries the start of the project's consultation once one is booked", async () => {
    const { sales, qft, sam, project } = await world();
    const board = (await import("../../convex/_generated/api")).api.crm.pipeline.board;
    const args = { businessId: qft, sortKey: "timeInStage", dir: "asc", leadSources: [], search: "", now: NOW } as const;
    const find = async () => (await sales.query(board, args)).columns.flatMap((c) => c.cards).find((c) => c.id === project);
    expect((await find())?.consultationAt).toBeUndefined();
    await sales.mutation(api.crm.schedule.book, { ...base, businessId: qft, type: "consultation", title: "Walk", start: at(12, 9), end: at(12, 10), assigneeIds: [sam], opportunityId: project });
    expect((await find())?.consultationAt).toBe(at(12, 9));
  });
});

describe("the project picker", () => {
  it("finds an open project by its code and lists recent ones when there is no search", async () => {
    const { sales, qft, project } = await world();
    const found = await sales.query(api.crm.schedule.projectOptions, { businessId: qft, search: "TST-001" });
    expect(found.map((p) => p.id)).toEqual([project]);
    expect((await sales.query(api.crm.schedule.projectOptions, { businessId: qft, search: "" })).length).toBeGreaterThan(0);
  });
});
