/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { buildDiscovery, emptyDiscovery } from "../../convex/shared/discovery";
import { adminOf } from "./helpers";

/* The customer is emailed when a consultation is booked or moved (D-127), following the business's sending mode. */

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
  const me = (await staff.query(api.crm.pipeline.people, { businessId: business._id }))[0].id;
  const start = Date.UTC(2026, 11, 3, 17, 0); // 9:00 AM in Los Angeles
  const book = () => staff.mutation(api.crm.schedule.book, {
    businessId: business._id, type: "consultation", title: "Consultation", start, end: start + 3_600_000, anytime: false,
    assigneeIds: [me], opportunityId: saved.opportunityId, notes: "internal gate code", now: start - 86_400_000,
  });
  const event = (id: Awaited<ReturnType<typeof book>>) => t.run((ctx) => ctx.db.get(id));
  const setMode = (mode: "log" | "test" | "live", testAddress = "") => staff.mutation(api.crm.automations.setSettings, { businessId: business._id, mode, testAddress, companyPhone: "(951) 555-0100", now: start });
  return { t, staff, business, saved, start, book, event, setMode };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("the booking confirmation email (D-127)", () => {
  it("only logs what it would send while the business is on Log only, and says who, when and where", async () => {
    const { t, book, event } = await world();
    const id = await book();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await event(id))?.confirmEmail).toMatchObject({ status: "logged" });
    expect((await event(id))?.confirmEmail?.detail).toContain("maya@example.com");

    const prep = await t.query(internal.crm.bookingEmail.prepare, { eventId: id });
    // Already handled for this time, so nothing more is prepared.
    expect(prep).toEqual({ go: false });
  });

  it("writes a message with the date, time and place, and not the internal notes", async () => {
    const { t, book, event } = await world();
    const id = await book();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run((ctx) => ctx.db.patch(id, { confirmEmail: undefined }));
    const prep = await t.query(internal.crm.bookingEmail.prepare, { eventId: id });
    expect(prep).toMatchObject({ go: true, mode: "log", wouldEmail: "maya@example.com" });
    if (!prep.go) throw new Error("expected a message");
    expect(prep.subject).toBe("Your consultation on Thursday, December 3, 2026 at 9:00 AM");
    expect(prep.text).toContain("Hi Maya,");
    expect(prep.text).toContain("12 Orchard Ln");
    expect(prep.text).not.toContain("gate code");
    void event;
  });

  it("is skipped when the client has no email on Live, and goes to the test address, never the customer, on Test", async () => {
    const { t, saved, book, event, setMode } = await world();
    await t.run((ctx) => ctx.db.patch(saved.clientId, { email: "" }));
    await setMode("live");
    const id = await book();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await event(id))?.confirmEmail).toMatchObject({ status: "skipped" });
    await t.run((ctx) => ctx.db.patch(id, { confirmEmail: undefined }));
    await setMode("test", "me@example.com");
    const prep = await t.query(internal.crm.bookingEmail.prepare, { eventId: id });
    expect(prep).toMatchObject({ go: true, mode: "test", to: "me@example.com" });
  });

  it("emails again when the time moves, but not when nothing about the time changed", async () => {
    const { t, staff, book, event, start } = await world();
    const id = await book();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = (await event(id))?.confirmEmail;
    await staff.mutation(api.crm.schedule.update, { id, notes: "different notes", now: start });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await event(id))?.confirmEmail).toEqual(first);
    await staff.mutation(api.crm.schedule.update, { id, start: start + 3_600_000, end: start + 7_200_000, now: start });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await event(id))?.confirmEmail).toMatchObject({ status: "logged" });
    expect((await event(id))?.confirmEmail?.start).toBe(start + 3_600_000);
  });

  it("gives a consultation made from the sales form the same confirmation", async () => {
    const { t, saved, event } = await world();
    const id = await t.mutation(internal.crm.formsConsultation.book, {
      formsProjectId: saved.projectId, email: "admin-test@example.com", name: "Sal", date: "2026-12-02", time: "09:30", minutes: 60, instructions: "", visit: 0,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await event(id!))?.confirmEmail).toMatchObject({ status: "logged" });
  });
});
