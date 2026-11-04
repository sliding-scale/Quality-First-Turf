import { emptyWorkArea, type WorkAreaDraft } from "@/components/work-areas";
import {
  areaNamesFor,
  type AreaSection,
  grassService,
  hasFollowUp,
  serviceLabel,
  type DiscoveryState,
} from "@/lib/discovery";
import type { Id } from "@/convex/_generated/dataModel";

export const SITE_PHOTOS_LABEL = "Site photos";

/** Marks the area that holds one service's photos and note; the service itself is in the label. */
export const SERVICE_PHOTOS = "Service photos";

export function servicePhotosLabel(service: string): string {
  return `${SERVICE_PHOTOS}: ${service}`;
}

export function isServicePhotos(area: { service?: string }): boolean {
  return area.service === SERVICE_PHOTOS;
}

/** The service a photos area belongs to, or null when the area is something else. */
export function serviceOfPhotos(area: { label: string; service?: string }): string | null {
  return isServicePhotos(area) ? area.label.slice(SERVICE_PHOTOS.length + 2) : null;
}

export function servicePhotosIndex(areas: { label: string; service?: string }[], service: string): number {
  return areas.findIndex((area) => isServicePhotos(area) && area.label === servicePhotosLabel(service));
}

export type CustomerMeasurement = {
  label: string;
  length: number | null;
  width: number | null;
  squareFeet: number | null;
  linearFeet: number | null;
  unmeasured: boolean;
  areaBand?: string | null;
  service?: string;
  installType?: string;
};

export type VisitArea = WorkAreaDraft & {
  service: string;
  installType: string;
  /** The title shown on the card while its name is being typed; unset means follow the name. */
  shownLabel?: string;
};

export type VisitWorkArea = {
  label: string;
  length: number | null;
  width: number | null;
  quantity: number | null;
  notes: string;
  photoIds: Id<"_storage">[];
  photoUrls: (string | null)[];
  service?: string;
  installType?: string;
  sections?: { length: string; width: string; size: string }[];
};

export function formatEstimate(measurement: CustomerMeasurement | undefined): string {
  if (measurement === undefined || measurement.unmeasured) {
    return "Customer did not know the size.";
  }
  const feet =
    measurement.squareFeet !== null && measurement.squareFeet > 0
      ? measurement.squareFeet
      : measurement.length !== null &&
          measurement.width !== null &&
          measurement.length > 0 &&
          measurement.width > 0
        ? measurement.length * measurement.width
        : null;
  if (feet !== null) {
    return `Customer estimated ${feet} SF.`;
  }
  if (measurement.linearFeet !== null) {
    return `Customer estimated ${measurement.linearFeet} linear ft.`;
  }
  return "Customer did not know the size.";
}

export function estimateFor(
  measurements: CustomerMeasurement[],
  labels: string[],
): CustomerMeasurement | undefined {
  return measurements.find((item) => labels.includes(item.label));
}

/** Every size the customer gave for one service: by owner when recorded, otherwise by name. */
export function estimatesFor(
  measurements: CustomerMeasurement[],
  service: string,
  labels: string[],
): CustomerMeasurement[] {
  return measurements.filter((item) =>
    item.service !== undefined ? item.service === service : labels.includes(item.label),
  );
}

/** One line for the customer's sizes: the single estimate, or each area and what they come to together. */
export function formatEstimates(list: CustomerMeasurement[]): string {
  if (list.length <= 1) return formatEstimate(list[0]);
  const sized = list.filter((item) => !item.unmeasured && (item.squareFeet ?? item.linearFeet ?? 0) > 0);
  if (sized.length === 0) return "Customer did not know the sizes.";
  const unit = (item: CustomerMeasurement) => (item.squareFeet !== null ? "SF" : "linear ft");
  const parts = sized.map((item) => `${item.label} ${item.squareFeet ?? item.linearFeet} ${unit(item)}`);
  const total = sized.reduce((sum, item) => sum + (item.squareFeet ?? item.linearFeet ?? 0), 0);
  return `Customer estimated ${parts.join(", ")} (${total} ${unit(sized[0])} in all).`;
}

export function serviceForLabel(
  label: string,
  form: DiscoveryState,
  measurements: CustomerMeasurement[],
): string {
  if (label === SITE_PHOTOS_LABEL) return SITE_PHOTOS_LABEL;
  for (const service of form.services) {
    if (label === service) return service;
    for (const type of form.installTypes[service] ?? []) {
      if (label === type) return service;
      if (areaNamesFor(form, service, type).includes(label)) return service;
    }
  }
  // Repair/replacement areas ("Artificial Grass Replacement job") belong to the grass service,
  // not to whichever service happens to come first.
  if (label.startsWith(grassService) && form.services.includes(grassService)) return grassService;
  const measurement = measurements.find((item) => item.label === label);
  if (measurement !== undefined) {
    if (label === "Underground") return "Underground";
    if (label === "Demo" || label.startsWith("Demo") || label.startsWith("Concrete")) return "Demo";
    if (label === "Putting Green" || label.includes("Putting Green")) return "Putting Green";
  }
  return form.services.find((service) => hasFollowUp(service)) ?? form.services[0] ?? SITE_PHOTOS_LABEL;
}

function installTypeForLabel(label: string, service: string, form: DiscoveryState): string {
  const types = form.installTypes[service] ?? [];
  if (types.includes(label)) return label;
  for (const type of types) {
    if (areaNamesFor(form, service, type).includes(label)) return type;
  }
  return types[0] ?? "";
}

function squareFeetValue(
  quantity: number | null,
  length: number | null,
  width: number | null,
  linearFeet: number | null = null,
): string {
  if (quantity !== null && quantity > 0) return String(quantity);
  if (length !== null && width !== null && length > 0 && width > 0) {
    return String(Math.round(length * width * 100) / 100);
  }
  if (linearFeet !== null && linearFeet > 0) return String(linearFeet);
  return "";
}

function draftFromStored(area: VisitWorkArea, guessedService: string, form: DiscoveryState): VisitArea {
  const service = area.service ?? guessedService;
  return {
    label: area.label,
    length: area.length !== null ? String(area.length) : "",
    width: area.width !== null ? String(area.width) : "",
    quantity: squareFeetValue(area.quantity, area.length, area.width),
    notes: area.notes,
    photoIds: area.photoIds,
    photoUrls: area.photoUrls,
    service,
    installType: area.installType ?? installTypeForLabel(area.label, service, form),
    ...(area.sections === undefined ? {} : { sections: area.sections }),
  };
}

function draftFromMeasurement(
  measurement: CustomerMeasurement,
  service: string,
  form: DiscoveryState,
): VisitArea {
  return {
    label: measurement.label,
    length: "",
    width: "",
    quantity: squareFeetValue(
      measurement.squareFeet,
      measurement.length,
      measurement.width,
      measurement.linearFeet,
    ),
    notes: "",
    photoIds: [],
    photoUrls: [],
    service,
    installType: measurement.installType ?? installTypeForLabel(measurement.label, service, form),
  };
}

function defaultArea(service: string, form: DiscoveryState, index: number): VisitArea {
  const types = form.installTypes[service] ?? [];
  const type = types[index] ?? types[0] ?? "";
  const named = type === "" ? "" : (areaNamesFor(form, service, type)[0] ?? "");
  return {
    ...emptyWorkArea(named || type || `${serviceLabel(service)} area`),
    service,
    installType: type,
  };
}

const JOB_SUFFIX = " job";

/**
 * The customer form records a repair/replacement twice: the job's size ("Artificial Grass
 * Replacement job") and the new work itself ("Artificial Grass Replacement"). On site that is one
 * area, so the job entry is folded into its partner and kept only if it stands alone.
 */
function foldJobAreas<T extends { label: string }>(items: T[], merge: (base: T, job: T) => T): T[] {
  const result: T[] = [];
  const jobs: T[] = [];
  for (const item of items) {
    if (item.label.endsWith(JOB_SUFFIX) && items.some((other) => other.label === item.label.slice(0, -JOB_SUFFIX.length))) {
      jobs.push(item);
    } else {
      result.push(item);
    }
  }
  return result.map((item) => {
    const job = jobs.find((entry) => entry.label === `${item.label}${JOB_SUFFIX}`);
    return job === undefined ? item : merge(item, job);
  });
}

export function seedVisitAreas(
  storedAreas: VisitWorkArea[],
  customerMeasurements: CustomerMeasurement[],
  form: DiscoveryState,
): VisitArea[] {
  const workAreas = foldJobAreas(storedAreas, (base, job) => ({
    ...base,
    quantity: base.quantity ?? job.quantity,
    length: base.length ?? job.length,
    width: base.width ?? job.width,
    notes: [base.notes, job.notes].filter((note) => note !== "").join(", "),
    photoIds: [...base.photoIds, ...job.photoIds],
    photoUrls: [...base.photoUrls, ...job.photoUrls],
  }));
  const measurements = foldJobAreas(customerMeasurements, (base, job) => ({
    ...base,
    squareFeet: base.squareFeet ?? job.squareFeet,
    linearFeet: base.linearFeet ?? job.linearFeet,
    length: base.length ?? job.length,
    width: base.width ?? job.width,
  }));
  const seeded: VisitArea[] = [];
  // Lighting is priced per item or per foot and has no areas; its quantities live on its own card.
  if (workAreas.length > 0) {
    for (const area of workAreas) {
      const service = area.service ?? serviceForLabel(area.label, form, measurements);
      if (service === "Low Voltage Lighting") continue;
      seeded.push(draftFromStored(area, service, form));
    }
  } else {
    for (const measurement of measurements) {
      const service = measurement.service ?? serviceForLabel(measurement.label, form, measurements);
      if (service === "Low Voltage Lighting") continue;
      seeded.push(draftFromMeasurement(measurement, service, form));
    }
  }

  for (const service of form.services) {
    if (service === "Low Voltage Lighting" || !hasFollowUp(service)) continue;
    const existing = seeded.filter((area) => area.service === service);
    if (existing.length > 0) continue;
    const types = form.installTypes[service] ?? [];
    if (service !== "Underground" && types.length > 0) {
      types.forEach((_, index) => seeded.push(defaultArea(service, form, index)));
    } else {
      seeded.push(defaultArea(service, form, 0));
    }
  }

  if (!seeded.some((area) => area.service === SITE_PHOTOS_LABEL)) {
    seeded.push({
      ...emptyWorkArea(SITE_PHOTOS_LABEL),
      service: SITE_PHOTOS_LABEL,
      installType: "",
    });
  }
  return seeded;
}

/** True while an area still carries its fallback name (its type, or "<Service> area 2"). */
export function isDefaultAreaName(area: VisitArea): boolean {
  return area.label === area.installType || / area( \d+)?$/.test(area.label) || area.label === area.service;
}

/** The name to show for an area: what was typed, or "Area N" by position within its service. */
export function areaDisplayName(area: VisitArea, order: number): string {
  return isDefaultAreaName(area) ? `Area ${order + 1}` : area.label;
}

/** The customer's version of an area: same name first, otherwise the same position within its service. */
export function matchOriginalArea(
  area: VisitArea,
  order: number,
  originalAreas: VisitArea[],
): VisitArea | undefined {
  const same = originalAreas.filter((item) => item.service === area.service);
  return (
    same.find((item) => item.label === area.label && item.installType === area.installType) ??
    same.find((item) => item.label === area.label) ??
    same[order]
  );
}

const roundTwo = (value: number) => Math.round(value * 100) / 100;

/** The pieces an area was measured in; an area saved before sections existed is one piece. */
export function sectionsOf(area: { sections?: AreaSection[]; length: string; width: string; quantity: string }): AreaSection[] {
  if (area.sections !== undefined && area.sections.length > 0) return area.sections;
  const both = Number(area.length) > 0 && Number(area.width) > 0;
  return [{ length: both ? area.length : "", width: both ? area.width : "", size: area.quantity }];
}

/** What one piece comes to: length times width when both are given, otherwise the size typed in. */
export function sectionAmount(section: AreaSection, linear: boolean): number | null {
  if (!linear) {
    const length = Number(section.length);
    const width = Number(section.width);
    if (length > 0 && width > 0) return roundTwo(length * width);
  }
  const size = Number(section.size);
  return section.size.trim() !== "" && Number.isFinite(size) && size > 0 ? size : null;
}

/**
 * The fields of an area that follow from its pieces: the pieces themselves, their total as the
 * quantity quoting reads, and the length and width only while there is exactly one rectangle.
 */
export function measuredPatch(
  sections: AreaSection[],
  linear: boolean,
): { sections: AreaSection[]; length: string; width: string; quantity: string } {
  let total = 0;
  let found = false;
  for (const section of sections) {
    const amount = sectionAmount(section, linear);
    if (amount === null) continue;
    total += amount;
    found = true;
  }
  const only = sections.length === 1 ? sections[0] : undefined;
  const rectangle = !linear && only !== undefined && Number(only.length) > 0 && Number(only.width) > 0;
  return {
    sections,
    length: rectangle ? only.length : "",
    width: rectangle ? only.width : "",
    quantity: found ? String(roundTwo(total)) : "",
  };
}

export function areasForService(areas: VisitArea[], service: string): VisitArea[] {
  return areas.filter((area) => area.service === service);
}

export function sitePhotosArea(areas: VisitArea[]): VisitArea | undefined {
  return areas.find((area) => area.service === SITE_PHOTOS_LABEL);
}

export function asWorkAreaDrafts(areas: VisitArea[]): WorkAreaDraft[] {
  return areas.map((area) => ({ ...area }));
}

export function measuredSquareFeet(area: VisitArea): string {
  return area.quantity.trim();
}

export function areaHasMeasure(area: VisitArea): boolean {
  return measuredSquareFeet(area) !== "";
}

export function serviceNeedsAreas(service: string): boolean {
  return (
    service === "Demo" ||
    service === grassService ||
    service === "Putting Green" ||
    service === "Underground"
  );
}

export function labelsForService(service: string, form: DiscoveryState): string[] {
  const labels = [service];
  for (const type of form.installTypes[service] ?? []) {
    labels.push(type);
    labels.push(...areaNamesFor(form, service, type));
  }
  return labels;
}

export function nextAreaLabel(service: string, areas: VisitArea[]): string {
  const count = areasForService(areas, service).length + 1;
  return `${serviceLabel(service)} area ${count}`;
}

/** A blank area added by the salesperson: nothing is chosen for them. */
export function emptyServiceArea(service: string, existing: VisitArea[] = []): VisitArea {
  if (service === "Underground") {
    return { ...emptyWorkArea("Underground"), service, installType: "" };
  }
  return { ...emptyWorkArea(nextAreaLabel(service, existing)), service, installType: "" };
}

/**
 * The sections the customer broke an area into, one line each, such as "20 × 25 ft = 500 sq ft".
 * The customer form records them in an "area detail" answer; this reads them back so the visit can
 * show what the customer entered. Empty when the area was a single size.
 */
export function customerSections(
  answers: { question: string; value: string }[],
  service: string,
  installType: string,
  labels: string[],
): string[] {
  for (const label of labels) {
    const prefix = `${installType}: ${label}: `;
    const detail = answers.find(
      (answer) => answer.question === `${service} area detail` && answer.value.startsWith(prefix),
    );
    if (detail === undefined) continue;
    const parts = detail.value.slice(prefix.length).split(" = ")[0].split(" + ");
    if (parts.length === 0 || parts[0] === "") continue;
    return parts.map((part) => {
      const dims = part.match(/^(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) ft$/);
      if (dims === null) return part;
      return `${dims[1]} × ${dims[2]} ft = ${Math.round(Number(dims[1]) * Number(dims[2]))} sq ft`;
    });
  }
  return [];
}
