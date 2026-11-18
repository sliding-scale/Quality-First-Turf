/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PREPLANNING_STAGES } from "../../convex/crm/lib/stages";
import { NOW, seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const boardArgs = { sortKey: "timeInStage" as const, dir: "desc" as const, leadSources: [] as string[], search: "", now: NOW + 100 };

/** A project taken through Sales and Preplanning to Construction, with the test Installer ready to be put on its work team. */
async function onSite() {
  const w = await seeded();
  await signedQuote(w);
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], now: NOW + 1 });
  const userId = async (name: string) => (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.name === name)!._id as Id<"users">;
  const installerId = await userId("Ivan Installer");
  const assign = (ids: Id<"users">[]) => w.admin.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: null, crewIds: [], installerIds: ids, now: NOW + 2 });
  return { ...w, userId, installerId, assign };
}

describe("An Installer logs in and sees only their own work (PRD 5.5)", () => {
  it("cannot see a project until they are on its work team, then sees it and can work on it", async () => {
    const w = await onSite();
    await expect(w.installer.query(api.crm.construction.get, { id: w.project })).rejects.toThrow(/no longer exists/);
    await expect(w.installer.mutation(api.crm.construction.addProgress, { id: w.project, text: "Base laid", files: [], now: NOW + 3 })).rejects.toThrow(/no longer exists/);
    expect((await w.installer.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs })).total).toBe(0);

    await w.assign([w.installerId]);
    expect((await w.installer.query(api.crm.construction.get, { id: w.project }))?.canWork).toBe(true);
    await w.installer.mutation(api.crm.construction.addProgress, { id: w.project, text: "Base laid", files: [], now: NOW + 3 });
    const board = await w.installer.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs });
    expect(board.total).toBe(1);
    expect(board.columns.flatMap((c) => c.cards)[0]).toMatchObject({ code: "TST-001", valueCents: 0 }); // no prices
    expect((await w.admin.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs })).columns.flatMap((c) => c.cards)[0].valueCents).toBeGreaterThan(0);
  });

  it("sees no prices on the project page, and nothing outside Construction, schedule and tasks", async () => {
    const w = await onSite();
    await w.assign([w.installerId]);
    const page = await w.installer.query(api.crm.opportunityPage.overview, { id: w.project });
    expect(page?.confirmed?.lines.every((l) => l.unitPriceCents === 0 && l.totalCents === 0)).toBe(true);
    expect((await w.admin.query(api.crm.opportunityPage.overview, { id: w.project }))?.confirmed?.lines[0].unitPriceCents).toBeGreaterThan(0);
    await expect(w.installer.query(api.crm.opportunityPage.quotes, { id: w.project })).rejects.toThrow(/do not have access/);
    await expect(w.installer.query(api.crm.clients.list, { businessId: w.qft, status: "All", type: "All", search: "", sortKey: "name", dir: "asc", page: 1, size: 10 })).rejects.toThrow(/do not have access/);
    await expect(w.installer.query(api.crm.invoices.stats, { businessId: w.qft, now: NOW })).rejects.toThrow(/do not have access/);
    await expect(w.installer.query(api.crm.pipeline.board, { businessId: w.qft, ...boardArgs })).rejects.toThrow(/do not have access/);
    await expect(w.installer.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "PM Job Walk & Mark-up", now: NOW + 5 })).resolves.toBeTruthy(); // Construction: Edit
    await expect(w.installer.mutation(api.crm.pipeline.startFinance, { id: w.project, now: NOW + 6 })).rejects.toThrow(/do not have access/);
  });

  it("is put on a project by someone who may, only if they are an Installer on the business, and cannot choose the team themselves", async () => {
    const w = await onSite();
    await expect(w.assign([await w.userId("Sam Sales")])).rejects.toThrow(/Pick an Installer/);
    await expect(w.assign([await w.userId("Olive Outsider")])).rejects.toThrow(/Pick an Installer/);
    await w.assign([w.installerId]);
    const page = await w.admin.query(api.crm.construction.get, { id: w.project });
    expect(page?.installers).toEqual([{ id: w.installerId, name: "Ivan Installer" }]);
    expect(page?.installerOptions.map((p) => p.name)).toContain("Ivan Installer");
    await expect(w.installer.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: null, crewIds: [], installerIds: [], now: NOW + 9 })).rejects.toThrow(/not change/);
    const told = await w.installer.query(api.crm.mentions.mine, {});
    expect(told.items.some((i) => i.excerpt.includes("work team"))).toBe(true);
  });

  it("sees only their own schedule items and tasks", async () => {
    const w = await onSite();
    await w.assign([w.installerId]);
    const visit = { businessId: w.qft, type: "visit" as const, title: "Install day", start: NOW + 86_400_000, end: NOW + 2 * 86_400_000, opportunityId: w.project, now: NOW, visitKind: "install" as const };
    await w.admin.mutation(api.crm.schedule.book, { ...visit, assigneeIds: [w.installerId] });
    await w.admin.mutation(api.crm.schedule.book, { ...visit, title: "Someone else's", assigneeIds: [] });
    const range = { businessId: w.qft, from: NOW, to: NOW + 5 * 86_400_000, types: [], assigneeIds: [], statuses: [], now: NOW };
    expect((await w.admin.query(api.crm.schedule.range, range)).items.map((i) => i.title).sort()).toEqual(["Install day", "Someone else's"]);
    expect((await w.installer.query(api.crm.schedule.range, range)).items.map((i) => i.title)).toEqual(["Install day"]);
    expect(await w.installer.query(api.crm.schedule.unscheduled, { businessId: w.qft, sort: "oldest" })).toEqual([]);

    await w.admin.mutation(api.crm.opportunityTasks.addTask, { id: w.project, title: "Order stakes", assigneeId: w.installerId });
    await w.admin.mutation(api.crm.opportunityTasks.addTask, { id: w.project, title: "Call the client" });
    const day = { businessId: w.qft, now: NOW, todayStart: NOW - 1000, todayEnd: NOW + 1000 };
    expect((await w.installer.query(api.crm.opportunityTasks.listAll, day)).rows.map((r) => r.title)).toEqual(["Order stakes"]);
    expect((await w.installer.query(api.crm.opportunityTasks.listForProject, { id: w.project })).tasks.map((t) => t.title)).toEqual(["Order stakes"]);
    expect((await w.admin.query(api.crm.opportunityTasks.listAll, day)).rows).toHaveLength(2);
  });
});

describe("The Admin's overrides (Manage Team, PRD 5.5)", () => {
  const edit = async (w: Awaited<ReturnType<typeof onSite>>, name: string, over: Record<string, unknown>) => {
    const u = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((x) => x.name === name)!;
    await w.admin.mutation(api.crm.users.update, { id: u._id, active: true, name: u.name, roles: u.roles, businessIds: u.businessIds, ...over });
  };

  it("lower or raise one module for one person and leave the rest alone", async () => {
    const w = await onSite();
    const listInvoices = (who: typeof w.office) => who.query(api.crm.invoices.stats, { businessId: w.qft, now: NOW });
    await listInvoices(w.office);
    await edit(w, "Olga Office", { permissions: { invoices: "none" } });
    await expect(listInvoices(w.office)).rejects.toThrow(/do not have access/);
    expect((await w.office.query(api.crm.quotes.stats, { businessId: w.qft, today: NOW })).counts).toBeTruthy(); // quotes untouched

    await edit(w, "Olga Office", { permissions: { quotes: "view" } });
    await expect(w.office.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, title: "T", now: NOW })).rejects.toThrow(/not change/);

    await edit(w, "Pat PM", { permissions: { invoices: "edit" } });
    await w.pm.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, now: NOW, subject: "From a PM", termsKey: "net_30", salesperson: "Pat", clientMessage: "", contract: "",
      clientView: { quantities: true, unitPrices: true, lineTotals: true, accountBalance: true, lateStamp: true }, lines: [{ name: "x", description: "", quantity: 1, unitPriceCents: 100 }] });
  });

  it("limit any person to their own records when the Admin switches it on, and take it off an Installer", async () => {
    const w = await onSite();
    const salesId = await w.userId("Sam Sales");
    const salesBoard = () => w.sales.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs });
    // Sales only look at Construction; with the switch off they see every project of the business.
    expect((await salesBoard()).total).toBe(1);
    await edit(w, "Sam Sales", { assignedOnly: true });
    expect((await salesBoard()).total).toBe(0);
    await w.admin.mutation(api.crm.pipeline.setSalesperson, { id: w.project, salespersonId: salesId });
    expect((await salesBoard()).total).toBe(1);

    await edit(w, "Ivan Installer", { assignedOnly: false });
    expect((await w.installer.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs })).total).toBe(1);
  });

  it("add the Installer role to an invitation, and only an Admin can change anyone's permissions", async () => {
    const w = await onSite();
    const id = await w.base.mutation(internalCreate, { email: "new.installer@example.com", invitedBy: "admin", name: "New Installer", roles: ["installer"], businessIds: [w.qft], permissions: { prices: "view" } });
    const row = await w.base.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ roles: ["installer"], permissions: { prices: "view" }, status: "invited" });
    await expect(w.office.mutation(api.crm.users.update, { id, active: true, name: "x", roles: ["admin"], businessIds: [w.qft] })).rejects.toThrow(/Only an Admin/);
  });
});

import { internal } from "../../convex/_generated/api";
const internalCreate = internal.crm.users.createInvited;
