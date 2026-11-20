/* Material takeoff rules (PRD 4.2): from a project's measurements and a material's formula, how much to order, and what the whole list needs.
   Pure TypeScript with no Convex or React imports. Money is whole cents. */

import { evaluateFormula } from "./formula";

/** The measurements a takeoff starts from, by the name a formula uses. All are numbers; a measurement not given is 0. */
export const TAKEOFF_INPUTS = [
  { key: "area", label: "Area", unit: "sq ft", group: "" },
  { key: "perimeter", label: "Perimeter", unit: "linear ft", group: "" },
  { key: "depth", label: "Depth", unit: "in", group: "" },
  { key: "length", label: "Length", unit: "ft", group: "" },
  { key: "width", label: "Width", unit: "ft", group: "" },
  { key: "height", label: "Height", unit: "ft", group: "" },
  { key: "quantity", label: "Quantity", unit: "each", group: "" },
  // The counts and lengths the client's irrigation and lighting calculators start from (D-107). They sit in their own groups on the Takeoff tab.
  { key: "valves", label: "Valves", unit: "each", group: "Irrigation" },
  { key: "plants", label: "Total plants", unit: "each", group: "Irrigation" },
  { key: "drip_line", label: "1/2 in. drip line", unit: "ft", group: "Irrigation" },
  { key: "drip_line_emitters", label: "Drip line with emitters built in", unit: "ft", group: "Irrigation" },
  { key: "soaker_hose", label: "1/2 in. soaker hose", unit: "ft", group: "Irrigation" },
  { key: "tree_rings", label: "Standard tree rings", unit: "each", group: "Irrigation" },
  { key: "large_tree_rings", label: "Large tree rings", unit: "each", group: "Irrigation" },
  { key: "lights", label: "Lights", unit: "each", group: "Lighting" },
  { key: "transformers", label: "Transformers", unit: "each", group: "Lighting" },
] as const;
export type InputKey = (typeof TAKEOFF_INPUTS)[number]["key"];
export type Inputs = Record<InputKey, number>;
export const emptyInputs = (): Inputs => Object.fromEntries(TAKEOFF_INPUTS.map((i) => [i.key, 0])) as Inputs;

/** How a worked-out quantity is made into what is ordered: up to a whole unit (rolls, bags), to the nearest whole unit, or kept to two decimals. */
export const ROUNDINGS = ["up", "nearest", "none"] as const;
export type Rounding = (typeof ROUNDINGS)[number];

export function applyRounding(x: number, rounding: Rounding): number {
  const r = rounding === "up" ? Math.ceil(x - 1e-9) : rounding === "nearest" ? Math.round(x) : Math.round(x * 100) / 100;
  return r === 0 ? 0 : r; // never -0 (ceil of a tiny negative)
}

export type Quantity = { ok: true; base: number; qty: number } | { ok: false; error: string };

/** What to order for one material: the formula's value, plus wastage, then rounded. `base` is the value before wastage and rounding. */
export function lineQuantity(a: { formula: string; wastagePercent: number; rounding: Rounding; inputs: Record<string, number> }): Quantity {
  const r = evaluateFormula(a.formula, a.inputs);
  if (!r.ok) return r;
  if (r.value < 0) return { ok: false, error: "The formula gives a negative quantity." };
  return { ok: true, base: r.value, qty: applyRounding(r.value * (1 + a.wastagePercent / 100), a.rounding) };
}

export type SummaryLine = { name: string; unit: string; qty: number; unitCostCents: number | null; supplier: string; leadTimeDays: number | null; inStock: number | null };

/** The material requirements summary: each supplier's lines with their cost, how much is short of stock, and how long the order takes. */
export function summarize(lines: SummaryLine[]) {
  const bySupplier = new Map<string, { supplier: string; lines: (SummaryLine & { toOrder: number; costCents: number | null })[]; costCents: number; leadTimeDays: number | null }>();
  let totalCents = 0;
  let longest: number | null = null;
  for (const l of lines) {
    const key = l.supplier.trim() || "No supplier yet";
    const toOrder = l.inStock === null ? l.qty : Math.max(0, Math.round((l.qty - l.inStock) * 100) / 100);
    const costCents = l.unitCostCents === null ? null : Math.round(toOrder * l.unitCostCents);
    let g = bySupplier.get(key);
    if (!g) { g = { supplier: key, lines: [], costCents: 0, leadTimeDays: null }; bySupplier.set(key, g); }
    g.lines.push({ ...l, toOrder, costCents });
    if (costCents !== null) { g.costCents += costCents; totalCents += costCents; }
    // A supplier's delivery waits for its slowest item; an item already in stock does not wait.
    if (toOrder > 0 && l.leadTimeDays !== null) {
      g.leadTimeDays = Math.max(g.leadTimeDays ?? 0, l.leadTimeDays);
      longest = Math.max(longest ?? 0, l.leadTimeDays);
    }
  }
  return { suppliers: [...bySupplier.values()].sort((a, b) => a.supplier.localeCompare(b.supplier)), totalCents, longestLeadTimeDays: longest, anyUnpriced: lines.some((l) => l.unitCostCents === null) };
}
