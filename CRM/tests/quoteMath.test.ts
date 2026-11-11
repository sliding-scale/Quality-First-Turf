import { describe, expect, it } from "vitest";
import { quoteTotals, type PricedLine } from "../../convex/crm/lib/quoteMath";

const line = (quantity: number, unitPriceCents: number, over: Partial<PricedLine> = {}): PricedLine => ({ quantity, unitPriceCents, optional: false, selected: true, ...over });

describe("quote totals", () => {
  it("adds the lines, rounding each line total to a whole cent (3 x $33.33)", () => {
    const t = quoteTotals([line(3, 3333), line(1, 100)], {}, 0);
    expect(t.subtotalCents).toBe(3 * 3333 + 100);
    expect(t.totalCents).toBe(10099);
  });

  it("leaves out an optional line that is not ticked, and text lines carry no money", () => {
    const t = quoteTotals([line(1, 10000), line(1, 5000, { optional: true, selected: false }), line(1, 99999, { kind: "text" })], {}, 0);
    expect(t.subtotalCents).toBe(10000);
  });

  it("takes a discount in dollars or in percent, and never goes below zero", () => {
    expect(quoteTotals([line(1, 10000)], { discountKind: "amount", discountValue: 2500 }, 0)).toMatchObject({ discountCents: 2500, totalCents: 7500 });
    expect(quoteTotals([line(1, 10000)], { discountKind: "percent", discountValue: 10 }, 0)).toMatchObject({ discountCents: 1000, totalCents: 9000 });
    expect(quoteTotals([line(1, 10000)], { discountKind: "amount", discountValue: 999999 }, 0)).toMatchObject({ discountCents: 10000, totalCents: 0 });
    expect(quoteTotals([line(1, 10000)], { discountKind: "percent", discountValue: 250 }, 0).totalCents).toBe(0);
  });

  it("puts tax on the discounted subtotal", () => {
    const t = quoteTotals([line(1, 10000)], { discountKind: "percent", discountValue: 10, taxPercent: 8.75 }, 0);
    expect(t.taxCents).toBe(Math.round(9000 * 0.0875));
    expect(t.totalCents).toBe(9000 + Math.round(9000 * 0.0875));
  });

  it("works out a deposit as a percent of the total or as a fixed amount, capped at the total", () => {
    expect(quoteTotals([line(1, 100000)], { depositKind: "percent", depositValue: 30 }, 0).depositCents).toBe(30000);
    expect(quoteTotals([line(1, 100000)], { depositKind: "amount", depositValue: 25000 }, 0).depositCents).toBe(25000);
    expect(quoteTotals([line(1, 100000)], { depositKind: "amount", depositValue: 900000 }, 0).depositCents).toBe(100000);
  });

  it("tracks what has been received and what is left of the deposit", () => {
    const t = quoteTotals([line(1, 100000)], { depositKind: "percent", depositValue: 30 }, 10000);
    expect(t).toMatchObject({ depositCents: 30000, depositCollectedCents: 10000, depositOutstandingCents: 20000 });
  });

  it("still takes the older call with a plain deposit percent", () => {
    expect(quoteTotals([line(1, 100000)], 25, 0).depositCents).toBe(25000);
  });
});
