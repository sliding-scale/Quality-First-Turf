/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOW, seeded } from "./pipelineSeed";

const DAY = 24 * 60 * 60 * 1000;
const todayStart = Date.UTC(2026, 10, 10, 0, 0, 0);
const todayEnd = todayStart + DAY - 1;

describe("project tasks and notes", () => {
  it("adds a task, trims the title, and refuses an empty or too-long one", async () => {
    const { sales, project } = await seeded();
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "  Call about gate code  " });
    const { tasks } = await sales.query(api.crm.opportunityTasks.listForProject, { id: project });
    expect(tasks.map((t) => t.title)).toEqual(["Call about gate code"]);
    await expect(sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "   " })).rejects.toThrow(/title/i);
    await expect(sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "x".repeat(201) })).rejects.toThrow(/title/i);
  });

  it("counts overdue, today, upcoming and undated tasks, and completing one takes it out", async () => {
    const { sales, admin, qft, project } = await seeded();
    const add = (title: string, dueAt?: number) => sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title, ...(dueAt === undefined ? {} : { dueAt }) });
    await add("yesterday", todayStart - 1000);
    await add("today", todayStart + 5 * 3600_000);
    await add("tomorrow", todayEnd + 1000);
    await add("whenever");
    const args = { businessId: qft, now: NOW, todayStart, todayEnd };
    const all = await admin.query(api.crm.opportunityTasks.listAll, args);
    expect(all.counts).toEqual({ all: 4, overdue: 1, today: 1, upcoming: 1, completed: 0 });
    const overdue = all.rows.find((r) => r.title === "yesterday")!;
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: overdue.id, done: true });
    const after = await admin.query(api.crm.opportunityTasks.listAll, args);
    expect(after.counts).toEqual({ all: 3, overdue: 0, today: 1, upcoming: 1, completed: 1 });
  });

  it("keeps completed tasks in their own list, newest first, and reopening puts one back", async () => {
    const { sales, admin, qft, project } = await seeded();
    const args = { businessId: qft, now: NOW, todayStart, todayEnd };
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "first" });
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "second" });
    const open = await admin.query(api.crm.opportunityTasks.listAll, args);
    const byTitle = (t: string) => open.rows.find((r) => r.title === t)!.id;
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: byTitle("first"), done: true });
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: byTitle("second"), done: true });
    const done = await admin.query(api.crm.opportunityTasks.listAll, args);
    expect(done.rows).toHaveLength(0);
    expect(done.counts).toMatchObject({ all: 0, completed: 2 });
    expect(done.completed.map((r) => r.title)).toEqual(["second", "first"]);
    expect(done.completed[0]).toMatchObject({ projectTitle: "Test turf", code: "TST-001" });
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: byTitle("first"), done: false });
    const back = await admin.query(api.crm.opportunityTasks.listAll, args);
    expect(back.rows.map((r) => r.title)).toEqual(["first"]);
    expect(back.completed.map((r) => r.title)).toEqual(["second"]);
  });

  it("lets an Admin create a task that belongs to no project and give it to anyone on the business", async () => {
    const { admin, sales, qft } = await seeded();
    const args = { businessId: qft, now: NOW, todayStart, todayEnd };
    const people = await admin.query(api.crm.pipeline.people, { businessId: qft });
    const sam = people.find((p) => p.name === "Sam Sales")!;
    await admin.mutation(api.crm.opportunityTasks.createTask, { businessId: qft, title: "  Order flags for the model yard ", assigneeId: sam.id, dueAt: todayEnd + 1000 });
    const all = await admin.query(api.crm.opportunityTasks.listAll, args);
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0]).toMatchObject({ title: "Order flags for the model yard", assigneeId: sam.id, projectTitle: "", code: "", clientName: "" });
    expect(all.rows[0].opportunityId).toBeUndefined();
    const mine = await admin.query(api.crm.opportunityTasks.listAll, { ...args, assigneeId: sam.id });
    expect(mine.counts).toMatchObject({ all: 1, upcoming: 1 });
    // The person it was given to sees it too, and can tick it off.
    const theirs = await sales.query(api.crm.opportunityTasks.listAll, args);
    await sales.mutation(api.crm.opportunityTasks.setDone, { taskId: theirs.rows[0].id, done: true });
    expect((await admin.query(api.crm.opportunityTasks.listAll, args)).completed).toHaveLength(1);
  });

  it("refuses a new task from anyone but an Admin, with an empty title, or for someone outside the business", async () => {
    const { admin, sales, base, qft } = await seeded();
    await expect(sales.mutation(api.crm.opportunityTasks.createTask, { businessId: qft, title: "nope" })).rejects.toThrow();
    await expect(admin.mutation(api.crm.opportunityTasks.createTask, { businessId: qft, title: "   " })).rejects.toThrow(/title/i);
    const olive = await base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Olive Outsider")!._id);
    await expect(admin.mutation(api.crm.opportunityTasks.createTask, { businessId: qft, title: "x", assigneeId: olive })).rejects.toThrow(/not on this business/);
  });

  it("also checks the assignee when a task is added to a project", async () => {
    const { sales, base, project } = await seeded();
    const olive = await base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Olive Outsider")!._id);
    await expect(sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "x", assigneeId: olive })).rejects.toThrow(/not on this business/);
  });

  it("gives a task to someone else on the team, or to nobody", async () => {
    const { sales, admin, base, qft, project, pm } = await seeded();
    const people = await admin.query(api.crm.pipeline.people, { businessId: qft });
    const sam = people.find((p) => p.name === "Sam Sales")!;
    const sal = people.find((p) => p.name === "Sal")!;
    const id = await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "Call the client", assigneeId: sam.id });
    await sales.mutation(api.crm.opportunityTasks.setTime, { taskId: id, startAt: NOW, endAt: NOW + 3_600_000, assigneeId: sal.id });
    let { tasks } = await sales.query(api.crm.opportunityTasks.listForProject, { id: project });
    expect(tasks[0]).toMatchObject({ assigneeId: sal.id, startAt: NOW, endAt: NOW + 3_600_000 });
    await sales.mutation(api.crm.opportunityTasks.setTime, { taskId: id, startAt: NOW, endAt: NOW + 3_600_000, assigneeId: null });
    ({ tasks } = await sales.query(api.crm.opportunityTasks.listForProject, { id: project }));
    expect(tasks[0].assigneeId).toBeUndefined();
    const olive = await base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Olive Outsider")!._id);
    await expect(sales.mutation(api.crm.opportunityTasks.setTime, { taskId: id, startAt: NOW, endAt: NOW + 3_600_000, assigneeId: olive })).rejects.toThrow(/not on this business/);
    await expect(pm.mutation(api.crm.opportunityTasks.setTime, { taskId: id, startAt: NOW, endAt: NOW + 3_600_000, assigneeId: sal.id })).rejects.toThrow();
  });

  it("filters by assignee", async () => {
    const { sales, admin, qft, project } = await seeded();
    const people = await admin.query(api.crm.pipeline.people, { businessId: qft });
    const sam = people.find((p) => p.name === "Sam Sales")!;
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "mine", assigneeId: sam.id });
    await sales.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "nobody" });
    const mine = await admin.query(api.crm.opportunityTasks.listAll, { businessId: qft, now: NOW, todayStart, todayEnd, assigneeId: sam.id });
    expect(mine.rows.map((r) => r.title)).toEqual(["mine"]);
  });

  it("adds notes with the author's name, newest first", async () => {
    const { sales, project } = await seeded();
    await sales.mutation(api.crm.opportunityTasks.addNote, { id: project, text: "first" });
    await sales.mutation(api.crm.opportunityTasks.addNote, { id: project, text: "second" });
    const { notes } = await sales.query(api.crm.opportunityTasks.listForProject, { id: project });
    expect(notes.map((n) => n.text)).toEqual(["second", "first"]);
    expect(notes[0].author).toBe("Sam Sales");
    await expect(sales.mutation(api.crm.opportunityTasks.addNote, { id: project, text: " " })).rejects.toThrow();
  });

  it("refuses a Project Manager's changes and anyone from another business", async () => {
    const { pm, outsider, qft, project } = await seeded();
    await expect(pm.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "nope" })).rejects.toThrow();
    await expect(outsider.mutation(api.crm.opportunityTasks.addTask, { id: project, title: "nope" })).rejects.toThrow();
    await expect(outsider.query(api.crm.opportunityTasks.listForProject, { id: project })).rejects.toThrow();
    await expect(outsider.query(api.crm.opportunityTasks.listAll, { businessId: qft, now: NOW, todayStart, todayEnd })).rejects.toThrow();
    // A Project Manager may read.
    await expect(pm.query(api.crm.opportunityTasks.listForProject, { id: project })).resolves.toBeTruthy();
  });
});
