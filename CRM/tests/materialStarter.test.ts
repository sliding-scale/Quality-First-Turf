import { describe, expect, it } from "vitest";
import { formulaInputs, formulaProblem } from "../../convex/crm/lib/formula";
import { STARTER_KITS, STARTER_MATERIALS } from "../../convex/crm/lib/materialStarter";
import { emptyInputs, lineQuantity } from "../../convex/crm/lib/takeoff";

const material = (name: string) => {
  const m = STARTER_MATERIALS.find((x) => x.name === name);
  if (!m) throw new Error(`No starter material "${name}"`);
  return m;
};
const qty = (name: string, inputs: Record<string, number>) => {
  const m = material(name);
  const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs: { ...emptyInputs(), ...inputs } });
  if (!r.ok) throw new Error(r.error);
  return r.qty;
};

describe("The client's material calculator, loaded as starter materials and kits (D-104)", () => {
  it("has names that are unique, and every formula reads and uses only known measurements", () => {
    const keys = STARTER_MATERIALS.map((m) => m.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    const known = new Set(Object.keys(emptyInputs()));
    for (const m of STARTER_MATERIALS) {
      expect(formulaProblem(m.formula), m.name).toBeNull();
      for (const i of formulaInputs(m.formula)) expect(known.has(i), `${m.name} uses ${i}`).toBe(true);
      expect(m.unit.trim(), m.name).not.toBe("");
    }
  });

  it("has kits that are unique, non-empty, and only list materials that exist, once each", () => {
    const names = STARTER_KITS.map((k) => k.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const have = new Set(STARTER_MATERIALS.map((m) => m.name));
    for (const k of STARTER_KITS) {
      expect(k.items.length, k.name).toBeGreaterThan(0);
      expect(new Set(k.items).size, k.name).toBe(k.items.length);
      for (const i of k.items) expect(have.has(i), `${k.name} lists ${i}`).toBe(true);
    }
    // Every material is in some kit (nothing was loaded that nothing uses).
    const used = new Set(STARTER_KITS.flatMap((k) => k.items));
    for (const m of STARTER_MATERIALS) expect(used.has(m.name), m.name).toBe(true);
  });

  it("works out the standard install for 1,000 sq ft the way the spreadsheet's formulas do", () => {
    const a = { area: 1000 };
    expect(qty("Artificial Grass Roll", a)).toBe(77); // ROUNDUP(1000*1.15/15)
    expect(qty("2 in. Class 2 Road Base", a)).toBe(7); // CEILING(1000*0.0067, 0.5)
    expect(qty("5 in. 4D Nails non galvanized", a)).toBe(2); // ROUNDUP(1000*0.002)
    expect(qty("6 in. Sod Staple Flat Top", a)).toBe(4); // ROUNDUP(1000*0.33/100)
    expect(qty("Site pro pre emergent", a)).toBe(1);
    expect(qty("#16 OR #20 Silica Infill", a)).toBe(30);
  });

  it("matches the spreadsheet's own worked values for 1 sq ft glued over concrete and 100 ft of 3/4 in. waterline", () => {
    expect(qty("2 in. Class 2 Road Base", { area: 1 })).toBe(0.5);
    expect(qty("#16 OR #20 Silica Infill (glued over concrete)", { area: 1 })).toBe(1);
    expect(qty("Seaming Tape", { area: 1 })).toBe(1);
    expect(qty("Adhesive / Glue (for seams)", { area: 1 })).toBe(1);
    const l = { length: 100 };
    expect(qty("3/4 in. x 20 ft Sch. 40 Bell End PVC Pipe", l)).toBe(100);
    expect(qty("3/4 in. Couplings", l)).toBe(10);
    expect(qty("Christys Red Hot Glue", l)).toBe(8);
    expect(qty("Bedding sand", l)).toBe(4);
  });

  it("rounds pipe to the next 10 ft and gopher wire to whole 100 ft x 4 ft rolls", () => {
    expect(qty("PVC Sewer and Drain Pipe 3 in. SDR-35 Bell End", { length: 43 })).toBe(50);
    expect(qty("PVC Sewer and Drain Pipe 3 in. SDR-35 Bell End", { length: 40 })).toBe(40);
    expect(qty("Gopher Wire 4 ft x 100 ft", { area: 801 })).toBe(3);
    expect(qty("Gopher Wire 4 ft x 100 ft", { area: 800 })).toBe(2);
  });

  it("works out a turf strip from its length and width in feet", () => {
    // 230 ft of strip 0.5 ft (6 in.) wide is 115 sq ft: nails 115 * 0.002 = 0.23 box, so 1.
    expect(qty("Turf Strips", { length: 230, width: 0.5 })).toBe(230);
    expect(qty("6 in. finishing 4D nails non galvanized", { length: 230, width: 0.5 })).toBe(1);
    expect(qty("#16 OR #20 Silica Infill (strips)", { length: 230, width: 0.5 })).toBe(5); // 115 * 2 / 50 = 4.6
  });

  it("works out the demo's dirt to haul away in cubic yards from length x width x depth (inches)", () => {
    // 20 ft x 10 ft x 6 in. = 100 cubic ft = 3.7037 cubic yards.
    expect(qty("Dirt to haul away (demo)", { length: 20, width: 10, depth: 6 })).toBe(3.7);
    expect(qty("Dirt to haul away (demo)", { length: 27, width: 12, depth: 12 })).toBe(12);
    expect(qty("Dirt to haul away (demo)", { length: 20, width: 10, depth: 0 })).toBe(0);
  });
});
