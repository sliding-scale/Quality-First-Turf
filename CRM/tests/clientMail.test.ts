/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import {
  OFFICE_MAILBOX,
  ZOHO_READ_SCOPES,
  addressesOnClient,
  extractAddresses,
  fieldSearchKey,
  mailDirection,
  matchingClients,
  parseZohoJson,
  pickFolder,
  previewText,
  readListedMessages,
  sanitizeEmailHtml,
} from "../../convex/crm/lib/zohoMail";
import { signedInAs, strangerIn } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);

const rejects = async (p: Promise<unknown>, message: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to be rejected").not.toBeNull();
  expect(String(err instanceof ConvexError ? err.data : err.message)).toMatch(message);
};

const listed = (over: Record<string, unknown> = {}) => ({
  messageId: "1709876190693100009",
  folderId: "2560636000000008014",
  threadId: "1709883095364100001",
  subject: "Quote",
  fromName: "Abraham",
  fromAddress: "ibra_gonzalez760@outlook.com",
  toAddresses: [OFFICE_MAILBOX],
  ccAddresses: [] as string[],
  receivedAt: 2_000,
  preview: "Can we look at the yard",
  hasAttachment: false,
  ...over,
});

async function world() {
  const base = convexTest(schema, modules);
  const admin = await signedInAs(base, { key: "admin-mail", roles: ["admin"], name: "Sal" });
  const businessA = await base.run((ctx) => ctx.db.insert("businesses", { name: "Quality First Turf", slug: "turf" }));
  const businessB = await base.run((ctx) => ctx.db.insert("businesses", { name: "Quality First Patios", slug: "patios" }));
  return { base, admin, businessA, businessB };
}

async function addClient(
  base: ReturnType<typeof convexTest<typeof schema>>,
  businessId: Id<"businesses">,
  extra: {
    email?: string;
    emails?: { address: string; description: string }[];
    contacts?: { name: string; role: string; phone: string; email: string }[];
  } = {},
) {
  return await base.run((ctx) =>
    ctx.db.insert("clients", {
      businessId,
      type: "homeowner",
      name: "Abraham Gonzalez",
      nameKey: "abraham gonzalez",
      contactName: "Abraham Gonzalez",
      company: "",
      phone: "555-0100",
      email: "ibra_gonzalez760@outlook.com",
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      notes: "",
      status: "active",
      createdAt: 1,
      lastActivityAt: 1,
      searchText: "abraham",
      ...extra,
    }),
  );
}

describe("Zoho mail parsing", () => {
  it("keeps Zoho ids that are too large for a JavaScript number", () => {
    const parsed = parseZohoJson('{"messageId":1709876190693100009,"folderId":2560636000000008014,"receivedTime":1709876190649}') as {
      messageId: string;
      folderId: string;
      receivedTime: number;
    };
    expect(parsed.messageId).toBe("1709876190693100009");
    expect(parsed.folderId).toBe("2560636000000008014");
    expect(parsed.receivedTime).toBe(1709876190649);
  });

  it("reads addresses from display names and ignores Zoho's Not Provided", () => {
    expect(extractAddresses('"Abraham" <Ibra_Gonzalez760@outlook.com>, office@qualityfirstturf.com')).toEqual([
      "ibra_gonzalez760@outlook.com",
      OFFICE_MAILBOX,
    ]);
    expect(extractAddresses("Not Provided")).toEqual([]);
  });

  it("matches from, to and cc, including extra addresses and contacts, and skips the office mailbox itself", () => {
    const owners = new Map([
      ["ibra_gonzalez760@outlook.com", [{ clientId: "a" }]],
      ["billing@example.com", [{ clientId: "a" }]],
      ["other@example.com", [{ clientId: "b" }]],
    ]);
    expect(matchingClients(["ibra_gonzalez760@outlook.com", OFFICE_MAILBOX], owners, OFFICE_MAILBOX).map((row) => row.clientId)).toEqual(["a"]);
    expect(matchingClients([OFFICE_MAILBOX, "other@example.com"], owners, OFFICE_MAILBOX).map((row) => row.clientId)).toEqual(["b"]);
    expect(matchingClients(["billing@example.com"], owners, OFFICE_MAILBOX).map((row) => row.clientId)).toEqual(["a"]);
    expect(matchingClients([OFFICE_MAILBOX], owners, OFFICE_MAILBOX)).toEqual([]);
    expect(addressesOnClient({
      email: "ibra_gonzalez760@outlook.com",
      emails: [{ address: "IBRA_gonzalez760@outlook.com" }, { address: "billing@example.com" }],
      contacts: [{ email: "jobs@example.com" }],
    })).toEqual(["ibra_gonzalez760@outlook.com", "billing@example.com", "jobs@example.com"]);
  });

  it("treats mail from the office mailbox as outgoing", () => {
    expect(mailDirection(OFFICE_MAILBOX, OFFICE_MAILBOX)).toBe("outgoing");
    expect(mailDirection("ibra_gonzalez760@outlook.com", OFFICE_MAILBOX)).toBe("incoming");
    expect(fieldSearchKey("cc", "IBRA_gonzalez760@outlook.com")).toBe("cc:ibra_gonzalez760@outlook.com");
  });

  it("uses the real Inbox and Sent paths, not a custom folder that also says Inbox", () => {
    const folders = [
      { folderId: "1", path: "/Inbox" },
      { folderId: "2", path: "/test" },
      { folderId: "3", path: "/Sent" },
    ];
    expect(pickFolder(folders, "/Inbox")).toBe("1");
    expect(pickFolder(folders, "/Sent")).toBe("3");
  });

  it("reads a list row, drops a missing thread id of 0, and shortens the preview", () => {
    const { messages, total } = readListedMessages([
      {
        messageId: "1709876190693100009",
        folderId: "2560636000000008014",
        threadId: "0",
        subject: "Hello",
        sender: "Abraham",
        fromAddress: "ibra_gonzalez760@outlook.com",
        toAddress: `"Office" <${OFFICE_MAILBOX}>`,
        ccAddress: "Not Provided",
        receivedTime: "1709876190649",
        summary: "<b>Hello</b>  there",
        hasAttachment: "1",
      },
    ], "fallback");
    expect(total).toBe(1);
    expect(messages[0]).toMatchObject({
      messageId: "1709876190693100009",
      threadId: "1709876190693100009",
      fromAddress: "ibra_gonzalez760@outlook.com",
      toAddresses: [OFFICE_MAILBOX],
      ccAddresses: [],
      hasAttachment: true,
      preview: "Hello there",
    });
    expect(previewText(`${"word ".repeat(80)}`)).toHaveLength(240);
  });

  it("strips scripts, tracking images and javascript links, and keeps a normal link", () => {
    const clean = sanitizeEmailHtml('<p onclick="x">Hi</p><script>alert(1)</script><img src="https://track.example/p"><a href="javascript:alert(1)">bad</a><a href="https://example.com">Quote</a>');
    expect(clean.imagesHidden).toBe(true);
    expect(clean.html).not.toMatch(/script|img|onclick|javascript/i);
    expect(clean.html).toContain('href="https://example.com"');
    expect(clean.html).toContain(">Quote</a>");
    expect(ZOHO_READ_SCOPES.every((scope) => scope.endsWith(".READ"))).toBe(true);
    expect(ZOHO_READ_SCOPES.join(" ")).not.toMatch(/ALL|UPDATE|DELETE/);
  });
});

describe("stored client mail", () => {
  it("stores incoming, outgoing and cc mail once, groups a thread, and does not overwrite a newer note", async () => {
    const { base, admin, businessA } = await world();
    const clientId = await addClient(base, businessA, {
      contacts: [{ name: "Billing", role: "", phone: "", email: "billing@example.com" }],
    });
    await base.run((ctx) => ctx.db.patch(clientId, { lastCommunication: { at: 9_000, text: "Called them" } }));

    const save = (messages: Record<string, unknown>[], matchedAddress?: string) =>
      base.mutation(internal.crm.clientMail.saveListed, { mailbox: OFFICE_MAILBOX, accountId: "acct", messages, ...(matchedAddress ? { matchedAddress } : {}) });

    await save([listed()]);
    await save([listed()]);
    await save([listed({ messageId: "1709876190693100010", receivedAt: 3_000, subject: "Newer", preview: "Second note" })]);
    await save([listed({ messageId: "1709876190693100011", receivedAt: 1_000, subject: "Older", preview: "First note" })]);
    await save([
      listed({
        messageId: "1709876190693100012",
        threadId: "other-thread",
        fromAddress: OFFICE_MAILBOX,
        fromName: "Office",
        toAddresses: ["ibra_gonzalez760@outlook.com"],
        receivedAt: 4_000,
        subject: "Sent quote",
        preview: "Here is the quote",
      }),
    ]);
    await save([
      listed({
        messageId: "1709876190693100013",
        threadId: "cc-thread",
        fromAddress: "vendor@example.com",
        fromName: "Vendor",
        toAddresses: [OFFICE_MAILBOX],
        ccAddresses: ["billing@example.com"],
        receivedAt: 5_000,
        subject: "Invoice copy",
        preview: "Copying the client",
      }),
    ]);
    const ignored: { inserted: number } = await save([
      listed({ messageId: "1709876190693100014", fromAddress: "stranger@example.com", toAddresses: [OFFICE_MAILBOX], threadId: "nope" }),
    ]);
    expect(ignored.inserted).toBe(0);

    const page = await admin.query(api.crm.clientMail.list, { clientId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((row) => row.subject)).toEqual(["Invoice copy", "Sent quote", "Newer"]);
    const quote = page.page.find((row) => row.subject === "Newer");
    expect(quote).toMatchObject({ count: 3, direction: "incoming", latestAt: 3_000 });
    expect(page.page.find((row) => row.subject === "Sent quote")?.direction).toBe("outgoing");

    const client = await base.run((ctx) => ctx.db.get(clientId));
    expect(client?.lastCommunication).toEqual({ at: 9_000, text: "Called them" });

    const messages = await admin.query(api.crm.clientMail.threadMessages, { clientId, threadId: "1709883095364100001" });
    expect(messages.map((row) => row.subject)).toEqual(["Older", "Quote", "Newer"]);

    const messageId = messages[2]._id;
    await base.mutation(internal.crm.clientMail.saveContent, {
      messageId,
      html: '<p>Hello</p><script>alert(1)</script><img src="https://track.example/x">',
      unavailable: false,
    });
    const detail = await admin.query(api.crm.clientMail.detail, { messageId });
    expect(detail?.contentStatus).toBe("stored");
    expect(detail?.imagesHidden).toBe(true);
    expect(detail?.html).toContain("<p>Hello</p>");
    expect(detail?.html).not.toMatch(/script|img/);

    const sales = await signedInAs(base, { key: "sales-b", roles: ["sales"], businessIds: [await base.run((ctx) => ctx.db.insert("businesses", { name: "Other", slug: "other" }))] });
    await rejects(sales.query(api.crm.clientMail.list, { clientId, paginationOpts: { numItems: 5, cursor: null } }), /No access/);
    await rejects(strangerIn(base).query(api.crm.clientMail.detail, { messageId }), /Not signed in|No access/);

    const status = await admin.query(api.crm.clientMail.status, {});
    expect(Object.keys(status).sort()).toEqual(["configured", "historyComplete", "lastError", "lastSuccessAt", "mailbox", "running"]);
    expect(JSON.stringify(status)).not.toMatch(/accessToken|refresh_token|client_secret/i);

    expect((await admin.query(api.crm.clients.deletePreview, { ids: [clientId] })).emails).toBeGreaterThan(0);
    vi.useFakeTimers();
    await admin.mutation(api.crm.clients.remove, { ids: [clientId] });
    await base.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const left = await base.run(async (ctx) => {
      const rows = await ctx.db.query("clientMailMessages").take(20);
      const bodies = await ctx.db.query("clientMailBodies").take(20);
      const threads = await ctx.db.query("clientMailThreads").take(20);
      return rows.length + bodies.length + threads.length;
    });
    expect(left).toBe(0);
  });

  it("leaves a client with no email address with an empty list", async () => {
    const { base, admin, businessA } = await world();
    const clientId = await addClient(base, businessA, { email: "" });
    await base.mutation(internal.crm.clientMail.saveListed, {
      mailbox: OFFICE_MAILBOX,
      accountId: "acct",
      messages: [listed({ fromAddress: "someone@example.com" })],
    });
    const page = await admin.query(api.crm.clientMail.list, { clientId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page).toEqual([]);
  });
});
