import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { env, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin, requireBusiness, requireEditor } from "./lib/access";
import {
  AUTOMATIONS, AUTOMATION_KEYS, DEFAULT_BODY, DEFAULT_COMPANY_PHONE, DEFAULT_SUBJECT, DEFAULT_TEXT, MAX_DAYS, MIN_DAYS,
  QUOTE_ARCHIVE_STATUSES, QUOTE_FOLLOW_UP_STATUSES, QUOTE_UNANSWERED_STATUSES, automationTitle, decide, followUpHtml, isDue, isEmail,
  renderTemplate, unknownVariables, unresponsiveReason,
  type AutomationKey, type Mode, type RunStatus, type TemplateVars,
} from "./lib/automationRules";
import { PIPELINE_GROUPS } from "./lib/stages";
import { systemMove } from "./lib/systemMove";
import { logEvent } from "./quoteDraft";

/* Pipeline automations (D-065). The four are Jobber's and cannot be added to or deleted: an Admin changes days, wording, on/off and the
   sending mode. A cron (`tick`, every 15 minutes) finds what is due. Emails go out through automationSend.ts (Zoho). "Log only" (the default)
   writes what would happen and changes nothing; "test" sends to one address and does the archiving; "live" sends to clients. */

const keyV = v.union(v.literal("quoteArchive"), v.literal("quoteFollowUp5"), v.literal("quoteFollowUp2"), v.literal("requestArchive"));
const modeV = v.union(v.literal("log"), v.literal("test"), v.literal("live"));

const MAX_QUOTES_SCANNED = 2000;
const MAX_REQUESTS_SCANNED = 2000;
const MAX_EMAILS_PER_TICK = 25;
const MAX_ARCHIVES_PER_TICK = 200;
const SYSTEM = "Automation";

/** Creates the four rows and the settings for a business if they are not there yet. Everything starts on (as in Jobber) and in log-only mode. */
async function ensureRows(ctx: MutationCtx, businessId: Id<"businesses">, now: number, byName: string) {
  const rows = await ctx.db.query("automations").withIndex("by_business_and_key", (q) => q.eq("businessId", businessId)).take(20);
  for (const key of AUTOMATION_KEYS) {
    if (rows.some((r) => r.key === key)) continue;
    const email = AUTOMATIONS[key].action === "email";
    const id = await ctx.db.insert("automations", {
      businessId, key, days: AUTOMATIONS[key].defaultDays, active: true, activeSince: now,
      ...(email ? { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY, textBody: DEFAULT_TEXT } : {}),
      updatedAt: now, updatedByName: byName,
    });
    rows.push((await ctx.db.get(id))!);
  }
  let settings = await ctx.db.query("automationSettings").withIndex("by_business", (q) => q.eq("businessId", businessId)).unique();
  if (!settings) {
    const id = await ctx.db.insert("automationSettings", { businessId, mode: "log", companyPhone: DEFAULT_COMPANY_PHONE, updatedAt: now, updatedByName: byName });
    settings = (await ctx.db.get(id))!;
  }
  return { rows, settings };
}

const order = (key: AutomationKey) => AUTOMATION_KEYS.indexOf(key);

/** The screen's data: the four automations (defaults shown until the first save creates them), the mode and whether sending is set up. */
export const overview = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const rows = await ctx.db.query("automations").withIndex("by_business_and_key", (q) => q.eq("businessId", a.businessId)).take(20);
    const settings = await ctx.db.query("automationSettings").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).unique();
    const automations = AUTOMATION_KEYS.map((key) => {
      const row = rows.find((r) => r.key === key);
      const def = AUTOMATIONS[key];
      const days = row?.days ?? def.defaultDays;
      return {
        key, title: automationTitle(key, days), group: def.group, action: def.action, onlyIf: def.onlyIf, startsFrom: def.startsFrom,
        days, active: row?.active ?? true, activeSince: row?.activeSince ?? null,
        subject: row?.subject ?? (def.action === "email" ? DEFAULT_SUBJECT : null),
        body: row?.body ?? (def.action === "email" ? DEFAULT_BODY : null),
        textBody: row?.textBody ?? (def.action === "email" ? DEFAULT_TEXT : null),
      };
    });
    return {
      automations,
      /** False until an Admin (or the cron) has created the rows; the page asks for them once. */
      ready: rows.length === AUTOMATION_KEYS.length && settings !== null,
      mode: (settings?.mode ?? "log") as Mode,
      testAddress: settings?.testAddress ?? "",
      companyPhone: settings?.companyPhone ?? DEFAULT_COMPANY_PHONE,
      sendingConfigured: Boolean(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN && env.CRM_APP_URL),
    };
  },
});

export const ensure = mutation({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    await requireBusiness(ctx, a.businessId);
    await ensureRows(ctx, a.businessId, a.now, staff.name);
    return null;
  },
});

function checkWording(subject: string, body: string, textBody: string) {
  if (!subject.trim()) throw new ConvexError("The email needs a subject.");
  if (!body.trim()) throw new ConvexError("The email needs a message.");
  if (!textBody.trim()) throw new ConvexError("The text message needs a message.");
  if (subject.length > 200) throw new ConvexError("The subject is too long (200 characters at most).");
  if (body.length > 5000) throw new ConvexError("The message is too long (5,000 characters at most).");
  if (textBody.length > 600) throw new ConvexError("The text message is too long (600 characters at most).");
  const unknown = [...new Set([...unknownVariables(subject), ...unknownVariables(body), ...unknownVariables(textBody)])];
  if (unknown.length) throw new ConvexError(`Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}. Use Insert variable.`);
}

/** Change one automation: days, on/off and (for the follow-ups) the wording. Admin only. Turning it on again restarts "only quotes sent from now on". */
export const update = mutation({
  args: {
    businessId: v.id("businesses"), key: keyV, days: v.number(), active: v.boolean(),
    subject: v.optional(v.string()), body: v.optional(v.string()), textBody: v.optional(v.string()), now: v.number(),
  },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    await requireBusiness(ctx, a.businessId);
    if (!Number.isInteger(a.days) || a.days < MIN_DAYS || a.days > MAX_DAYS) throw new ConvexError(`Days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}.`);
    const { rows } = await ensureRows(ctx, a.businessId, a.now, staff.name);
    const row = rows.find((r) => r.key === a.key)!;
    const patch: Partial<Doc<"automations">> = { days: a.days, active: a.active, updatedAt: a.now, updatedByName: staff.name };
    if (a.active && !row.active) patch.activeSince = a.now;
    if (AUTOMATIONS[a.key].action === "email") {
      const subject = a.subject ?? row.subject ?? DEFAULT_SUBJECT;
      const body = a.body ?? row.body ?? DEFAULT_BODY;
      const textBody = a.textBody ?? row.textBody ?? DEFAULT_TEXT;
      checkWording(subject, body, textBody);
      Object.assign(patch, { subject, body, textBody });
    }
    await ctx.db.patch(row._id, patch);
    return null;
  },
});

/** Put the follow-up wording back to Jobber's. */
export const resetWording = mutation({
  args: { businessId: v.id("businesses"), key: keyV, now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    await requireBusiness(ctx, a.businessId);
    if (AUTOMATIONS[a.key].action !== "email") throw new ConvexError("This automation has no message.");
    const { rows } = await ensureRows(ctx, a.businessId, a.now, staff.name);
    const row = rows.find((r) => r.key === a.key)!;
    await ctx.db.patch(row._id, { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY, textBody: DEFAULT_TEXT, updatedAt: a.now, updatedByName: staff.name });
    return null;
  },
});

export const setSettings = mutation({
  args: { businessId: v.id("businesses"), mode: modeV, testAddress: v.string(), companyPhone: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireAdmin(ctx);
    await requireBusiness(ctx, a.businessId);
    const test = a.testAddress.trim().toLowerCase();
    if (test && !isEmail(test)) throw new ConvexError("Enter a valid test email address.");
    if (a.mode === "test" && !test) throw new ConvexError("Test mode needs a test email address.");
    const phone = a.companyPhone.trim();
    if (phone.length > 40) throw new ConvexError("The phone number is too long.");
    const { settings } = await ensureRows(ctx, a.businessId, a.now, staff.name);
    await ctx.db.patch(settings._id, { mode: a.mode, testAddress: test || undefined, companyPhone: phone, updatedAt: a.now, updatedByName: staff.name });
    return null;
  },
});

/** The latest things the automations did, newest first. */
export const activity = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const runs = await ctx.db.query("automationRuns").withIndex("by_business_and_at", (q) => q.eq("businessId", a.businessId)).order("desc").take(100);
    const out = [];
    for (const r of runs) {
      const quote = r.quoteId ? await ctx.db.get(r.quoteId) : null;
      const project = r.opportunityId ? await ctx.db.get(r.opportunityId) : null;
      const client = r.clientId ? await ctx.db.get(r.clientId) : null;
      out.push({
        id: r._id, at: r.at, key: r.key, title: AUTOMATIONS[r.key].title, status: r.status, mode: r.mode, detail: r.detail,
        clientId: r.clientId ?? null, clientName: client?.name ?? "",
        quoteId: r.quoteId ?? null, quoteNumber: quote?.number ?? null, opportunityId: r.opportunityId ?? null, projectTitle: project?.title ?? "",
      });
    }
    return out;
  },
});

/** Put an automatically archived request back on the board, in the stage it was in. */
export const restoreRequest = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.id);
    if (!project) throw new ConvexError("That request no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    if (project.archivedAt === undefined) throw new ConvexError("This request is not archived.");
    const back = project.archivedFromStage ?? "New Request";
    const wasClosed = project.stage;
    await ctx.db.patch(project._id, {
      stage: back, stageEnteredAt: a.now, outcome: undefined, closedAt: undefined, lostReason: undefined,
      archivedAt: undefined, archivedReason: undefined, archivedFromStage: undefined,
      searchText: project.searchText.endsWith(wasClosed) ? project.searchText.slice(0, -wasClosed.length) + back : project.searchText,
    });
    await ctx.db.insert("stageHistory", {
      opportunityId: project._id, businessId: project.businessId, from: wasClosed, to: back, byName: staff.name, byUserId: staff.userId, at: a.now, note: "Restored from archive",
    });
    return null;
  },
});

/* ---- Running them ---- */

type RunBase = { businessId: Id<"businesses">; key: AutomationKey; quoteId?: Id<"quotes">; opportunityId?: Id<"opportunities">; clientId?: Id<"clients"> };

async function writeRun(
  ctx: MutationCtx, row: Doc<"automationRuns"> | null, base: RunBase, status: RunStatus, mode: Mode, detail: string, now: number,
  extra: { to?: string; attempts?: number } = {},
) {
  const fields = { status, mode, detail: detail.slice(0, 400), at: now, attempts: extra.attempts ?? row?.attempts ?? 0, toAddress: extra.to };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("automationRuns", { ...base, ...fields });
}

type Built = { ok: true; to: string; subject: string; text: string; html: string } | { ok: false; reason: string; fatal: boolean };

/** The email for one quote: Jobber's wording with the variables filled in, the client's address (or the test address in test mode). */
async function buildMessage(ctx: QueryCtx, quote: Doc<"quotes">, auto: Doc<"automations">, settings: Doc<"automationSettings">, mode: Mode): Promise<Built> {
  const client = await ctx.db.get(quote.clientId);
  const business = await ctx.db.get(quote.businessId);
  if (!client || !business) return { ok: false, reason: "The client or business no longer exists.", fatal: true };
  const clientEmail = (client.email ?? "").trim().toLowerCase();
  if (!clientEmail) return { ok: false, reason: "The client has no email address.", fatal: true };
  if (!isEmail(clientEmail)) return { ok: false, reason: `The client's email address (${clientEmail}) is not usable.`, fatal: true };
  const to = mode === "test" ? settings.testAddress ?? "" : clientEmail;
  if (!to) return { ok: false, reason: "Test mode has no test address, so nothing was sent.", fatal: true };
  const vars: TemplateVars = {
    CLIENT_FIRST_NAME: client.firstName?.trim() || client.name.trim().split(/\s+/)[0] || "there",
    CLIENT_NAME: client.name, COMPANY_NAME: business.name, DEFAULT_PHONE: settings.companyPhone, QUOTE_NUMBER: `#${quote.number}`,
  };
  const base = (env.CRM_APP_URL ?? "").trim().replace(/\/$/, "");
  if (quote.shareToken && !base) return { ok: false, reason: "CRM_APP_URL is not set, so the quote link cannot be made.", fatal: false };
  const url = quote.shareToken ? `${base}/q/${quote.shareToken}` : null;
  const body = renderTemplate(auto.body ?? DEFAULT_BODY, vars);
  const subject = renderTemplate(auto.subject ?? DEFAULT_SUBJECT, vars);
  return {
    ok: true, to,
    subject: mode === "test" ? `[TEST, would go to ${clientEmail}] ${subject}` : subject,
    text: url ? `${body}\n\nView your quote: ${url}` : body,
    html: followUpHtml(body, url),
  };
}

async function projectIsStillLive(ctx: QueryCtx, quote: Doc<"quotes">): Promise<boolean> {
  if (!quote.opportunityId) return false;
  const others = await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", quote.opportunityId)).take(50);
  return others.some((o) => o._id !== quote._id && ["Draft", "Awaiting response", "Changes requested", "Approved", "Converted"].includes(o.status));
}

async function archiveQuote(ctx: MutationCtx, quote: Doc<"quotes">, auto: Doc<"automations">, mode: Mode, row: Doc<"automationRuns"> | null, now: number) {
  const base: RunBase = { businessId: quote.businessId, key: auto.key, quoteId: quote._id, clientId: quote.clientId };
  const reason = unresponsiveReason(auto.days);
  const unanswered = QUOTE_UNANSWERED_STATUSES.includes(quote.status);
  if (mode === "log") {
    await writeRun(ctx, row, base, "logged", mode, `Would archive quote #${quote.number}${unanswered ? " and close its project as lost" : ""}.`, now);
    return;
  }
  await ctx.db.patch(quote._id, { status: "Archived" });
  await logEvent(ctx, quote._id, "archived", SYSTEM, `Archived automatically after ${auto.days} days`, now);
  let closed = false;
  if (unanswered && quote.opportunityId && !(await projectIsStillLive(ctx, quote))) {
    const project = await ctx.db.get(quote.opportunityId);
    if (project) closed = await systemMove(ctx, project, "Closed Lost", SYSTEM, now, { note: reason });
  }
  await writeRun(ctx, row, base, "archived", mode, `Archived quote #${quote.number}${closed ? " and closed its project as lost" : ""}.`, now);
}

async function archiveRequest(ctx: MutationCtx, project: Doc<"opportunities">, auto: Doc<"automations">, mode: Mode, row: Doc<"automationRuns"> | null, now: number) {
  const base: RunBase = { businessId: project.businessId, key: auto.key, opportunityId: project._id, clientId: project.clientId };
  if (mode === "log") {
    await writeRun(ctx, row, base, "logged", mode, `Would archive request "${project.title}" and close it as lost.`, now);
    return;
  }
  const reason = unresponsiveReason(auto.days);
  const from = project.stage;
  await systemMove(ctx, project, "Closed Lost", SYSTEM, now, { note: reason });
  const fresh = (await ctx.db.get(project._id))!;
  await ctx.db.patch(project._id, { archivedAt: now, archivedReason: reason, archivedFromStage: from, lostReason: reason, outcome: fresh.outcome ?? "lost", closedAt: fresh.closedAt ?? now });
  await writeRun(ctx, row, base, "archived", mode, `Archived request "${project.title}" and closed it as lost.`, now);
}

const REQUEST_STAGES: readonly string[] = PIPELINE_GROUPS.Requests;

/** Finds what is due for every business and does it (or, for an email, queues it). Safe to run any number of times. */
export const tick = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const a = { now: args.now ?? Date.now() };
    const businesses = await ctx.db.query("businesses").take(50);
    let emails = 0;
    let archives = 0;
    for (const b of businesses) {
      const { rows, settings } = await ensureRows(ctx, b._id, a.now, SYSTEM);
      const mode = settings.mode;
      const active = rows.filter((r) => r.active).sort((x, y) => order(x.key) - order(y.key));
      if (active.length === 0) continue;
      const quotes = await ctx.db.query("quotes").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", b._id)).order("desc").take(MAX_QUOTES_SCANNED);
      for (const auto of active.filter((r) => AUTOMATIONS[r.key].target === "quote")) {
        const statuses = AUTOMATIONS[auto.key].action === "archive" ? QUOTE_ARCHIVE_STATUSES : QUOTE_FOLLOW_UP_STATUSES;
        for (const quote of quotes) {
          if (!statuses.includes(quote.status) || !isDue(quote.sentAt, auto.activeSince, auto.days, a.now)) continue;
          const row = await ctx.db.query("automationRuns").withIndex("by_quote_and_key", (q) => q.eq("quoteId", quote._id).eq("key", auto.key)).first();
          const verdict = decide(row, mode, a.now);
          if (verdict.action === "skip") continue;
          if (AUTOMATIONS[auto.key].action === "archive") {
            if (archives >= MAX_ARCHIVES_PER_TICK) continue;
            archives++;
            await archiveQuote(ctx, quote, auto, mode, row, a.now);
            continue;
          }
          const base: RunBase = { businessId: b._id, key: auto.key, quoteId: quote._id, clientId: quote.clientId };
          if (mode === "log") {
            const built = await buildMessage(ctx, quote, auto, settings, "log");
            await writeRun(ctx, row, base, "logged", mode, built.ok ? `Would email ${built.to}: ${built.subject}` : `Would skip: ${built.reason}`, a.now, built.ok ? { to: built.to } : {});
            continue;
          }
          if (emails >= MAX_EMAILS_PER_TICK) continue;
          emails++;
          await writeRun(ctx, row, base, "queued", mode, "Waiting to send.", a.now);
          const saved = (await ctx.db.query("automationRuns").withIndex("by_quote_and_key", (q) => q.eq("quoteId", quote._id).eq("key", auto.key)).first())!;
          await ctx.scheduler.runAfter(0, internal.crm.automationSend.sendOne, { runId: saved._id });
        }
      }
      const archiveRequests = active.find((r) => r.key === "requestArchive");
      if (archiveRequests) {
        const projects = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", b._id)).order("desc").take(MAX_REQUESTS_SCANNED);
        for (const project of projects) {
          if (project.pipeline !== "Sales" || project.outcome !== undefined || project.archivedAt !== undefined || !REQUEST_STAGES.includes(project.stage)) continue;
          if (!isDue(project.requestedAt, archiveRequests.activeSince, archiveRequests.days, a.now)) continue;
          const row = await ctx.db.query("automationRuns").withIndex("by_opportunity_and_key", (q) => q.eq("opportunityId", project._id).eq("key", "requestArchive")).first();
          if (decide(row, mode, a.now).action === "skip" || archives >= MAX_ARCHIVES_PER_TICK) continue;
          archives++;
          await archiveRequest(ctx, project, archiveRequests, mode, row, a.now);
        }
      }
    }
    return null;
  },
});

/** Called by the sender just before it emails: checks that the follow-up still applies, and returns what to send (or null when it was dealt with). */
export const prepareSend = internalMutation({
  args: { runId: v.id("automationRuns"), now: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.runId);
    if (!row || row.status !== "queued" || !row.quoteId) return null;
    const quote = await ctx.db.get(row.quoteId);
    const auto = await ctx.db.query("automations").withIndex("by_business_and_key", (q) => q.eq("businessId", row.businessId).eq("key", row.key)).unique();
    const settings = await ctx.db.query("automationSettings").withIndex("by_business", (q) => q.eq("businessId", row.businessId)).unique();
    const base: RunBase = { businessId: row.businessId, key: row.key, quoteId: row.quoteId, clientId: row.clientId };
    const stop = async (reason: string) => { await writeRun(ctx, row, base, "skipped", row.mode, reason, a.now); return null; };
    if (!quote || !auto || !settings) return await stop("The quote or the automation no longer exists.");
    if (!auto.active) return await stop("The automation was turned off before the email went out.");
    if (!QUOTE_FOLLOW_UP_STATUSES.includes(quote.status)) return await stop(`The quote is now "${quote.status}", so no follow-up was needed.`);
    if (!isDue(quote.sentAt, auto.activeSince, auto.days, a.now)) return await stop("The quote was sent again, so this follow-up no longer applies.");
    const mode = settings.mode;
    if (mode === "log") {
      const built = await buildMessage(ctx, quote, auto, settings, "log");
      await writeRun(ctx, row, base, "logged", mode, built.ok ? `Would email ${built.to}: ${built.subject}` : `Would skip: ${built.reason}`, a.now);
      return null;
    }
    const built = await buildMessage(ctx, quote, auto, settings, mode);
    if (!built.ok) {
      if (built.fatal) return await stop(built.reason);
      await writeRun(ctx, row, base, "failed", mode, built.reason, a.now, { attempts: row.attempts + 1 });
      return null;
    }
    return { mode, to: built.to, subject: built.subject, text: built.text, html: built.html };
  },
});

/** Records how the send went. A failure is retried by the next tick, up to three times. */
export const finishSend = internalMutation({
  args: { runId: v.id("automationRuns"), mode: modeV, to: v.string(), subject: v.string(), error: v.optional(v.string()), now: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.runId);
    if (!row || row.status !== "queued" || !row.quoteId) return null;
    const base: RunBase = { businessId: row.businessId, key: row.key, quoteId: row.quoteId, clientId: row.clientId };
    if (a.error !== undefined) {
      await writeRun(ctx, row, base, "failed", a.mode, `Could not send: ${a.error}`, a.now, { to: a.to, attempts: row.attempts + 1 });
      return null;
    }
    const days = (await ctx.db.query("automations").withIndex("by_business_and_key", (q) => q.eq("businessId", row.businessId).eq("key", row.key)).unique())?.days;
    await writeRun(ctx, row, base, a.mode === "live" ? "sent" : "tested", a.mode, `Emailed ${a.to}: ${a.subject}`, a.now, { to: a.to });
    await logEvent(ctx, row.quoteId, "followup", SYSTEM, a.mode === "live" ? `Follow-up emailed to ${a.to}${days ? ` (${days} days after sending)` : ""}` : `Test follow-up emailed to ${a.to}`, a.now);
    return null;
  },
});

/** The Zoho account id the Communication tab's sync already found, if it has run. */
export const mailAccountId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sync = await ctx.db.query("zohoMailSync").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
    return sync?.accountId ?? "";
  },
});
