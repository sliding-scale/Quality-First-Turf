import {
  decimalInput,
  emailInput,
  canonicalService,
  emptyDiscovery,
  grassService,
  grassWork,
  grassWorkFromTypes,
  hasFollowUp,
  normalizeDemoChoices,
  phoneInput,
  orderServices,
  requiredContact,
  services,
  soilCondition,
  zipInput,
  type CustomerType,
  type DiscoveryState,
} from "@/lib/discovery";

const storageKey = "qft-discovery-draft";

export type DiscoveryStep = "property" | "services" | "details" | "confirmation";

export type DiscoveryDraft = {
  step: DiscoveryStep;
  form: DiscoveryState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapValues(record: Record<string, string>, clean: (value: string) => string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) result[key] = clean(value);
  return result;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

function stringListRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!Array.isArray(item)) continue;
    result[key] = item.filter((entry): entry is string => typeof entry === "string");
  }
  return result;
}

function yesNo(value: unknown): "" | "yes" | "no" {
  return value === "yes" || value === "no" ? value : "";
}

function yesNoRecord(value: unknown): Record<string, "" | "yes" | "no"> {
  if (!isRecord(value)) return {};
  const result: Record<string, "" | "yes" | "no"> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = yesNo(item);
  }
  return result;
}

const knownServices = new Set<string>(services);

function formFrom(value: unknown): DiscoveryState {
  const blank = emptyDiscovery();
  if (!isRecord(value)) return blank;
  const customerType: CustomerType =
    value.customerType === "Contractor" ? "Contractor" : "Homeowner";
  const savedServices = Array.isArray(value.services)
    ? [
        ...new Set(
          value.services
            .filter((item): item is string => typeof item === "string")
            .map((item) => canonicalService(item))
            .filter((item) => knownServices.has(item)),
        ),
      ]
    : [];
  const installTypes = remapServiceKeys(stringListRecord(value.installTypes));
  const savedWork = grassWork(value.grassWork);
  return normalizeDemoChoices({
    ...blank,
    firstName: text(value.firstName),
    lastName: text(value.lastName),
    phone: phoneInput(text(value.phone)),
    email: emailInput(text(value.email)),
    street1: text(value.street1),
    street2: text(value.street2),
    city: text(value.city),
    state: text(value.state),
    zip: zipInput(text(value.zip)),
    customerType,
    services: orderServices(savedServices),
    installTypes,
    areaNames: remapKeyed(stringRecord(value.areaNames)),
    replacementInstall: remapKeyed(stringRecord(value.replacementInstall)),
    product: remapKeyed(stringRecord(value.product)),
    addOns: remapServiceKeys(stringListRecord(value.addOns)),
    addOnQuantity: remapKeyed(mapValues(stringRecord(value.addOnQuantity), decimalInput)),
    areaKnown: yesNoRecord(value.areaKnown),
    squareFeet: squareFeetFrom(value),
    length: mapValues(stringRecord(value.length), decimalInput),
    width: mapValues(stringRecord(value.width), decimalInput),
    lengthKnown: yesNo(value.lengthKnown),
    linearFeet: decimalInput(text(value.linearFeet)),
    soil: soilCondition(value.soil),
    notes: stringRecord(value.notes),
    grassWork: savedWork || grassWorkFromTypes(installTypes[grassService] ?? []),
  });
}

function remapServiceKey(key: string): string {
  return key.replaceAll("Artificial Grass Installation", grassService);
}

function remapKeyed(record: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) result[remapServiceKey(key)] = value;
  return result;
}

function remapServiceKeys(record: Record<string, string[]>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(record)) {
    const next = remapServiceKey(key);
    result[next] = [...(result[next] ?? []), ...value];
  }
  return result;
}

function squareFeetFrom(value: Record<string, unknown>): Record<string, string> {
  const squareFeet = mapValues(stringRecord(value.squareFeet), decimalInput);
  const lengths = mapValues(stringRecord(value.length), decimalInput);
  const widths = mapValues(stringRecord(value.width), decimalInput);
  for (const [key, length] of Object.entries(lengths)) {
    if ((squareFeet[key] ?? "") !== "") continue;
    const area = Number(length) * Number(widths[key] ?? "");
    if (Number.isFinite(area) && area > 0) squareFeet[key] = String(area);
  }
  const installTypes = stringListRecord(value.installTypes);
  for (const service of ["Demo", "Putting Green"]) {
    const legacy = squareFeet[service];
    if (legacy === undefined || legacy === "") continue;
    for (const type of installTypes[service] ?? []) {
      if ((squareFeet[type] ?? "") === "") squareFeet[type] = legacy;
    }
  }
  return squareFeet;
}

function stepFor(step: unknown, form: DiscoveryState): DiscoveryStep {
  const requested: DiscoveryStep =
    step === "services" || step === "details" ? step : "property";
  if (requested !== "property" && requiredContact(form) !== null) return "property";
  if (requested === "details" && !form.services.some((service) => hasFollowUp(service))) {
    return form.services.length > 0 ? "services" : "property";
  }
  return requested;
}

export function readDiscoveryDraft(): DiscoveryDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const form = formFrom(parsed.form);
    return { form, step: stepFor(parsed.step, form) };
  } catch {
    return null;
  }
}

export function writeDiscoveryDraft(draft: DiscoveryDraft) {
  window.localStorage.setItem(storageKey, JSON.stringify(draft));
}

export function clearDiscoveryDraft() {
  window.localStorage.removeItem(storageKey);
}
