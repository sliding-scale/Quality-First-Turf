/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { buildDiscovery, emptyDiscovery } from "../../convex/shared/discovery";
import { adminOf } from "./helpers";

/* The sales form books on the CRM calendar, not in Jobber (D-126), and the CRM calendar's changes reach the sales form at once. */

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

function answers() {
  const built = buildDiscovery({
    ...emptyDiscovery(), customerType: "Homeowner", firstName: "Maya", lastName: "Patel", phone: "9515550199", email: "maya@example.com",
    street1: "12 Orchard Ln", street2: "", city: "Temecula", state: "California", zip: "92592", services: ["SOD"],
  });
  if (built.payload === null) throw new Error(built.error ?? "The test form did not build.");
  return built.payload;
}

async function world() {
  const t = setup();
  await t.run(async (ctx) => { await ctx.db.insert("businesses", { name: "Quality First Turf Landscape", slug: "quality-first-turf" }); });
  const staff = await adminOf(t);
  const business = (await staff.query(api.crm.businesses.list, {}))[0];
  const saved = await staff.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers() });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const events = () => t.run((ctx) => ctx.db.query("calendarEvents").collect());
  const forms = () => t.run((ctx) => ctx.db.get(saved.projectId));
  const project = () => t.run((ctx) => ctx.db.get(saved.opportunityId));
  return { t, staff, saved, events, forms, project };
}

const booking = { email: "admin-test@example.com", name: "Sal", date: "2026-12-02", time: "09:30", minutes: 60, instructions: "Gate code 1234", visit: 0 };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("the sales form books on the CRM calendar (D-126)", () => {
  it("makes a consultation for that person, moves the project to Onsite Consultation, and moves it rather than adding a second", async () => {
    const { t, saved, events, project } = await world();
    const id = await t.mutation(internal.crm.formsConsultation.book, { formsProjectId: saved.projectId, ...booking });
    expect(id).not.toBeNull();
    const [e] = await events();
    expect(e).toMatchObject({ type: "consultation", opportunityId: saved.opportunityId, notes: "Gate code 1234", status: "upcoming" });
    expect(e.assigneeIds).toHaveLength(1);
    expect((await project())?.stage).toBe("Onsite Consultation");
    expect(await t.query(internal.crm.formsConsultation.where, { existingId: id! })).toEqual({ state: "scheduled", date: "2026-12-02", time: "09:30", minutes: 60 });

    await t.mutation(internal.crm.formsConsultation.book, { formsProjectId: saved.projectId, ...booking, time: "13:00", existingId: id! });
    const after = await events();
    expect(after).toHaveLength(1);
    expect(await t.query(internal.crm.formsConsultation.where, { existingId: id! })).toMatchObject({ time: "13:00" });
  });

  it("refuses a time the person is already booked, and cancelling removes the item", async () => {
    const { t, saved, events } = await world();
    const id = await t.mutation(internal.crm.formsConsultation.book, { formsProjectId: saved.projectId, ...booking });
    await expect(t.mutation(internal.crm.formsConsultation.book, { formsProjectId: saved.projectId, ...booking, visit: 1 })).rejects.toThrow(/busy/);
    await t.mutation(internal.crm.formsConsultation.cancel, { existingId: id! });
    expect(await events()).toHaveLength(0);
    expect(await t.query(internal.crm.formsConsultation.where, { existingId: id! })).toEqual({ state: "missing" });
    // An old Jobber id is not a CRM item and is left alone.
    expect(await t.query(internal.crm.formsConsultation.where, { existingId: "Z2lkOi8vSm9iYmVyL0Fzc2Vzc21lbnQvMTIz" })).toEqual({ state: "unknown" });
  });

  it("a consultation booked or moved in the CRM shows on the sales form at once", async () => {
    const { t, staff, saved, forms } = await world();
    const business = (await staff.query(api.crm.businesses.list, {}))[0];
    const me = (await staff.query(api.crm.pipeline.people, { businessId: business._id }))[0].id;
    const start = Date.UTC(2026, 11, 3, 17, 0); // 9:00 AM in Los Angeles
    const id = await staff.mutation(api.crm.schedule.book, {
      businessId: business._id, type: "consultation", title: "Consultation", start, end: start + 3_600_000, anytime: false,
      assigneeIds: [me], opportunityId: saved.opportunityId, notes: "", now: start - 86_400_000,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await forms())?.consultation).toMatchObject({ assessmentId: id, date: "2026-12-03", time: "09:00", minutes: 60 });

    await staff.mutation(api.crm.schedule.update, { id, start: start + 3_600_000, end: start + 2 * 3_600_000, now: start - 86_400_000 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await forms())?.consultation).toMatchObject({ time: "10:00" });

    await staff.mutation(api.crm.schedule.remove, { id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await forms())?.consultation).toBeUndefined();
  });
});
