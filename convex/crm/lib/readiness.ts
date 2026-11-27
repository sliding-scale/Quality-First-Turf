/* What a project is still short of, for the warning on the way into Construction (D-136, PRD 4.4). */

import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { readinessOf } from "./purchaseOrders";

/** The materials not yet in stock or delivered, or null when there is nothing to warn about (all ready, or no takeoff to judge by). */
export async function materialsShortfall(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const lines = await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(500);
  if (lines.length === 0) return null;
  const orders = await ctx.db.query("purchaseOrders").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(200);
  const r = readinessOf(
    lines.map((l) => ({ id: l._id as string, qty: l.qtyOverride ?? l.calcQty ?? 0, inStock: l.inStock ?? null })),
    orders.map((o) => ({ status: o.status, expectedDate: o.expectedDate ?? null, lines: o.lines.map((x) => ({ takeoffLineId: x.takeoffLineId ?? null, qty: x.qty })) })),
  );
  if (r.ready) return null;
  const named = (state: "open" | "ordered") => lines.filter((_, i) => r.lines[i].state === state).map((l) => l.name);
  return { notOrdered: named("open"), onTheWay: named("ordered"), latestExpected: r.latestExpected };
}
