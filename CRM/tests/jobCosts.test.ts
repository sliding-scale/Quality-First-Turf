import { describe, expect, it } from "vitest";
import { laborCostCents, lineCostCents, minutesBetween, profitOf } from "../../convex/crm/lib/jobCosts";

const H = 3_600_000;

describe("A job's cost rules (plan 2026-11-19-jobs-costs)", () => {
  it("counts whole minutes between a start and an end, and none when the end is not after the start", () => {
    expect(minutesBetween(9 * H, 17 * H)).toBe(480);
    expect(minutesBetween(9 * H, 9 * H + 90_000)).toBe(2); // 1.5 minutes rounds to the nearest minute
    expect(minutesBetween(9 * H, 9 * H)).toBe(0);
    expect(minutesBetween(17 * H, 9 * H)).toBe(0);
  });

  it("costs labor by the minute", () => {
    expect(laborCostCents(90, 2500)).toBe(3750);
    expect(laborCostCents(480, 1999)).toBe(15992);
    expect(laborCostCents(0, 2500)).toBe(0);
  });

  it("costs a line by its quantity, or nothing known when the item has no cost", () => {
    expect(lineCostCents(2, 380)).toBe(760);
    expect(lineCostCents(1.5, 1000)).toBe(1500);
    expect(lineCostCents(2, null)).toBeNull();
  });

  it("works profit out from revenue and cost, with no percent when there was no revenue", () => {
    expect(profitOf(100000, 0)).toEqual({ cents: 100000, percent: 100 });
    expect(profitOf(100000, 25000)).toEqual({ cents: 75000, percent: 75 });
    expect(profitOf(0, 500)).toEqual({ cents: -500, percent: null });
    expect(profitOf(3, 1)).toEqual({ cents: 2, percent: 66.7 });
  });
});
