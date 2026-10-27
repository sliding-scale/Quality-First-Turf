import { emptyWorkArea, type WorkAreaDraft } from "@/components/work-areas";
import {

  grassService,
  hasFollowUp,
  selectionKey,
  serviceLabel,
  type DiscoveryState,
} from "@/lib/discovery";
import type { Id } from "@/convex/_generated/dataModel";

export const SITE_PHOTOS_LABEL = "Site photos";

export type CustomerMeasurement = {
  label: string;
  length: number | null;
  width: number | null;
  squareFeet: number | null;
  linearFeet: number | null;
  unmeasured: boolean;
  areaBand?: string | null;
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
      const areaName = form.areaNames[selectionKey(service, type)] ?? "";
      if (areaName !== "" && label === areaName) return service;
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
    const areaName = form.areaNames[selectionKey(service, type)] ?? "";
    if (areaName !== "" && areaName === label) return type;
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
    installType: installTypeForLabel(measurement.label, service, form),
  };
}

function defaultArea(service: string, form: DiscoveryState, index: number): VisitArea {
  const types = form.installTypes[service] ?? [];
  const type = types[index] ?? types[0] ?? "";
  const named = type === "" ? "" : (form.areaNames[selectionKey(service, type)] ?? "");
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
      const service = serviceForLabel(area.label, form, measurements);
      if (service === "Low Voltage Lighting") continue;
      seeded.push(draftFromStored(area, service, form));
    }
  } else {
    for (const measurement of measurements) {
      const service = serviceForLabel(measurement.label, form, measurements);
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
  return same.find((item) => item.label === area.label) ?? same[order];
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
    const areaName = form.areaNames[selectionKey(service, type)] ?? "";
    if (areaName !== "") labels.push(areaName);
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
