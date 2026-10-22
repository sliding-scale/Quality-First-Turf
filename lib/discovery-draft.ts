import {
  emptyDiscovery,
  hasFollowUp,
  requiredContact,
  services,
  type CustomerType,
  type DiscoveryState,
} from "@/lib/discovery";

const storageKey = "qft-discovery-draft";

export type DiscoveryStep = "property" | "services" | "details";

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
    ? value.services.filter(
        (item): item is string => typeof item === "string" && knownServices.has(item),
      )
    : [];
  return {
    ...blank,
    firstName: text(value.firstName),
    lastName: text(value.lastName),
    phone: text(value.phone),
    email: text(value.email),
    street1: text(value.street1),
    street2: text(value.street2),
    city: text(value.city),
    state: text(value.state),
    zip: text(value.zip),
    customerType,
    services: savedServices,
    installTypes: stringListRecord(value.installTypes),
    areaNames: stringRecord(value.areaNames),
    replacementInstall: stringRecord(value.replacementInstall),
    product: stringRecord(value.product),
    addOns: stringListRecord(value.addOns),
    addOnQuantity: stringRecord(value.addOnQuantity),
    areaKnown: yesNoRecord(value.areaKnown),
    length: stringRecord(value.length),
    width: stringRecord(value.width),
    lengthKnown: yesNo(value.lengthKnown),
    linearFeet: text(value.linearFeet),
    notes: stringRecord(value.notes),
  };
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
