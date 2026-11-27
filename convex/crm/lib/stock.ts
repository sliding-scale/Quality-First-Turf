/* Stock in the yard (D-138). Every material is tracked: `inStock` is what is in the yard (none recorded yet counts as 0), not what was
   bought for one job.
   Jobs that are won and have not recorded what they used each claim what they still need from the yard (their takeoff quantity less what was
   ordered for them), earliest install first, so two jobs never count the same stock. Every change is written to `stockMovements`. */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { coverage } from "./purchaseOrders";

const round = (n: number) => Math.round(n * 100) / 100;
export const qtyOf = (l: Pick<Doc<"takeoffLines">, "qtyOverride" | "calcQty">) => l.qtyOverride ?? l.calcQty ?? 0;

export type Claim = { opportunityId: Id<"opportunities">; qty: number; start: number; won: number };
export const onHandOf = (m: Pick<Doc<"materials">, "inStock">) => m.inStock ?? 0;
const before = (a: Claim, b: Claim) => a.start - b.start || a.won - b.won || a.opportunityId.localeCompare(b.opportunityId);

/** A reader of claims that looks each project up once. */
export function claimReader(ctx: QueryCtx) {
  const jobs = new Map<Id<"opportunities">, Promise<{ start: number; won: number; orders: Doc<"purchaseOrders">[] } | null>>();
  const claims = new Map<Id<"materials">, Promise<Claim[]>>();

  async function load(id: Id<"opportunities">) {
    const p = await ctx.db.get(id);
    if (p === null || p.outcome !== "won" || p.archivedAt !== undefined || p.pipeline === "Sales") return null;
    const takeoff = await ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).unique();
    if (takeoff?.stockUsedAt !== undefined) return null;
    const pkg = await ctx.db.query("workPackages").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).unique();
    const orders = await ctx.db.query("purchaseOrders").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).take(300);
    return { start: pkg?.startDate ?? Number.MAX_SAFE_INTEGER, won: p.closedAt ?? p._creationTime, orders };
  }
  const job = (id: Id<"opportunities">) => {
    if (!jobs.has(id)) jobs.set(id, load(id));
    return jobs.get(id)!;
  };

  /** What a job still needs from the yard for one of its lines. */
  async function claimOf(line: Doc<"takeoffLines">): Promise<Claim | null> {
    const j = await job(line.opportunityId);
    if (!j) return null;
    const qty = round(Math.max(0, qtyOf(line) - orderedFor(line._id, j.orders)));
    return qty > 0 ? { opportunityId: line.opportunityId, qty, start: j.start, won: j.won } : null;
  }

  async function read(materialId: Id<"materials">): Promise<Claim[]> {
    const lines = await ctx.db.query("takeoffLines").withIndex("by_material", (q) => q.eq("materialId", materialId)).take(500);
    const out: Claim[] = [];
    for (const line of lines) {
      const claim = await claimOf(line);
      if (claim) out.push(claim);
    }
    return out.sort(before);
  }
  const of = (materialId: Id<"materials">) => {
    if (!claims.has(materialId)) claims.set(materialId, read(materialId));
    return claims.get(materialId)!;
  };
  return { of, job, claimOf };
}

/** How much of a takeoff line is on the way or has arrived. A draft order is not bought yet, so it counts for nothing here. */
export function orderedFor(lineId: Id<"takeoffLines">, orders: Doc<"purchaseOrders">[]) {
  const placed = orders.filter((o) => o.status === "ordered" || o.status === "delivered").map((o) => ({
    status: o.status, expectedDate: null, lines: o.lines.map((x) => ({ takeoffLineId: x.takeoffLineId ?? null, qty: x.qty })),
  }));
  return coverage(lineId, placed).covered;
}

/** Every claim of a business's jobs, by material. Read job by job, so a long list of materials costs nothing extra. */
export async function claimsByMaterial(ctx: QueryCtx, businessId: Id<"businesses">) {
  const reader = claimReader(ctx);
  const won = await ctx.db.query("opportunities").withIndex("by_business_and_jobNumber", (q) => q.eq("businessId", businessId).gt("jobNumber", 0)).order("desc").take(1000);
  const out = new Map<Id<"materials">, Claim[]>();
  for (const p of won) {
    if (!(await reader.job(p._id))) continue;
    for (const line of await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500)) {
      const claim = line.materialId ? await reader.claimOf(line) : null;
      if (claim) out.set(line.materialId!, [...(out.get(line.materialId!) ?? []), claim]);
    }
  }
  return out;
}

/** For each of a project's takeoff lines, how much of the yard's stock is free for it: what is in stock less what earlier jobs claim. null
 *  only for a line whose material was deleted. A project that has recorded what it used is covered. */
export async function freeStockFor(ctx: QueryCtx, opportunityId: Id<"opportunities">, lines: Doc<"takeoffLines">[]) {
  const reader = claimReader(ctx);
  const mine = await reader.job(opportunityId);
  const takeoff = await ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).unique();
  const done = takeoff?.stockUsedAt !== undefined;
  const out = new Map<Id<"takeoffLines">, { free: number | null; onHand: number | null }>();
  for (const l of lines) {
    const m = l.materialId ? await ctx.db.get(l.materialId) : null;
    const onHand = m ? onHandOf(m) : null;
    if (done) { out.set(l._id, { free: qtyOf(l), onHand }); continue; }
    if (!m || onHand === null) { out.set(l._id, { free: null, onHand: null }); continue; }
    const ahead = mine
      ? (await reader.of(m._id)).filter((c) => before(c, { opportunityId, qty: 0, start: mine.start, won: mine.won }) < 0).reduce((s, c) => s + c.qty, 0)
      : 0;
    out.set(l._id, { free: round(Math.max(0, onHand - ahead)), onHand });
  }
  return out;
}

export type StockReason = "count" | "delivery" | "used" | "bought";

/** Sets what is in stock for a material and writes the change down. A count also records when and by whom it was last checked. */
export async function setStock(
  ctx: MutationCtx,
  m: Doc<"materials">,
  to: number,
  a: { reason: StockReason; byName: string; now: number; note?: string; opportunityId?: Id<"opportunities">; purchaseOrderId?: Id<"purchaseOrders"> },
) {
  const after = round(Math.max(0, to));
  await ctx.db.patch(m._id, { inStock: after, updatedAt: a.now, ...(a.reason === "count" ? { stockCountedAt: a.now, stockCountedBy: a.byName } : {}) });
  await ctx.db.insert("stockMovements", {
    businessId: m.businessId, materialId: m._id, change: round(after - onHandOf(m)), after, reason: a.reason, byName: a.byName, at: a.now, note: a.note ?? "",
    ...(a.opportunityId ? { opportunityId: a.opportunityId } : {}), ...(a.purchaseOrderId ? { purchaseOrderId: a.purchaseOrderId } : {}),
  });
}
