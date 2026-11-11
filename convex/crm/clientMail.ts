import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { env, internalMutation, internalQuery, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireAdmin, requireBusiness, requireStaff } from "./lib/access";
import {
  OFFICE_MAILBOX,
  addressesOnClient,
  mailDirection,
  matchingClients,
  sanitizeEmailHtml,
  type SearchField,
} from "./lib/zohoMail";

/* Stored mail for the client Communication tab (D-064). Reading is open to anyone who can see the client's business.
   Writing happens only from the sync, which is internal. Nothing in this file calls Zoho. */

const searchField = v.union(v.literal("sender"), v.literal("to"), v.literal("cc"));

const listedMessage = v.object({
  messageId: v.string(),
  folderId: v.string(),
  threadId: v.string(),
  subject: v.string(),
  fromName: v.string(),
  fromAddress: v.string(),
  toAddresses: v.array(v.string()),
  ccAddresses: v.array(v.string()),
  receivedAt: v.number(),
  preview: v.string(),
  hasAttachment: v.boolean(),
});

const emptySync = {
  singleton: "default" as const,
  mailbox: "",
  accountId: "",
  accessToken: "",
  accessTokenExpiresAt: 0,
  inboxFolderId: "",
  sentFolderId: "",
  inboxCursor: 1,
  sentCursor: 1,
  inboxDone: false,
  sentDone: false,
  running: false,
  runningUntil: 0,
  lastError: "",
};

export function configuredMailbox(): { configured: boolean; mailbox: string } {
  const configured = Boolean(env.ZOHO_CLIENT_ID?.trim() && env.ZOHO_CLIENT_SECRET?.trim() && env.ZOHO_REFRESH_TOKEN?.trim());
  const mailbox = (env.ZOHO_MAILBOX?.trim() || OFFICE_MAILBOX).toLowerCase();
  return { configured, mailbox };
}

/** Whether the office mailbox is connected, and how far the last sync got. No tokens. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const { configured, mailbox } = configuredMailbox();
    const sync = await ctx.db.query("zohoMailSync").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
    const pendingSearch = await ctx.db
      .query("zohoWatchedAddresses")
      .withIndex("by_done_and_inScan", (q) => q.eq("done", false).eq("inScan", false))
      .take(1);
    const foldersDone = Boolean(sync?.inboxDone && sync.sentDone);
    return {
      configured,
      mailbox: sync?.mailbox || mailbox,
      running: sync?.running ?? false,
      historyComplete: configured && foldersDone && pendingSearch.length === 0,
      lastSuccessAt: sync?.lastSuccessAt ?? null,
      lastError: sync?.lastError ?? "",
    };
  },
});

/** Conversations for one client, newest activity first. */
export const list = query({
  args: { clientId: v.id("clients"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new ConvexError("Client not found.");
    await requireBusiness(ctx, client.businessId);
    return await ctx.db
      .query("clientMailThreads")
      .withIndex("by_client_and_latestAt", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** The messages inside one conversation, oldest first. Capped so one huge thread cannot load the page. */
export const threadMessages = query({
  args: { clientId: v.id("clients"), threadId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new ConvexError("Client not found.");
    await requireBusiness(ctx, client.businessId);
    const rows = await ctx.db
      .query("clientMailMessages")
      .withIndex("by_client_and_thread", (q) => q.eq("clientId", args.clientId).eq("threadId", args.threadId))
      .take(100);
    return rows
      .map((row) => ({
        _id: row._id,
        subject: row.subject,
        fromName: row.fromName,
        fromAddress: row.fromAddress,
        toAddresses: row.toAddresses,
        ccAddresses: row.ccAddresses,
        direction: row.direction,
        receivedAt: row.receivedAt,
        preview: row.preview,
        hasAttachment: row.hasAttachment,
        contentStatus: row.contentStatus,
      }))
      .sort((a, b) => a.receivedAt - b.receivedAt);
  },
});

/** One message, including its sanitized body when that has been stored. */
export const detail = query({
  args: { messageId: v.id("clientMailMessages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) return null;
    await requireBusiness(ctx, row.businessId);
    const body = row.contentStatus === "stored"
      ? await ctx.db.query("clientMailBodies").withIndex("by_message", (q) => q.eq("messageId", row._id)).unique()
      : null;
    return {
      subject: row.subject,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
      toAddresses: row.toAddresses,
      ccAddresses: row.ccAddresses,
      direction: row.direction,
      receivedAt: row.receivedAt,
      preview: row.preview,
      hasAttachment: row.hasAttachment,
      contentStatus: row.contentStatus,
      imagesHidden: row.imagesHidden,
      html: body?.html ?? "",
    };
  },
});

export const assertAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return null;
  },
});

/** What the sync needs in order to fetch, plus the lock. Null when another run is already in progress. */
export const prepareBatch = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const { mailbox } = configuredMailbox();
    let sync = await ensureSync(ctx);
    if (sync.running && sync.runningUntil > args.now) return null;
    if (sync.mailbox && sync.mailbox !== mailbox) {
      // A different mailbox: drop the cached connection and walk Inbox, Sent and each client address again.
      await ctx.db.replace(sync._id, { ...emptySync, mailbox });
      for await (const row of ctx.db.query("zohoWatchedAddresses")) {
        await ctx.db.patch(row._id, { done: false, inScan: false, field: "sender", nextStart: 1 });
      }
      const replaced = await ctx.db.get(sync._id);
      if (!replaced) throw new ConvexError("Mail sync could not start.");
      sync = replaced;
    } else if (sync.mailbox !== mailbox) {
      await ctx.db.patch(sync._id, { mailbox });
    }
    await ensureWatched(ctx, sync, args.now);
    const fresh = await ctx.db.get(sync._id);
    if (!fresh) throw new ConvexError("Mail sync could not start.");
    await ctx.db.patch(fresh._id, { running: true, runningUntil: args.now + 120_000, mailbox });
    const searchRows = await ctx.db
      .query("zohoWatchedAddresses")
      .withIndex("by_done_and_inScan", (q) => q.eq("done", false).eq("inScan", false))
      .take(3);
    const pending = await ctx.db
      .query("clientMailMessages")
      .withIndex("by_contentStatus", (q) => q.eq("contentStatus", "pending"))
      .take(5);
    return {
      mailbox,
      accountId: fresh.accountId,
      accessToken: fresh.accessToken,
      accessTokenExpiresAt: fresh.accessTokenExpiresAt,
      inboxFolderId: fresh.inboxFolderId,
      sentFolderId: fresh.sentFolderId,
      inboxCursor: fresh.inboxCursor,
      sentCursor: fresh.sentCursor,
      inboxDone: fresh.inboxDone,
      sentDone: fresh.sentDone,
      searches: searchRows.slice(0, 2).map((row) => ({ address: row.address, field: row.field, nextStart: row.nextStart })),
      moreSearches: searchRows.length > 2,
      pending: pending.slice(0, 4).map((row) => ({
        id: row._id,
        accountId: row.zohoAccountId,
        folderId: row.folderId,
        messageId: row.zohoMessageId,
      })),
      contentBacklog: pending.length > 4,
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    accountId: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    inboxFolderId: v.optional(v.string()),
    sentFolderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sync = await ensureSync(ctx);
    const patch: Partial<Doc<"zohoMailSync">> = {};
    if (args.accountId !== undefined) patch.accountId = args.accountId;
    if (args.accessToken !== undefined) patch.accessToken = args.accessToken;
    if (args.accessTokenExpiresAt !== undefined) patch.accessTokenExpiresAt = args.accessTokenExpiresAt;
    if (args.inboxFolderId !== undefined) patch.inboxFolderId = args.inboxFolderId;
    if (args.sentFolderId !== undefined) patch.sentFolderId = args.sentFolderId;
    await ctx.db.patch(sync._id, patch);
    return null;
  },
});

export const saveListed = internalMutation({
  args: {
    mailbox: v.string(),
    accountId: v.string(),
    matchedAddress: v.optional(v.string()),
    messages: v.array(listedMessage),
  },
  handler: async (ctx, args) => {
    const byAddress = await addressMap(ctx);
    let inserted = 0;
    for (const message of args.messages) {
      const addresses = [message.fromAddress, ...message.toAddresses, ...message.ccAddresses];
      if (args.matchedAddress) addresses.push(args.matchedAddress);
      const clients = matchingClients(addresses, byAddress, args.mailbox);
      const direction = mailDirection(message.fromAddress, args.mailbox);
      for (const client of clients) {
        const existing = await ctx.db
          .query("clientMailMessages")
          .withIndex("by_zohoMessage_and_client", (q) => q.eq("zohoMessageId", message.messageId).eq("clientId", client.clientId))
          .unique();
        if (existing) continue;
        await ctx.db.insert("clientMailMessages", {
          businessId: client.businessId,
          clientId: client.clientId,
          zohoAccountId: args.accountId,
          zohoMessageId: message.messageId,
          folderId: message.folderId,
          threadId: message.threadId,
          subject: message.subject,
          fromName: message.fromName,
          fromAddress: message.fromAddress,
          toAddresses: message.toAddresses,
          ccAddresses: message.ccAddresses,
          direction,
          receivedAt: message.receivedAt,
          preview: message.preview,
          hasAttachment: message.hasAttachment,
          contentStatus: "pending",
          imagesHidden: false,
        });
        await bumpThread(ctx, client, message, direction);
        await bumpLastCommunication(ctx, client.clientId, message.receivedAt, message.preview || message.subject);
        inserted += 1;
      }
    }
    return { inserted };
  },
});

export const noteFolderPage = internalMutation({
  args: {
    folder: v.union(v.literal("inbox"), v.literal("sent")),
    nextCursor: v.number(),
    done: v.boolean(),
  },
  handler: async (ctx, args) => {
    const sync = await ensureSync(ctx);
    const inboxDone = args.folder === "inbox" ? args.done : sync.inboxDone;
    const sentDone = args.folder === "sent" ? args.done : sync.sentDone;
    await ctx.db.patch(sync._id, args.folder === "inbox"
      ? { inboxCursor: args.nextCursor, inboxDone }
      : { sentCursor: args.nextCursor, sentDone });
    if (inboxDone && sentDone) await markScannedAddressesDone(ctx);
    return { historyFoldersDone: inboxDone && sentDone };
  },
});

export const noteSearchPage = internalMutation({
  args: {
    address: v.string(),
    field: searchField,
    nextStart: v.number(),
    pageDone: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("zohoWatchedAddresses").withIndex("by_address", (q) => q.eq("address", args.address)).unique();
    if (!row || row.done) return null;
    if (!args.pageDone) {
      await ctx.db.patch(row._id, { field: args.field, nextStart: args.nextStart });
      return null;
    }
    const order: SearchField[] = ["sender", "to", "cc"];
    const next = order[order.indexOf(args.field) + 1];
    if (!next) await ctx.db.patch(row._id, { done: true, nextStart: 1 });
    else await ctx.db.patch(row._id, { field: next, nextStart: 1 });
    return null;
  },
});

export const saveContent = internalMutation({
  args: { messageId: v.id("clientMailMessages"), html: v.string(), unavailable: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) return null;
    if (args.unavailable) {
      await ctx.db.patch(row._id, { contentStatus: "unavailable" });
      return null;
    }
    const clean = sanitizeEmailHtml(args.html);
    const existing = await ctx.db.query("clientMailBodies").withIndex("by_message", (q) => q.eq("messageId", row._id)).unique();
    if (existing) await ctx.db.patch(existing._id, { html: clean.html });
    else await ctx.db.insert("clientMailBodies", { messageId: row._id, html: clean.html });
    await ctx.db.patch(row._id, { contentStatus: "stored", imagesHidden: clean.imagesHidden });
    return null;
  },
});

/** Cached access token for a one-message read. Does not take the sync lock. */
export const connection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sync = await ctx.db.query("zohoMailSync").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
    return { accessToken: sync?.accessToken ?? "", accessTokenExpiresAt: sync?.accessTokenExpiresAt ?? 0 };
  },
});

export const noteContentFailure = internalMutation({
  args: { messageId: v.id("clientMailMessages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row || row.contentStatus !== "pending") return null;
    const attempts = (row.contentAttempts ?? 0) + 1;
    if (attempts >= 3) await ctx.db.patch(row._id, { contentStatus: "unavailable", contentAttempts: attempts });
    else await ctx.db.patch(row._id, { contentAttempts: attempts });
    return null;
  },
});

export const getForContent = internalQuery({
  args: { messageId: v.id("clientMailMessages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) throw new ConvexError("That email is no longer available.");
    await requireBusiness(ctx, row.businessId);
    if (row.contentStatus !== "pending") return null;
    return { accountId: row.zohoAccountId, folderId: row.folderId, zohoMessageId: row.zohoMessageId };
  },
});

export const finishBatch = internalMutation({
  args: { ok: v.boolean(), lastError: v.string() },
  handler: async (ctx, args) => {
    const sync = await ctx.db.query("zohoMailSync").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
    if (!sync) return null;
    await ctx.db.patch(sync._id, {
      running: false,
      runningUntil: 0,
      lastError: args.lastError.slice(0, 300),
      ...(args.ok ? { lastSuccessAt: Date.now() } : {}),
    });
    return null;
  },
});

/** Deletes saved copies after a client is deleted. One batch, then another if more remain. */
export const deleteClientMail = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const threads = await ctx.db.query("clientMailThreads").withIndex("by_client_and_latestAt", (q) => q.eq("clientId", args.clientId)).take(50);
    for (const thread of threads) await ctx.db.delete(thread._id);
    const rows = await ctx.db.query("clientMailMessages").withIndex("by_client_and_receivedAt", (q) => q.eq("clientId", args.clientId)).take(50);
    for (const row of rows) {
      const body = await ctx.db.query("clientMailBodies").withIndex("by_message", (q) => q.eq("messageId", row._id)).unique();
      if (body) await ctx.db.delete(body._id);
      await ctx.db.delete(row._id);
    }
    if (threads.length === 50 || rows.length === 50) {
      await ctx.scheduler.runAfter(0, internal.crm.clientMail.deleteClientMail, { clientId: args.clientId });
    }
    return null;
  },
});

async function ensureSync(ctx: MutationCtx): Promise<Doc<"zohoMailSync">> {
  const existing = await ctx.db.query("zohoMailSync").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("zohoMailSync", emptySync);
  const created = await ctx.db.get(id);
  if (!created) throw new ConvexError("Mail sync could not start.");
  return created;
}

async function ensureWatched(ctx: MutationCtx, sync: Doc<"zohoMailSync">, now: number) {
  const starting = sync.backfillStartedAt === undefined;
  if (starting) await ctx.db.patch(sync._id, { backfillStartedAt: now, inboxCursor: 1, sentCursor: 1, inboxDone: false, sentDone: false });
  const known = new Set<string>();
  for await (const row of ctx.db.query("zohoWatchedAddresses")) known.add(row.address);
  for await (const client of ctx.db.query("clients")) {
    for (const address of addressesOnClient(client)) {
      if (known.has(address)) continue;
      known.add(address);
      await ctx.db.insert("zohoWatchedAddresses", {
        address,
        field: "sender",
        nextStart: 1,
        done: false,
        inScan: starting,
        enqueuedAt: now,
      });
    }
  }
}

async function markScannedAddressesDone(ctx: MutationCtx) {
  for await (const row of ctx.db.query("zohoWatchedAddresses").withIndex("by_inScan_and_done", (q) => q.eq("inScan", true).eq("done", false))) {
    await ctx.db.patch(row._id, { done: true });
  }
}

type Owner = { clientId: Id<"clients">; businessId: Id<"businesses"> };

async function addressMap(ctx: MutationCtx): Promise<Map<string, Owner[]>> {
  const map = new Map<string, Owner[]>();
  for await (const client of ctx.db.query("clients")) {
    for (const address of addressesOnClient(client)) {
      const list = map.get(address) ?? [];
      list.push({ clientId: client._id, businessId: client.businessId });
      map.set(address, list);
    }
  }
  return map;
}

async function bumpThread(
  ctx: MutationCtx,
  client: Owner,
  message: {
    threadId: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    toAddresses: string[];
    receivedAt: number;
    preview: string;
    hasAttachment: boolean;
  },
  direction: "incoming" | "outgoing",
) {
  const thread = await ctx.db
    .query("clientMailThreads")
    .withIndex("by_client_and_thread", (q) => q.eq("clientId", client.clientId).eq("threadId", message.threadId))
    .unique();
  if (!thread) {
    await ctx.db.insert("clientMailThreads", {
      businessId: client.businessId,
      clientId: client.clientId,
      threadId: message.threadId,
      subject: message.subject,
      latestAt: message.receivedAt,
      preview: message.preview,
      fromName: message.fromName,
      fromAddress: message.fromAddress,
      toAddresses: message.toAddresses,
      direction,
      count: 1,
      hasAttachment: message.hasAttachment,
    });
    return;
  }
  if (message.receivedAt >= thread.latestAt) {
    await ctx.db.patch(thread._id, {
      subject: message.subject,
      latestAt: message.receivedAt,
      preview: message.preview,
      fromName: message.fromName,
      fromAddress: message.fromAddress,
      toAddresses: message.toAddresses,
      direction,
      count: thread.count + 1,
      hasAttachment: thread.hasAttachment || message.hasAttachment,
    });
  } else {
    await ctx.db.patch(thread._id, { count: thread.count + 1, hasAttachment: thread.hasAttachment || message.hasAttachment });
  }
}

async function bumpLastCommunication(ctx: MutationCtx, clientId: Id<"clients">, at: number, text: string) {
  const client = await ctx.db.get(clientId);
  if (!client) return;
  if (client.lastCommunication && client.lastCommunication.at > at) return;
  await ctx.db.patch(clientId, { lastCommunication: { at, text: text.slice(0, 500) } });
}
