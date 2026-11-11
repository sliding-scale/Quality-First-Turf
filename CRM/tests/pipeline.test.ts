/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOW, seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const historyOf = (t: Awaited<ReturnType<typeof seeded>>["admin"], id: Id<"opportunities">) => t.query(api.crm.pipeline.history, { id });

describe("moveStage", () => {
  it("moves a project, saves the new stage time, and writes one history row", async () => {
    const { sales, project } = await seeded();
    const r = await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW });
    expect(r).toEqual({ from: "New Request", to: "Onsite Consultation" });
    const rows = await historyOf(sales, project);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: "New Request", to: "Onsite Consultation", byName: "Sam Sales", at: NOW });
  });

  it("refuses a move to the same stage and writes no history", async () => {
    const { sales, project } = await seeded();
    await expect(sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "New Request", now: NOW })).rejects.toThrow(/already/);
    expect(await historyOf(sales, project)).toHaveLength(0);
  });

  it("keeps history in order, each from equal to the previous to", async () => {
    const { sales, project } = await seeded();
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Schedule Onsite Consultation", now: NOW });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Changes Requested", now: NOW + 1000 });
    const rows = await historyOf(sales, project);
    expect(rows.map((r) => [r.from, r.to])).toEqual([
      ["Schedule Onsite Consultation", "Changes Requested"],
      ["New Request", "Schedule Onsite Consultation"],
    ]);
  });

  it("needs a reason for Closed Lost and then records the outcome", async () => {
    const { sales, base, project } = await seeded();
    await expect(sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Lost", now: NOW })).rejects.toThrow(/why/);
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Lost", reason: "Went with another company", now: NOW });
    const doc = await base.run((ctx) => ctx.db.get(project));
    expect(doc).toMatchObject({ stage: "Closed Lost", outcome: "lost", lostReason: "Went with another company", closedAt: NOW });
  });

  it("closes as won once the quote is signed, and only an Admin reopens", async () => {
    const w = await seeded();
    const { sales, admin, base, project } = w;
    await expect(sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Won", now: NOW })).rejects.toThrow();
    await signedQuote(w);
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Won", now: NOW });
    expect(await base.run((ctx) => ctx.db.get(project))).toMatchObject({ outcome: "won", closedAt: NOW });
    const rows = await historyOf(admin, project);
    expect(rows[0].note).toMatch(/approved and signed/);
    await expect(sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "New Request", now: NOW + 1 })).rejects.toThrow(/Admin/);
    await admin.mutation(api.crm.pipeline.moveStage, { id: project, to: "New Request", now: NOW + 1 });
    const doc = await base.run((ctx) => ctx.db.get(project));
    expect(doc?.outcome).toBeUndefined();
    expect(doc?.closedAt).toBeUndefined();
  });

  it("refuses a Project Manager and a person from another business", async () => {
    const { pm, outsider, project } = await seeded();
    await expect(pm.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW })).rejects.toThrow();
    await expect(outsider.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW })).rejects.toThrow();
    await expect(outsider.query(api.crm.pipeline.history, { id: project })).rejects.toThrow();
  });
});

const boardArgs = { sortKey: "timeInStage", dir: "desc", leadSources: [], search: "", now: NOW } as const;
const cardsOf = (b: { columns: { cards: { id: Id<"opportunities"> }[] }[] }) => b.columns.flatMap((c) => c.cards);

describe("board", () => {
  it("has the seven open columns and then Closed Won and Closed Lost, and every count and total adds up", async () => {
    const { admin, qft } = await seeded();
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(b.columns.map((c) => c.name)).toEqual([
      "New Request", "Schedule Onsite Consultation", "Onsite Consultation", "Quote Draft & Site Plan / Design",
      "Proposal Delivered — Awaiting Response", "Changes Requested", "Quotes Approved — Contract Out for Signature", "Closed Won", "Closed Lost",
    ]);
    expect(b.columns.slice(-2).map((c) => c.group)).toEqual(["Closed", "Closed"]);
    for (const c of b.columns) {
      expect(c.count).toBe(c.cards.length);
      expect(c.totalCents).toBe(c.cards.reduce((n, k) => n + k.valueCents, 0));
    }
    expect(b.total).toBe(b.columns.reduce((n, c) => n + c.count, 0));
    expect(b.groups.Requests.count + b.groups.Quotes.count + b.groups.Closed.count).toBe(b.total);
  });

  it("shows a project with no quote at $0, and one with quotes at its latest quote's total", async () => {
    const { admin, base, qft, project, clientId } = await seeded();
    let b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(cardsOf(b).find((c) => c.id === project)).toMatchObject({ valueCents: 0 });
    expect(cardsOf(b).find((c) => c.id === project)?.quoteId).toBeUndefined();
    const ids = await base.run(async (ctx) => {
      const mk = (number: number, createdAt: number, totalCents: number) =>
        ctx.db.insert("quotes", {
          businessId: qft, clientId, opportunityId: project, number, title: "Q", status: "Draft", salesperson: "Sal", createdAt,
          introHeading: "", introText: "", clientMessage: "", contract: "", depositPercent: 0, totalCents, searchText: "Q",
        });
      await mk(9001, NOW - 2000, 500_00);
      return [await mk(9002, NOW - 1000, 810_00)];
    });
    b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(cardsOf(b).find((c) => c.id === project)).toMatchObject({ valueCents: 810_00, quoteId: ids[0], group: "Requests" });
  });

  it("measures time in stage from the stage time, or from the request when there is none", async () => {
    const { admin, sales, qft, project } = await seeded();
    let b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(cardsOf(b).find((c) => c.id === project)?.timeInStageMs).toBe(3_600_000);
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Onsite Consultation", now: NOW - 60_000 });
    b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(cardsOf(b).find((c) => c.id === project)?.timeInStageMs).toBe(60_000);
  });

  it("filters by salesperson, lead source, date range and search together with matching counts", async () => {
    const { admin, base, qft, project } = await seeded();
    const salesUser = await base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.email === "sales-1@example.com")!._id);
    await base.run((ctx) => ctx.db.patch(project, { salespersonId: salesUser, leadSource: "Google" }));
    const mine = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, salespersonId: salesUser });
    expect(cardsOf(mine).map((c) => c.id)).toEqual([project]);
    expect(mine.total).toBe(1);
    const unassigned = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, salespersonId: "unassigned" });
    expect(cardsOf(unassigned).some((c) => c.id === project)).toBe(false);
    const google = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, leadSources: ["Google"] });
    expect(cardsOf(google).map((c) => c.id)).toContain(project);
    expect(cardsOf(google).every((c) => c.leadSource === "Google")).toBe(true);
    const none = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, leadSources: ["No source"] });
    expect(cardsOf(none).some((c) => c.id === project)).toBe(false);
    expect(none.total).toBeGreaterThan(0);
    const dated = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, from: NOW - 2 * 3_600_000, to: NOW });
    expect(cardsOf(dated).map((c) => c.id)).toEqual([project]);
    const found = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, search: "TST-001" });
    expect(cardsOf(found).map((c) => c.id)).toEqual([project]);
    const both = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, search: "TST-001", leadSources: ["Facebook"] });
    expect(both.total).toBe(0);
  });

  it("sorts by value, and a closed project moves to the Closed Won or Closed Lost column", async () => {
    const w = await seeded();
    const { admin, base, qft, project, clientId } = w;
    await base.run(async (ctx) => {
      await ctx.db.insert("quotes", {
        businessId: qft, clientId, opportunityId: project, number: 9100, title: "Q", status: "Draft", salesperson: "Sal", createdAt: NOW,
        introHeading: "", introText: "", clientMessage: "", contract: "", depositPercent: 0, totalCents: 99_999_00, searchText: "Q",
      });
    });
    const desc = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs, sortKey: "value", dir: "desc" });
    const col = desc.columns.find((c) => c.name === "New Request")!;
    expect(col.cards[0].id).toBe(project);
    await admin.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Lost", reason: "x", now: NOW });
    const after = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(after.columns.find((c) => c.name === "New Request")!.cards.some((c) => c.id === project)).toBe(false);
    expect(after.columns.find((c) => c.name === "Closed Lost")!.cards.map((c) => c.id)).toContain(project);
    await signedQuote(w);
    await admin.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Won", now: NOW + 1 });
    const won = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(won.columns.find((c) => c.name === "Closed Lost")!.cards.some((c) => c.id === project)).toBe(false);
    expect(won.columns.find((c) => c.name === "Closed Won")!.cards.map((c) => c.id)).toContain(project);
  });

  it("is closed to people from another business", async () => {
    const { outsider, qft } = await seeded();
    await expect(outsider.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs })).rejects.toThrow();
  });
});

describe("card actions and outcomes", () => {
  it("sets and clears the salesperson, and refuses someone outside the business", async () => {
    const { sales, base, admin, qft, project } = await seeded();
    const people = await admin.query(api.crm.pipeline.people, { businessId: qft });
    const sam = people.find((p) => p.name === "Sam Sales")!;
    expect(people.some((p) => p.name === "Olive Outsider")).toBe(false);
    await sales.mutation(api.crm.pipeline.setSalesperson, { id: project, salespersonId: sam.id });
    expect((await base.run((ctx) => ctx.db.get(project)))?.salespersonId).toBe(sam.id);
    await sales.mutation(api.crm.pipeline.setSalesperson, { id: project, salespersonId: null });
    expect((await base.run((ctx) => ctx.db.get(project)))?.salespersonId).toBeUndefined();
    const olive = await base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Olive Outsider")!._id);
    await expect(sales.mutation(api.crm.pipeline.setSalesperson, { id: project, salespersonId: olive })).rejects.toThrow(/not on this business/);
  });

  it("sets a lead source from the list only", async () => {
    const { sales, base, project } = await seeded();
    await sales.mutation(api.crm.pipeline.setLeadSource, { id: project, leadSource: "Referral" });
    expect((await base.run((ctx) => ctx.db.get(project)))?.leadSource).toBe("Referral");
    await expect(sales.mutation(api.crm.pipeline.setLeadSource, { id: project, leadSource: "Carrier pigeon" })).rejects.toThrow(/lead source/i);
    await sales.mutation(api.crm.pipeline.setLeadSource, { id: project, leadSource: null });
    expect((await base.run((ctx) => ctx.db.get(project)))?.leadSource).toBeUndefined();
  });

  it("marks lost with a reason and won only with a signed quote, and lists them under outcomes", async () => {
    const w = await seeded();
    const { sales, admin, qft, project } = w;
    await expect(sales.mutation(api.crm.pipeline.markOutcome, { id: project, outcome: "lost", now: NOW })).rejects.toThrow(/why/);
    await expect(sales.mutation(api.crm.pipeline.markOutcome, { id: project, outcome: "won", now: NOW })).rejects.toThrow();
    await sales.mutation(api.crm.pipeline.markOutcome, { id: project, outcome: "lost", reason: "Too expensive", now: NOW });
    const args = { businessId: qft, from: 0, to: NOW + 1000, sortKey: "closedOn", dir: "desc", page: 1, size: 10 } as const;
    const lost = await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "lost" });
    expect(lost.rows.map((r) => r.id)).toContain(project);
    expect(lost.rows.find((r) => r.id === project)).toMatchObject({ title: "Test turf", closedOn: NOW, totalCents: 0, lostReason: "Too expensive" });
    const won = await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "won" });
    expect(won.rows.map((r) => r.id)).not.toContain(project);
    await signedQuote(w);
    await admin.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Won", now: NOW + 5 });
    expect((await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "won" })).rows.map((r) => r.id)).toContain(project);
    expect((await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "lost" })).rows.map((r) => r.id)).not.toContain(project);
  });

  it("pages and sorts outcomes, and clamps the page size", async () => {
    const { admin, base, qft, clientId } = await seeded();
    await base.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("opportunities", {
          businessId: qft, clientId, code: `W-${i}`, title: `Won ${i}`, pipeline: "Sales", stage: "Closed Won", requestedAt: NOW - 10_000,
          owner: "x", searchText: "x", outcome: "won", closedAt: NOW - i * 1000,
        });
      }
    });
    const base1 = { businessId: qft, outcome: "won", from: 0, to: NOW + 1, sortKey: "closedOn", dir: "desc" } as const;
    const first = await admin.query(api.crm.pipeline.outcomes, { ...base1, page: 1, size: 2 });
    expect(first.rows.map((r) => r.title)).toEqual(["Won 0", "Won 1"]);
    expect(first.total).toBeGreaterThanOrEqual(3);
    const asc = await admin.query(api.crm.pipeline.outcomes, { ...base1, dir: "asc", page: 1, size: 500 });
    expect(asc.rows.length).toBeLessThanOrEqual(100);
    expect(asc.rows[0].closedOn).toBeLessThanOrEqual(asc.rows[1].closedOn);
  });
});

describe("custom and hidden stages", () => {
  const names = (b: { columns: { name: string }[] }) => b.columns.map((c) => c.name);

  it("adds a custom stage to a group, and it shows on the board and accepts projects", async () => {
    const { sales, admin, qft, project } = await seeded();
    await admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Requests", name: "  Site Survey " });
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(names(b).slice(0, 4)).toEqual(["New Request", "Schedule Onsite Consultation", "Onsite Consultation", "Site Survey"]);
    expect(b.columns.find((c) => c.name === "Site Survey")).toMatchObject({ custom: true, group: "Requests" });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Site Survey", now: NOW });
    const after = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(after.columns.find((c) => c.name === "Site Survey")?.cards.map((c) => c.id)).toEqual([project]);
  });

  it("refuses an empty, too-long, duplicate or PRD-named stage", async () => {
    const { admin, qft } = await seeded();
    const add = (name: string) => admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Quotes", name });
    await expect(add("   ")).rejects.toThrow(/name/i);
    await expect(add("x".repeat(61))).rejects.toThrow(/name/i);
    await expect(add("changes requested")).rejects.toThrow(/already/i);
    await expect(add("Closed Won")).rejects.toThrow(/already/i);
    await add("Walkthrough");
    await expect(add("walkthrough")).rejects.toThrow(/already/i);
  });

  it("reorders stages in a group", async () => {
    const { admin, qft } = await seeded();
    await admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Requests", name: "Site Survey" });
    await admin.mutation(api.crm.pipeline.reorderStages, {
      businessId: qft, group: "Requests", names: ["Site Survey", "New Request", "Schedule Onsite Consultation", "Onsite Consultation"],
    });
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(names(b).slice(0, 4)).toEqual(["Site Survey", "New Request", "Schedule Onsite Consultation", "Onsite Consultation"]);
    await expect(
      admin.mutation(api.crm.pipeline.reorderStages, { businessId: qft, group: "Requests", names: ["New Request"] }),
    ).rejects.toThrow(/every stage/i);
  });

  it("hides a stage with no projects, refuses one that holds projects, and hides it from moves", async () => {
    const { admin, sales, qft, project } = await seeded();
    await expect(admin.mutation(api.crm.pipeline.setStageHidden, { businessId: qft, name: "New Request", hidden: true })).rejects.toThrow(/projects/i);
    await admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Quotes", name: "Walkthrough" });
    await admin.mutation(api.crm.pipeline.setStageHidden, { businessId: qft, name: "Walkthrough", hidden: true });
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(names(b)).not.toContain("Walkthrough");
    await expect(sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Walkthrough", now: NOW })).rejects.toThrow(/hidden/);
    await admin.mutation(api.crm.pipeline.setStageHidden, { businessId: qft, name: "Walkthrough", hidden: false });
    expect(names(await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs }))).toContain("Walkthrough");
  });

  it("deletes a custom stage only when empty, and never a PRD stage", async () => {
    const { admin, sales, qft, project } = await seeded();
    await admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Quotes", name: "Walkthrough" });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Walkthrough", now: NOW });
    await expect(admin.mutation(api.crm.pipeline.deleteStage, { businessId: qft, name: "Walkthrough" })).rejects.toThrow(/projects/i);
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "New Request", now: NOW + 1 });
    await admin.mutation(api.crm.pipeline.deleteStage, { businessId: qft, name: "Walkthrough" });
    expect(names(await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs }))).not.toContain("Walkthrough");
    await expect(admin.mutation(api.crm.pipeline.deleteStage, { businessId: qft, name: "New Request" })).rejects.toThrow(/own/i);
  });

  it("renames a custom stage and carries its projects with it", async () => {
    const { admin, sales, qft, project } = await seeded();
    await admin.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Quotes", name: "Walkthrough" });
    await sales.mutation(api.crm.pipeline.moveStage, { id: project, to: "Walkthrough", now: NOW });
    await admin.mutation(api.crm.pipeline.renameStage, { businessId: qft, name: "Walkthrough", newName: "Site walk" });
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    expect(b.columns.find((c) => c.name === "Site walk")?.cards.map((c) => c.id)).toEqual([project]);
  });

  it("lists every stage for editing with locks and project counts, and is closed to Project Managers", async () => {
    const { admin, pm, qft } = await seeded();
    const list = await admin.query(api.crm.pipeline.stagesForEdit, { businessId: qft });
    expect(list.find((s) => s.name === "New Request")).toMatchObject({ locked: true, hidden: false });
    expect(list.find((s) => s.name === "New Request")!.projects).toBeGreaterThan(0);
    await expect(pm.mutation(api.crm.pipeline.addStage, { businessId: qft, group: "Quotes", name: "Nope" })).rejects.toThrow();
  });
});

describe("sample data", () => {
  it("puts cards in every column and one won and one lost outcome on the board's data", async () => {
    const { admin, qft } = await seeded();
    const b = await admin.query(api.crm.pipeline.board, { businessId: qft, ...boardArgs });
    for (const c of b.columns) expect(c.count, c.name).toBeGreaterThan(0);
    const args = { businessId: qft, from: 0, to: NOW * 2, sortKey: "closedOn", dir: "desc", page: 1, size: 10 } as const;
    expect((await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "won" })).total).toBeGreaterThan(0);
    expect((await admin.query(api.crm.pipeline.outcomes, { ...args, outcome: "lost" })).total).toBeGreaterThan(0);
    expect(b.columns.flatMap((c) => c.cards).some((c) => c.leadSource !== "No source")).toBe(true);
  });
});
