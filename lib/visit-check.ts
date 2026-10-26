import { fieldIdFor, grassService, selectionKey, serviceLabel, services } from "@/lib/discovery";
import { planQuoteLines } from "@/lib/quote-lines";
import { SITE_PHOTOS_LABEL, type VisitArea } from "@/lib/visit-areas";

type CheckInput = {
  services: string[];
  products: string[];
  answers: { question: string; value: string }[];
  /** The customer's own estimates; quoting falls back to them when no area was measured. */
  measurements: { label: string; squareFeet: number | null; linearFeet: number | null; unmeasured: boolean }[];
  /** The areas as they will be saved, in the same order as `areas`. */
  workAreas: { label: string; length: number | null; width: number | null; quantity: number | null }[];
  areas: VisitArea[];
};

export type VisitCheck = {
  /** Field id → message, in the ids the visit form uses, so each can be highlighted. */
  problems: Record<string, string>;
  /** Something that has no single field to point at. */
  general: string | null;
};

/**
 * Runs the quote planner before anything is saved and turns what it is missing into
 * messages on the fields that can fix it, instead of letting an incomplete draft through.
 */
export function checkVisit(input: CheckInput): VisitCheck {
  const planned = planQuoteLines({
    services: input.services,
    products: input.products,
    answers: input.answers,
    measurements: input.measurements,
    workAreas: input.workAreas,
  });
  const problems: Record<string, string> = {};
  let general: string | null = null;
  if (planned.missing === null) return { problems, general };

  const areaIndex = (matches: (area: VisitArea, saved: CheckInput["workAreas"][number]) => boolean) =>
    input.areas.findIndex(
      (area, index) =>
        area.service !== SITE_PHOTOS_LABEL && input.workAreas[index] !== undefined && matches(area, input.workAreas[index]),
    );
  const serviceByLabel = (label: string) => services.find((service) => serviceLabel(service) === label);

  for (const gap of planned.missing.match(/[^.]+\./g) ?? []) {
    const text = gap.trim();
    let match: RegExpMatchArray | null;

    if ((match = text.match(/^Size is still missing for (.+)\.$/))) {
      const label = match[1];
      const index = areaIndex((area, saved) => saved.label === label || area.installType === label || area.label === label);
      if (index >= 0) problems[`area-${index}-quantity`] = "Add the size of this area.";
      else general = general ?? text;
    } else if ((match = text.match(/^Work area (.+) is not matched to a service\.$/))) {
      const label = match[1];
      const index = areaIndex((area, saved) => saved.label === label || area.label === label);
      if (index >= 0) problems[`area-${index}-install`] = "Choose an installation type so this area can be quoted.";
      else general = general ?? text;
    } else if (text === "Soil is still missing for Underground.") {
      problems["underground-soil"] = "Choose the soil type.";
    } else if (text === "Length is still missing for Underground.") {
      const index = areaIndex((area) => area.service === "Underground");
      if (index >= 0) problems[`area-${index}-quantity`] = "Add the measured length.";
      else general = general ?? text;
    } else if ((match = text.match(/^Choose an installation type for (.+)\.$/))) {
      const service = serviceByLabel(match[1]);
      const index = areaIndex((area) => area.service === service && area.installType === "");
      if (index >= 0) problems[`area-${index}-install`] = "Choose an installation type.";
      else if (service !== undefined) problems[fieldIdFor("install", service)] = "Choose an installation type.";
      else general = general ?? text;
    } else if (text === "Choose a product for Putting Green.") {
      problems[fieldIdFor("product", "Putting Green")] = "Choose a product.";
    } else if (text === "Choose the new turf installation for the replacement.") {
      problems[fieldIdFor("replacement", selectionKey(grassService, "Artificial Grass Replacement"))] =
        "Choose the new installation.";
    } else if (text === "Customer type is missing.") {
      problems["customerType"] = "Choose whether the customer is a homeowner or a contractor.";
    } else if (text.startsWith("No catalogue item for")) {
      // The Jobber catalogue is the office's to fix; it does not block a visit from being saved.
      continue;
    } else {
      general = general ?? text;
    }
  }
  return { problems, general };
}
