import { describe, expect, it } from "vitest";
import { balanceOf, derivedStatus, dueDateFor, invoiceTotals, splitSchedule } from "../../convex/crm/lib/invoiceMath";
import { quoteTotals } from "../../convex/crm/lib/quoteMath";
import { CONSTRUCTION_STAGES, FINANCE_ENTRY, FINANCE_STAGES, isWorkStage, stagesOf, WORK_PIPELINES } from "../../convex/crm/lib/stages";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 18); // 18 Nov 2026

describe("splitSchedule", () => {
  it("splits three rows so the last takes the rounding remainder and the sum stays exact", () => {
    const { amounts, remainingCents } = splitSchedule(10_000, [
      { kind: "percent", value: 33.33 }, { kind: "percent", value: 33.33 }, { kind: "percent", value: 33.34 },
    ]);
    expect(amounts).toEqual([3333, 3333, 3334]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(remainingCents).toBe(0);
  });

  it("takes the remainder on the last row when percents add to 100 and rounding would leave a cent", () => {
    const { amounts } = splitSchedule(10_001, [{ kind: "percent", value: 50 }, { kind: "percent", value: 50 }]);
    expect(amounts).toEqual([5001, 5000]); // 50% of 10,001 rounds to 5001; the last row is what is left
    expect(amounts[0] + amounts[1]).toBe(10_001);
  });

  it("handles dollar rows and reports what is left", () => {
    const { amounts, remainingCents } = splitSchedule(100_000, [{ kind: "amount", value: 30_000 }, { kind: "percent", value: 20 }]);
    expect(amounts).toEqual([30_000, 20_000]);
    expect(remainingCents).toBe(50_000);
  });

  it("never lets rows add up to more than the total", () => {
    const { amounts, remainingCents } = splitSchedule(10_000, [{ kind: "amount", value: 9_000 }, { kind: "amount", value: 9_000 }]);
    expect(amounts).toEqual([9_000, 1_000]);
    expect(remainingCents).toBe(0);
  });

  it("copes with a zero total and with no rows", () => {
    expect(splitSchedule(0, [{ kind: "percent", value: 30 }]).amounts).toEqual([0]);
    expect(splitSchedule(5_000, [])).toEqual({ amounts: [], remainingCents: 5_000 });
  });
});

describe("invoiceTotals", () => {
  it("takes the discount before tax, exactly as a quote does", () => {
    const lines = [{ quantity: 2, unitPriceCents: 50_000 }];
    const opts = { discountKind: "percent" as const, discountValue: 10, taxPercent: 8.75 };
    const mine = invoiceTotals(lines, opts);
    const theirs = quoteTotals([{ quantity: 2, unitPriceCents: 50_000, optional: false, selected: true }], { ...opts }, 0);
    expect(mine).toEqual({ subtotalCents: theirs.subtotalCents, discountCents: theirs.discountCents, taxCents: theirs.taxCents, totalCents: theirs.totalCents });
  });

  it("bills only a line's share when it carries a due amount", () => {
    const t = invoiceTotals([{ quantity: 1, unitPriceCents: 100_000, dueCents: 30_000 }], {});
    expect(t).toMatchObject({ subtotalCents: 30_000, totalCents: 30_000 });
  });
});

describe("dates, balances and status", () => {
  it("works out due dates", () => {
    expect(dueDateFor(T0, "due_on_receipt")).toBe(T0);
    expect(dueDateFor(T0, "net_30")).toBe(T0 + 30 * DAY);
    expect(dueDateFor(T0, "end_of_month")).toBe(Date.UTC(2026, 10, 30));
    expect(dueDateFor(T0, "custom", T0 + 5 * DAY)).toBe(T0 + 5 * DAY);
  });

  it("never lets a balance go below zero", () => {
    expect(balanceOf(30_000, 10_000)).toBe(20_000);
    expect(balanceOf(30_000, 40_000)).toBe(0);
  });

  it("derives past due, awaiting and paid from the stored status", () => {
    expect(derivedStatus("Draft", undefined, 30_000, T0)).toBe("Draft");
    expect(derivedStatus("Sent", T0 + DAY, 30_000, T0)).toBe("Awaiting payment");
    expect(derivedStatus("Sent", T0 - DAY, 30_000, T0)).toBe("Past due");
    expect(derivedStatus("Sent", T0 - DAY, 0, T0)).toBe("Paid");
    expect(derivedStatus("Void", T0 - DAY, 30_000, T0)).toBe("Void");
    expect(derivedStatus("Bad debt", T0 - DAY, 30_000, T0)).toBe("Bad debt");
  });
});

describe("Finance stages", () => {
  it("are the PRD's six, verbatim, and join the other work pipelines", () => {
    expect(FINANCE_STAGES).toEqual(["Send Final Invoice", "Pending Final Payment", "Final Payment Received", "Get Client Review", "Consolidate Files", "Archive"]);
    expect(FINANCE_ENTRY).toBe("Send Final Invoice");
    expect(WORK_PIPELINES).toContain("Finance");
    expect(stagesOf("Finance")).toBe(FINANCE_STAGES);
    expect(isWorkStage("Archive")).toBe(true);
    expect(isWorkStage(CONSTRUCTION_STAGES[0])).toBe(true);
  });
});
