import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { calendarSettings } from "./calendarConnect";
import { decryptToken } from "./lib/calendarCrypto";
import {
  fieldsHash, fromZohoEvent, searchWindows, syncsKind, toZohoEvent, whoWins, type ItemKind, type Mirrored, type ZohoEvent,
} from "./lib/calendarSync";
import { ZohoCalError, createEvent, deleteEvent, listEvents, refreshAccess, updateEvent } from "./lib/zohoCalendarApi";

/* The two-way mirror between each connected person's Zoho Calendar and the CRM calendar (D-069).
   CRM to Zoho: `pushItem` runs when an item is made or changed. Zoho to CRM: `pullConnection` runs every 5 minutes, reads the person's
   calendar, and applies what changed. `calendarLinks` joins each CRM item to its Zoho event; the two fingerprints on a link say which side
   changed since the last time they matched, and when both did the later change wins. A change the sync itself makes is never sent back. */

const DAY = 86_400_000;
const BACK = 7 * DAY;
const AHEAD = 90 * DAY;
const MAX_PENDING = 100;

type Kind = "event" | "task";
const LOOKBACK = (now: number) => ({ from: now - BACK, to: now + AHEAD });

/* ---- The CRM item as the fields both calendars hold ---- */

const addressOf = (c: Doc<"clients"> | null) => (c ? [c.street1, [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") : "");

async function mirroredOf(ctx: QueryCtx, kind: Kind, row: Doc<"calendarEvents"> | Doc<"opportunityTasks">): Promise<{ m: Mirrored; link: string | null; people: Id<"users">[]; itemKind: ItemKind } | null> {
  const app = calendarSettings().appUrl;
  if (kind === "event") {
    const e = row as Doc<"calendarEvents">;
    const client = e.clientId ? await ctx.db.get(e.clientId) : null;
    return {
      m: { title: e.title, start: e.start, end: e.end, anytime: e.anytime, notes: e.notes, repeat: e.repeat, repeatUntil: e.repeatUntil, location: e.location ?? addressOf(client) },
      link: e.opportunityId && app ? `${app}/requests/${e.opportunityId}` : null, people: e.assigneeIds, itemKind: e.type,
    };
  }
  const t = row as Doc<"opportunityTasks">;
  if (t.startAt === undefined || t.endAt === undefined) return null;
  const project = t.opportunityId ? await ctx.db.get(t.opportunityId) : null;
  const client = project ? await ctx.db.get(project.clientId) : null;
  return {
    m: { title: t.title, start: t.startAt, end: t.endAt, anytime: false, notes: "", repeat: "none", location: addressOf(client) },
    link: project && app ? `${app}/requests/${project._id}` : null, people: t.assigneeId ? [t.assigneeId] : [], itemKind: "task",
  };
}

/* ---- Tokens ---- */

async function tokenFor(ctx: ActionCtx, c: Doc<"calendarConnections">): Promise<string> {
  if (c.accessToken && (c.accessTokenExpiresAt ?? 0) > Date.now() + 60_000) return c.accessToken;
  const s = calendarSettings();
  try {
    const t = await refreshAccess(c.accountsUrl, { clientId: s.clientId, clientSecret: s.clientSecret, refreshToken: await decryptToken(c.refreshToken, s.key) });
    await ctx.runMutation(internal.crm.calendarSync.saveToken, { connectionId: c._id, accessToken: t.accessToken, expiresAt: t.expiresAt });
    return t.accessToken;
  } catch (e) {
    if (e instanceof ZohoCalError && (e.status === 401 || e.status === 400)) {
      const why = "Zoho no longer accepts this connection. Connect again.";
      await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, status: "needsReconnect", error: why });
      throw new ZohoCalError(why, 401);
    }
    throw e;
  }
}

export const saveToken = internalMutation({
  args: { connectionId: v.id("calendarConnections"), accessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, a) => {
    if (await ctx.db.get(a.connectionId)) await ctx.db.patch(a.connectionId, { accessToken: a.accessToken, accessTokenExpiresAt: a.expiresAt });
    return null;
  },
});

export const markState = internalMutation({
  args: { connectionId: v.id("calendarConnections"), status: v.optional(v.union(v.literal("connected"), v.literal("needsReconnect"))), error: v.optional(v.string()), synced: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.connectionId);
    if (!c) return null;
    await ctx.db.patch(c._id, {
      ...(a.status ? { status: a.status } : {}), ...(a.error !== undefined ? { lastError: a.error.slice(0, 300) } : {}),
      ...(a.synced !== undefined ? { lastSyncAt: a.synced, ...(a.error === undefined ? { lastError: "" } : {}) } : {}),
    });
    return null;
  },
});

const message = (e: unknown) => (e instanceof Error ? e.message : "The sync failed.").replace(/Zoho-oauthtoken\s+\S+/gi, "[removed]").slice(0, 300);

/* ---- CRM to Zoho ---- */

type PushInfo = { mirrored: NonNullable<Awaited<ReturnType<typeof mirroredOf>>> | null; connections: Doc<"calendarConnections">[]; links: Doc<"calendarLinks">[] };

export const pushInfo = internalQuery({
  args: { kind: v.union(v.literal("event"), v.literal("task")), id: v.string() },
  handler: async (ctx, a) => {
    const row = a.kind === "event" ? await ctx.db.get(a.id as Id<"calendarEvents">) : await ctx.db.get(a.id as Id<"opportunityTasks">);
    if (!row) return null;
    const mirrored = await mirroredOf(ctx, a.kind, row);
    const links = a.kind === "event"
      ? await ctx.db.query("calendarLinks").withIndex("by_event", (q) => q.eq("eventId", a.id as Id<"calendarEvents">)).take(50)
      : await ctx.db.query("calendarLinks").withIndex("by_task", (q) => q.eq("taskId", a.id as Id<"opportunityTasks">)).take(50);
    const people = mirrored?.people ?? [];
    const connections: Doc<"calendarConnections">[] = [];
    for (const u of people) {
      const c = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", u)).unique();
      if (c && c.status === "connected") connections.push(c);
    }
    return { mirrored, connections, links };
  },
});

export const recordLink = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"), kind: v.union(v.literal("event"), v.literal("task")), id: v.string(), zohoUid: v.string(), etag: v.string(),
    hash: v.string(), origin: v.union(v.literal("crm"), v.literal("zoho")),
  },
  handler: async (ctx, a) => {
    const conn = await ctx.db.get(a.connectionId);
    if (!conn) return null;
    const existing = await ctx.db.query("calendarLinks").withIndex("by_connection_and_zohoUid", (q) => q.eq("connectionId", a.connectionId).eq("zohoUid", a.zohoUid)).unique();
    const fields = { etag: a.etag, crmHash: a.hash, zohoHash: a.hash };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("calendarLinks", { connectionId: a.connectionId, userId: conn.userId, kind: a.kind, ...(a.kind === "event" ? { eventId: a.id as Id<"calendarEvents"> } : { taskId: a.id as Id<"opportunityTasks"> }), zohoUid: a.zohoUid, origin: a.origin, ...fields });
    return null;
  },
});

export const dropLinks = internalMutation({
  args: { ids: v.array(v.id("calendarLinks")) },
  handler: async (ctx, a) => {
    for (const id of a.ids) if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});

/** Sends one item to every assigned person's Zoho Calendar (making or updating the event), and takes it out of the calendars of people who are no longer on it. */
export const pushItem = internalAction({
  args: { kind: v.union(v.literal("event"), v.literal("task")), id: v.string() },
  handler: async (ctx, a) => {
    const info: PushInfo | null = await ctx.runQuery(internal.crm.calendarSync.pushInfo, a);
    if (!info) return null;
    const { mirrored, connections, links } = info;
    const wanted = new Set<Id<"calendarConnections">>();
    if (mirrored) {
      const hash = fieldsHash(mirrored.m);
      for (const c of connections) {
        wanted.add(c._id);
        const existing = links.find((l) => l.connectionId === c._id);
        if (existing?.lossy) continue;
        if (!existing && !syncsKind(c.syncTypes, mirrored.itemKind)) continue;
        const data = toZohoEvent(mirrored.m, mirrored.link);
        try {
          const token = await tokenFor(ctx, c);
          const ev = existing
            ? await updateEvent(c.apiBase, token, c.calendarUid, existing.zohoUid, existing.etag, data)
            : await createEvent(c.apiBase, token, c.calendarUid, data);
          await ctx.runMutation(internal.crm.calendarSync.recordLink, { connectionId: c._id, kind: a.kind, id: a.id, zohoUid: ev.uid || existing!.zohoUid, etag: ev.etag || existing?.etag || "", hash, origin: existing?.origin ?? "crm" });
        } catch (e) {
          await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, error: message(e) });
        }
      }
    }
    // People who are no longer on the item: delete their Zoho event.
    const stale = links.filter((l) => !wanted.has(l.connectionId));
    for (const l of stale) {
      const c: Doc<"calendarConnections"> | null = await ctx.runQuery(internal.crm.calendarConnect.connectionDoc, { connectionId: l.connectionId });
      if (!c) continue;
      try {
        await deleteEvent(c.apiBase, await tokenFor(ctx, c), c.calendarUid, l.zohoUid, l.etag);
        await ctx.runMutation(internal.crm.calendarSync.dropLinks, { ids: [l._id] });
      } catch (e) {
        await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, error: message(e) });
      }
    }
    return null;
  },
});

/** Deletes Zoho events whose CRM item is gone (the links are already forgotten). */
export const pushDelete = internalAction({
  args: { links: v.array(v.object({ connectionId: v.id("calendarConnections"), zohoUid: v.string(), etag: v.string() })) },
  handler: async (ctx, a) => {
    for (const l of a.links) {
      const c: Doc<"calendarConnections"> | null = await ctx.runQuery(internal.crm.calendarConnect.connectionDoc, { connectionId: l.connectionId });
      if (!c || c.status !== "connected") continue;
      try {
        await deleteEvent(c.apiBase, await tokenFor(ctx, c), c.calendarUid, l.zohoUid, l.etag);
      } catch (e) {
        await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, error: message(e) });
      }
    }
    return null;
  },
});

/* ---- Zoho to CRM ---- */

const zohoEventV = v.object({
  uid: v.string(), etag: v.string(), title: v.optional(v.string()), description: v.optional(v.string()), location: v.optional(v.string()), isallday: v.optional(v.boolean()),
  start: v.optional(v.string()), end: v.optional(v.string()), rrule: v.optional(v.string()), lastmodifiedtime: v.optional(v.string()),
  dateandtime: v.optional(v.object({ timezone: v.optional(v.string()), start: v.optional(v.string()), end: v.optional(v.string()) })),
});

/** Applies what is in one person's Zoho Calendar to the CRM: new events, changed events, deleted events. */
export const applyZoho = internalMutation({
  args: { connectionId: v.id("calendarConnections"), events: v.array(zohoEventV), from: v.number(), to: v.number(), complete: v.boolean(), now: v.number() },
  handler: async (ctx, a) => {
    const conn = await ctx.db.get(a.connectionId);
    if (!conn || conn.status !== "connected") return { created: 0, changed: 0, removed: 0 };
    const seen = new Set<string>();
    let created = 0;
    let changed = 0;
    let removed = 0;
    for (const ev of a.events as ZohoEvent[]) {
      seen.add(ev.uid);
      const f = fromZohoEvent(ev, conn.timezone || undefined);
      if (!f) continue;
      const zh = fieldsHash(f);
      const link = await ctx.db.query("calendarLinks").withIndex("by_connection_and_zohoUid", (q) => q.eq("connectionId", conn._id).eq("zohoUid", ev.uid)).unique();
      if (!link) {
        // The same Zoho event may already be mirrored for someone else it was shared with: join that CRM item instead of making a second.
        const other = (await ctx.db.query("calendarLinks").withIndex("by_zohoUid", (q) => q.eq("zohoUid", ev.uid)).take(5)).find((l) => l.eventId !== undefined);
        const shared = other?.eventId ? await ctx.db.get(other.eventId) : null;
        if (shared) {
          if (!shared.assigneeIds.includes(conn.userId)) await ctx.db.patch(shared._id, { assigneeIds: [...shared.assigneeIds, conn.userId] });
          await ctx.db.insert("calendarLinks", { connectionId: conn._id, userId: conn.userId, kind: "event", eventId: shared._id, zohoUid: ev.uid, etag: ev.etag, crmHash: zh, zohoHash: zh, origin: "zoho", ...(f.lossy ? { lossy: true } : {}) });
          continue;
        }
        const id = await ctx.db.insert("calendarEvents", {
          businessId: conn.businessId, type: "event", title: f.title, start: f.start, end: f.end, anytime: f.anytime, assigneeIds: [conn.userId], status: "upcoming", notes: f.notes,
          repeat: f.repeat, repeatUntil: f.repeatUntil, createdBy: conn.userId, createdAt: a.now, updatedAt: a.now, source: "zoho", location: f.location,
        });
        await ctx.db.insert("calendarLinks", { connectionId: conn._id, userId: conn.userId, kind: "event", eventId: id, zohoUid: ev.uid, etag: ev.etag, crmHash: zh, zohoHash: zh, origin: "zoho", ...(f.lossy ? { lossy: true } : {}) });
        created += 1;
        continue;
      }
      const kind: Kind = link.kind;
      const row = link.eventId ? await ctx.db.get(link.eventId) : link.taskId ? await ctx.db.get(link.taskId) : null;
      if (!row) {
        await ctx.db.delete(link._id);
        continue;
      }
      if (zh === link.zohoHash) {
        if (ev.etag && ev.etag !== link.etag) await ctx.db.patch(link._id, { etag: ev.etag });
        continue;
      }
      const mirrored = await mirroredOf(ctx, kind, row);
      const crmChanged = mirrored ? fieldsHash(mirrored.m) !== link.crmHash : false;
      if (crmChanged && whoWins(row.updatedAt ?? row.createdAt, ev.lastmodifiedtime) === "crm") {
        await ctx.db.patch(link._id, { etag: ev.etag || link.etag });
        continue; // the CRM's later change is sent to Zoho by the next push
      }
      if (kind === "event") {
        const patch = { title: f.title, start: f.start, end: f.end, anytime: f.anytime, notes: f.notes, repeat: f.repeat, repeatUntil: f.repeatUntil, location: f.location, updatedAt: a.now };
        await ctx.db.patch(row._id as Id<"calendarEvents">, patch);
      } else {
        await ctx.db.patch(row._id as Id<"opportunityTasks">, { title: f.title, startAt: f.start, endAt: f.end, updatedAt: a.now });
      }
      const after = await mirroredOf(ctx, kind, (await ctx.db.get(row._id as never)) as Doc<"calendarEvents">);
      await ctx.db.patch(link._id, { etag: ev.etag || link.etag, zohoHash: zh, crmHash: after ? fieldsHash(after.m) : zh });
      changed += 1;
    }
    // Deleted in Zoho: the item is deleted in the CRM too (a task is only taken off the calendar). Only when the whole range was read.
    if (a.complete) {
      for (const link of await ctx.db.query("calendarLinks").withIndex("by_connection", (q) => q.eq("connectionId", conn._id)).take(5000)) {
        if (seen.has(link.zohoUid)) continue;
        if (link.kind === "event" && link.eventId) {
          const e = await ctx.db.get(link.eventId);
          if (!e) { await ctx.db.delete(link._id); continue; }
          if (e.start < a.from || e.start >= a.to) continue;
          if (e.assigneeIds.length > 1) {
            await ctx.db.patch(e._id, { assigneeIds: e.assigneeIds.filter((u) => u !== conn.userId), updatedAt: a.now });
          } else {
            for (const other of await ctx.db.query("calendarLinks").withIndex("by_event", (q) => q.eq("eventId", e._id)).take(50)) {
              if (other._id !== link._id) await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pushDelete, { links: [{ connectionId: other.connectionId, zohoUid: other.zohoUid, etag: other.etag }] });
              if (other._id !== link._id) await ctx.db.delete(other._id);
            }
            await ctx.db.delete(e._id);
          }
          await ctx.db.delete(link._id);
          removed += 1;
        } else if (link.kind === "task" && link.taskId) {
          const t = await ctx.db.get(link.taskId);
          if (t && t.startAt !== undefined && t.startAt >= a.from && t.startAt < a.to) await ctx.db.patch(t._id, { startAt: undefined, endAt: undefined, updatedAt: a.now });
          await ctx.db.delete(link._id);
          removed += 1;
        }
      }
    }
    return { created, changed, removed };
  },
});

/** CRM items for this person that Zoho does not have yet or has an older copy of (a push that failed, or a newly ticked kind). */
export const pending = internalQuery({
  args: { connectionId: v.id("calendarConnections"), from: v.number(), to: v.number() },
  handler: async (ctx, a) => {
    const conn = await ctx.db.get(a.connectionId);
    if (!conn) return [];
    const out: { kind: Kind; id: string }[] = [];
    const linkFor = async (kind: Kind, id: string) => {
      const rows = kind === "event"
        ? await ctx.db.query("calendarLinks").withIndex("by_event", (q) => q.eq("eventId", id as Id<"calendarEvents">)).take(20)
        : await ctx.db.query("calendarLinks").withIndex("by_task", (q) => q.eq("taskId", id as Id<"opportunityTasks">)).take(20);
      return rows.find((l) => l.connectionId === conn._id) ?? null;
    };
    const events = await ctx.db.query("calendarEvents").withIndex("by_business_and_start", (q) => q.eq("businessId", conn.businessId).gte("start", a.from).lt("start", a.to)).take(1000);
    for (const e of events) {
      if (out.length >= MAX_PENDING) break;
      if (!e.assigneeIds.includes(conn.userId)) continue;
      const link = await linkFor("event", e._id);
      if (link?.lossy) continue;
      const m = await mirroredOf(ctx, "event", e);
      if (!m) continue;
      if (!link ? syncsKind(conn.syncTypes, m.itemKind) : fieldsHash(m.m) !== link.crmHash) out.push({ kind: "event", id: e._id });
    }
    const tasks = await ctx.db.query("opportunityTasks").withIndex("by_business", (q) => q.eq("businessId", conn.businessId)).take(2000);
    for (const t of tasks) {
      if (out.length >= MAX_PENDING) break;
      if (t.assigneeId !== conn.userId || t.startAt === undefined || t.startAt < a.from || t.startAt >= a.to) continue;
      const link = await linkFor("task", t._id);
      const m = await mirroredOf(ctx, "task", t);
      if (!m) continue;
      if (!link ? syncsKind(conn.syncTypes, "task") : fieldsHash(m.m) !== link.crmHash) out.push({ kind: "task", id: t._id });
    }
    return out;
  },
});

/** One person's turn: read their Zoho Calendar and apply it, then send whatever the CRM has that Zoho does not. */
export const pullConnection = internalAction({
  args: { connectionId: v.id("calendarConnections") },
  handler: async (ctx, a) => {
    const c: Doc<"calendarConnections"> | null = await ctx.runQuery(internal.crm.calendarConnect.connectionDoc, { connectionId: a.connectionId });
    if (!c || c.status !== "connected") return null;
    const now = Date.now();
    const { from, to } = LOOKBACK(now);
    try {
      let token = await tokenFor(ctx, c);
      const found = new Map<string, ZohoEvent>();
      const complete = true;
      for (const w of searchWindows(from, to, c.timezone || undefined)) {
        let rows: ZohoEvent[];
        try {
          rows = await listEvents(c.apiBase, token, c.calendarUid, w);
        } catch (e) {
          if (e instanceof ZohoCalError && e.status === 401) {
            await ctx.runMutation(internal.crm.calendarSync.saveToken, { connectionId: c._id, accessToken: "", expiresAt: 0 });
            token = await tokenFor(ctx, { ...c, accessToken: undefined, accessTokenExpiresAt: 0 });
            rows = await listEvents(c.apiBase, token, c.calendarUid, w);
          } else {
            throw e;
          }
        }
        for (const r of rows) found.set(r.uid, r);
      }
      await ctx.runMutation(internal.crm.calendarSync.applyZoho, {
        connectionId: c._id, from, to, complete, now,
        events: [...found.values()].map((e) => ({
          uid: e.uid, etag: e.etag, title: e.title, description: e.description, location: e.location, isallday: e.isallday, start: e.start, end: e.end, rrule: e.rrule, lastmodifiedtime: e.lastmodifiedtime,
          ...(e.dateandtime ? { dateandtime: { timezone: e.dateandtime.timezone, start: e.dateandtime.start, end: e.dateandtime.end } } : {}),
        })),
      });
      await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, synced: now });
      const todo: { kind: Kind; id: string }[] = await ctx.runQuery(internal.crm.calendarSync.pending, { connectionId: c._id, from, to });
      for (const p of todo) await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pushItem, p);
    } catch (e) {
      await ctx.runMutation(internal.crm.calendarSync.markState, { connectionId: c._id, error: message(e) });
    }
    return null;
  },
});

export const activeIds = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("calendarConnections").take(500)).filter((c) => c.status === "connected").map((c) => c._id),
});

/** The cron: every connected person, one after another. */
export const pullAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids: Id<"calendarConnections">[] = await ctx.runQuery(internal.crm.calendarSync.activeIds, {});
    for (const [i, connectionId] of ids.entries()) await ctx.scheduler.runAfter(i * 2000, internal.crm.calendarSync.pullConnection, { connectionId });
    await ctx.runMutation(internal.crm.calendarConnect.purgeStates, { now: Date.now() });
    return null;
  },
});
