import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin, requireBusiness, requireStaff } from "./lib/access";
import { DEFAULT_SYNC_TYPES, SYNC_TYPE_KEYS } from "./lib/calendarSync";
import { decryptToken, encryptToken } from "./lib/calendarCrypto";
import { CALENDAR_SCOPES, ZohoCalError, apiBaseOf, defaultCalendar, exchangeCode, revokeToken } from "./lib/zohoCalendarApi";

/* Connecting a person's Zoho Calendar (D-069): the person clicks Connect, Zoho asks them to Allow, and Zoho sends the browser back to
   /zoho/calendar/callback (calendarHttp.ts), which finishes here. Tokens are stored encrypted and never returned to the browser. */

const STATE_MS = 10 * 60 * 1000;
/** Zoho's own accounts servers, so a made-up "accounts-server" in the address can never make us call somewhere else. */
const ACCOUNTS_URL = /^https:\/\/accounts\.zoho\.(com|eu|in|com\.au|jp|com\.cn|sa|ca)$/;

export const calendarSettings = () => ({
  clientId: env.ZOHO_CAL_CLIENT_ID?.trim() ?? "",
  clientSecret: env.ZOHO_CAL_CLIENT_SECRET?.trim() ?? "",
  key: env.CALENDAR_TOKEN_KEY?.trim() ?? "",
  redirectUri: `${(env.CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/zoho/calendar/callback`,
  appUrl: (env.CRM_APP_URL ?? "").trim().replace(/\/$/, ""),
});

const configured = () => {
  const s = calendarSettings();
  return Boolean(s.clientId && s.clientSecret && s.key && env.CONVEX_SITE_URL);
};

/** What the My calendar screen shows: whether the connection is set up on this deployment, and the caller's own connection (no tokens). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const c = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", staff.userId)).unique();
    return {
      available: configured(),
      connection: c
        ? {
            status: c.status, calendarName: c.calendarName, businessId: c.businessId, syncTypes: c.syncTypes, connectedAt: c.connectedAt,
            lastSyncAt: c.lastSyncAt ?? null, lastError: c.lastError,
          }
        : null,
    };
  },
});

/** Admin: who is connected. Status only. */
export const team = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("calendarConnections").take(500);
    return rows.map((c) => ({ userId: c.userId, status: c.status, lastSyncAt: c.lastSyncAt ?? null }));
  },
});

/** The Connect button: makes a one-use code for this person and returns the Zoho address to send them to. */
export const start = mutation({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireBusiness(ctx, a.businessId).catch(async () => {
      throw new ConvexError("You do not have access to that business.");
    });
    if (!configured()) throw new ConvexError("Zoho Calendar is not set up on this system yet. Ask an Admin.");
    const s = calendarSettings();
    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await ctx.db.insert("calendarOauthStates", { state, userId: staff.userId, businessId: a.businessId, expiresAt: a.now + STATE_MS });
    const url = new URL("https://accounts.zoho.com/oauth/v2/auth");
    url.searchParams.set("scope", CALENDAR_SCOPES);
    url.searchParams.set("client_id", s.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("redirect_uri", s.redirectUri);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  },
});

export const consumeState = internalMutation({
  args: { state: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.query("calendarOauthStates").withIndex("by_state", (q) => q.eq("state", a.state)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return row.expiresAt >= a.now ? { userId: row.userId, businessId: row.businessId } : null;
  },
});

export const save = internalMutation({
  args: {
    userId: v.id("users"), businessId: v.id("businesses"), calendarUid: v.string(), calendarName: v.string(), timezone: v.string(), accountsUrl: v.string(),
    apiBase: v.string(), refreshToken: v.string(), accessToken: v.string(), accessTokenExpiresAt: v.number(), now: v.number(),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", a.userId)).unique();
    const fields = {
      businessId: a.businessId, status: "connected" as const, calendarUid: a.calendarUid, calendarName: a.calendarName, timezone: a.timezone, accountsUrl: a.accountsUrl,
      apiBase: a.apiBase, refreshToken: a.refreshToken, accessToken: a.accessToken, accessTokenExpiresAt: a.accessTokenExpiresAt, lastError: "",
    };
    if (existing) {
      // Reconnecting keeps the person's choices. If they chose a different Zoho calendar, the old links no longer point at anything.
      if (existing.calendarUid !== a.calendarUid) for (const l of await ctx.db.query("calendarLinks").withIndex("by_connection", (q) => q.eq("connectionId", existing._id)).take(2000)) await ctx.db.delete(l._id);
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("calendarConnections", { userId: a.userId, ...fields, syncTypes: DEFAULT_SYNC_TYPES, connectedAt: a.now });
  },
});

/** Finishes a connect: checks the code Zoho sent back, swaps it for tokens, finds the person's calendar and saves it (encrypted). */
export const finish = internalAction({
  args: { code: v.string(), state: v.string(), accountsServer: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ ok: true } | { ok: false; error: string }> => {
    const s = calendarSettings();
    if (!configured()) return { ok: false, error: "not_set_up" };
    const st: { userId: Id<"users">; businessId: Id<"businesses"> } | null = await ctx.runMutation(internal.crm.calendarConnect.consumeState, { state: a.state, now: Date.now() });
    if (!st) return { ok: false, error: "expired" };
    const accountsUrl = (a.accountsServer ?? "https://accounts.zoho.com").replace(/\/$/, "");
    if (!ACCOUNTS_URL.test(accountsUrl)) return { ok: false, error: "bad_server" };
    try {
      const t = await exchangeCode(accountsUrl, { clientId: s.clientId, clientSecret: s.clientSecret, code: a.code, redirectUri: s.redirectUri });
      if (!t.refreshToken) return { ok: false, error: "no_refresh_token" };
      const apiBase = apiBaseOf(accountsUrl);
      const cal = await defaultCalendar(apiBase, t.accessToken);
      const id: Id<"calendarConnections"> = await ctx.runMutation(internal.crm.calendarConnect.save, {
        userId: st.userId, businessId: st.businessId, calendarUid: cal.uid, calendarName: cal.name, timezone: cal.timezone || "America/Los_Angeles", accountsUrl, apiBase,
        refreshToken: await encryptToken(t.refreshToken, s.key), accessToken: t.accessToken, accessTokenExpiresAt: t.expiresAt, now: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pullConnection, { connectionId: id });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof ZohoCalError ? "zoho" : "failed" };
    }
  },
});

/** Which kinds of items this person sends to Zoho (Jobber's tick boxes). */
export const setSyncTypes = mutation({
  args: { tasks: v.boolean(), reminders: v.boolean(), events: v.boolean(), visits: v.boolean(), consultations: v.boolean() },
  handler: async (ctx, a) => {
    const staff = await requireStaff(ctx);
    const c = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", staff.userId)).unique();
    if (!c) throw new ConvexError("Connect your Zoho Calendar first.");
    const next = Object.fromEntries(SYNC_TYPE_KEYS.map((k) => [k, a[k]])) as typeof c.syncTypes;
    await ctx.db.patch(c._id, { syncTypes: next });
    // Newly ticked kinds are sent on the next check.
    await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pullConnection, { connectionId: c._id });
    return null;
  },
});

export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const c = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", staff.userId)).unique();
    if (!c) throw new ConvexError("Connect your Zoho Calendar first.");
    await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pullConnection, { connectionId: c._id });
    return null;
  },
});

/** Disconnect: stops the sync and forgets the tokens. Nothing is deleted from either calendar (D-069). */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const c = await ctx.db.query("calendarConnections").withIndex("by_userId", (q) => q.eq("userId", staff.userId)).unique();
    if (!c) return null;
    for (const l of await ctx.db.query("calendarLinks").withIndex("by_connection", (q) => q.eq("connectionId", c._id)).take(5000)) await ctx.db.delete(l._id);
    await ctx.db.delete(c._id);
    await ctx.scheduler.runAfter(0, internal.crm.calendarConnect.revoke, { accountsUrl: c.accountsUrl, refreshToken: c.refreshToken });
    return null;
  },
});

export const revoke = internalAction({
  args: { accountsUrl: v.string(), refreshToken: v.string() },
  handler: async (_ctx, a) => {
    try {
      await revokeToken(a.accountsUrl, await decryptToken(a.refreshToken, calendarSettings().key));
    } catch {
      // The tokens are already forgotten here; Zoho will let them lapse.
    }
    return null;
  },
});

/** The pending states that have run out, cleaned by the cron. */
export const purgeStates = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, a) => {
    for (const r of await ctx.db.query("calendarOauthStates").take(200)) if (r.expiresAt < a.now) await ctx.db.delete(r._id);
    return null;
  },
});

export const connectionDoc = internalQuery({
  args: { connectionId: v.id("calendarConnections") },
  handler: async (ctx, a) => await ctx.db.get(a.connectionId),
});
