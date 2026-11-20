import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaInputs, formulaProblem } from "../../convex/crm/lib/formula";
import { applyRounding, emptyInputs, lineQuantity, summarize } from "../../convex/crm/lib/takeoff";

const ok = (src: string, vars: Record<string, number> = {}) => {
  const r = evaluateFormula(src, vars);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const bad = (src: string, vars: Record<string, number> = {}) => {
  const r = evaluateFormula(src, vars);
  return r.ok ? null : r.error;
};

describe("The formula evaluator (CRM rule 8: formulas are data, never eval)", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(ok("2 + 3 * 4")).toBe(14);
    expect(ok("(2 + 3) * 4")).toBe(20);
    expect(ok("10 - 4 - 3")).toBe(3);
    expect(ok("100 / 5 / 2")).toBe(10);
    expect(ok("-2 + 5")).toBe(3);
    expect(ok("2 ^ 3 ^ 2")).toBe(512); // right to left
    expect(ok("-2 ^ 2")).toBe(4); // unary minus binds tighter than ^ in this grammar, so it is (-2) ^ 2
  });

  it("uses the inputs and the functions", () => {
    expect(ok("area / 100", { area: 450 })).toBe(4.5);
    expect(ok("ceil(area / 100)", { area: 450 })).toBe(5);
    expect(ok("floor(2.9) + round(2.5) + abs(-1)")).toBe(2 + 3 + 1);
    expect(ok("sqrt(area)", { area: 144 })).toBe(12);
    expect(ok("max(area, 500) - min(depth, 2)", { area: 450, depth: 3 })).toBe(498);
    expect(ok("perimeter * depth / 12 / 27", { perimeter: 100, depth: 4 })).toBeCloseTo(1.2346, 4);
    expect(ok("ceil(0.1 + 0.2 + 0.7)")).toBe(1); // no floating-point surprise at a whole number
  });

  it("explains what it cannot read, without throwing", () => {
    expect(bad("")).toMatch(/empty/);
    expect(bad("2 +")).toMatch(/ends too soon/);
    expect(bad("2 $ 3")).toMatch(/not allowed/);
    expect(bad("(2 + 3")).toMatch(/Expected "\)"/);
    expect(bad("2 3")).toMatch(/Unexpected "3"/);
    expect(bad("foo(2)")).toMatch(/not a function/);
    expect(bad("ceil")).toMatch(/is a function/);
    expect(bad("ceil(1, 2)")).toMatch(/takes 1 value/);
    expect(bad("min(1)")).toMatch(/takes 2 to 8/);
    expect(bad("area + 1")).toMatch(/Unknown input "area"/);
    expect(bad("1 / 0")).toMatch(/divides by zero/);
    expect(bad("sqrt(-1)")).toMatch(/not give a number/);
    expect(bad("9 ^ 9 ^ 9 ^ 9")).toMatch(/not give a number/);
  });

  it("is not code: nothing that looks like JavaScript runs", () => {
    for (const evil of ["process.exit()", "constructor.constructor('return 1')()", "globalThis", "1; 2", "a = 1", "`x`", "x => 1", "[1]", "'a'"]) expect(evaluateFormula(evil, { x: 1, a: 1 }).ok).toBe(false);
  });

  it("stops a formula that is too long or nested too deep", () => {
    expect(bad("1+".repeat(300) + "1")).toMatch(/up to 500 characters/);
    expect(bad("(".repeat(100) + "1" + ")".repeat(100))).toMatch(/nested too deeply/);
  });

  it("lists the inputs a formula uses, and finds a syntax problem without needing values", () => {
    expect(formulaInputs("ceil(area / 100) + perimeter * area")).toEqual(["area", "perimeter"]);
    expect(formulaInputs("2 +")).toEqual([]);
    expect(formulaProblem("ceil(area / 100)")).toBeNull();
    expect(formulaProblem("ceil(area /")).toMatch(/ends too soon/);
  });
});

describe("Takeoff quantities (PRD 4.2)", () => {
  const inputs = { ...emptyInputs(), area: 1250, perimeter: 150, depth: 3 };
  it("adds wastage and rounds up to whole rolls", () => {
    // 1250 sq ft in 15 ft wide, 100 ft long rolls (1500 sq ft each): 0.83 rolls, plus 10% wastage, is 1 roll
    expect(lineQuantity({ formula: "area / 1500", wastagePercent: 10, rounding: "up", inputs })).toEqual({ ok: true, base: 1250 / 1500, qty: 1 });
    // infill at 1.5 lb per sq ft in 50 lb bags, 5% wastage: 1250 * 1.5 / 50 = 37.5, plus 5% = 39.375, 40 bags
    expect(lineQuantity({ formula: "area * 1.5 / 50", wastagePercent: 5, rounding: "up", inputs })).toMatchObject({ ok: true, qty: 40 });
  });
  it("rounds the other ways, and does not round up a whole number that floating point made 0.0000001 over", () => {
    expect(applyRounding(2.4, "nearest")).toBe(2);
    expect(applyRounding(2.456, "none")).toBe(2.46);
    expect(applyRounding(3.0000000001, "up")).toBe(3);
    expect(Object.is(applyRounding(0, "up"), 0)).toBe(true); // 0, not -0
  });
  it("reports a formula that cannot be worked out, or that goes negative", () => {
    expect(lineQuantity({ formula: "area / ", wastagePercent: 0, rounding: "up", inputs })).toMatchObject({ ok: false });
    expect(lineQuantity({ formula: "length - 5", wastagePercent: 0, rounding: "up", inputs })).toEqual({ ok: false, error: "The formula gives a negative quantity." });
  });
  it("starts every input at zero: the seven standard ones, then the irrigation and lighting counts (D-107)", () => {
    expect(Object.values(emptyInputs()).every((v) => v === 0)).toBe(true);
    expect(Object.keys(emptyInputs())).toEqual([
      "area", "perimeter", "depth", "length", "width", "height", "quantity",
      "valves", "plants", "drip_line", "drip_line_emitters", "soaker_hose", "tree_rings", "large_tree_rings", "lights", "transformers",
    ]);
  });
});

describe("The material requirements summary", () => {
  const lines = [
    { name: "Turf roll", unit: "roll", qty: 4, unitCostCents: 120000, supplier: "TurfCo", leadTimeDays: 10, inStock: 1 },
    { name: "Infill bag", unit: "bag", qty: 40, unitCostCents: 1500, supplier: "TurfCo", leadTimeDays: 3, inStock: null },
    { name: "Road base", unit: "ton", qty: 6, unitCostCents: 3000, supplier: "", leadTimeDays: null, inStock: 10 },
    { name: "Nails", unit: "box", qty: 2, unitCostCents: null, supplier: "Hardware", leadTimeDays: 2, inStock: 0 },
  ];
  const s = summarize(lines);
  it("groups by supplier, takes stock off what must be ordered, and prices only what is to order", () => {
    expect(s.suppliers.map((g) => g.supplier)).toEqual(["Hardware", "No supplier yet", "TurfCo"]);
    const turfco = s.suppliers.find((g) => g.supplier === "TurfCo")!;
    expect(turfco.lines.map((l) => [l.name, l.toOrder, l.costCents])).toEqual([["Turf roll", 3, 360000], ["Infill bag", 40, 60000]]);
    expect(turfco.costCents).toBe(420000);
    expect(s.suppliers.find((g) => g.supplier === "No supplier yet")!.lines[0]).toMatchObject({ toOrder: 0, costCents: 0 });
  });
  it("waits on the slowest item that is actually ordered, and says when something has no price", () => {
    expect(s.suppliers.find((g) => g.supplier === "TurfCo")!.leadTimeDays).toBe(10);
    expect(s.suppliers.find((g) => g.supplier === "No supplier yet")!.leadTimeDays).toBeNull(); // all in stock
    expect(s.longestLeadTimeDays).toBe(10);
    expect(s.totalCents).toBe(420000);
    expect(s.anyUnpriced).toBe(true);
  });
});
