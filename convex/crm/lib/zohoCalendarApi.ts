import type { ZohoEvent } from "./calendarSync";

/* Zoho Calendar's API (D-069), the few calls the mirror needs. Each takes the connection's `apiBase` (calendar.zoho.com, .eu, .in...) and an
   access token. Written against Zoho's public docs; the request shapes are in the design's "to check" list until tried against a real account. */

export class ZohoCalError extends Error {
  constructor(message: string, readonly status: number, readonly gone = false) {
    super(message);
    this.name = "ZohoCalError";
  }
}

const headers = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json", ...extra });

/** Zoho's ids are long numbers; keep them as text so they survive JSON.parse. */
function parse(text: string): unknown {
  try {
    return JSON.parse(text.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
  } catch {
    throw new ZohoCalError("Zoho Calendar returned something that was not JSON.", 502);
  }
}

async function call(method: string, url: string, token: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  if (!url.startsWith("https://")) throw new ZohoCalError("Refusing a Zoho request that is not https.", 400);
  const res = await fetch(url, { method, headers: headers(token, extra) });
  const text = await res.text();
  const body = text ? (parse(text) as Record<string, unknown>) : {};
  if (res.status === 401) throw new ZohoCalError("Zoho refused the token.", 401);
  if (res.status === 404 || res.status === 410) throw new ZohoCalError("Zoho does not have that event.", res.status, true);
  if (res.status === 429) throw new ZohoCalError("Zoho Calendar is limiting requests.", 429);
  if (res.status >= 400) {
    const why = typeof body.message === "string" ? body.message : `Zoho Calendar error ${res.status}`;
    throw new ZohoCalError(why, res.status);
  }
  return body;
}

const eventsOf = (body: Record<string, unknown>): ZohoEvent[] => (Array.isArray(body.events) ? (body.events as ZohoEvent[]).map((e) => ({ ...e, etag: String(e.etag ?? "") })) : []);

export async function defaultCalendar(apiBase: string, token: string): Promise<{ uid: string; name: string; timezone: string }> {
  const body = await call("GET", `${apiBase}/api/v1/calendars`, token);
  const rows = (Array.isArray(body.calendars) ? body.calendars : []) as { uid?: string; name?: string; timezone?: string; isdefault?: boolean }[];
  const pick = rows.find((c) => c.isdefault) ?? rows[0];
  if (!pick?.uid) throw new ZohoCalError("Zoho did not return a calendar for this account.", 404);
  return { uid: pick.uid, name: pick.name ?? "Calendar", timezone: pick.timezone ?? "" };
}

export async function listEvents(apiBase: string, token: string, calendarUid: string, range: { start: string; end: string }): Promise<ZohoEvent[]> {
  const url = `${apiBase}/api/v1/calendars/${encodeURIComponent(calendarUid)}/events?range=${encodeURIComponent(JSON.stringify(range))}`;
  return eventsOf(await call("GET", url, token, { Accept: "application/json+large" }));
}

export async function createEvent(apiBase: string, token: string, calendarUid: string, data: Record<string, unknown>): Promise<ZohoEvent> {
  const url = `${apiBase}/api/v1/calendars/${encodeURIComponent(calendarUid)}/events?eventdata=${encodeURIComponent(JSON.stringify(data))}`;
  const [event] = eventsOf(await call("POST", url, token));
  if (!event?.uid) throw new ZohoCalError("Zoho did not return the new event.", 502);
  return event;
}

/** Zoho replaces the whole event, and wants the latest etag. */
export async function updateEvent(apiBase: string, token: string, calendarUid: string, uid: string, etag: string, data: Record<string, unknown>): Promise<ZohoEvent> {
  const url = `${apiBase}/api/v1/calendars/${encodeURIComponent(calendarUid)}/events/${encodeURIComponent(uid)}?eventdata=${encodeURIComponent(JSON.stringify({ ...data, uid }))}`;
  const [event] = eventsOf(await call("PUT", url, token, { etag }));
  if (!event) throw new ZohoCalError("Zoho did not return the changed event.", 502);
  return event;
}

export async function deleteEvent(apiBase: string, token: string, calendarUid: string, uid: string, etag: string): Promise<void> {
  const url = `${apiBase}/api/v1/calendars/${encodeURIComponent(calendarUid)}/events/${encodeURIComponent(uid)}`;
  try {
    await call("DELETE", url, token, { etag });
  } catch (e) {
    if (!(e instanceof ZohoCalError && e.gone)) throw e; // already gone is fine
  }
}

/* ---- Signing in (OAuth) ---- */

export const CALENDAR_SCOPES = "ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL";

/** Where Zoho keeps this person's calendar: the accounts server Zoho sent back, with `accounts` swapped for `calendar`. */
export const apiBaseOf = (accountsUrl: string) => accountsUrl.replace("://accounts.", "://calendar.").replace(/\/$/, "");

export async function exchangeCode(accountsUrl: string, p: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  return tokenCall(accountsUrl, new URLSearchParams({ grant_type: "authorization_code", client_id: p.clientId, client_secret: p.clientSecret, code: p.code, redirect_uri: p.redirectUri }));
}

export async function refreshAccess(accountsUrl: string, p: { clientId: string; clientSecret: string; refreshToken: string }) {
  return tokenCall(accountsUrl, new URLSearchParams({ grant_type: "refresh_token", client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken }));
}

async function tokenCall(accountsUrl: string, body: URLSearchParams): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number }> {
  const res = await fetch(`${accountsUrl}/oauth/v2/token`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = (res.headers.get("content-type") ?? "").includes("json") ? ((await res.json()) as Record<string, unknown>) : {};
  if (typeof json.access_token !== "string") {
    const reason = typeof json.error === "string" ? json.error : `no token (${res.status})`;
    throw new ZohoCalError(`Zoho sign-in failed (${reason}).`, reason === "invalid_code" || reason === "invalid_grant" ? 401 : res.status || 400);
  }
  const seconds = Number(json.expires_in_sec ?? json.expires_in ?? 3600);
  return { accessToken: json.access_token, refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined, expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 };
}

export async function revokeToken(accountsUrl: string, refreshToken: string): Promise<void> {
  await fetch(`${accountsUrl}/oauth/v2/token/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => undefined);
}
