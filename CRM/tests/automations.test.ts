/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  DAY_MS, decide, followUpHtml, isDue, renderTemplate, unknownVariables, unresponsiveReason, DEFAULT_BODY,
  type RunStatus, type TemplateVars,
} from "../../convex/crm/lib/automationRules";
import { quoteWorld } from "./quoteSeed";
import { seeded } from "./pipelineSeed";

process.env.CRM_APP_URL = "https://crm.test"; // the quote link in the email

afterEach(() => vi.useRealTimers());

describe("automation rules", () => {
  it("is due only for items that started after the automation was turned on, once the days have passed", () => {
    const on = 1000 * DAY_MS;
    expect(isDue(on + DAY_MS, on, 2, on + 3 * DAY_MS)).toBe(true);
    expect(isDue(on + DAY_MS, on, 2, on + 2 * DAY_MS)).toBe(false); // only 1 day yet
    expect(isDue(on - DAY_MS, on, 2, on + 30 * DAY_MS)).toBe(false); // sent before it was on
    expect(isDue(undefined, on, 2, on + 30 * DAY_MS)).toBe(false);
  });

  it("decides what to do from the existing row and the mode, so nobody is emailed twice", () => {
    const row = (status: RunStatus, attempts = 0, at = 0) => ({ _id: "r", status, attempts, at });
    expect(decide(null, "live", 0).action).toBe("new");
    expect(decide(row("sent"), "live", 1).action).toBe("skip");
    expect(decide(row("archived"), "live", 1).action).toBe("skip");
    expect(decide(row("skipped"), "live", 1).action).toBe("skip");
    expect(decide(row("logged"), "log", 1).action).toBe("skip"); // preview already written
    expect(decide(row("logged"), "live", 1).action).toBe("reuse"); // a preview is not "done"
    expect(decide(row("tested"), "test", 1).action).toBe("skip");
    expect(decide(row("tested"), "live", 1).action).toBe("reuse");
    expect(decide(row("failed", 1), "live", 1).action).toBe("reuse");
    expect(decide(row("failed", 3), "live", 1).action).toBe("skip");
    expect(decide(row("queued", 0, 0), "live", 1000).action).toBe("skip");
    expect(decide(row("queued", 0, 0), "live", 2 * 60 * 60 * 1000).action).toBe("reuse"); // stuck
  });

  it("fills in Jobber's variables, flags unknown ones, and words the unresponsive reason", () => {
    const vars: TemplateVars = { CLIENT_FIRST_NAME: "Natasha", CLIENT_NAME: "Natasha Lee", COMPANY_NAME: "Quality First Turf", DEFAULT_PHONE: "+1 555", QUOTE_NUMBER: "#2345" };
    const text = renderTemplate(DEFAULT_BODY, vars);
    expect(text).toContain("Hi Natasha,");
    expect(text).toContain("Quality First Turf\n+1 555");
    expect(text).not.toContain("{{");
    expect(unknownVariables("Hi {{CLIENT_FIRST_NAME}} {{NOPE}}")).toEqual(["NOPE"]);
    expect(unresponsiveReason(90)).toBe("Archived automatically after 3 months of unresponsiveness");
    expect(unresponsiveReason(45)).toBe("Archived automatically after 45 days of unresponsiveness");
  });

  it("escapes the message in the HTML email and adds the quote link only when there is one", () => {
    expect(followUpHtml("Hi <b>x</b>\n\nBye", "https://crm.test/q/abc")).toContain("&lt;b&gt;");
    expect(followUpHtml("Hi", "https://crm.test/q/abc")).toContain('href="https://crm.test/q/abc"');
    expect(followUpHtml("Hi", null)).not.toContain("href");
  });
});

type World = Awaited<ReturnType<typeof sentQuote>>;
const T0 = Date.UTC(2026, 10, 1);

/** A quote sent at `sentAt`, whose client has an email address, in a business whose automations were turned on at `on`. */
async function sentQuote(sentAt: number, on: number) {
  const w = await quoteWorld();
  await w.base.run(async (ctx) => {
    const quote = (await ctx.db.get(w.quoteId))!;
    await ctx.db.patch(w.quoteId, { status: "Awaiting response", sentAt, shareToken: "tok123", revision: 1 });
    await ctx.db.patch(quote.clientId, { email: "client@example.com" });
  });
  await w.admin.mutation(api.crm.automations.ensure, { businessId: w.qft, now: on });
  return w;
}

/** The runs for this world's quote or project only: the sample data has other quotes and requests the tick also looks at. */
const runs = (w: Pick<World, "base" | "quoteId"> | (Pick<World, "base"> & { project: unknown })) =>
  w.base.run(async (ctx) => (await ctx.db.query("automationRuns").collect()).filter((r) => ("quoteId" in w ? r.quoteId === w.quoteId : r.opportunityId === (w as { project: unknown }).project)));
const settings = (w: World | Awaited<ReturnType<typeof seeded>>, mode: "log" | "test" | "live", testAddress = "me@test.com", now = T0) =>
  w.admin.mutation(api.crm.automations.setSettings, { businessId: w.qft, mode, testAddress, companyPhone: "+1 555", now });

describe("automations: log only (the default)", () => {
  it("writes what it would send, changes nothing, and does not repeat itself", async () => {
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    const first = await runs(w);
    expect(first.map((r) => r.key)).toEqual(["quoteFollowUp2"]);
    expect(first[0]).toMatchObject({ status: "logged", mode: "log", toAddress: "client@example.com" });
    expect(first[0].detail).toContain("Following up on quote #");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS + 1000 });
    expect(await runs(w)).toHaveLength(1);
    expect((await w.base.run((ctx) => ctx.db.get(w.quoteId)))?.status).toBe("Awaiting response");
  });

  it("logs the 90-day archive instead of doing it", async () => {
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 100 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(w.quoteId)))?.status).toBe("Awaiting response");
    expect((await runs(w)).some((r) => r.key === "quoteArchive" && r.status === "logged")).toBe(true);
  });
});

describe("automations: only what started after they were turned on", () => {
  it("leaves a quote sent before the automation was on alone", async () => {
    const w = await sentQuote(T0 - 10 * DAY_MS, T0);
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 200 * DAY_MS });
    expect(await runs(w)).toHaveLength(0);
  });

  it("does nothing for a follow-up that is turned off, and a quote sent before it was turned back on stays left alone", async () => {
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.admin.mutation(api.crm.automations.update, { businessId: w.qft, key: "quoteFollowUp2", days: 2, active: false, now: T0 + 2 * DAY_MS });
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    expect((await runs(w)).filter((r) => r.key === "quoteFollowUp2")).toHaveLength(0);
    await w.admin.mutation(api.crm.automations.update, { businessId: w.qft, key: "quoteFollowUp2", days: 2, active: true, now: T0 + 5 * DAY_MS });
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 9 * DAY_MS });
    expect((await runs(w)).filter((r) => r.key === "quoteFollowUp2")).toHaveLength(0);
  });
});

describe("automations: test and live mode", () => {
  it("queues the follow-up once, checks it again at send time, and sends to the test address", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await settings(w, "test", "Me@Test.com");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS + 5 });
    const rows = (await runs(w)).filter((r) => r.key === "quoteFollowUp2");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("queued");
    const prep = await w.base.mutation(internal.crm.automations.prepareSend, { runId: rows[0]._id, now: T0 + 4 * DAY_MS + 10 });
    expect(prep).toMatchObject({ mode: "test", to: "me@test.com" });
    expect(prep?.subject).toContain("[TEST, would go to client@example.com]");
    expect(prep?.html).toContain("https://crm.test/q/tok123");
    await w.base.mutation(internal.crm.automations.finishSend, { runId: rows[0]._id, mode: "test", to: "me@test.com", subject: prep!.subject, now: T0 + 5 * DAY_MS });
    expect((await runs(w)).find((r) => r._id === rows[0]._id)?.status).toBe("tested");
    // a test send is not the real one: going live sends it once
    await settings(w, "live", "me@test.com", T0 + 6 * DAY_MS);
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 6 * DAY_MS });
    expect((await runs(w)).find((r) => r._id === rows[0]._id)?.status).toBe("queued");
  });

  it("does not send when the quote was approved before the email went out", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await settings(w, "live", "");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    const row = (await runs(w)).find((r) => r.key === "quoteFollowUp2")!;
    await w.base.run((ctx) => ctx.db.patch(w.quoteId, { status: "Approved" }));
    expect(await w.base.mutation(internal.crm.automations.prepareSend, { runId: row._id, now: T0 + 4 * DAY_MS + 5 })).toBeNull();
    const after = (await runs(w)).find((r) => r._id === row._id)!;
    expect(after.status).toBe("skipped");
    expect(after.detail).toContain("Approved");
  });

  it("retries a failed send up to three times, then leaves it", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await settings(w, "live", "");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    const find = async () => (await runs(w)).find((r) => r.key === "quoteFollowUp2")!;
    const id = (await find())._id;
    for (let i = 1; i <= 3; i++) {
      const prep = await w.base.mutation(internal.crm.automations.prepareSend, { runId: id, now: T0 + 4 * DAY_MS + i });
      await w.base.mutation(internal.crm.automations.finishSend, { runId: id, mode: prep!.mode, to: prep!.to, subject: prep!.subject, error: "Zoho is down", now: T0 + 4 * DAY_MS + i });
      expect(await find()).toMatchObject({ status: "failed", attempts: i });
      await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS + i + 1 });
    }
    expect(await find()).toMatchObject({ status: "failed", attempts: 3 }); // the last tick left it alone
  });

  it("skips a client with no email address and says why", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.base.run(async (ctx) => ctx.db.patch((await ctx.db.get(w.quoteId))!.clientId, { email: "" }));
    await settings(w, "live", "");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 4 * DAY_MS });
    const row = (await runs(w)).find((r) => r.key === "quoteFollowUp2")!;
    expect(await w.base.mutation(internal.crm.automations.prepareSend, { runId: row._id, now: T0 + 4 * DAY_MS + 5 })).toBeNull();
    expect((await runs(w)).find((r) => r._id === row._id)).toMatchObject({ status: "skipped", detail: "The client has no email address." });
  });

  it("archives an unanswered quote after 90 days and closes its project as lost with the reason", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.base.run((ctx) => ctx.db.patch(w.project, { stage: "Proposal Delivered — Awaiting Response" }));
    await settings(w, "test");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 100 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(w.quoteId)))?.status).toBe("Archived");
    const project = await w.base.run((ctx) => ctx.db.get(w.project));
    expect(project).toMatchObject({ stage: "Closed Lost", outcome: "lost", lostReason: "Archived automatically after 3 months of unresponsiveness" });
    const events = await w.sales.query(api.crm.quoteFlow.events, { id: w.quoteId });
    expect(events.some((e) => e.kind === "archived")).toBe(true);
  });

  it("archives an approved quote but leaves its project alone", async () => {
    vi.useFakeTimers();
    const w = await sentQuote(T0 + DAY_MS, T0);
    await w.base.run(async (ctx) => {
      await ctx.db.patch(w.quoteId, { status: "Approved" });
      await ctx.db.patch(w.project, { stage: "Quotes Approved — Contract Out for Signature" });
    });
    await settings(w, "test");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 100 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(w.quoteId)))?.status).toBe("Archived");
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.stage).toBe("Quotes Approved — Contract Out for Signature");
  });
});

describe("automations: archiving requests", () => {
  it("closes an old unanswered request as lost, archives it off the board and list, and Restore puts it back", async () => {
    vi.useFakeTimers();
    const w = await seeded();
    await w.admin.mutation(api.crm.automations.ensure, { businessId: w.qft, now: T0 });
    await w.base.run((ctx) => ctx.db.patch(w.project, { requestedAt: T0 + DAY_MS }));
    await settings(w, "test");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 100 * DAY_MS });
    const p = await w.base.run((ctx) => ctx.db.get(w.project));
    expect(p).toMatchObject({ stage: "Closed Lost", outcome: "lost", archivedFromStage: "New Request", lostReason: "Archived automatically after 3 months of unresponsiveness" });
    expect(p?.archivedAt).toBeDefined();
    const list = await w.sales.query(api.crm.requests.list, { businessId: w.qft, status: "All", from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today: T0 + 100 * DAY_MS, page: 1, size: 100 } as never);
    expect(JSON.stringify(list)).not.toContain("TST-001");
    await w.sales.mutation(api.crm.automations.restoreRequest, { id: w.project, now: T0 + 101 * DAY_MS });
    const back = await w.base.run((ctx) => ctx.db.get(w.project));
    expect(back).toMatchObject({ stage: "New Request" });
    expect(back?.outcome).toBeUndefined();
    expect(back?.archivedAt).toBeUndefined();
  });

  it("does not archive a request that already moved on to quoting", async () => {
    vi.useFakeTimers();
    const w = await seeded();
    await w.admin.mutation(api.crm.automations.ensure, { businessId: w.qft, now: T0 });
    await w.base.run((ctx) => ctx.db.patch(w.project, { requestedAt: T0 + DAY_MS, stage: "Quote Draft & Site Plan / Design" }));
    await settings(w, "live", "");
    await w.base.mutation(internal.crm.automations.tick, { now: T0 + 100 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.stage).toBe("Quote Draft & Site Plan / Design");
  });
});

describe("automations: who can change them", () => {
  it("lets only an Admin edit, validates the days and the wording, and keeps the four fixed", async () => {
    const w = await seeded();
    const args = { businessId: w.qft, key: "quoteFollowUp2" as const, days: 3, active: true, now: T0 };
    await expect(w.sales.mutation(api.crm.automations.update, args)).rejects.toThrow(/Admin/);
    await expect(w.admin.mutation(api.crm.automations.update, { ...args, days: 0 })).rejects.toThrow(/whole number/);
    await expect(w.admin.mutation(api.crm.automations.update, { ...args, subject: "Hi {{NOPE}}" })).rejects.toThrow(/Unknown variable/);
    await expect(w.admin.mutation(api.crm.automations.update, { ...args, subject: "  " })).rejects.toThrow(/subject/);
    await w.admin.mutation(api.crm.automations.update, { ...args, subject: "Quote {{QUOTE_NUMBER}} check-in" });
    const o = await w.sales.query(api.crm.automations.overview, { businessId: w.qft });
    expect(o.automations.map((x) => x.key)).toEqual(["quoteArchive", "quoteFollowUp5", "quoteFollowUp2", "requestArchive"]);
    expect(o.automations.find((x) => x.key === "quoteFollowUp2")).toMatchObject({ days: 3, subject: "Quote {{QUOTE_NUMBER}} check-in", title: "Follow-up with clients 3 days after quotes are sent" });
    await expect(w.outsider.query(api.crm.automations.overview, { businessId: w.qft })).rejects.toThrow();
    await expect(settings(w, "test", "")).rejects.toThrow(/test email/);
  });
});
