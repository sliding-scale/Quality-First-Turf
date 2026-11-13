/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { decryptToken, encryptToken } from "../../convex/crm/lib/calendarCrypto";
import {
  fieldsHash, fromZohoEvent, notesFromZoho, parseZohoTime, repeatToRrule, rruleToRepeat, searchWindows, toZohoEvent, whoWins, zohoDay, zohoUtc,
} from "../../convex/crm/lib/calendarSync";
import { seeded } from "./pipelineSeed";

const KEY = Buffer.alloc(32, 7).toString("base64");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("calendar rules", () => {
  it("writes and reads Zoho's times", () => {
    const ms = Date.UTC(2026, 10, 12, 18, 30, 0);
    expect(zohoUtc(ms)).toBe("20261112T183000Z");
    expect(parseZohoTime("20261112T183000Z")).toBe(ms);
    expect(parseZohoTime("20261112T103000-0800")).toBe(ms);
    expect(parseZohoTime("20261112T123000+0200")).toBe(Date.UTC(2026, 10, 12, 10, 30, 0));
    expect(zohoDay(ms, "America/Los_Angeles")).toBe("20261112");
    expect(parseZohoTime("20261112", "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 12, 8, 0, 0)); // local midnight, PST
    expect(parseZohoTime("nonsense")).toBeNull();
  });

  it("turns the CRM's four repeats into Zoho rules and back, and says when it cannot", () => {
    expect(repeatToRrule("none")).toBeUndefined();
    expect(rruleToRepeat(repeatToRrule("daily"))).toMatchObject({ repeat: "daily", lossy: false });
    expect(rruleToRepeat(repeatToRrule("weekdays"))).toMatchObject({ repeat: "weekdays", lossy: false });
    expect(rruleToRepeat(repeatToRrule("weekly"))).toMatchObject({ repeat: "weekly", lossy: false });
    expect(rruleToRepeat(repeatToRrule("monthly", Date.UTC(2027, 0, 1)))).toMatchObject({ repeat: "monthly", until: Date.UTC(2027, 0, 1), lossy: false });
    expect(rruleToRepeat("FREQ=WEEKLY;INTERVAL=2")).toEqual({ repeat: "none", lossy: true });
    expect(rruleToRepeat("FREQ=DAILY;COUNT=5")).toEqual({ repeat: "none", lossy: true });
    expect(rruleToRepeat("FREQ=WEEKLY;BYDAY=MO,WE")).toEqual({ repeat: "none", lossy: true });
  });

  it("round trips an item, keeps the link line out of the notes, and notices a change", () => {
    const m = { title: "Site walk", start: Date.UTC(2026, 10, 13, 17, 0), end: Date.UTC(2026, 10, 13, 18, 0), anytime: false, notes: "Bring the gate code", repeat: "weekly" as const, location: "1 Test St" };
    const data = toZohoEvent(m, "https://crm.test/requests/abc");
    expect(String(data.description)).toContain("https://crm.test/requests/abc");
    const back = fromZohoEvent({ uid: "u", etag: "1", title: data.title as string, description: data.description as string, location: data.location as string, isallday: false, dateandtime: data.dateandtime as never, rrule: data.rrule as string })!;
    expect(back).toMatchObject({ title: "Site walk", start: m.start, end: m.end, notes: "Bring the gate code", repeat: "weekly", location: "1 Test St", lossy: false });
    expect(fieldsHash(back)).toBe(fieldsHash(m));
    expect(fieldsHash({ ...m, title: "Site walk 2" })).not.toBe(fieldsHash(m));
    expect(notesFromZoho("plain notes")).toBe("plain notes");
  });

  it("lets the later change win, and keeps search windows under Zoho's 31 days", () => {
    expect(whoWins(1000, "20261112T000000Z")).toBe("zoho");
    expect(whoWins(Date.UTC(2026, 10, 13), "20261112T000000Z")).toBe("crm");
    expect(whoWins(5, undefined)).toBe("crm");
    const w = searchWindows(Date.UTC(2026, 10, 1, 12), Date.UTC(2027, 1, 1));
    expect(w.length).toBeGreaterThan(2);
    expect(w[0].start).toBe("20261101");
  });

  it("encrypts a token so the stored text is not the token, and only the key reads it", async () => {
    const stored = await encryptToken("refresh-token-123", KEY);
    expect(stored).not.toContain("refresh-token-123");
    expect(await decryptToken(stored, KEY)).toBe("refresh-token-123");
    await expect(decryptToken(stored, Buffer.alloc(32, 9).toString("base64"))).rejects.toThrow();
  });
});

/* ---- A pretend Zoho: the sign-in server and one Calendar ---- */

type FakeEvent = Record<string, unknown> & { uid: string; etag: string };
function fakeZoho() {
  const z = { events: new Map<string, FakeEvent>(), calls: [] as string[], failRefresh: false, seq: 0, revoked: 0 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const stamp = () => zohoUtc(Date.now());
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    z.calls.push(`${method} ${url.pathname}`);
    if (url.pathname === "/oauth/v2/token/revoke") { z.revoked += 1; return json({ status: "success" }); }
    if (url.pathname === "/oauth/v2/token") {
      const grant = String((init?.body as URLSearchParams).get("grant_type"));
      if (grant === "refresh_token" && z.failRefresh) return json({ error: "invalid_grant" }, 400);
      return json({ access_token: `AT${++z.seq}`, ...(grant === "authorization_code" ? { refresh_token: "RT-secret" } : {}), expires_in_sec: 3600 });
    }
    if (url.pathname === "/api/v1/calendars") return json({ calendars: [{ uid: "cal1", name: "Sam's Calendar", isdefault: true, timezone: "America/Los_Angeles" }] });
    const m = /^\/api\/v1\/calendars\/cal1\/events(?:\/(.+))?$/.exec(url.pathname);
    if (!m) return json({ message: "not found" }, 404);
    const headers = new Headers(init?.headers);
    if (method === "GET") return json({ events: [...z.events.values()] });
    const data = JSON.parse(url.searchParams.get("eventdata") ?? "{}") as Record<string, unknown>;
    if (method === "POST") {
      const uid = `ev${++z.seq}@zoho.com`;
      const e: FakeEvent = { ...data, uid, etag: String(1000 + z.seq), lastmodifiedtime: stamp() };
      z.events.set(uid, e);
      return json({ events: [{ uid, etag: e.etag, estatus: "added" }] });
    }
    const uid = decodeURIComponent(m[1] ?? "");
    const cur = z.events.get(uid);
    if (!cur) return json({ message: "gone" }, 404);
    if (headers.get("etag") !== cur.etag) return json({ message: "etag mismatch" }, 400);
    if (method === "DELETE") { z.events.delete(uid); return json({ events: [{ uid, estatus: "deleted" }] }); }
    const e: FakeEvent = { ...data, uid, etag: String(1000 + ++z.seq), lastmodifiedtime: stamp() };
    z.events.set(uid, e);
    return json({ events: [{ uid, etag: e.etag }] });
  };
  /** Someone edits or adds an event in Zoho itself. */
  const put = (uid: string, e: Record<string, unknown>) => z.events.set(uid, { ...(z.events.get(uid) ?? {}), ...e, uid, etag: String(1000 + ++z.seq), lastmodifiedtime: stamp() } as FakeEvent);
  const timed = (title: string, start: number, end: number, extra: Record<string, unknown> = {}) => ({ title, isallday: false, dateandtime: { timezone: "America/Los_Angeles", start: zohoUtc(start), end: zohoUtc(end) }, description: "", location: "", ...extra });
  return { z, impl, put, timed };
}

async function world() {
  const w = await seeded();
  const zoho = fakeZoho();
  vi.stubGlobal("fetch", zoho.impl);
  const user = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.email === "sales-1@example.com")!;
  const start = await w.sales.mutation(api.crm.calendarConnect.start, { businessId: w.qft, now: Date.now() });
  const state = new URL(start.url).searchParams.get("state")!;
  const done = await w.base.action(internal.crm.calendarConnect.finish, { code: "the-code", state, accountsServer: "https://accounts.zoho.com" });
  const conn = (await w.base.run((ctx) => ctx.db.query("calendarConnections").collect()))[0];
  return { ...w, zoho, user, start, done, conn };
}
type World = Awaited<ReturnType<typeof world>>;

const pull = (w: World) => w.base.action(internal.crm.calendarSync.pullConnection, { connectionId: w.conn._id });
const push = (w: World, kind: "event" | "task", id: string) => w.base.action(internal.crm.calendarSync.pushItem, { kind, id });
const eventsOf = (w: World) => w.base.run((ctx) => ctx.db.query("calendarEvents").collect());
const linksOf = (w: World) => w.base.run((ctx) => ctx.db.query("calendarLinks").collect());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
  process.env.ZOHO_CAL_CLIENT_ID = "cal-client";
  process.env.ZOHO_CAL_CLIENT_SECRET = "cal-secret";
  process.env.CALENDAR_TOKEN_KEY = KEY;
  process.env.CONVEX_SITE_URL = "https://site.convex.test";
  process.env.CRM_APP_URL = "https://crm.test";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connecting", () => {
  it("makes a one-use code, finishes the connection, stores the token encrypted, and shows nobody a token", async () => {
    const w = await world();
    expect(w.start.url).toContain("accounts.zoho.com/oauth/v2/auth");
    expect(w.start.url).toContain("ZohoCalendar.event.ALL");
    expect(w.start.url).toContain(encodeURIComponent("https://site.convex.test/zoho/calendar/callback"));
    expect(w.done).toEqual({ ok: true });
    expect(w.conn).toMatchObject({ status: "connected", calendarUid: "cal1", calendarName: "Sam's Calendar", userId: w.user._id });
    expect(w.conn.refreshToken).not.toContain("RT-secret");
    expect(await decryptToken(w.conn.refreshToken, KEY)).toBe("RT-secret");
    const mine = await w.sales.query(api.crm.calendarConnect.mine, {});
    expect(mine.connection).toMatchObject({ status: "connected", calendarName: "Sam's Calendar" });
    expect(JSON.stringify(mine)).not.toContain("RT-secret");
    expect((await w.pm.query(api.crm.calendarConnect.mine, {})).connection).toBeNull(); // nobody else's
    const again = await w.base.action(internal.crm.calendarConnect.finish, { code: "x", state: new URL(w.start.url).searchParams.get("state")!, accountsServer: "https://accounts.zoho.com" });
    expect(again).toEqual({ ok: false, error: "expired" }); // the code is one use
  });

  it("refuses an accounts server that is not Zoho's", async () => {
    const w = await seeded();
    vi.stubGlobal("fetch", fakeZoho().impl);
    const s = await w.sales.mutation(api.crm.calendarConnect.start, { businessId: w.qft, now: Date.now() });
    const r = await w.base.action(internal.crm.calendarConnect.finish, { code: "c", state: new URL(s.url).searchParams.get("state")!, accountsServer: "https://evil.example.com" });
    expect(r).toEqual({ ok: false, error: "bad_server" });
  });
});

describe("Zoho to the CRM", () => {
  it("brings an event made in Zoho into the CRM calendar with its title, time and notes, once", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist", at, at + HOUR, { description: "Cleaning", location: "Temecula" }));
    await pull(w);
    await pull(w);
    const ev = (await eventsOf(w)).filter((e) => e.source === "zoho");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ title: "Dentist", start: at - (at % 1000), notes: "Cleaning", location: "Temecula", type: "event", assigneeIds: [w.user._id] });
    expect(await linksOf(w)).toHaveLength(1);
    const range = await w.sales.query(api.crm.schedule.range, { businessId: w.qft, from: at - DAY, to: at + DAY, types: [], assigneeIds: [], statuses: [], now: Date.now() });
    expect(range.items.find((i) => i.title === "Dentist")?.zoho).toBe(true);
  });

  it("follows a change made in Zoho, and a delete made in Zoho", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist", at, at + HOUR));
    await pull(w);
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist (moved)", at + HOUR, at + 2 * HOUR, { description: "Second floor" }));
    await pull(w);
    const [e] = (await eventsOf(w)).filter((x) => x.source === "zoho");
    expect(e).toMatchObject({ title: "Dentist (moved)", notes: "Second floor" });
    expect(e.start).toBeGreaterThan(at);
    w.zoho.z.events.delete("zev1@zoho.com");
    await pull(w);
    expect((await eventsOf(w)).filter((x) => x.source === "zoho")).toHaveLength(0);
    expect(await linksOf(w)).toHaveLength(0);
  });

  it("does not block a booking over a Zoho event, and marks it as outside busy time", async () => {
    const w = await world();
    const at = Date.now() + 3 * DAY;
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist", at, at + HOUR));
    await pull(w);
    const id = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "consultation", title: "Site visit", start: at, end: at + HOUR, assigneeIds: [w.user._id], now: Date.now() });
    expect(id).toBeTruthy();
    const avail = await w.sales.query(api.crm.schedule.availability, { businessId: w.qft, userIds: [w.user._id], from: at - HOUR, to: at + 2 * HOUR });
    expect(avail.busy.some((b) => b.title === "Dentist" && b.external)).toBe(true);
    // two CRM items for the same person still refuse each other
    await expect(w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "visit", title: "Again", start: at, end: at + HOUR, assigneeIds: [w.user._id], now: Date.now() })).rejects.toThrow(/busy/);
  });

  it("joins a Zoho event two connected people share into one CRM item", async () => {
    const w = await world();
    const other = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.email === "pm-1@example.com")!;
    await w.base.run(async (ctx) => {
      await ctx.db.insert("calendarConnections", {
        userId: other._id, businessId: w.qft, status: "connected", calendarUid: "cal1", calendarName: "PM", timezone: "America/Los_Angeles", accountsUrl: "https://accounts.zoho.com",
        apiBase: "https://calendar.zoho.com", syncTypes: { tasks: true, reminders: true, events: true, visits: true, consultations: true }, refreshToken: await encryptToken("RT-2", KEY),
        connectedAt: 1, lastError: "",
      });
    });
    const second = (await w.base.run((ctx) => ctx.db.query("calendarConnections").collect())).find((c) => c.userId === other._id)!;
    const at = Date.now() + 2 * DAY;
    w.zoho.put("shared@zoho.com", w.zoho.timed("Team lunch", at, at + HOUR));
    await pull(w);
    await w.base.action(internal.crm.calendarSync.pullConnection, { connectionId: second._id });
    const rows = (await eventsOf(w)).filter((e) => e.title === "Team lunch");
    expect(rows).toHaveLength(1);
    expect([...rows[0].assigneeIds].sort()).toEqual([w.user._id, other._id].sort());
  });
});

describe("the CRM to Zoho", () => {
  it("sends a booked item to the person's Zoho Calendar with the client's address, then follows an edit and a delete", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    const id = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "consultation", title: "Putting green consult", start: at, end: at + HOUR, assigneeIds: [w.user._id], notes: "Gate code 1234", opportunityId: w.project, now: Date.now() });
    await push(w, "event", id);
    expect(w.zoho.z.events.size).toBe(1);
    const sent = [...w.zoho.z.events.values()][0];
    expect(sent.title).toBe("Putting green consult");
    expect(String(sent.description)).toContain("Gate code 1234");
    expect(String(sent.description)).toContain(`https://crm.test/requests/${w.project}`);
    expect(String(sent.location)).not.toBe("");
    // pulling right after changes nothing: our own event is not brought back in as a second item
    await pull(w);
    expect((await eventsOf(w)).filter((e) => e.title === "Putting green consult")).toHaveLength(1);
    expect(w.zoho.z.events.size).toBe(1);
    await w.sales.mutation(api.crm.schedule.update, { id, title: "Putting green consult (new time)", start: at + HOUR, end: at + 2 * HOUR, now: Date.now() });
    await push(w, "event", id);
    expect([...w.zoho.z.events.values()][0].title).toBe("Putting green consult (new time)");
    expect(w.zoho.z.events.size).toBe(1);
    await w.sales.mutation(api.crm.schedule.remove, { id });
    // the delete was queued while timers are held: run it
    const links = await linksOf(w);
    expect(links).toHaveLength(0);
    await w.base.action(internal.crm.calendarSync.pushDelete, { links: [{ connectionId: w.conn._id, zohoUid: [...w.zoho.z.events.keys()][0], etag: String([...w.zoho.z.events.values()][0].etag) }] });
    expect(w.zoho.z.events.size).toBe(0);
  });

  it("when both sides changed, the later change wins", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    const id = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "event", title: "Original", start: at, end: at + HOUR, assigneeIds: [w.user._id], now: Date.now() });
    await push(w, "event", id);
    const uid = [...w.zoho.z.events.keys()][0];
    // the CRM changes it, then Zoho changes it later
    await w.base.run((ctx) => ctx.db.patch(id, { title: "CRM edit", updatedAt: Date.now() - 5 * HOUR }));
    w.zoho.put(uid, w.zoho.timed("Zoho edit", at, at + HOUR));
    await pull(w);
    expect((await w.base.run((ctx) => ctx.db.get(id)))?.title).toBe("Zoho edit");
    // the other way round: Zoho's change is older than the CRM's
    await w.base.run((ctx) => ctx.db.patch(id, { title: "CRM wins", updatedAt: Date.now() + 5 * HOUR }));
    w.zoho.put(uid, w.zoho.timed("Zoho again", at, at + HOUR));
    await pull(w);
    expect((await w.base.run((ctx) => ctx.db.get(id)))?.title).toBe("CRM wins");
    const pendingNow = await w.base.query(internal.crm.calendarSync.pending, { connectionId: w.conn._id, from: Date.now() - DAY, to: Date.now() + 10 * DAY });
    expect(pendingNow.map((p) => p.id)).toContain(id); // and is sent to Zoho next
  });

  it("sends a scheduled task, and a delete in Zoho takes the task off the calendar but keeps the task", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    const taskId = await w.base.run((ctx) => ctx.db.insert("opportunityTasks", { businessId: w.qft, opportunityId: w.project, title: "Order sod", assigneeId: w.user._id, done: false, createdAt: Date.now(), startAt: at, endAt: at + HOUR }));
    await push(w, "task", taskId);
    expect([...w.zoho.z.events.values()].map((e) => e.title)).toEqual(["Order sod"]);
    w.zoho.z.events.clear();
    await pull(w);
    const t = await w.base.run((ctx) => ctx.db.get(taskId));
    expect(t?.title).toBe("Order sod");
    expect(t?.startAt).toBeUndefined();
  });

  it("only sends the kinds the person ticked", async () => {
    const w = await world();
    await w.sales.mutation(api.crm.calendarConnect.setSyncTypes, { tasks: true, reminders: true, events: true, visits: true, consultations: false });
    const at = Date.now() + 2 * DAY;
    const consult = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "consultation", title: "Consult", start: at, end: at + HOUR, assigneeIds: [w.user._id], now: Date.now() });
    const visit = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "visit", title: "Visit", start: at + 2 * HOUR, end: at + 3 * HOUR, assigneeIds: [w.user._id], now: Date.now() });
    await push(w, "event", consult);
    await push(w, "event", visit);
    expect([...w.zoho.z.events.values()].map((e) => e.title)).toEqual(["Visit"]);
  });
});

describe("disconnecting and breaking", () => {
  it("disconnect forgets the connection and links and deletes nothing on either side", async () => {
    const w = await world();
    const at = Date.now() + 2 * DAY;
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist", at, at + HOUR));
    await pull(w);
    await w.sales.mutation(api.crm.calendarConnect.disconnect, {});
    expect(await w.base.run((ctx) => ctx.db.query("calendarConnections").collect())).toHaveLength(0);
    expect(await linksOf(w)).toHaveLength(0);
    expect((await eventsOf(w)).filter((e) => e.title === "Dentist")).toHaveLength(1);
    expect(w.zoho.z.events.size).toBe(1);
    expect((await w.sales.query(api.crm.calendarConnect.mine, {})).connection).toBeNull();
  });

  it("a connection Zoho no longer accepts is marked as needing to be reconnected, and does not touch the calendars", async () => {
    const w = await world();
    w.zoho.z.failRefresh = true;
    await w.base.run((ctx) => ctx.db.patch(w.conn._id, { accessToken: undefined, accessTokenExpiresAt: 0 }));
    const at = Date.now() + 2 * DAY;
    w.zoho.put("zev1@zoho.com", w.zoho.timed("Dentist", at, at + HOUR));
    await pull(w);
    const c = await w.base.run((ctx) => ctx.db.get(w.conn._id));
    expect(c?.status).toBe("needsReconnect");
    expect(c?.lastError).toMatch(/Connect again/);
    expect((await eventsOf(w)).filter((e) => e.title === "Dentist")).toHaveLength(0);
    expect((await w.sales.query(api.crm.calendarConnect.mine, {})).connection?.status).toBe("needsReconnect");
  });

  it("does nothing when nobody has connected", async () => {
    const w = await seeded();
    vi.stubGlobal("fetch", fakeZoho().impl);
    const at = Date.now() + 2 * DAY;
    const sam = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.email === "sales-1@example.com")!;
    const id = await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "event", title: "Lonely", start: at, end: at + HOUR, assigneeIds: [sam._id as Id<"users">], now: Date.now() });
    expect(id).toBeTruthy();
    expect(await w.base.run((ctx) => ctx.db.query("calendarLinks").collect())).toHaveLength(0);
  });
});
