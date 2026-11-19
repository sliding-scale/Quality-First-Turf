/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { budgetLineProblem, budgetTotalCents, expiryFrom, lineTotalCents, linkDaysProblem, shareState } from "../../convex/crm/lib/workPackage";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;
type World = Awaited<ReturnType<typeof seeded>>;

describe("work package rules", () => {
  it("prices lines to the cent and totals them", () => {
    expect(lineTotalCents({ quantity: 2.5, rateCents: 4533 })).toBe(11333);
    expect(budgetTotalCents([{ quantity: 8, rateCents: 5000 }, { quantity: 0.5, rateCents: 3333 }])).toBe(40000 + 1667);
    expect(budgetTotalCents([])).toBe(0);
  });
  it("refuses bad budget lines", () => {
    const ok = { description: "Install", quantity: 8, unit: "hr", rateCents: 5000 };
    expect(budgetLineProblem(ok)).toBeNull();
    expect(budgetLineProblem({ ...ok, description: " " })).toMatch(/description/);
    expect(budgetLineProblem({ ...ok, quantity: -1 })).toMatch(/quantity/);
    expect(budgetLineProblem({ ...ok, quantity: NaN })).toMatch(/quantity/);
    expect(budgetLineProblem({ ...ok, rateCents: 10.5 })).toMatch(/rate/);
  });
  it("knows when a link is none, live or expired", () => {
    expect(shareState({}, NOW)).toBe("none");
    expect(shareState({ shareToken: "x", shareExpiresAt: NOW + 1 }, NOW)).toBe("live");
    expect(shareState({ shareToken: "x", shareExpiresAt: NOW }, NOW)).toBe("expired");
    expect(shareState({ shareToken: "x" }, NOW)).toBe("live");
    expect(expiryFrom(NOW, 14)).toBe(NOW + 14 * DAY);
    expect(linkDaysProblem(0)).not.toBeNull();
    expect(linkDaysProblem(91)).not.toBeNull();
    expect(linkDaysProblem(1.5)).not.toBeNull();
    expect(linkDaysProblem(14)).toBeNull();
  });
});

const wonProject = (w: World, over: Record<string, unknown> = {}) =>
  w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "WP-1", title: "Back yard", pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: "WP-1", outcome: "won", jobNumber: 1, closedAt: 1, ...over }),
  );
const pkg = (id: Id<"opportunities">, over: Record<string, unknown> = {}) => ({
  id, scope: "Lay turf", scheduleNotes: "", siteAccess: "Gate code 1234", customerAvailability: "", installerNotes: "", includeMaterials: true, fileIds: [] as Id<"opportunityFiles">[],
  budgetLines: [{ description: "Install", quantity: 8, unit: "hr", rateCents: 5000 }], now: NOW, ...over,
});
async function blindPm(w: World) {
  const blind = await signedInAs(w.base, { key: "blind", roles: ["pm"], businessIds: [w.qft], name: "Blind" });
  await w.base.run(async (ctx) => {
    const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Blind")!;
    await ctx.db.patch(u._id, { permissions: { prices: "none" } });
  });
  return blind;
}

describe("Installer work packages (PRD 4.3, plan 2026-11-20-work-packages)", () => {
  it("saves and reads back a package, with the budget total", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await w.pm.mutation(api.crm.workPackages.save, pkg(id));
    const got = await w.pm.query(api.crm.workPackages.get, { id });
    expect(got).toMatchObject({ saved: true, scope: "Lay turf", siteAccess: "Gate code 1234", budgetTotalCents: 40000, canSeeBudget: true });
  });

  it("has no package for a project that is not Closed Won", async () => {
    const w = await seeded();
    const id = await wonProject(w, { outcome: undefined });
    expect(await w.pm.query(api.crm.workPackages.get, { id })).toBeNull();
    await expect(w.pm.mutation(api.crm.workPackages.save, pkg(id))).rejects.toThrow(/Closed Won/);
  });

  it("refuses an end date before the start, and a bad budget line", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await expect(w.pm.mutation(api.crm.workPackages.save, pkg(id, { startDate: NOW + DAY, endDate: NOW }))).rejects.toThrow(/end date is before/);
    await expect(w.pm.mutation(api.crm.workPackages.save, pkg(id, { budgetLines: [{ description: "", quantity: 1, unit: "", rateCents: 1 }] }))).rejects.toThrow(/description/);
  });

  it("is looked at by Sales and changed by Preplanning people only", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await w.pm.mutation(api.crm.workPackages.save, pkg(id));
    await expect(w.sales.mutation(api.crm.workPackages.save, pkg(id))).rejects.toThrow(/can view this but not change it/);
    expect((await w.sales.query(api.crm.workPackages.get, { id }))?.scope).toBe("Lay turf");
  });

  it("hides the budget from someone without price access and leaves it unchanged when they save", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await w.pm.mutation(api.crm.workPackages.save, pkg(id));
    const blind = await blindPm(w);
    expect((await blind.query(api.crm.workPackages.get, { id }))).toMatchObject({ budgetLines: [], canSeeBudget: false, budgetTotalCents: 0 });
    await blind.mutation(api.crm.workPackages.save, pkg(id, { scope: "Changed", budgetLines: [] }));
    const after = await w.pm.query(api.crm.workPackages.get, { id });
    expect(after).toMatchObject({ scope: "Changed", budgetTotalCents: 40000 });
  });

  it("refuses a file from another project", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    const other = await wonProject(w, { code: "WP-2", searchText: "WP-2", jobNumber: 2 });
    const fileId = await w.base.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      return ctx.db.insert("opportunityFiles", { businessId: w.qft, opportunityId: other, storageId, name: "plan.png", contentType: "image/png", size: 1, kind: "plan", uploadedByName: "x", createdAt: 1 });
    });
    await expect(w.pm.mutation(api.crm.workPackages.save, pkg(id, { fileIds: [fileId] }))).rejects.toThrow(/not on this project/);
  });

  it("shares by a secret link that shows the installer's page, with no customer prices, and stops when revoked, replaced or expired", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await expect(w.pm.mutation(api.crm.workPackages.share, { id, days: 14, now: NOW })).rejects.toThrow(/Save the work package first/);
    const fileId = await w.base.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      return ctx.db.insert("opportunityFiles", { businessId: w.qft, opportunityId: id, storageId, name: "plan.png", contentType: "image/png", size: 1, kind: "plan", uploadedByName: "x", createdAt: 1 });
    });
    await w.pm.mutation(api.crm.workPackages.save, pkg(id, { fileIds: [fileId] }));
    await expect(w.pm.mutation(api.crm.workPackages.share, { id, days: 0, now: NOW })).rejects.toThrow(/1 to 90 days/);
    const { token } = await w.pm.mutation(api.crm.workPackages.share, { id, days: 14, now: Date.now() });
    expect(token).toHaveLength(64);
    const page = await w.base.query(api.crm.clientWorkPackage.get, { token });
    expect(page).toMatchObject({ title: "Back yard", scope: "Lay turf", siteAccess: "Gate code 1234", budgetTotalCents: 40000 });
    expect(page?.files.map((f) => f.name)).toEqual(["plan.png"]);
    expect(JSON.stringify(page)).not.toMatch(/email|costCents|unitCost/i);
    // Replaced: the old link dies.
    const second = await w.pm.mutation(api.crm.workPackages.share, { id, days: 14, now: Date.now() });
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token })).toBeNull();
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token: second.token })).not.toBeNull();
    // A short or made-up token shows nothing.
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token: "short" })).toBeNull();
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token: "z".repeat(64) })).toBeNull();
    // Revoked.
    await w.pm.mutation(api.crm.workPackages.revoke, { id });
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token: second.token })).toBeNull();
    // Expired: a link made in the past.
    const old = await w.pm.mutation(api.crm.workPackages.share, { id, days: 1, now: Date.now() - 3 * DAY });
    expect(await w.base.query(api.crm.clientWorkPackage.get, { token: old.token })).toBeNull();
    expect((await w.pm.query(api.crm.workPackages.get, { id }))?.share).toMatchObject({ state: "expired", token: null });
  });

  it("skips a file deleted from the project, and leaves the materials out when asked", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    const fileId = await w.base.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      return ctx.db.insert("opportunityFiles", { businessId: w.qft, opportunityId: id, storageId, name: "gone.png", contentType: "image/png", size: 1, kind: "photo", uploadedByName: "x", createdAt: 1 });
    });
    await w.base.run((ctx) => ctx.db.insert("takeoffLines", { businessId: w.qft, opportunityId: id, position: 0, name: "Turf roll", sku: "", unit: "roll", formula: "1", wastagePercent: 0, rounding: "up", calcQty: 3, supplier: "", notes: "" }));
    await w.pm.mutation(api.crm.workPackages.save, pkg(id, { fileIds: [fileId] }));
    const { token } = await w.pm.mutation(api.crm.workPackages.share, { id, days: 5, now: Date.now() });
    expect((await w.base.query(api.crm.clientWorkPackage.get, { token }))?.materials).toEqual([{ name: "Turf roll", unit: "roll", qty: 3 }]);
    await w.base.run((ctx) => ctx.db.delete(fileId));
    expect((await w.base.query(api.crm.clientWorkPackage.get, { token }))?.files).toEqual([]);
    expect((await w.pm.query(api.crm.workPackages.get, { id }))?.fileIds).toEqual([]);
    await w.pm.mutation(api.crm.workPackages.save, pkg(id, { includeMaterials: false }));
    expect((await w.base.query(api.crm.clientWorkPackage.get, { token }))?.materials).toEqual([]);
  });

  it("keeps a crew's agreed rate and availability, and hides the rate from someone without price access", async () => {
    const w = await seeded();
    const crewId = await w.pm.mutation(api.crm.construction.saveCrew, { businessId: w.qft, name: "Alpha", leadName: "Sam", phone: "", notes: "", active: true, availability: "Mon to Fri", rateCents: 6500, now: NOW });
    const blind = await blindPm(w);
    expect((await blind.query(api.crm.construction.crews, { businessId: w.qft }))[0]).toMatchObject({ rateCents: null, availability: "Mon to Fri", canSeeRates: false });
    await blind.mutation(api.crm.construction.saveCrew, { id: crewId, businessId: w.qft, name: "Alpha", leadName: "Sam", phone: "", notes: "", active: true, availability: "Weekdays", rateCents: 1, now: NOW });
    expect((await w.pm.query(api.crm.construction.crews, { businessId: w.qft }))[0]).toMatchObject({ rateCents: 6500, availability: "Weekdays" });
    await expect(w.pm.mutation(api.crm.construction.saveCrew, { id: crewId, businessId: w.qft, name: "Alpha", leadName: "", phone: "", notes: "", active: true, rateCents: -5, now: NOW })).rejects.toThrow(/rate/);
  });
});
