/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { callProblem, durationLabel } from "../../convex/crm/lib/calls";
import { whatsAppDigits } from "../../convex/crm/lib/phone";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 20, 18, 0, 0);
type World = Awaited<ReturnType<typeof seeded>>;

describe("call and WhatsApp rules", () => {
  it("labels a duration", () => {
    expect(durationLabel(252)).toBe("4 min 12 s");
    expect(durationLabel(45)).toBe("45 s");
    expect(durationLabel(3900)).toBe("1 h 5 min");
    expect(durationLabel(3600)).toBe("1 h");
    expect(durationLabel(120)).toBe("2 min");
    expect(durationLabel(0)).toBe("");
    expect(durationLabel(null)).toBe("");
  });
  it("refuses a call from the future, a bad outcome, and a length on a call nobody answered", () => {
    const ok = { outcome: "answered", durationSeconds: 60, at: NOW - 1000, now: NOW, notes: "" };
    expect(callProblem(ok)).toBeNull();
    expect(callProblem({ ...ok, at: NOW + 10 * 60 * 1000 })).toMatch(/future/);
    expect(callProblem({ ...ok, at: NOW + 60 * 1000 })).toBeNull(); // a clock a minute fast is fine
    expect(callProblem({ ...ok, outcome: "shrug" })).toMatch(/how the call went/);
    expect(callProblem({ ...ok, outcome: "no_answer" })).toMatch(/Only an answered call/);
    expect(callProblem({ ...ok, outcome: "no_answer", durationSeconds: 0 })).toBeNull();
    expect(callProblem({ ...ok, durationSeconds: -1 })).toMatch(/how long/);
    expect(callProblem({ ...ok, durationSeconds: 90_000 })).toMatch(/how long/);
    expect(callProblem({ ...ok, durationSeconds: 1.5 })).toMatch(/how long/);
    expect(callProblem({ ...ok, notes: "x".repeat(3001) })).toMatch(/too long/);
  });
  it("gives WhatsApp the digits of an E.164 number", () => {
    expect(whatsAppDigits("(555) 123-4567")).toBe("15551234567");
    expect(whatsAppDigits("+44 7700 900123")).toBe("447700900123");
    expect(whatsAppDigits("12345")).toBeNull();
  });
});

const clientWith = (w: World, phone: string, name = "Pat Client", businessId = w.qft) =>
  w.base.run(async (ctx) => {
    const base = (await ctx.db.query("clients").collect()).find((c) => c.businessId === businessId)!;
    const { _id, _creationTime, ...rest } = base;
    void _id; void _creationTime;
    return ctx.db.insert("clients", { ...rest, name, nameKey: name.toLowerCase(), contactName: name, phone, email: "", phones: undefined });
  });
const wonProject = (w: World, over: Record<string, unknown> = {}) =>
  w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "WA-1", title: "Yard", pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: "WA-1", outcome: "won", jobNumber: 1, closedAt: 1, ...over }),
  );
const call = { direction: "out" as const, outcome: "answered" as const, durationSeconds: 252, notes: "Booked the install", at: NOW - 60_000, now: NOW };

describe("Calls (plan 2026-11-20-calls-whatsapp)", () => {
  it("logs a call against the client, the project and the person, oldest first in the thread", async () => {
    const w = await seeded();
    const client = await clientWith(w, "(555) 123-4567");
    const project = await wonProject(w);
    await w.office.mutation(api.crm.calls.log, { businessId: w.qft, clientId: client, opportunityId: project, ...call });
    await w.office.mutation(api.crm.calls.log, { businessId: w.qft, clientId: client, ...call, direction: "in", outcome: "no_answer", durationSeconds: undefined, notes: "", at: NOW - 3_600_000 });
    const t = await w.office.query(api.crm.calls.thread, { businessId: w.qft, clientId: client });
    expect(t.map((c) => c.outcome)).toEqual(["no_answer", "answered"]);
    expect(t[1]).toMatchObject({ direction: "out", durationSeconds: 252, notes: "Booked the install", userName: "Olga Office", opportunityId: project });
  });

  it("logs a call to a bare number, and finds it by the same line however it is typed", async () => {
    const w = await seeded();
    await w.office.mutation(api.crm.calls.log, { businessId: w.qft, phone: "555.987.6543", ...call });
    expect(await w.office.query(api.crm.calls.thread, { businessId: w.qft, phone: "+15559876543" })).toHaveLength(1);
    expect(await w.office.query(api.crm.calls.thread, { businessId: w.qft, phone: "(555) 000-0000" })).toHaveLength(0);
  });

  it("needs a number, and refuses a client or project from another business", async () => {
    const w = await seeded();
    const noPhone = await clientWith(w, "", "No Phone");
    await expect(w.office.mutation(api.crm.calls.log, { businessId: w.qft, clientId: noPhone, ...call })).rejects.toThrow(/no phone number/);
    await expect(w.office.mutation(api.crm.calls.log, { businessId: w.qft, ...call })).rejects.toThrow(/Enter the phone number/);
    const theirs = await clientWith(w, "5551112222", "Theirs", w.other);
    await expect(w.office.mutation(api.crm.calls.log, { businessId: w.qft, clientId: theirs, ...call })).rejects.toThrow(/from this business/);
    const theirProject = await w.base.run((ctx) =>
      ctx.db.insert("opportunities", { businessId: w.other, clientId: theirs, code: "X-1", title: "x", pipeline: "Sales", stage: "New Request", requestedAt: 1, owner: "x", searchText: "x" }),
    );
    await expect(w.office.mutation(api.crm.calls.log, { businessId: w.qft, phone: "5551234567", opportunityId: theirProject, ...call })).rejects.toThrow(/not in this business/);
    await expect(w.outsider.mutation(api.crm.calls.log, { businessId: w.qft, phone: "5551234567", ...call })).rejects.toThrow();
  });

  it("refuses a future call, is read by Sales and not logged by an Installer", async () => {
    const w = await seeded();
    await expect(w.office.mutation(api.crm.calls.log, { businessId: w.qft, phone: "5551234567", ...call, at: NOW + 3_600_000 })).rejects.toThrow(/future/);
    await w.office.mutation(api.crm.calls.log, { businessId: w.qft, phone: "5551234567", ...call });
    expect(await w.sales.query(api.crm.calls.thread, { businessId: w.qft, phone: "5551234567" })).toHaveLength(1);
    await expect(w.installer.mutation(api.crm.calls.log, { businessId: w.qft, phone: "5551234567", ...call })).rejects.toThrow();
    await expect(w.installer.query(api.crm.calls.thread, { businessId: w.qft, phone: "5551234567" })).rejects.toThrow();
  });
});

describe("WhatsApp (plan 2026-11-20-calls-whatsapp)", () => {
  it("logs a work package sent by WhatsApp against the project, as sent by hand, on its own channel", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const r = await w.pm.mutation(api.crm.whatsapp.log, { businessId: w.qft, opportunityId: project, phone: "(555) 123-4567", body: " Here is the work package: https://x/w/abc ", now: NOW });
    expect(r).toMatchObject({ digits: "15551234567", body: "Here is the work package: https://x/w/abc" });
    const t = await w.pm.query(api.crm.messages.thread, { businessId: w.qft, phone: "+15551234567" });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ direction: "out", status: "manual", channel: "whatsapp", opportunityId: project, userName: "Pat PM" });
  });

  it("keeps texts as texts: an SMS row has the sms channel", async () => {
    const w = await seeded();
    const client = await clientWith(w, "5551234567");
    await w.office.mutation(api.crm.messages.send, { businessId: w.qft, clientId: client, body: "Hi", now: NOW });
    expect((await w.office.query(api.crm.messages.thread, { businessId: w.qft, clientId: client }))[0].channel).toBe("sms");
  });

  it("refuses a bad number, an empty message, a project not Closed Won or from another business, and a person who cannot message", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const base = { businessId: w.qft, opportunityId: project, phone: "5551234567", body: "Hi", now: NOW };
    await expect(w.pm.mutation(api.crm.whatsapp.log, { ...base, phone: "12345" })).rejects.toThrow(/country code/);
    await expect(w.pm.mutation(api.crm.whatsapp.log, { ...base, body: "  " })).rejects.toThrow(/Write the message/);
    await expect(w.pm.mutation(api.crm.whatsapp.log, { ...base, body: "x".repeat(4001) })).rejects.toThrow(/up to 4000/);
    const open = await wonProject(w, { outcome: undefined, code: "WA-2", searchText: "WA-2", jobNumber: 2 });
    await expect(w.pm.mutation(api.crm.whatsapp.log, { ...base, opportunityId: open })).rejects.toThrow(/Closed Won/);
    await expect(w.outsider.mutation(api.crm.whatsapp.log, base)).rejects.toThrow();
    await expect(w.installer.mutation(api.crm.whatsapp.log, base)).rejects.toThrow();
  });
});
