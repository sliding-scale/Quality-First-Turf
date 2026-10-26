import { formatPhone, orderServices, serviceLabel, type DiscoveryState } from "@/lib/discovery";
import type { VisitArea } from "@/lib/visit-areas";

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
  add(
    "services",
    "Services",
    orderServices(form.services).map(serviceLabel).join(", "),
    contactGroup,
  );

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

function areaRows(areas: VisitArea[]): Rows {
  const rows: Rows = new Map();
  for (const area of areas) {
    if (area.label.trim() === "") continue;
    rows.set(`area:${area.label}`, {
      label: `${area.label} · Size`,
      value: area.quantity.trim() === "" ? "Not given" : area.quantity.trim(),
      group: area.service,
    });
    if (area.notes.trim() !== "") {
      rows.set(`areaNote:${area.label}`, {
        label: `${area.label} · Notes`,
        value: area.notes.trim(),
        group: area.service,
      });
    }
  }
  return rows;
}

/** Everything that differs between two versions, with an empty value shown as a word, not blank. */
export function compareSnapshots(before: Snapshot, after: Snapshot): Change[] {
  const left: Rows = new Map([...formRows(before.form), ...areaRows(before.areas)]);
  const right: Rows = new Map([...formRows(after.form), ...areaRows(after.areas)]);
  if ((before.visitNote ?? "").trim() !== "") {
    left.set("visitNote", { label: "Visit notes", value: before.visitNote!.trim(), group: contactGroup });
  }
  if ((after.visitNote ?? "").trim() !== "") {
    right.set("visitNote", { label: "Visit notes", value: after.visitNote!.trim(), group: contactGroup });
  }

  const changes: Change[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const was = left.get(key);
    const now = right.get(key);
    if (was?.value === now?.value) continue;
    const isArea = key.startsWith("area:") || key.startsWith("areaNote:");
    const wasItems = was?.items ?? [];
    const nowItems = now?.items ?? [];
    const isList = was?.items !== undefined || now?.items !== undefined;
    changes.push({
      label: (now ?? was)!.label,
      before: was?.value ?? (isArea ? "Not on the customer's form" : "Not set"),
      after: now?.value ?? (isArea ? "Removed on site" : "Cleared"),
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
