import { ConvexError, v } from "convex/values";
import { env, action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  OFFICE_MAILBOX,
  ZohoAuthError,
  ZohoError,
  ZohoRateLimitError,
  fieldSearchKey,
  parseZohoJson,
  pickFolder,
  readAccounts,
  readContent,
  readFolders,
  readListedMessages,
  unwrapZoho,
  type SearchField,
} from "./lib/zohoMail";

/* Pulls mail from Zoho into the CRM (D-064). GET requests only. The refresh token lives in the Convex environment and is
   exchanged for a short-lived access token. Marking read, sending, replying, deleting and archiving are separate Zoho
   URLs and are never called. Zoho allows about 30 API calls a minute, so each run stays small and continues itself
   while history or message bodies are still outstanding. */

const BACKFILL_LIMIT = 200;
const NEW_LIMIT = 25;
const SEARCH_LIMIT = 200;
const CONTINUE_MS = 30_000;
const RATE_LIMIT_MS = 60_000;

type Batch = {
  mailbox: string;
  accountId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  inboxFolderId: string;
  sentFolderId: string;
  inboxCursor: number;
  sentCursor: number;
  inboxDone: boolean;
  sentDone: boolean;
  searches: { address: string; field: SearchField; nextStart: number }[];
  moreSearches: boolean;
  pending: { id: Id<"clientMailMessages">; accountId: string; folderId: string; messageId: string }[];
  contentBacklog: boolean;
};

type Settings = {
  configured: boolean;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountsUrl: string;
  mailApiUrl: string;
  mailbox: string;
};

export const syncBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    await runBatch(ctx, false);
    return null;
  },
});

/** An Admin can run one batch immediately after the Zoho keys are set. Still read-only. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.crm.clientMail.assertAdmin, {});
    await runBatch(ctx, true);
    return null;
  },
});

/** Loads the body of one message when a person opens it, if the sync has not stored it yet. */
export const loadContent = action({
  args: { messageId: v.id("clientMailMessages") },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.crm.clientMail.getForContent, { messageId: args.messageId });
    if (!row) return null;
    const settings = zohoSettings();
    if (!settings.configured) throw new ConvexError("Zoho Mail isn't connected yet.");
    try {
      let token = await tokenForRead(ctx, settings);
      let data: unknown;
      try {
        data = await zohoGet(contentUrl(settings.mailApiUrl, row.accountId, row.folderId, row.zohoMessageId), token);
      } catch (err) {
        if (!(err instanceof ZohoAuthError)) throw err;
        token = await refresh(ctx, settings);
        data = await zohoGet(contentUrl(settings.mailApiUrl, row.accountId, row.folderId, row.zohoMessageId), token);
      }
      await ctx.runMutation(internal.crm.clientMail.saveContent, { messageId: args.messageId, html: readContent(data), unavailable: false });
    } catch (err) {
      if (err instanceof ZohoError && (err.status === 404 || err.status === 400)) {
        await ctx.runMutation(internal.crm.clientMail.saveContent, { messageId: args.messageId, html: "", unavailable: true });
        return null;
      }
      throw new ConvexError(safeMessage(err));
    }
    return null;
  },
});

async function runBatch(ctx: ActionCtx, manual: boolean) {
  const settings = zohoSettings();
  if (!settings.configured) {
    if (manual) {
      throw new ConvexError("Zoho Mail isn't connected yet. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN on the Convex deployment.");
    }
    return;
  }
  const prepared: Batch | null = await ctx.runMutation(internal.crm.clientMail.prepareBatch, { now: Date.now() });
  if (!prepared) {
    if (manual) throw new ConvexError("A sync is already running.");
    return;
  }
  let more = !prepared.inboxDone || !prepared.sentDone || prepared.moreSearches || prepared.contentBacklog || prepared.searches.length > 0 || prepared.pending.length > 0;
  try {
    const state = await connect(ctx, prepared, settings);
    const inserted = await syncFolders(ctx, state, settings);
    const searchMore = await syncSearches(ctx, state, settings);
    await syncContent(ctx, state, settings, prepared.pending);
    if (inserted > 0 || searchMore) more = true;
    await ctx.runMutation(internal.crm.clientMail.finishBatch, { ok: true, lastError: "" });
    if (more) await ctx.scheduler.runAfter(CONTINUE_MS, internal.crm.zohoMailSync.syncBatch, {});
  } catch (err) {
    await ctx.runMutation(internal.crm.clientMail.finishBatch, { ok: false, lastError: safeMessage(err) });
    if (err instanceof ZohoRateLimitError) await ctx.scheduler.runAfter(RATE_LIMIT_MS, internal.crm.zohoMailSync.syncBatch, {});
    if (manual) throw new ConvexError(safeMessage(err));
  }
}

async function connect(ctx: ActionCtx, state: Batch, settings: Settings): Promise<Batch> {
  const next = await ensureToken(ctx, state, settings);
  if (next.accountId && next.inboxFolderId && next.sentFolderId) return next;
  const accounts = readAccounts(await zohoGetAuthed(ctx, next, settings, `${settings.mailApiUrl}/api/accounts`));
  const account = accounts.find((row) => row.email === next.mailbox);
  if (!account) {
    const found = accounts.map((row) => row.email).join(", ") || "none";
    throw new ZohoError(`Zoho did not return ${next.mailbox}. Accounts on this token: ${found}.`, 404);
  }
  const folders = readFolders(await zohoGetAuthed(ctx, next, settings, `${settings.mailApiUrl}/api/accounts/${encodeURIComponent(account.accountId)}/folders`));
  const inboxFolderId = pickFolder(folders, "/Inbox");
  const sentFolderId = pickFolder(folders, "/Sent");
  if (!inboxFolderId || !sentFolderId) throw new ZohoError(`Zoho did not return Inbox and Sent for ${next.mailbox}.`, 404);
  await ctx.runMutation(internal.crm.clientMail.saveConnection, { accountId: account.accountId, inboxFolderId, sentFolderId });
  return { ...next, accountId: account.accountId, inboxFolderId, sentFolderId };
}

async function syncFolders(ctx: ActionCtx, state: Batch, settings: Settings): Promise<number> {
  // Inbox and Sent move together. A long Inbox history must not hide mail that was sent yesterday.
  const inbox = await pullFolderPair(ctx, state, settings, "inbox", state.inboxFolderId, state.inboxCursor, state.inboxDone);
  const sent = await pullFolderPair(ctx, state, settings, "sent", state.sentFolderId, state.sentCursor, state.sentDone);
  return inbox + sent;
}

async function pullFolderPair(
  ctx: ActionCtx,
  state: Batch,
  settings: Settings,
  folder: "inbox" | "sent",
  folderId: string,
  cursor: number,
  done: boolean,
): Promise<number> {
  if (done) return await pullFolder(ctx, state, settings, folder, folderId, 1, NEW_LIMIT, false);
  let inserted = 0;
  if (cursor > 1) inserted += await pullFolder(ctx, state, settings, folder, folderId, 1, NEW_LIMIT, false);
  inserted += await pullFolder(ctx, state, settings, folder, folderId, cursor, BACKFILL_LIMIT, true);
  return inserted;
}

async function pullFolder(
  ctx: ActionCtx,
  state: Batch,
  settings: Settings,
  folder: "inbox" | "sent",
  folderId: string,
  start: number,
  limit: number,
  advance: boolean,
): Promise<number> {
  const url = mailUrl(settings.mailApiUrl, `/api/accounts/${encodeURIComponent(state.accountId)}/messages/view`, {
    folderId,
    start: String(start),
    limit: String(limit),
    includeto: "true",
    sortBy: "date",
    sortorder: "false",
  });
  const { messages, total } = readListedMessages(await zohoGetAuthed(ctx, state, settings, url), folderId);
  const saved: { inserted: number } = await ctx.runMutation(internal.crm.clientMail.saveListed, {
    mailbox: state.mailbox,
    accountId: state.accountId,
    messages,
  });
  if (advance) {
    const done = total < limit;
    await ctx.runMutation(internal.crm.clientMail.noteFolderPage, { folder, nextCursor: start + total, done });
    if (folder === "inbox") {
      state.inboxCursor = start + total;
      state.inboxDone = done;
    } else {
      state.sentCursor = start + total;
      state.sentDone = done;
    }
  }
  return saved.inserted;
}

async function syncSearches(ctx: ActionCtx, state: Batch, settings: Settings): Promise<boolean> {
  let more = false;
  for (const search of state.searches) {
    const url = mailUrl(settings.mailApiUrl, `/api/accounts/${encodeURIComponent(state.accountId)}/messages/search`, {
      searchKey: fieldSearchKey(search.field, search.address),
      start: String(search.nextStart),
      limit: String(SEARCH_LIMIT),
      includeto: "true",
      receivedTime: String(Date.now()),
    });
    const { messages, total } = readListedMessages(await zohoGetAuthed(ctx, state, settings, url), "");
    await ctx.runMutation(internal.crm.clientMail.saveListed, {
      mailbox: state.mailbox,
      accountId: state.accountId,
      matchedAddress: search.address,
      messages,
    });
    const pageDone = total < SEARCH_LIMIT;
    await ctx.runMutation(internal.crm.clientMail.noteSearchPage, {
      address: search.address,
      field: search.field,
      nextStart: search.nextStart + total,
      pageDone,
    });
    if (!pageDone || search.field !== "cc") more = true;
  }
  return more;
}

async function syncContent(ctx: ActionCtx, state: Batch, settings: Settings, pending: Batch["pending"]) {
  for (const row of pending) {
    try {
      const data = await zohoGetAuthed(ctx, state, settings, contentUrl(settings.mailApiUrl, row.accountId, row.folderId, row.messageId));
      await ctx.runMutation(internal.crm.clientMail.saveContent, { messageId: row.id, html: readContent(data), unavailable: false });
    } catch (err) {
      if (err instanceof ZohoRateLimitError || err instanceof ZohoAuthError) throw err;
      if (err instanceof ZohoError && (err.status === 404 || err.status === 400)) {
        await ctx.runMutation(internal.crm.clientMail.saveContent, { messageId: row.id, html: "", unavailable: true });
        continue;
      }
      await ctx.runMutation(internal.crm.clientMail.noteContentFailure, { messageId: row.id });
    }
  }
}

async function tokenForRead(ctx: ActionCtx, settings: Settings): Promise<string> {
  const current = await ctx.runQuery(internal.crm.clientMail.connection, {});
  if (current.accessToken && current.accessTokenExpiresAt > Date.now() + 120_000) return current.accessToken;
  const refreshed = await refresh(ctx, settings);
  return refreshed;
}

async function ensureToken(ctx: ActionCtx, state: Batch, settings: Settings): Promise<Batch> {
  if (state.accessToken && state.accessTokenExpiresAt > Date.now() + 120_000) return state;
  const accessToken = await refresh(ctx, settings);
  return { ...state, accessToken, accessTokenExpiresAt: Date.now() + 3_000_000 };
}

async function refresh(ctx: ActionCtx, settings: Settings): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: settings.refreshToken,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
  });
  const response = await fetch(`${settings.accountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  const json: unknown = text ? parseZohoJson(text) : {};
  const token = isRecord(json) && typeof json.access_token === "string" ? json.access_token : "";
  if (!token) {
    const reason = isRecord(json) && typeof json.error === "string" ? json.error : "no token";
    throw new ZohoAuthError(`Zoho token refresh failed (${reason}).`, response.status || 401);
  }
  const expiresIn = isRecord(json) ? Number(json.expires_in) : 3600;
  const accessTokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000;
  await ctx.runMutation(internal.crm.clientMail.saveConnection, { accessToken: token, accessTokenExpiresAt });
  return token;
}

/** GET, and one refresh if Zoho rejects the cached token. Never anything but GET. */
async function zohoGetAuthed(ctx: ActionCtx, state: Batch, settings: Settings, url: string): Promise<unknown> {
  const ready = await ensureToken(ctx, state, settings);
  state.accessToken = ready.accessToken;
  state.accessTokenExpiresAt = ready.accessTokenExpiresAt;
  try {
    return await zohoGet(url, ready.accessToken);
  } catch (err) {
    if (!(err instanceof ZohoAuthError)) throw err;
    const token = await refresh(ctx, settings);
    state.accessToken = token;
    state.accessTokenExpiresAt = Date.now() + 3_000_000;
    return await zohoGet(url, token);
  }
}

async function zohoGet(url: string, accessToken: string): Promise<unknown> {
  if (!url.startsWith("https://") || url.includes("/updatemessage")) {
    throw new ZohoError("Refusing a Zoho request that is not a read.", 400);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const text = await response.text();
  const body: unknown = text ? parseZohoJson(text) : {};
  return unwrapZoho(response.status, body);
}

function contentUrl(base: string, accountId: string, folderId: string, messageId: string): string {
  return `${base}/api/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content?includeBlockContent=true`;
}

function mailUrl(base: string, path: string, query: Record<string, string>): string {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

function zohoSettings(): Settings {
  const clientId = env.ZOHO_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.ZOHO_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = env.ZOHO_REFRESH_TOKEN?.trim() ?? "";
  return {
    configured: Boolean(clientId && clientSecret && refreshToken),
    clientId,
    clientSecret,
    refreshToken,
    accountsUrl: (env.ZOHO_ACCOUNTS_URL?.trim() || "https://accounts.zoho.com").replace(/\/$/, ""),
    mailApiUrl: (env.ZOHO_MAIL_API_URL?.trim() || "https://mail.zoho.com").replace(/\/$/, ""),
    mailbox: (env.ZOHO_MAILBOX?.trim() || OFFICE_MAILBOX).toLowerCase(),
  };
}

function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Email sync failed.";
  return raw.replace(/Zoho-oauthtoken\s+\S+/gi, "Zoho-oauthtoken [removed]").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
