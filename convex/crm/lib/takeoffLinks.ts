/* Filling a takeoff from a quote (D-137). A quote lists services ("10.01 RP - AG Standard Install - Malibu [300 - 699 SF]"), not materials, so
   each service is linked once to the material kits it needs, and to the measurement its quoted quantity is. Pure TypeScript. */

export const LINK_MEASURES = ["area", "perimeter", "length", "quantity", "none"] as const;
export type LinkMeasure = (typeof LINK_MEASURES)[number];
export const LINK_MEASURE_LABEL: Record<LinkMeasure, string> = { area: "Square feet (area)", perimeter: "Linear feet (perimeter)", length: "Length in feet", quantity: "A count (quantity)", none: "Not a measurement" };

/** The service a price list name stands for: without its code in front ("10.01 RP - ") and its size band behind ("[300 - 699 SF]"). */
export const serviceOf = (name: string): string =>
  name.replace(/^\s*\d+(\.\d+)*\s*([A-Z]{2})?\s*-\s*/i, "").replace(/\s*\[[^\]]*\]\s*$/, "").trim().replace(/\s+/g, " ");

export const serviceKey = (service: string): string => service.trim().toLowerCase();

/** Installations that differ only by the product ("AG Standard Install - Malibu", "- Pasadena") need the same materials, so one that has no
 *  link of its own takes the link of "AG Standard Install". null for any other service. */
export function sharedService(service: string): string | null {
  const base = service.split(" - ")[0].trim();
  return base !== service && /install$/i.test(base) ? base : null;
}

/** What the quoted quantity most likely measures, from the price list name. The person confirms or changes it. */
export function suggestMeasure(name: string): LinkMeasure {
  if (/\bSF\b|sq\.?\s*ft/i.test(name)) return "area";
  if (/\bLF\b|linear/i.test(name)) return "perimeter";
  return "none";
}

export type FillLine = { quantity: number; kitMaterials: string[][]; measure: LinkMeasure };

/** From the linked quote lines: each measurement's total, and for each material the amounts of the services whose kits include it, so a
 *  material used by the turf (500 sq ft) and not by the rock (100 sq ft) is worked out from 500. Materials keep the order they appear in. */
export function planFill(lines: FillLine[]) {
  const totals = new Map<string, number>();
  const needs = new Map<string, Map<string, number>>();
  for (const l of lines) {
    if (l.measure !== "none") totals.set(l.measure, (totals.get(l.measure) ?? 0) + l.quantity);
    // A material in two kits of the same line is needed once for that line.
    for (const id of new Set(l.kitMaterials.flat())) {
      const mine = needs.get(id) ?? new Map<string, number>();
      if (l.measure !== "none") mine.set(l.measure, (mine.get(l.measure) ?? 0) + l.quantity);
      needs.set(id, mine);
    }
  }
  return { totals, needs };
}
