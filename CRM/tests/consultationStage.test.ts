/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOW, seeded } from "./pipelineSeed";
import { zonedToMs } from "../../convex/crm/lib/schedule";

const at = (d: number, h: number) => zonedToMs(2026, 11, d, h, 0, "America/Los_Angeles");

/* What a Sales move does to a project's consultations (D-085). */

async function world() {
  const w = await seeded();
  const people = await w.admin.query(api.crm.pipeline.people, { businessId: w.qft });
  const sam = people.find((p) => p.name === "Sam Sales")!.id as Id<"users">;
  const events = () => w.base.run((ctx) => ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", w.project)).collect());
  return { ...w, sam, events };
}
const book = (type: "consultation" | "visit", d: number) => ({ type, title: "X", start: at(d, 9), end: at(d, 10), anytime: false, notes: "", now: NOW });

describe("consultations follow the pipeline", () => {
  it("records a completed offline consultation when a project is moved to Onsite Consultation with none booked", async () => {
    const { sales, project, events, base, sam } = await world();
    await base.run((ctx) => ctx.db.patch(project, { salespersonId: sam }));
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW });
    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "consultation", status: "completed", offline: true, anytime: true, assigneeIds: [sam] });
    // Moving back and forward again does not add a second one.
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Schedule Onsite Consultation", now: NOW + 1 });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW + 2 });
    expect(await events()).toHaveLength(1);
  });

  it("adds nothing when a consultation is already booked", async () => {
    const { sales, qft, sam, project, events } = await world();
    await sales.mutation(api.crm.schedule.book, { ...book("consultation", 12), businessId: qft, assigneeIds: [sam], opportunityId: project });
    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "upcoming" });
    expect(rows[0].offline).toBeUndefined();
  });

  it("completes open consultations and follow-ups when the project leaves the request stages, but not construction visits", async () => {
    const { sales, base, qft, sam, project, events } = await world();
    await sales.mutation(api.crm.schedule.book, { ...book("consultation", 12), businessId: qft, assigneeIds: [sam], opportunityId: project });
    await sales.mutation(api.crm.schedule.book, { ...book("visit", 13), businessId: qft, assigneeIds: [sam], opportunityId: project });
    const job = await base.run(async (ctx) => {
      const e = (await ctx.db.query("calendarEvents").collect()).find((x) => x.type === "visit")!;
      return ctx.db.insert("calendarEvents", { ...e, _id: undefined, _creationTime: undefined, visitKind: "jobWalk", start: at(20, 9), end: at(20, 10) } as never);
    });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Quote Draft & Site Plan / Design", now: NOW });
    const rows = await events();
    expect(rows.filter((e) => e._id !== job).map((e) => e.status)).toEqual(["completed", "completed"]);
    expect(rows.find((e) => e._id === job)?.status).toBe("upcoming");
  });

  it("marks them lost, not completed, when the project is lost", async () => {
    const { sales, qft, sam, project, events } = await world();
    await sales.mutation(api.crm.schedule.book, { ...book("consultation", 12), businessId: qft, assigneeIds: [sam], opportunityId: project });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Lost", reason: "Went elsewhere", now: NOW });
    expect((await events()).map((e) => e.status)).toEqual(["lost"]);
  });

  it("completes them when a quote moves the project on by itself", async () => {
    const { sales, base, qft, sam, project, events } = await world();
    await sales.mutation(api.crm.schedule.book, { ...book("consultation", 12), businessId: qft, assigneeIds: [sam], opportunityId: project });
    const { systemMove } = await import("../../convex/crm/lib/systemMove");
    await base.run(async (ctx) => { await systemMove(ctx, (await ctx.db.get(project))!, "Quote Draft & Site Plan / Design", "System", NOW); });
    expect((await events()).map((e) => e.status)).toEqual(["completed"]);
  });
});
