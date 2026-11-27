/* What a project is still short of, for the warning on the way into Construction (D-136, PRD 4.4). */

import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { readinessOf } from "./purchaseOrders";
import { freeStockFor, qtyOf } from "./stock";

/** The materials not yet in stock or delivered, or null when there is nothing to warn about (all ready, or no takeoff to judge by). A takeoff
 *  with no quantities at all is warned about too: nothing on it can be judged. */
export async function materialsShortfall(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const lines = await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(500);
  if (lines.length === 0) return null;
  const orders = await ctx.db.query("purchaseOrders").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(300);
  const stock = await freeStockFor(ctx, opportunityId, lines);
  const r = readinessOf(
    lines.map((l) => ({ id: l._id as string, qty: qtyOf(l), inStock: stock.get(l._id)!.free })),
    orders.map((o) => ({ status: o.status, expectedDate: o.expectedDate ?? null, lines: o.lines.map((x) => ({ takeoffLineId: x.takeoffLineId ?? null, qty: x.qty })) })),
  );
  const named = (state: "open" | "ordered" | "none") => lines.filter((_, i) => r.lines[i].state === state).map((l) => l.name);
  const noQuantity = r.lines.every((l) => l.state === "none") ? named("none") : [];
  if (r.open === 0 && r.onTheWay === 0 && noQuantity.length === 0) return null;
  return { notOrdered: named("open"), onTheWay: named("ordered"), noQuantity, latestExpected: r.latestExpected };
}
