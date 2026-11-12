/** The three businesses (D-016, renamed in D-066). The landscape business keeps the slug the form and the imports already use. */

export const TURF_SLUG = "quality-first-turf";
export const TURF_NAME = "Quality First Turf Landscape";

export const BUSINESS_NAMES = [TURF_NAME, "Quality First Turf Construction", "Quality First Patios"] as const;

/** Names that were used before and are corrected in place by `businesses.alignNames` (the slug is not touched). */
export const RENAMED: Record<string, string> = {
  "Quality First Turf": TURF_NAME,
  "Quality First Construction": "Quality First Turf Construction",
};

export function businessSlug(name: string): string {
  if (name === TURF_NAME || name === "Quality First Turf") return TURF_SLUG;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
