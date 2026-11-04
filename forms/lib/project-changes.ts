import { formatPhone, orderServices, serviceLabel, type DiscoveryState } from "@/lib/discovery";
import {
  areaDisplayName,
  isDefaultAreaName,
  matchOriginalArea,
  SITE_PHOTOS_LABEL,
  isServicePhotos,
  type VisitArea,
} from "@/lib/visit-areas";

/** One difference between two versions of a project, in words a person can read. */
export type Change = {
  label: string;
  before: string;
  after: string;
  /** The service (or "Contact") the change belongs to, for counting; never stored. */
  group: string;
  /** For list answers (items ticked), what was ticked and unticked; never stored. */
  added?: string[];
  removed?: string[];
};

type Row = { label: string; value: string; group: string; items?: string[] };
type Rows = Map<string, Row>;

export type Snapshot = {
  form: DiscoveryState;
  areas: VisitArea[];
  visitNote?: string;
};

const contactGroup = "Contact";

function pretty(key: string): string {
  return key.replaceAll("::", " · ");
}

/** The service a keyed answer belongs to: keys look like `Service::Type`. */
function groupOf(key: string, services: string[]): string {
  const head = key.split("::")[0] ?? key;
  return services.includes(head) ? head : contactGroup;
}

function formRows(form: DiscoveryState): Rows {
  const rows: Rows = new Map();
  const add = (key: string, label: string, value: string, group: string, items?: string[]) => {
    const text = value.trim();
    if (text !== "") rows.set(key, { label, value: text, group, items });
  };

  add("firstName", "First name", form.firstName, contactGroup);
  add("lastName", "Last name", form.lastName, contactGroup);
  add("phone", "Phone", formatPhone(form.phone), contactGroup);
  add("email", "Email", form.email, contactGroup);
  add("street1", "Street", form.street1, contactGroup);
  add("street2", "Street 2", form.street2, contactGroup);
  add("city", "City", form.city, contactGroup);
  add("state", "State", form.state, contactGroup);
  add("zip", "ZIP code", form.zip, contactGroup);
  add("customerType", "Customer type", form.customerType, contactGroup);
  const picked = orderServices(form.services).map(serviceLabel);
  add("services", "Services", picked.join(", "), contactGroup, picked);

  for (const [key, types] of Object.entries(form.installTypes)) {
    add(`installTypes:${key}`, "Installation items", [...types].sort().join(", "), key, types);
  }
  const keyed: [string, string, Record<string, string>][] = [
    ["areaNames", "Area name", form.areaNames],
    ["replacementInstall", "New installation", form.replacementInstall],
    ["product", "Product", form.product],
    ["addOnQuantity", "Add-on quantity", form.addOnQuantity],
    ["lightingQuantity", "Quantity", form.lightingQuantity],
    ["squareFeet", "Size", form.squareFeet],
    ["notes", "Notes", form.notes],
  ];
  for (const [field, name, record] of keyed) {
    for (const [key, value] of Object.entries(record)) {
      add(`${field}:${key}`, `${name} · ${pretty(key)}`, value, groupOf(key, form.services));
    }
  }
  for (const [key, list] of Object.entries(form.addOns)) {
    add(`addOns:${key}`, "Add-ons", [...list].sort().join(", "), groupOf(key, form.services), list);
  }
  add("linearFeet", "Linear feet", form.linearFeet, "Underground");
  add("soil", "Soil", form.soil, "Underground");
  add("grassWork", "Grass work", form.grassWork, "Artificial Grass");
  return rows;
}

/** Services whose answers live on area cards, so they are compared per area instead. */
function servicesWithAreas(areas: VisitArea[]): Set<string> {
  return new Set(
    areas.filter((area) => area.service !== SITE_PHOTOS_LABEL && !isServicePhotos(area)).map((area) => area.service),
  );
}

function areaChanges(before: VisitArea[], after: VisitArea[]): Change[] {
  const changes: Change[] = [];
  const matched = new Set<VisitArea>();
  const sizeText = (area: VisitArea) => (area.quantity.trim() === "" ? "Not given" : area.quantity.trim());
  const nameText = (area: VisitArea) => (isDefaultAreaName(area) ? "Not set" : area.label);
  const typeText = (area: VisitArea) => (area.installType === "" ? "Not set" : area.installType);

  for (const service of servicesWithAreas(after)) {
    after
      .filter((area) => area.service === service)
      .forEach((area, order) => {
        const name = areaDisplayName(area, order);
        const was = matchOriginalArea(area, order, before);
        if (was === undefined) {
          changes.push({ label: name, before: "Not on the customer's form", after: `Added on site (${sizeText(area)})`, group: service });
          return;
        }
        matched.add(was);
        const compare = (label: string, left: string, right: string) => {
          if (left !== right) changes.push({ label: `${name} · ${label}`, before: left, after: right, group: service });
        };
        compare("Name", nameText(was), nameText(area));
        compare("Size", sizeText(was), sizeText(area));
        compare("Installation type", typeText(was), typeText(area));
        compare("Notes", was.notes.trim() || "None", area.notes.trim() || "None");
      });
  }
  for (const service of servicesWithAreas(before)) {
    before
      .filter((area) => area.service === service && !matched.has(area))
      .forEach((area, order) => {
        changes.push({ label: areaDisplayName(area, order), before: sizeText(area), after: "Removed on site", group: service });
      });
  }
  return changes;
}

/** Everything that differs between two versions, with an empty value shown as a word, not blank. */
export function compareSnapshots(before: Snapshot, after: Snapshot): Change[] {
  const covered = new Set([...servicesWithAreas(before.areas), ...servicesWithAreas(after.areas)]);
  // Area names, sizes and installation types are compared on the area cards, so skip them here.
  const keep = (rows: Rows): Rows =>
    new Map(
      [...rows].filter(([key, row]) => {
        const overlapping = key.startsWith("areaNames:") || key.startsWith("installTypes:") || key.startsWith("squareFeet:");
        return !(overlapping && covered.has(row.group));
      }),
    );
  const left: Rows = keep(formRows(before.form));
  const right: Rows = keep(formRows(after.form));
  if ((before.visitNote ?? "").trim() !== "") {
    left.set("visitNote", { label: "Visit notes", value: before.visitNote!.trim(), group: contactGroup });
  }
  if ((after.visitNote ?? "").trim() !== "") {
    right.set("visitNote", { label: "Visit notes", value: after.visitNote!.trim(), group: contactGroup });
  }

  const changes: Change[] = areaChanges(before.areas, after.areas);
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const was = left.get(key);
    const now = right.get(key);
    if (was?.value === now?.value) continue;
    const wasItems = was?.items ?? [];
    const nowItems = now?.items ?? [];
    const isList = was?.items !== undefined || now?.items !== undefined;
    changes.push({
      label: (now ?? was)!.label,
      before: was?.value ?? "Not set",
      after: now?.value ?? "Cleared",
      group: (now ?? was)!.group,
      ...(isList
        ? {
            added: nowItems.filter((item) => !wasItems.includes(item)),
            removed: wasItems.filter((item) => !nowItems.includes(item)),
          }
        : {}),
    });
  }
  return changes;
}

/** The part of a change that is stored and sent to the server. */
export function storedChanges(changes: Change[]): { label: string; before: string; after: string }[] {
  return changes.map(({ label, before, after }) => ({ label, before, after }));
}
