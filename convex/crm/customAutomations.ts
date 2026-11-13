import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { env, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin, requireBusiness } from "./lib/access";
import {
  DEFAULT_COMPANY_PHONE, decide, followUpHtml, isDue, isEmail, type Mode, type RunRow,
} from "./lib/automationRules";
import {
  CUSTOM_BODY, CUSTOM_SUBJECT, MAX_CUSTOM_PER_BUSINESS, actionSentence, checkDefinition, conditionSentence, conditionsPass, renderCustom, triggerSentence,
  type CustomDefinition, type CustomVars, type Facts,
} from "./lib/customAutomation";
import { logEvent } from "./quoteDraft";

/* Custom automations (D-071): what an Admin builds with Jobber's "New Automation" panel. A cron (`tick`, every 15 minutes) finds what is
   due or what happened, checks the conditions and does the action. They obey the same sending mode as the four fixed ones (D-065): "log
   only" writes what would happen and changes nothing; "test" emails the test address and does the rest for real; "live" emails clients.
   Only Admins make or change them. */

const triggerV = v.object({ kind: v.union(v.literal("datePassed"), v.literal("occurs")), object: v.union(v.literal("quote"), v.literal("project")), event: v.string(), days: v.optional(v.number()) });
const conditionV = v.object({
  field: v.union(v.literal("quoteStatus"), v.literal("stage"), v.literal("clientTag"), v.literal("lineItem")),
  op: v.union(v.literal("is"), v.literal("isNot")),
  values: v.array(v.string()),
});
const actionV = v.object({
  kind: v.union(v.literal("notify"), v.literal("addTag"), v.literal("updateStatus")),
  method: v.optional(v.union(v.literal("both"), v.literal("email"), v.literal("text"))),
  subject: v.optional(v.string()),
  body: v.optional(v.string()),
  textBody: v.optional(v.string()),
  tag: v.optional(v.string()),
  status: v.optional(v.string()),
});

const MAX_QUOTES_SCANNED = 2000;
const MAX_PROJECTS_SCANNED = 2000;
const MAX_HISTORY_SCANNED = 500;
const MAX_EMAILS_PER_TICK = 25;
const MAX_CHANGES_PER_TICK = 200;
const SYSTEM = "Automation";

const shape = (a: Doc<"customAutomations">) => ({
  id: a._id, businessId: a.businessId, title: a.title, active: a.active, activeSince: a.activeSince, trigger: a.trigger, conditions: a.conditions, action: a.action,
  /** Jobber's three lines, in words. */
  sentences: { trigger: triggerSentence(a.trigger), conditions: a.conditions.map(conditionSentence), action: actionSentence(a.action) },
  updatedAt: a.updatedAt, updatedByName: a.updatedByName,
});

export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const rows = await ctx.db.query("customAutomations").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_CUSTOM_PER_BUSINESS + 1);
    return rows.sort((x, y) => x.createdAt - y.createdAt).map(shape);
  },
});

/** Make a custom automation, or change one (`id`). A new one starts Active. Turning one on again restarts "only what happens from now on". */
export const save = mutation({
  args: {
    businessId: v.id("businesses"), id: v.optional(v.id("customAutomations")), title: v.string(), trigger: triggerV, conditions: v.array(conditionV), action: actionV,
    active: v.optional(v.boolean()), now: v.number(),
  },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    await requireBusiness(ctx, a.businessId);
    const def: CustomDefinition = { title: a.title.trim(), trigger: a.trigger, conditions: a.conditions, action: a.action };
    const problem = checkDefinition(def);
    if (problem) throw new ConvexError(problem);
    // Only the parts that belong to the chosen action are kept.
    const action = def.action.kind === "notify"
      ? { kind: "notify" as const, method: def.action.method, subject: def.action.subject ?? CUSTOM_SUBJECT, body: def.action.body ?? CUSTOM_BODY, textBody: def.action.textBody ?? "" }
      : def.action.kind === "addTag" ? { kind: "addTag" as const, tag: def.action.tag } : { kind: "updateStatus" as const, status: def.action.status };
    const trigger = def.trigger.kind === "datePassed" ? def.trigger : { kind: def.trigger.kind, object: def.trigger.object, event: def.trigger.event };
    if (a.id) {
      const row = await ctx.db.get(a.id);
      if (!row || row.businessId !== a.businessId) throw new ConvexError("That automation no longer exists.");
      const active = a.active ?? row.active;
      await ctx.db.patch(row._id, {
        title: def.title, trigger, conditions: def.conditions, action, active, ...(active && !row.active ? { activeSince: a.now } : {}), updatedAt: a.now, updatedByName: staff.name,
      });
      return row._id;
    }
    const existing = await ctx.db.query("customAutomations").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_CUSTOM_PER_BUSINESS + 1);
    if (existing.length >= MAX_CUSTOM_PER_BUSINESS) throw new ConvexError(`A business can have up to ${MAX_CUSTOM_PER_BUSINESS} custom automations.`);
    return await ctx.db.insert("customAutomations", {
      businessId: a.businessId, title: def.title, active: a.active ?? true, activeSince: a.now, trigger, conditions: def.conditions, action, createdAt: a.now, updatedAt: a.now, updatedByName: staff.name,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("customAutomations"), active: v.boolean(), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    const row = await ctx.db.get(a.id);
    if (!row) throw new ConvexError("That automation no longer exists.");
    await requireBusiness(ctx, row.businessId);
    await ctx.db.patch(row._id, { active: a.active, ...(a.active && !row.active ? { activeSince: a.now } : {}), updatedAt: a.now, updatedByName: staff.name });
    return null;
  },
});

/** Deletes the automation. Its past runs stay in the activity list, shown under "Deleted automation". */
export const remove = mutation({
  args: { id: v.id("customAutomations") },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(a.id);
    if (!row) return null;
    await requireBusiness(ctx, row.businessId);
    await ctx.db.delete(row._id);
    return null;
  },
});

/** What custom automations did lately, newest first. */
export const activity = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const runs = await ctx.db.query("customAutomationRuns").withIndex("by_business_and_at", (q) => q.eq("businessId", a.businessId)).order("desc").take(100);
    const out = [];
    for (const r of runs) {
      const auto = await ctx.db.get(r.automationId);
      const quote = r.quoteId ? await ctx.db.get(r.quoteId) : null;
      const project = r.opportunityId ? await ctx.db.get(r.opportunityId) : null;
      const client = r.clientId ? await ctx.db.get(r.clientId) : null;
      out.push({
        id: r._id, at: r.at, title: auto?.title ?? "Deleted automation", status: r.status, mode: r.mode, detail: r.detail,
        clientId: r.clientId ?? null, clientName: client?.name ?? "", quoteId: r.quoteId ?? null, quoteNumber: quote?.number ?? null,
        opportunityId: r.opportunityId ?? null, projectTitle: project?.title ?? "",
      });
    }
    return out;
  },
});

/* ---- Running them ---- */

type Item = { key: string; quote?: Doc<"quotes">; project?: Doc<"opportunities">; client: Doc<"clients">; stage?: string };
type Settings = { mode: Mode; testAddress: string; companyPhone: string };

async function settingsOf(ctx: QueryCtx, businessId: Id<"businesses">): Promise<Settings> {
  const s = await ctx.db.query("automationSettings").withIndex("by_business", (q) => q.eq("businessId", businessId)).unique();
  return { mode: s?.mode ?? "log", testAddress: s?.testAddress ?? "", companyPhone: s?.companyPhone ?? DEFAULT_COMPANY_PHONE };
}

async function factsOf(ctx: QueryCtx, item: Item): Promise<Facts> {
  const lines = item.quote
    ? await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", item.quote!._id)).take(200)
    : [];
  return { quoteStatus: item.quote?.status, stage: item.stage ?? item.project?.stage, clientTags: item.client.tags ?? [], lineNames: lines.map((l) => l.name) };
}

async function writeRun(
  ctx: MutationCtx, row: Doc<"customAutomationRuns"> | null, auto: Doc<"customAutomations">, item: Item, status: Doc<"customAutomationRuns">["status"], mode: Mode,
  detail: string, now: number, extra: { to?: string; attempts?: number } = {},
) {
  const fields = { status, mode, detail: detail.slice(0, 400), at: now, attempts: extra.attempts ?? row?.attempts ?? 0, toAddress: extra.to };
  if (row) await ctx.db.patch(row._id, fields);
  else {
    await ctx.db.insert("customAutomationRuns", {
      businessId: auto.businessId, automationId: auto._id, itemKey: item.key, clientId: item.client._id,
      ...(item.quote ? { quoteId: item.quote._id } : {}), ...(item.project ? { opportunityId: item.project._id } : {}), ...fields,
    });
  }
}

/** The existing "decide" knows the fixed automations' statuses; a custom run that did its work ("done") counts as archived there: finished. */
const asRunRow = (row: Doc<"customAutomationRuns"> | null): RunRow | null => (row ? { _id: row._id, status: row.status === "done" ? "archived" : row.status, attempts: row.attempts, at: row.at } : null);

type Built = { ok: true; to: string; subject: string; text: string; html: string } | { ok: false; reason: string; fatal: boolean };

async function buildMessage(ctx: QueryCtx, auto: Doc<"customAutomations">, item: Item, settings: Settings, mode: Mode): Promise<Built> {
  const business = await ctx.db.get(auto.businessId);
  if (!business) return { ok: false, reason: "The business no longer exists.", fatal: true };
  const clientEmail = (item.client.email ?? "").trim().toLowerCase();
  if (!clientEmail) return { ok: false, reason: "The client has no email address.", fatal: true };
  if (!isEmail(clientEmail)) return { ok: false, reason: `The client's email address (${clientEmail}) is not usable.`, fatal: true };
  const to = mode === "test" ? settings.testAddress : clientEmail;
  if (!to) return { ok: false, reason: "Test mode has no test address, so nothing was sent.", fatal: true };
  const vars: CustomVars = {
    CLIENT_FIRST_NAME: item.client.firstName?.trim() || item.client.name.trim().split(/\s+/)[0] || "there",
    CLIENT_NAME: item.client.name, COMPANY_NAME: business.name, DEFAULT_PHONE: settings.companyPhone,
    QUOTE_NUMBER: item.quote ? `#${item.quote.number}` : "", PROJECT_TITLE: item.project?.title ?? "",
  };
  const base = (env.CRM_APP_URL ?? "").trim().replace(/\/$/, "");
  if (item.quote?.shareToken && !base) return { ok: false, reason: "CRM_APP_URL is not set, so the quote link cannot be made.", fatal: false };
  const url = item.quote?.shareToken ? `${base}/q/${item.quote.shareToken}` : null;
  const body = renderCustom(auto.action.body ?? CUSTOM_BODY, vars);
  const subject = renderCustom(auto.action.subject ?? CUSTOM_SUBJECT, vars);
  return { ok: true, to, subject: mode === "test" ? `[TEST, would go to ${clientEmail}] ${subject}` : subject, text: url ? `${body}\n\nView your quote: ${url}` : body, html: followUpHtml(body, url) };
}

/** Does the automation's action for one item. Returns "email" when an email was queued, "change" when something was changed or logged. */
async function perform(ctx: MutationCtx, auto: Doc<"customAutomations">, item: Item, mode: Mode, settings: Settings, row: Doc<"customAutomationRuns"> | null, now: number, canEmail: boolean): Promise<"email" | "change" | "none"> {
  const a = auto.action;
  if (a.kind === "notify") {
    if (a.method === "text") {
      await writeRun(ctx, row, auto, item, "skipped", mode, "Text messages are not sent yet: the CRM has no text provider.", now);
      return "change";
    }
    if (mode === "log") {
      const built = await buildMessage(ctx, auto, item, settings, "log");
      await writeRun(ctx, row, auto, item, "logged", mode, built.ok ? `Would email ${built.to}: ${built.subject}` : `Would skip: ${built.reason}`, now, built.ok ? { to: built.to } : {});
      return "change";
    }
    if (!canEmail) return "none";
    await writeRun(ctx, row, auto, item, "queued", mode, "Waiting to send.", now);
    const saved = (await ctx.db.query("customAutomationRuns").withIndex("by_automation_and_item", (q) => q.eq("automationId", auto._id).eq("itemKey", item.key)).first())!;
    await ctx.scheduler.runAfter(0, internal.crm.automationSend.sendCustomOne, { runId: saved._id });
    return "email";
  }
  if (a.kind === "addTag") {
    const tag = a.tag ?? "";
    const has = (item.client.tags ?? []).includes(tag);
    if (mode === "log") {
      await writeRun(ctx, row, auto, item, "logged", mode, has ? `The client already has the "${tag}" tag.` : `Would add the "${tag}" tag to ${item.client.name}.`, now);
      return "change";
    }
    if (!has) await ctx.db.patch(item.client._id, { tags: [...(item.client.tags ?? []), tag] });
    await writeRun(ctx, row, auto, item, "done", mode, has ? `${item.client.name} already had the "${tag}" tag.` : `Added the "${tag}" tag to ${item.client.name}.`, now);
    return "change";
  }
  // updateStatus: archive the quote.
  const quote = item.quote;
  if (!quote) {
    await writeRun(ctx, row, auto, item, "skipped", mode, "There is no quote to update.", now);
    return "change";
  }
  if (quote.status === "Archived" || quote.status === "Converted") {
    await writeRun(ctx, row, auto, item, "skipped", mode, `Quote #${quote.number} is already ${quote.status.toLowerCase()}.`, now);
    return "change";
  }
  if (mode === "log") {
    await writeRun(ctx, row, auto, item, "logged", mode, `Would archive quote #${quote.number}.`, now);
    return "change";
  }
  await ctx.db.patch(quote._id, { status: "Archived" });
  await logEvent(ctx, quote._id, "archived", SYSTEM, `Archived by the automation "${auto.title}"`, now);
  await writeRun(ctx, row, auto, item, "done", mode, `Archived quote #${quote.number}.`, now);
  return "change";
}

/** The items a trigger is about, each with the time that counts and a key for "done once". */
async function candidates(ctx: QueryCtx, auto: Doc<"customAutomations">, now: number): Promise<(Item & { at: number })[]> {
  const t = auto.trigger;
  const out: (Item & { at: number })[] = [];
  const client = new Map<Id<"clients">, Doc<"clients"> | null>();
  const clientOf = async (id: Id<"clients">) => {
    if (!client.has(id)) client.set(id, await ctx.db.get(id));
    return client.get(id) ?? null;
  };
  if (t.object === "quote") {
    const quotes = await ctx.db.query("quotes").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", auto.businessId)).order("desc").take(MAX_QUOTES_SCANNED);
    for (const quote of quotes) {
      const at = t.event === "approved" ? quote.approvedAt : quote.sentAt;
      if (!isDue(at, auto.activeSince, t.days ?? 0, now)) continue;
      const c = await clientOf(quote.clientId);
      if (c) out.push({ key: `q:${quote._id}`, quote, client: c, at: at! });
    }
  } else if (t.kind === "datePassed") {
    const projects = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", auto.businessId)).order("desc").take(MAX_PROJECTS_SCANNED);
    for (const project of projects) {
      if (project.pipeline !== "Sales" || project.archivedAt !== undefined || !isDue(project.requestedAt, auto.activeSince, t.days ?? 0, now)) continue;
      const c = await clientOf(project.clientId);
      if (c) out.push({ key: `p:${project._id}`, project, client: c, at: project.requestedAt });
    }
  } else {
    // "Something occurs": every stage move since the automation was turned on.
    const moves = await ctx.db.query("stageHistory").withIndex("by_business", (q) => q.eq("businessId", auto.businessId).gte("at", auto.activeSince)).order("desc").take(MAX_HISTORY_SCANNED);
    for (const move of moves) {
      const project = await ctx.db.get(move.opportunityId);
      if (!project || project.archivedAt !== undefined) continue;
      const c = await clientOf(project.clientId);
      if (c) out.push({ key: `h:${move._id}`, project, client: c, stage: move.to, at: move.at });
    }
  }
  return out;
}

/** Finds what is due for every business and does it (or queues the email). Safe to run any number of times. */
export const tick = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const businesses = await ctx.db.query("businesses").take(50);
    let emails = 0;
    let changes = 0;
    for (const b of businesses) {
      const autos = (await ctx.db.query("customAutomations").withIndex("by_business", (q) => q.eq("businessId", b._id)).take(MAX_CUSTOM_PER_BUSINESS + 1)).filter((x) => x.active);
      if (autos.length === 0) continue;
      const settings = await settingsOf(ctx, b._id);
      for (const auto of autos) {
        for (const item of await candidates(ctx, auto, now)) {
          const row = await ctx.db.query("customAutomationRuns").withIndex("by_automation_and_item", (q) => q.eq("automationId", auto._id).eq("itemKey", item.key)).first();
          if (decide(asRunRow(row), settings.mode, now).action === "skip") continue;
          if (!conditionsPass(auto.conditions, await factsOf(ctx, item))) continue;
          if (changes >= MAX_CHANGES_PER_TICK) continue;
          const did = await perform(ctx, auto, item, settings.mode, settings, row, now, emails < MAX_EMAILS_PER_TICK);
          if (did === "email") emails++;
          if (did !== "none") changes++;
        }
      }
    }
    return null;
  },
});

/** Called by the sender just before it emails: checks the automation still applies and returns what to send (or null when it was dealt with). */
export const prepareSend = internalMutation({
  args: { runId: v.id("customAutomationRuns"), now: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.runId);
    if (!row || row.status !== "queued") return null;
    const auto = await ctx.db.get(row.automationId);
    const stop = async (item: Item | null, reason: string) => {
      if (auto && item) await writeRun(ctx, row, auto, item, "skipped", row.mode, reason, a.now);
      else await ctx.db.patch(row._id, { status: "skipped", detail: reason.slice(0, 400), at: a.now });
      return null;
    };
    if (!auto) return await stop(null, "The automation no longer exists.");
    const client = row.clientId ? await ctx.db.get(row.clientId) : null;
    const quote = row.quoteId ? await ctx.db.get(row.quoteId) : null;
    const project = row.opportunityId ? await ctx.db.get(row.opportunityId) : null;
    if (!client || (!quote && !project)) return await stop(null, "The client, quote or project no longer exists.");
    let stage: string | undefined;
    if (row.itemKey.startsWith("h:")) {
      const id = ctx.db.normalizeId("stageHistory", row.itemKey.slice(2));
      stage = id ? (await ctx.db.get(id))?.to : undefined;
    }
    const item: Item = { key: row.itemKey, client, ...(quote ? { quote } : {}), ...(project ? { project } : {}), ...(stage ? { stage } : {}) };
    if (!auto.active) return await stop(item, "The automation was turned off before the email went out.");
    if (!conditionsPass(auto.conditions, await factsOf(ctx, item))) return await stop(item, "What it is about changed before the email went out, so it no longer applies.");
    const settings = await settingsOf(ctx, row.businessId);
    if (settings.mode === "log") {
      const built = await buildMessage(ctx, auto, item, settings, "log");
      await writeRun(ctx, row, auto, item, "logged", "log", built.ok ? `Would email ${built.to}: ${built.subject}` : `Would skip: ${built.reason}`, a.now);
      return null;
    }
    const built = await buildMessage(ctx, auto, item, settings, settings.mode);
    if (!built.ok) {
      if (built.fatal) return await stop(item, built.reason);
      await writeRun(ctx, row, auto, item, "failed", settings.mode, built.reason, a.now, { attempts: row.attempts + 1 });
      return null;
    }
    return { mode: settings.mode, to: built.to, subject: built.subject, text: built.text, html: built.html };
  },
});

/** Records how the send went. A failure is retried by the next tick, up to three times. */
export const finishSend = internalMutation({
  args: { runId: v.id("customAutomationRuns"), mode: v.union(v.literal("log"), v.literal("test"), v.literal("live")), to: v.string(), subject: v.string(), error: v.optional(v.string()), now: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.runId);
    if (!row || row.status !== "queued") return null;
    if (a.error !== undefined) {
      await ctx.db.patch(row._id, { status: "failed", mode: a.mode, detail: `Could not send: ${a.error}`.slice(0, 400), at: a.now, toAddress: a.to, attempts: row.attempts + 1 });
      return null;
    }
    await ctx.db.patch(row._id, { status: a.mode === "live" ? "sent" : "tested", mode: a.mode, detail: `Emailed ${a.to}: ${a.subject}`.slice(0, 400), at: a.now, toAddress: a.to });
    if (row.quoteId) await logEvent(ctx, row.quoteId, "followup", SYSTEM, a.mode === "live" ? `Automation email sent to ${a.to}` : `Test automation email sent to ${a.to}`, a.now);
    return null;
  },
});
