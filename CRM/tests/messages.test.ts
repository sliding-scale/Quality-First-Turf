/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { api } from "../../convex/_generated/api";
import { twilioSignature } from "../../convex/crm/lib/phone";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 19, 18, 0, 0);
type World = Awaited<ReturnType<typeof seeded>>;

afterEach(() => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});

/** A client in the business with a phone number. */
const clientWith = (w: World, phone: string, name = "Pat Client") =>
  w.base.run(async (ctx) => {
    const base = (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.qft)!;
    const { _id, _creationTime, ...rest } = base;
    void _id; void _creationTime;
    return ctx.db.insert("clients", { ...rest, name, nameKey: name.toLowerCase(), contactName: name, phone, email: "", phones: undefined });
  });
const addNumber = (w: World, number = "(555) 000-1111") => w.admin.mutation(api.crm.phoneNumbers.add, { businessId: w.qft, number, label: "Main", now: NOW });

describe("Messages: sending (plan 2026-11-19-messages)", () => {
  it("logs a text as sent by hand when texting is not set up, against the client and the sender", async () => {
    const w = await seeded();
    const client = await clientWith(w, "(555) 123-4567");
    const r = await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "  See you Tuesday ", now: NOW });
    expect(r).toMatchObject({ mode: "manual", phone: "+15551234567", body: "See you Tuesday" });
    const t = await w.office.query(api.crm.messages.thread, { businessId: w.qft, clientId: client });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ direction: "out", body: "See you Tuesday", status: "manual", userName: "Olga Office" });
  });

  it("queues the text for Twilio only when the keys are set and the business has a number", async () => {
    const w = await seeded();
    const client = await clientWith(w, "5551234567");
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    expect((await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "Hi", now: NOW })).mode).toBe("manual"); // keys, but no number yet
    await addNumber(w);
    const r = await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "Hi again", now: NOW + 1 });
    expect(r.mode).toBe("provider");
    const row = await w.base.run((ctx) => ctx.db.get(r.id));
    expect(row).toMatchObject({ status: "queued", fromNumber: "+15550001111" });
  });

  it("keeps the job a text came from, and refuses a job from another business", async () => {
    const w = await seeded();
    const client = await clientWith(w, "5551234567");
    const r = await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, opportunityId: w.project, body: "About the job", now: NOW });
    expect((await w.office.query(api.crm.messages.thread, { businessId: w.qft, clientId: client }))[0].opportunityId).toBe(w.project);
    void r;
    const otherProject = await w.base.run(async (ctx) => {
      const c = (await ctx.db.query("clients").collect()).find((x) => x.businessId === w.other)!;
      return ctx.db.insert("opportunities", { businessId: w.other, clientId: c._id, code: "O-1", title: "x", pipeline: "Sales", stage: "New Request", requestedAt: 1, owner: "x", searchText: "O-1" });
    });
    await expect(w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, opportunityId: otherProject, body: "x", now: NOW })).rejects.toThrow(/not in this business/);
  });

  it("refuses an empty text, a text that is too long, a client with no number, and Installers", async () => {
    const w = await seeded();
    const client = await clientWith(w, "5551234567");
    const none = await clientWith(w, "", "No Phone");
    await expect(w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "   ", now: NOW })).rejects.toThrow(/Write the message/);
    await expect(w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "x".repeat(1601), now: NOW })).rejects.toThrow(/1600/);
    await expect(w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: none, body: "Hi", now: NOW })).rejects.toThrow(/no phone number/);
    await expect(w.installer.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "Hi", now: NOW })).rejects.toThrow(/do not have access/);
  });
});

describe("Messages: receiving and reading", () => {
  const inbound = (w: World, over: { to?: string; from?: string; body?: string; sid?: string; now?: number } = {}) =>
    w.base.mutation(internal.crm.messages.receive, { to: "+15550001111", from: "+15551234567", body: "Can you come Friday?", sid: "SM1", now: NOW, ...over });

  it("files a received text under the business that owns the number and the client whose phone matches, unread", async () => {
    const w = await seeded();
    await addNumber(w);
    const client = await clientWith(w, "(555) 123-4567");
    expect(await inbound(w)).toEqual({ filed: true });
    const list = await w.office.query(api.crm.messages.conversations, { businessId: w.qft });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ clientId: client, name: "Pat Client", unread: 1, lastDirection: "in", lastBody: "Can you come Friday?" });
    expect(await w.office.query(api.crm.messages.unread, { businessId: w.qft })).toBe(1);
  });

  it("keeps a text from an unknown number under the bare number, and ignores a duplicate, an unknown number of ours and the other business", async () => {
    const w = await seeded();
    await addNumber(w);
    await inbound(w, { from: "+15559998888", sid: "SM2" });
    expect(await inbound(w, { from: "+15559998888", sid: "SM2" })).toMatchObject({ filed: false, why: "duplicate" });
    expect(await inbound(w, { to: "+15550002222", sid: "SM3" })).toMatchObject({ filed: false, why: "unknown number" });
    const list = await w.office.query(api.crm.messages.conversations, { businessId: w.qft });
    expect(list.map((c) => [c.clientId, c.name])).toEqual([[null, "+15559998888"]]);
    expect(await w.outsider.query(api.crm.messages.conversations, { businessId: w.other })).toEqual([]);
    await expect(w.outsider.query(api.crm.messages.conversations, { businessId: w.qft })).rejects.toBeTruthy();
  });

  it("orders conversations by the latest text, shows a thread oldest first, and marking it read clears the count", async () => {
    const w = await seeded();
    await addNumber(w);
    const a = await clientWith(w, "5551110001", "Ann");
    const b = await clientWith(w, "5551110002", "Bob");
    await inbound(w, { from: "+15551110001", sid: "A1", body: "First from Ann" });
    await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: b, body: "Hello Bob", now: NOW + 10 });
    await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: a, body: "Reply to Ann", now: NOW + 20 });
    const list = await w.office.query(api.crm.messages.conversations, { businessId: w.qft });
    expect(list.map((c) => c.name)).toEqual(["Ann", "Bob"]);
    const t = await w.office.query(api.crm.messages.thread, { businessId: w.qft, clientId: a });
    expect(t.map((m) => m.body)).toEqual(["First from Ann", "Reply to Ann"]);
    await w.office.mutation(api.crm.messages.markRead, { businessId: w.qft, clientId: a, now: NOW + 30 });
    expect(await w.office.query(api.crm.messages.unread, { businessId: w.qft })).toBe(0);
  });
});

describe("Phone numbers", () => {
  it("lets an Admin add and remove a number, refuses a duplicate or one from another business, and keeps others to looking", async () => {
    const w = await seeded();
    const id = await addNumber(w);
    expect(await w.office.query(api.crm.phoneNumbers.list, { businessId: w.qft })).toEqual([{ id, number: "+15550001111", display: "(555) 000-1111", label: "Main" }]);
    await expect(addNumber(w, "555 000 1111")).rejects.toThrow(/already in the list/);
    await expect(w.admin.mutation(api.crm.phoneNumbers.add, { businessId: w.other, number: "555-000-1111", label: "x", now: NOW })).rejects.toThrow(/another business/);
    await expect(w.admin.mutation(api.crm.phoneNumbers.add, { businessId: w.qft, number: "12345", label: "x", now: NOW })).rejects.toThrow(/area code/);
    await expect(w.office.mutation(api.crm.phoneNumbers.add, { businessId: w.qft, number: "555 222 3333", label: "x", now: NOW })).rejects.toBeTruthy();
    await w.admin.mutation(api.crm.phoneNumbers.remove, { id });
    expect(await w.office.query(api.crm.phoneNumbers.list, { businessId: w.qft })).toEqual([]);
  });
});

describe("Twilio's inbound webhook", () => {
  const post = async (w: World, params: Record<string, string>, signature: string | null) =>
    w.base.fetch("/twilio/sms", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(signature ? { "X-Twilio-Signature": signature } : {}) }, body: new URLSearchParams(params).toString() });

  it("refuses everything when texting is not set up, and anything unsigned or wrongly signed", async () => {
    const w = await seeded();
    const params = { To: "+15550001111", From: "+15551234567", Body: "Hi", MessageSid: "SMx" };
    expect((await post(w, params, null)).status).toBe(503);
    process.env.TWILIO_AUTH_TOKEN = "secret";
    expect((await post(w, params, null)).status).toBe(403);
    expect((await post(w, params, "bad")).status).toBe(403);
  });

  it("files a correctly signed text, and refuses the same text signed for another address", async () => {
    const w = await seeded();
    await addNumber(w);
    await clientWith(w, "5551234567");
    process.env.TWILIO_AUTH_TOKEN = "secret";
    const params = { To: "+15550001111", From: "+15551234567", Body: "Hello from a customer", MessageSid: "SMy" };
    // The signature covers the address Twilio called; the test client serves the route at https://some.convex.site.
    const wrong = await post(w, params, await twilioSignature("secret", "https://elsewhere.example/twilio/sms", params));
    expect(wrong.status).toBe(403);
    expect((await post(w, params, await twilioSignature("secret", "https://some.convex.site/twilio/sms", params))).status).toBe(200);
    const list = await w.office.query(api.crm.messages.conversations, { businessId: w.qft });
    expect(list.map((c) => [c.name, c.unread])).toEqual([["Pat Client", 1]]);
  });
});
