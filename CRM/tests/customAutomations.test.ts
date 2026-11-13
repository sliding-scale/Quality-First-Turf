/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { DAY_MS } from "../../convex/crm/lib/automationRules";
import {
  actionSentence, checkDefinition, conditionPasses, conditionSentence, renderCustom, triggerSentence, unknownCustomVariables,
  type CustomDefinition,
} from "../../convex/crm/lib/customAutomation";
import { seeded } from "./pipelineSeed";
import { quoteWorld } from "./quoteSeed";

process.env.CRM_APP_URL = "https://crm.test";

const T0 = Date.UTC(2026, 10, 1);

const followUp = (over: Partial<CustomDefinition> = {}): CustomDefinition => ({
  title: "Follow up after 3 days",
  trigger: { kind: "datePassed", object: "quote", event: "sent", days: 3 },
  conditions: [{ field: "quoteStatus", op: "is", values: ["Awaiting response"] }],
  action: { kind: "notify", method: "email", subject: "Hello {{CLIENT_FIRST_NAME}}", body: "About quote {{QUOTE_NUMBER}}", textBody: "Hi" },
  ...over,
});

describe("custom automation rules", () => {
  it("accepts a good definition and says it in Jobber's words", () => {
    const d = followUp();
    expect(checkDefinition(d)).toBeNull();
    expect(triggerSentence(d.trigger)).toBe("3 days after quotes are sent");
    expect(conditionSentence(d.conditions[0])).toBe("Status is awaiting response");
    expect(actionSentence(d.action)).toBe("Email the client");
    expect(triggerSentence({ kind: "occurs", object: "project", event: "updated" })).toBe("When Sales pipeline projects are updated");
  });

  it("refuses the things that cannot work", () => {
    expect(checkDefinition(followUp({ title: "  " }))).toMatch(/title/i);
    expect(checkDefinition(followUp({ trigger: { kind: "datePassed", object: "quote", event: "sent", days: -1 } }))).toMatch(/Days/);
    expect(checkDefinition(followUp({ trigger: { kind: "datePassed", object: "quote", event: "sent", days: 1.5 } }))).toMatch(/Days/);
    expect(checkDefinition(followUp({ trigger: { kind: "datePassed", object: "quote", event: "created", days: 1 } }))).toMatch(/not something/);
    expect(checkDefinition(followUp({ trigger: { kind: "occurs", object: "quote", event: "updated" } }))).toMatch(/not something/);
    expect(checkDefinition(followUp({ conditions: [{ field: "stage", op: "is", values: ["Closed Won"] }] }))).toMatch(/not a condition/);
    expect(checkDefinition(followUp({ conditions: [{ field: "quoteStatus", op: "is", values: ["Nope"] }] }))).toMatch(/status/);
    expect(checkDefinition(followUp({ action: { kind: "addTag", tag: "VIP" } }))).toMatch(/tag/);
    expect(checkDefinition(followUp({ action: { kind: "updateStatus", status: "Approved" } }))).toMatch(/status/);
    expect(checkDefinition(followUp({ action: { kind: "notify", method: "email", subject: "", body: "x", textBody: "" } }))).toMatch(/subject/);
    expect(checkDefinition(followUp({ action: { kind: "notify", method: "text", textBody: "" } }))).toMatch(/text message/);
    expect(checkDefinition(followUp({ action: { kind: "notify", method: "email", subject: "a {{NOPE}}", body: "x" } }))).toMatch(/NOPE/);
    expect(checkDefinition({ ...followUp(), trigger: { kind: "datePassed", object: "project", event: "created", days: 1 }, conditions: [], action: { kind: "updateStatus", status: "Archived" } })).toMatch(/quote/);
  });

  it("checks conditions case-insensitively, with is and is not", () => {
    const facts = { quoteStatus: "Awaiting response", clientTags: ["Homeowner"], lineNames: ["Paver Patio", "Retaining Wall"] };
    expect(conditionPasses({ field: "quoteStatus", op: "is", values: ["awaiting response"] }, facts)).toBe(true);
    expect(conditionPasses({ field: "quoteStatus", op: "isNot", values: ["Approved"] }, facts)).toBe(true);
    expect(conditionPasses({ field: "clientTag", op: "is", values: ["Company"] }, facts)).toBe(false);
    expect(conditionPasses({ field: "lineItem", op: "is", values: ["patio"] }, facts)).toBe(true);
    expect(conditionPasses({ field: "lineItem", op: "isNot", values: ["turf"] }, facts)).toBe(true);
  });

  it("fills the variables and flags unknown ones", () => {
    const vars = { CLIENT_FIRST_NAME: "Pat", CLIENT_NAME: "Pat Lee", COMPANY_NAME: "QFT", DEFAULT_PHONE: "1", QUOTE_NUMBER: "#2", PROJECT_TITLE: "Putting green" };
    expect(renderCustom("Hi {{CLIENT_FIRST_NAME}}: {{PROJECT_TITLE}} {{X}}", vars)).toBe("Hi Pat: Putting green {{X}}");
    expect(unknownCustomVariables("{{COMPANY_NAME}} {{X}}")).toEqual(["X"]);
  });
});

async function sentQuoteWorld(sentAt: number) {
  const w = await quoteWorld();
  await w.base.run(async (ctx) => {
    const quote = (await ctx.db.get(w.quoteId))!;
    await ctx.db.patch(w.quoteId, { status: "Awaiting response", sentAt, shareToken: "tok123", revision: 1 });
    await ctx.db.patch(quote.clientId, { email: "client@example.com", tags: [] });
  });
  return w;
}

const mine = (w: { base: Awaited<ReturnType<typeof seeded>>["base"] }, quoteId: string) =>
  w.base.run(async (ctx) => (await ctx.db.query("customAutomationRuns").collect()).filter((r) => r.quoteId === quoteId));

const live = (w: Awaited<ReturnType<typeof seeded>>, now = T0) =>
  w.admin.mutation(api.crm.automations.setSettings, { businessId: w.qft, mode: "live", testAddress: "", companyPhone: "+1 555", now });

describe("custom automations: saving", () => {
  it("lets an Admin make, change, switch off and delete one, and nobody else", async () => {
    const w = await seeded();
    const def = followUp();
    const id = await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...def, now: T0 });
    expect((await w.admin.query(api.crm.customAutomations.list, { businessId: w.qft })).map((a) => a.title)).toEqual(["Follow up after 3 days"]);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, id, ...def, title: "Renamed", now: T0 + 1 });
    await w.admin.mutation(api.crm.customAutomations.setActive, { id, active: false, now: T0 + 2 });
    const [row] = await w.admin.query(api.crm.customAutomations.list, { businessId: w.qft });
    expect(row).toMatchObject({ title: "Renamed", active: false });
    await expect(w.sales.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...def, now: T0 })).rejects.toThrow(/Admin/);
    await expect(w.sales.mutation(api.crm.customAutomations.remove, { id })).rejects.toThrow(/Admin/);
    await w.admin.mutation(api.crm.customAutomations.remove, { id });
    expect(await w.admin.query(api.crm.customAutomations.list, { businessId: w.qft })).toEqual([]);
  });

  it("refuses a definition that does not check out", async () => {
    const w = await seeded();
    await expect(w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp({ title: "" }), now: T0 })).rejects.toThrow(/title/i);
  });

  it("restarts the from-now-on clock when it is turned back on", async () => {
    const w = await seeded();
    const id = await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), now: T0 });
    await w.admin.mutation(api.crm.customAutomations.setActive, { id, active: false, now: T0 + DAY_MS });
    await w.admin.mutation(api.crm.customAutomations.setActive, { id, active: true, now: T0 + 5 * DAY_MS });
    expect((await w.admin.query(api.crm.customAutomations.list, { businessId: w.qft }))[0].activeSince).toBe(T0 + 5 * DAY_MS);
  });
});

describe("custom automations: running", () => {
  it("logs what it would email in log-only mode, once, and changes nothing", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS + 1000 });
    const rows = await mine(w, w.quoteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "logged", mode: "log", toAddress: "client@example.com" });
  });

  it("waits for the days, and skips a quote sent before it was turned on", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 3 * DAY_MS }); // only 2 days since it was sent
    expect(await mine(w, w.quoteId)).toHaveLength(0);
    const old = await sentQuoteWorld(T0 - 10 * DAY_MS);
    await old.admin.mutation(api.crm.customAutomations.save, { businessId: old.qft, ...followUp(), now: T0 });
    await old.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 90 * DAY_MS });
    expect(await mine(old, old.quoteId)).toHaveLength(0);
  });

  it("only acts when the conditions hold", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp({ conditions: [{ field: "quoteStatus", op: "is", values: ["Approved"] }] }), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    expect(await mine(w, w.quoteId)).toHaveLength(0);
    const lined = await sentQuoteWorld(T0 + DAY_MS);
    await lined.admin.mutation(api.crm.customAutomations.save, { businessId: lined.qft, ...followUp({ conditions: [{ field: "lineItem", op: "is", values: ["turf"] }] }), now: T0 });
    await lined.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    expect(await mine(lined, lined.quoteId)).toHaveLength(1); // the quote has a "Turf" line
  });

  it("queues one email in test mode, checks again at send time, and sends to the test address", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await w.admin.mutation(api.crm.automations.setSettings, { businessId: w.qft, mode: "test", testAddress: "Me@Test.com", companyPhone: "+1 555", now: T0 });
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    const [row] = await mine(w, w.quoteId);
    expect(row.status).toBe("queued");
    const prep = await w.base.mutation(internal.crm.customAutomations.prepareSend, { runId: row._id, now: T0 + 5 * DAY_MS + 10 });
    expect(prep).toMatchObject({ mode: "test", to: "me@test.com" });
    expect(prep?.subject).toContain("[TEST, would go to client@example.com]");
    expect(prep?.html).toContain("https://crm.test/q/tok123");
    await w.base.mutation(internal.crm.customAutomations.finishSend, { runId: row._id, mode: "test", to: "me@test.com", subject: prep!.subject, now: T0 + 6 * DAY_MS });
    expect((await mine(w, w.quoteId))[0].status).toBe("tested");
  });

  it("does not send when the quote changed before the email went out", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await live(w);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    const [row] = await mine(w, w.quoteId);
    await w.base.run((ctx) => ctx.db.patch(w.quoteId, { status: "Approved" }));
    expect(await w.base.mutation(internal.crm.customAutomations.prepareSend, { runId: row._id, now: T0 + 5 * DAY_MS + 10 })).toBeNull();
    expect((await mine(w, w.quoteId))[0].status).toBe("skipped");
  });

  it("adds a tag to the client for real in live mode, once, and only logs it in log-only mode", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    const clientId = (await w.base.run((ctx) => ctx.db.get(w.quoteId)))!.clientId;
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp({ action: { kind: "addTag", tag: "Company" } }), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(clientId)))?.tags).toEqual([]);
    expect((await mine(w, w.quoteId))[0]).toMatchObject({ status: "logged" });
    await live(w, T0 + 6 * DAY_MS);
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 6 * DAY_MS });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 6 * DAY_MS + 5 });
    expect((await w.base.run((ctx) => ctx.db.get(clientId)))?.tags).toEqual(["Company"]);
    expect((await mine(w, w.quoteId))[0]).toMatchObject({ status: "done" });
  });

  it("archives the quote when asked, in live mode", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await live(w);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp({ action: { kind: "updateStatus", status: "Archived" } }), now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    expect((await w.base.run((ctx) => ctx.db.get(w.quoteId)))?.status).toBe("Archived");
  });

  it("reacts to a project changing stage, using the stage it moved to", async () => {
    const w = await seeded();
    await live(w);
    const def: CustomDefinition = {
      title: "Tag when it reaches consultation",
      trigger: { kind: "occurs", object: "project", event: "updated" },
      conditions: [{ field: "stage", op: "is", values: ["Onsite Consultation"] }],
      action: { kind: "addTag", tag: "Partner Contractor" },
    };
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...def, now: T0 });
    await w.base.run(async (ctx) => {
      const p = (await ctx.db.get(w.project))!;
      await ctx.db.insert("stageHistory", { opportunityId: p._id, businessId: p.businessId, from: "New Request", to: "Schedule Onsite Consultation", byName: "x", at: T0 + 1000 });
    });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 2000 });
    expect((await w.base.run((ctx) => ctx.db.get(w.clientId)))?.tags ?? []).not.toContain("Partner Contractor");
    await w.base.run(async (ctx) => {
      const p = (await ctx.db.get(w.project))!;
      await ctx.db.insert("stageHistory", { opportunityId: p._id, businessId: p.businessId, from: "Schedule Onsite Consultation", to: "Onsite Consultation", byName: "x", at: T0 + 3000 });
    });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 4000 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5000 });
    expect((await w.base.run((ctx) => ctx.db.get(w.clientId)))?.tags).toEqual(["Partner Contractor"]);
  });

  it("does nothing for an automation that is off", async () => {
    const w = await sentQuoteWorld(T0 + DAY_MS);
    await w.admin.mutation(api.crm.customAutomations.save, { businessId: w.qft, ...followUp(), active: false, now: T0 });
    await w.base.mutation(internal.crm.customAutomations.tick, { now: T0 + 5 * DAY_MS });
    expect(await mine(w, w.quoteId)).toHaveLength(0);
  });
});
