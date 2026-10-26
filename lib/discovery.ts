import { isUsState } from "./us-states";

export const grassService = "Artificial Grass";

export const grassWorks = ["Installation", "Replacement", "Repair"] as const;

export type GrassWork = (typeof grassWorks)[number];

export function grassWork(value: unknown): GrassWork | "" {
  const match = grassWorks.find((item) => item === value);
  return match ?? "";
}

export function grassWorkFromTypes(types: string[]): GrassWork | "" {
  const hasInstall = types.some((type) => turfInstallTypes.includes(type));
  const hasReplacement = types.includes("Artificial Grass Replacement");
  const hasRepair = types.includes("Artificial Grass Repair");
  if (hasInstall) return "Installation";
  if (hasReplacement) return "Replacement";
  if (hasRepair) return "Repair";
  return "";
}

export function canonicalService(name: string): string {
  return name === "Artificial Grass Installation" ? grassService : name;
}

export const services = [
  "Demo",
  grassService,
  "Putting Green",
  "Underground",
  "Low Voltage Lighting",
  "SOD",
  "Patio Covers",
  "Concrete",
  "Retaining Walls",
  "Planter Walls",
  "Pavers",
  "Bar & Bbq",
  "Fire Pits",
  "Decomposite Granite",
  "Decorative Rock",
  "Irrigation",
  "Planting",
] as const;

export type ServiceName = (typeof services)[number];

export function orderServices(selected: readonly string[]): string[] {
  const chosen = new Set(selected);
  return services.filter((service) => chosen.has(service));
}

export function serviceLabel(service: string): string {
  return service === "Demo" ? "Demolition" : service;
}

const followUpServices = [
  "Demo",
  grassService,
  "Putting Green",
  "Underground",
  "Low Voltage Lighting",
] as const;

type ProductOption = { name: string; mark: string | null };

function marked(names: string[], mark: string | null): ProductOption[] {
  return names.map((name) => ({ name, mark }));
}

const budgetNames = [
  "Players Choice",
  "Olive Natural",
  "Cali's Finest Light",
  "Hollywood",
  "Spring Natural",
];

const standardNames = [
  "La Jolla Lush",
  "Pasadena",
  "Cali's Finest",
  "Hollywood Lush",
  "Central Park",
];

const premiumNames = [
  "Wimbledon",
  "Malibu",
  "Big Sur",
  "Monterey",
  "Sol Natural",
  "Brentwood",
  "Newport",
];

const petNames = ["Pets Choice", "Kennels Best", "Fringe"];

const budgetFriendly = marked(budgetNames, null);
const yardTurf = [...marked(standardNames, "Standard"), ...marked(premiumNames, "Premium")];
const petTurf = marked(petNames, null);
const playgroundTurf = marked(["Kids Play"], null);

const everyGrassProduct = [
  ...marked(budgetNames, "Budget Friendly"),
  ...marked(standardNames, "Standard"),
  ...marked(premiumNames, "Premium"),
  ...marked(petNames, "Pet"),
  ...marked(["Kids Play"], "Playground"),
];

const grassAddOns = [
  "Additional #16 / #20 Silica Sand",
  "Additional Pet Deodorizer",
  "Additional Camofill",
  "Additional Seam Tape",
  "Additional Weed Cloth",
  "Gopher Wire",
  "1 x 4 Bender Board",
  "2 x 4 Pressure Treated Lumber",
  "Black Aluminum Border",
  'Additional 2" of Base',
];

export const concreteRockAddOn = "Concrete / Rock";

const additionalDemo = 'Additional 2" of Demolition';
const additionalDemoRegrade = 'Additional 2" of Demolition & Regrade';

const demoAddOns: Record<string, string[]> = {
  Demolition: [concreteRockAddOn, additionalDemo],
  "Demolition & Regrade": [concreteRockAddOn, additionalDemoRegrade],
};

export const installTypeDetail: Record<string, string> = {
  Demolition:
    "Removal of natural elements like grass and vegetation. Includes haul and dump.",
  "Demolition & Regrade":
    "Removal of grass and vegetation, then reshaping and leveling the soil. Includes haul and dump.",
  '3" Drains': "Helps manage water drainage and prevent pooling.",
  '4" Drains': "Larger drainage capacity for heavy water flow.",
  '1" Mainline': "Primary water line for irrigation systems.",
  '3/4" Waterline': "Secondary waterline for irrigation.",
  '1" Pipe Sleeve': "Protects pipes when running under hardscapes.",
  '2" Conduit': "Electrical conduit for low voltage lighting or other utilities.",
  '3/4" Gas Line': "Gas line for fire features or outdoor appliances.",
  "Run Loose Lay Wire": "Low voltage wire run above or within the landscape (no conduit).",
  "Run Wire Through Conduit": "Wire run through protective conduit for added durability.",
  "Run Line Under Concrete": "Low voltage wire run beneath concrete surfaces.",
  "Install Outlet": "Outdoor outlet for lighting system.",
  "Install GFI": "Ground fault interrupter for safety.",
  "Install Conduit with 110V Line": "Conduit run with 110V power line.",
  "Install Controller": "Lighting controller for automated operation.",
  "150 Watt Transformer": "Transformer for a smaller set of lights.",
  "300 Watt Transformer": "Transformer for a mid-size lighting layout.",
  "600 Watt Transformer": "Transformer for a larger lighting layout.",
  "Corona Bullet Up Lights": "Up lights aimed at trees, walls, or features.",
  "Corona Path Lights": "Lights along a walkway or path.",
  "Step Lights, Pro-Trade LL1": "Lights set into steps.",
  "Step Lights, Alliance SL35": "Lights set into steps.",
  "Under Lights, Pro-Trade LL1": "Lights mounted under rails, benches, or overhangs.",
};

const lightingByLength = new Set([
  "Run Loose Lay Wire",
  "Run Wire Through Conduit",
  "Run Line Under Concrete",
  "Install Conduit with 110V Line",
]);

export function lightingUnit(installType: string): "lin ft" | "each" {
  return lightingByLength.has(installType) ? "lin ft" : "each";
}

const puttingProducts: ProductOption[] = [
  "Champions Choice",
  "Pro Putter",
  "Poa Annua Natural",
  "Poa Annua Max",
].map((name) => ({ name, mark: null }));

const puttingAddOns = [
  "Additional #60 Silica Sand",
  "Additional Seam Tape",
  "Additional Weed Cloth",
  "Gopher Wire",
  "1 x 4 Bender Board",
  "2 x 4 Pressure Treated Lumber",
  "Black Aluminum Border",
  "Aluminium Golf Cup / Flag Set",
  "Unique Cup Set / Flag Light Set",
];

const addOnUnits: Record<string, string> = {
  "Additional #16 / #20 Silica Sand": "bags",
  "Additional #60 Silica Sand": "bags",
  "Additional Pet Deodorizer": "bags",
  "Additional Camofill": "bags",
  "Additional Seam Tape": "rolls",
  "Additional Weed Cloth": "rolls",
  "Gopher Wire": "rolls",
  "1 x 4 Bender Board": "linear ft",
  "2 x 4 Pressure Treated Lumber": "linear ft",
  "Black Aluminum Border": "linear ft",
  "Aluminium Golf Cup / Flag Set": "each",
  "Unique Cup Set / Flag Light Set": "each",
  'Additional 2" of Base': "layers",
  [additionalDemo]: "layers",
  [additionalDemoRegrade]: "layers",
  "Concrete / Rock": "sq ft",
};

export function unitForAddOn(addOn: string): string {
  return addOnUnits[addOn] ?? "each";
}

const notesInstallTypes = new Set([
  "Artificial Grass Replacement",
  "Artificial Grass Repair",
]);

export const installTypes: Record<string, string[]> = {
  Demo: ["Demolition", "Demolition & Regrade"],
  [grassService]: [
    "Budget Friendly",
    "Standard",
    "Deluxe",
    "Basic Pet",
    "Premium Pet",
    "Playground",
    "Glue Down Over Concrete",
    "Turf Strip",
  ],
  "Putting Green": ["Entertainment Putting Green", "PGA Putting Green"],
  Underground: [
    '3" Drains',
    '4" Drains',
    '1" Mainline',
    '3/4" Waterline',
    '1" Pipe Sleeve',
    '2" Conduit',
    '3/4" Gas Line',
  ],
  "Low Voltage Lighting": [
    "Run Loose Lay Wire",
    "Run Wire Through Conduit",
    "Run Line Under Concrete",
    "Install Outlet",
    "Install GFI",
    "Install Conduit with 110V Line",
    "Install Controller",
    "150 Watt Transformer",
    "300 Watt Transformer",
    "600 Watt Transformer",
    "Corona Bullet Up Lights",
    "Corona Path Lights",
    "Step Lights, Pro-Trade LL1",
    "Step Lights, Alliance SL35",
    "Under Lights, Pro-Trade LL1",
  ],
};

const grassProducts: Record<string, ProductOption[]> = {
  "Budget Friendly": budgetFriendly,
  Standard: yardTurf,
  Deluxe: yardTurf,
  "Basic Pet": petTurf,
  "Premium Pet": petTurf,
  Playground: playgroundTurf,
  "Glue Down Over Concrete": everyGrassProduct,
  "Turf Strip": everyGrassProduct,
};

export type CustomerType = "Homeowner" | "Contractor";

export function grassUsesLinearFeet(installType: string, product: string): boolean {
  return installType === "Turf Strip" && product !== "Kids Play";
}

export const turfInstallTypes = [
  "Budget Friendly",
  "Standard",
  "Deluxe",
  "Basic Pet",
  "Premium Pet",
  "Playground",
  "Glue Down Over Concrete",
  "Turf Strip",
];

export const soilConditions = ["Standard soil", "Rocky or clay soil", "Not sure"] as const;

export type SoilCondition = (typeof soilConditions)[number];

export const soilDetail: Record<SoilCondition, string> = {
  "Standard soil": "Typical, easy to dig.",
  "Rocky or clay soil": "Harder to dig, may require additional work.",
  "Not sure": "We can assess during the site visit.",
};

export function soilCondition(value: unknown): SoilCondition | "" {
  const match = soilConditions.find((item) => item === value);
  return match ?? "";
}

export type DiscoveryState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  customerType: CustomerType | "";
  services: string[];
  installTypes: Record<string, string[]>;
  areaNames: Record<string, string>;
  replacementInstall: Record<string, string>;
  product: Record<string, string>;
  addOns: Record<string, string[]>;
  addOnQuantity: Record<string, string>;
  lightingQuantity: Record<string, string>;
  areaKnown: Record<string, "" | "yes" | "no">;
  squareFeet: Record<string, string>;
  length: Record<string, string>;
  width: Record<string, string>;
  lengthKnown: "" | "yes" | "no";
  linearFeet: string;
  soil: SoilCondition | "";
  notes: Record<string, string>;
  grassWork: GrassWork | "";
};

export function emptyDiscovery(): DiscoveryState {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    customerType: "Homeowner",
    services: [],
    installTypes: {},
    areaNames: {},
    replacementInstall: {},
    product: {},
    addOns: {},
    addOnQuantity: {},
    lightingQuantity: {},
    areaKnown: {},
    squareFeet: {},
    length: {},
    width: {},
    lengthKnown: "",
    linearFeet: "",
    soil: "",
    notes: {},
    grassWork: "",
  };
}

export function selectionKey(service: string, installType: string): string {
  return `${service}::${installType}`;
}

export function grassJobAreaKey(installType: string): string {
  return `${selectionKey(grassService, installType)}::job`;
}

const retiredDemoAddOns: Record<string, string> = {
  'Additional 2" of Demo': additionalDemo,
  'Additional 2" of Demo & Regrade': additionalDemoRegrade,
};

function demolitionAddOnName(name: string): string {
  return retiredDemoAddOns[name] ?? name;
}

function withDemolitionAddOnNames(form: DiscoveryState): DiscoveryState {
  let changed = false;
  const addOns: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(form.addOns)) {
    const next: string[] = [];
    for (const value of values) {
      const name = demolitionAddOnName(value);
      if (name !== value) changed = true;
      if (!next.includes(name)) next.push(name);
    }
    addOns[key] = next;
  }
  const addOnQuantity: Record<string, string> = {};
  for (const [key, value] of Object.entries(form.addOnQuantity)) {
    const split = key.indexOf("::");
    const nextKey =
      split < 0 ? key : `${key.slice(0, split)}::${demolitionAddOnName(key.slice(split + 2))}`;
    if (nextKey !== key) changed = true;
    addOnQuantity[nextKey] = value;
  }
  return changed ? { ...form, addOns, addOnQuantity } : form;
}

const retiredDemoTypes: Record<string, { installType: string; concrete: boolean }> = {
  Demo: { installType: "Demolition", concrete: false },
  "Demo & Regrade": { installType: "Demolition & Regrade", concrete: false },
  "Concrete / Rock Demo": { installType: "Demolition", concrete: true },
  "Concrete / Rock Demo & Regrade": { installType: "Demolition & Regrade", concrete: true },
};

export function normalizeDemoChoices(form: DiscoveryState): DiscoveryState {
  form = withDemolitionAddOnNames(form);
  const selected = form.installTypes.Demo;
  if (selected === undefined) return form;
  const allowed = new Set(installTypes.Demo ?? []);
  const nextTypes: string[] = [];
  let concrete = (form.addOns.Demo ?? []).includes(concreteRockAddOn);
  let concreteFeet = "";
  for (const type of selected) {
    const retired = retiredDemoTypes[type];
    const name = retired?.installType ?? type;
    if (retired?.concrete) {
      concrete = true;
      if (concreteFeet === "") concreteFeet = form.squareFeet[type] ?? "";
    }
    if (allowed.has(name) && !nextTypes.includes(name)) nextTypes.push(name);
  }
  const squareFeet = { ...form.squareFeet };
  for (const [oldName, mapped] of Object.entries(retiredDemoTypes)) {
    const value = squareFeet[oldName];
    if (value && (squareFeet[mapped.installType] ?? "") === "") {
      squareFeet[mapped.installType] = value;
    }
  }
  const addOns = [...(form.addOns.Demo ?? [])];
  if (concrete && !addOns.includes(concreteRockAddOn)) addOns.push(concreteRockAddOn);
  const quantityKey = `Demo::${concreteRockAddOn}`;
  const addOnQuantity = { ...form.addOnQuantity };
  if (concrete && concreteFeet !== "" && (addOnQuantity[quantityKey] ?? "") === "") {
    addOnQuantity[quantityKey] = concreteFeet;
  }
  return {
    ...form,
    installTypes: { ...form.installTypes, Demo: nextTypes },
    squareFeet,
    addOns: { ...form.addOns, Demo: addOns },
    addOnQuantity,
  };
}

export function allowsMultipleInstallTypes(service: string): boolean {
  return service !== "Putting Green";
}

export function hasFollowUp(service: string): boolean {
  return (followUpServices as readonly string[]).includes(service);
}

export function productsFor(service: string, installType: string): ProductOption[] {
  if (service === grassService) {
    return grassProducts[installType] ?? [];
  }
  if (service === "Putting Green" && installType !== "") {
    return puttingProducts;
  }
  return [];
}

export function addOnsFor(service: string, installType: string): string[] {
  if (installType === "" || installType === "Artificial Grass Repair") {
    return [];
  }
  if (service === grassService) {
    return grassAddOns;
  }
  if (service === "Putting Green") {
    return puttingAddOns;
  }
  if (service === "Demo") {
    return demoAddOns[installType] ?? [];
  }
  return [];
}

function grassAddOnOwner(owner: string): boolean {
  return (
    owner === grassService ||
    owner === "Artificial Grass Installation" ||
    owner === "Artificial Grass Replacement" ||
    owner === "Artificial Grass Repair" ||
    turfInstallTypes.includes(owner)
  );
}

export function withAddOn(
  form: DiscoveryState,
  service: string,
  addOn: string,
  on: boolean,
): DiscoveryState {
  const addOns: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(form.addOns)) {
    const sameService = key === service || key.startsWith(`${service}::`);
    addOns[key] = sameService ? values.filter((item) => item !== addOn) : values;
  }
  if (on) addOns[service] = [...(addOns[service] ?? []), addOn];
  const addOnQuantity = { ...form.addOnQuantity };
  if (!on) {
    for (const key of Object.keys(addOnQuantity)) {
      if (key === `${service}::${addOn}` || (key.startsWith(`${service}::`) && key.endsWith(`::${addOn}`))) {
        delete addOnQuantity[key];
      }
    }
  }
  return { ...form, addOns, addOnQuantity };
}

export function addOnsForSelected(service: string, selected: string[]): string[] {
  const addOns: string[] = [];
  for (const installType of selected) {
    for (const addOn of addOnsFor(service, installType)) {
      if (!addOns.includes(addOn)) addOns.push(addOn);
    }
  }
  return addOns;
}

export function asksForArea(service: string, installType: string): boolean {
  if (installType === "" || notesInstallTypes.has(installType)) {
    return false;
  }
  return (
    service === "Demo" ||
    service === grassService ||
    service === "Putting Green"
  );
}

export function asksForNotes(installType: string): boolean {
  return notesInstallTypes.has(installType);
}

type Measurement = {
  label: string;
  length: number | null;
  width: number | null;
  squareFeet: number | null;
  linearFeet: number | null;
  unmeasured: boolean;
};

export type DiscoveryPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  services: string[];
  products: string[];
  addOns: string[];
  answers: { question: string; value: string }[];
  notes: string;
  measurements: Measurement[];
};

export function fieldIdFor(...parts: string[]): string {
  const id = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return id.length > 0 ? id : "field";
}

export type DiscoveryBuild = {
  error: string | null;
  fieldId: string | null;
  payload: DiscoveryPayload | null;
};

function invalid(error: string, fieldId: string): DiscoveryBuild {
  return { error, fieldId, payload: null };
}

export function buildDiscovery(input: DiscoveryState): DiscoveryBuild {
  const contact = contactProblems(input);
  const contactId = Object.keys(contact)[0];
  if (contactId !== undefined) {
    return invalid(contact[contactId], contactId);
  }
  if (input.services.length === 0) {
    return invalid("Choose at least one service.", "services");
  }

  const answers: { question: string; value: string }[] = [
    { question: "Customer type", value: input.customerType },
  ];
  const products: string[] = [];
  const addOns: string[] = [];
  const measurements: Measurement[] = [];
  const noteLines: string[] = [];

  for (const service of services) {
    if (!input.services.includes(service) || !hasFollowUp(service)) {
      continue;
    }
    let selected = input.installTypes[service] ?? [];
    if (service === grassService) {
      const work = grassWork(input.grassWork);
      if (work === "") {
        return invalid(
          "Choose installation, replacement, or repair.",
          fieldIdFor("grass-work", service),
        );
      }
      answers.push({ question: `${service} work`, value: work });
      if (work === "Replacement") selected = ["Artificial Grass Replacement"];
      else if (work === "Repair") selected = ["Artificial Grass Repair"];
      else selected = selected.filter((type) => turfInstallTypes.includes(type));
      input = {
        ...input,
        installTypes: { ...input.installTypes, [service]: selected },
      };
    }
    if (selected.length === 0) {
      return invalid(`Choose an installation type for ${serviceLabel(service)}.`, fieldIdFor("install", service));
    }
    if (service === grassService) {
      const grassError = collectGrass(
        input,
        selected,
        answers,
        products,
        addOns,
        measurements,
        noteLines,
      );
      if (grassError !== null) {
        return invalid(grassError.error, grassError.fieldId);
      }
      continue;
    }

    for (const installType of selected) {
      answers.push({ question: `${service} install type`, value: installType });
    }
    const needsAreaName = selected.length > 1 || service === "Low Voltage Lighting";
    for (const type of selected) {
      const areaName = needsAreaName
        ? (input.areaNames[selectionKey(service, type)] ?? "").trim()
        : "";
      if (areaName !== "") {
        answers.push({ question: `${service} area`, value: `${type}: ${areaName}` });
      }
    }
    if (service === "Low Voltage Lighting") {
      for (const type of selected) {
        const key = selectionKey(service, type);
        const text = (input.lightingQuantity[key] ?? "").trim();
        if (text === "") continue;
        const quantity = Number(text);
        const fieldId = fieldIdFor("qty", key);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return invalid(
            lightingUnit(type) === "lin ft"
              ? `Enter the linear feet for ${type}, or leave it blank.`
              : `Enter how many for ${type}, or leave it blank.`,
            fieldId,
          );
        }
        answers.push({ question: `${service} quantity`, value: `${type}: ${text}` });
        if (lightingUnit(type) === "lin ft") {
          measurements.push({
            label: type,
            length: null,
            width: null,
            squareFeet: null,
            linearFeet: quantity,
            unmeasured: false,
          });
        }
      }
    }
    const installType = selected[0];

    const productChoices = productsFor(service, installType);
    if (productChoices.length > 0) {
      const product = input.product[service] ?? "";
      if (!productChoices.some((choice) => choice.name === product)) {
        return invalid(`Choose a product for ${serviceLabel(service)}.`, fieldIdFor("product", service));
      }
      products.push(product);
    }

    if (asksForNotes(installType)) {
      const note = (input.notes[installType] ?? "").trim();
      if (note !== "") {
        noteLines.push(`${installType}: ${note}`);
      }
    }

    if (asksForArea(service, installType)) {
      for (const type of selected) {
        const areaName = (input.areaNames[selectionKey(service, type)] ?? "").trim();
        const areaError = optionalSquareFeet(
          areaName || type,
          input.squareFeet[type] ?? "",
          measurements,
          fieldIdFor("square-feet", service, type),
        );
        if (areaError !== null) {
          return invalid(areaError.error, areaError.fieldId);
        }
      }
    }

    for (const addOn of input.addOns[service] ?? []) {
      if (!selected.some((type) => addOnsFor(service, type).includes(addOn))) {
        continue;
      }
      answers.push({ question: `${service} add-on`, value: addOn });
      if (!addOns.includes(addOn)) {
        addOns.push(addOn);
      }
      const quantityError = collectQuantity(
        input,
        `${service}::${addOn}`,
        addOn,
        `${service} add-on quantity`,
        answers,
      );
      if (quantityError !== null) {
        return invalid(quantityError.error, quantityError.fieldId);
      }
    }
  }

  if (input.services.includes("Underground")) {
    const soil = soilCondition(input.soil);
    if (soil === "") {
      return invalid("Tell us the soil conditions.", "underground-soil");
    }
    answers.push({ question: "Underground soil", value: soil });
    const lengthError = optionalLinearFeet(
      "Underground",
      input.linearFeet,
      measurements,
      "underground-feet",
    );
    if (lengthError !== null) {
      return invalid(lengthError.error, lengthError.fieldId);
    }
  }

  return {
    error: null,
    fieldId: null,
    payload: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: phoneInput(input.phone),
      email: input.email.trim(),
      street1: input.street1.trim(),
      street2: input.street2.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      zip: zipInput(input.zip),
      services: services.filter((service) => input.services.includes(service)),
      products,
      addOns,
      answers,
      notes: noteLines.join("\n"),
      measurements,
    },
  };
}

function collectGrass(
  input: DiscoveryState,
  selected: string[],
  answers: { question: string; value: string }[],
  products: string[],
  addOns: string[],
  measurements: Measurement[],
  noteLines: string[],
): { error: string; fieldId: string } | null {
  const service = grassService;
  const needsAreaName = selected.length > 1;
  for (const installType of selected) {
    const key = selectionKey(service, installType);
    const areaName = needsAreaName ? (input.areaNames[key] ?? "").trim() : "";
    answers.push({ question: `${service} install type`, value: installType });
    if (areaName !== "") {
      answers.push({
        question: `${service} area`,
        value: `${installType}: ${areaName}`,
      });
    }
    const note = (input.notes[installType] ?? "").trim();
    if (note !== "" && asksForNotes(installType)) {
      noteLines.push(`${installType}: ${note}`);
    }
    if (installType === "Artificial Grass Repair" || installType === "Artificial Grass Replacement") {
      const jobKey = installType === "Artificial Grass Repair" ? key : grassJobAreaKey(installType);
      const jobLabel =
        installType === "Artificial Grass Repair" ? installType : `${installType} job`;
      const jobError = optionalSquareFeet(
        jobLabel,
        input.squareFeet[jobKey] ?? "",
        measurements,
        fieldIdFor("square-feet", jobKey),
      );
      if (jobError !== null) {
        return jobError;
      }
    }
    if (installType === "Artificial Grass Repair") {
      continue;
    }

    const productInstall =
      installType === "Artificial Grass Replacement"
        ? (input.replacementInstall[key] ?? "")
        : installType;
    if (installType === "Artificial Grass Replacement") {
      if (!turfInstallTypes.includes(productInstall)) {
        return {
          error: "Choose the new turf installation for the replacement.",
          fieldId: fieldIdFor("replacement", key),
        };
      }
      answers.push({
        question: "Artificial Grass Replacement new installation",
        value: productInstall,
      });
    }

    const product = input.product[key] ?? "";
    if (!productsFor(service, productInstall).some((choice) => choice.name === product)) {
      return {
        error: `Choose a turf product for ${installType}.`,
        fieldId: fieldIdFor("product", key),
      };
    }
    products.push(product);
    answers.push({ question: `${installType} product`, value: product });

    const measureText = input.squareFeet[key] ?? "";
    const areaError = grassUsesLinearFeet(productInstall, product)
      ? optionalLinearFeet(
          areaName || installType,
          measureText,
          measurements,
          fieldIdFor("square-feet", key),
        )
      : optionalSquareFeet(
          areaName || installType,
          measureText,
          measurements,
          fieldIdFor("square-feet", key),
        );
    if (areaError !== null) {
      return areaError;
    }
  }

  const offered = new Set(addOnsForSelected(service, selected));
  if (offered.size === 0) return null;
  for (const addOn of input.addOns[service] ?? []) {
    if (!offered.has(addOn)) continue;
    answers.push({ question: `${service} add-on`, value: addOn });
    if (!addOns.includes(addOn)) addOns.push(addOn);
    const quantityError = collectQuantity(
      input,
      `${service}::${addOn}`,
      addOn,
      `${service} add-on quantity`,
      answers,
    );
    if (quantityError !== null) return quantityError;
  }
  return null;
}

function optionalSquareFeet(
  label: string,
  squareFeetText: string,
  measurements: Measurement[],
  fieldId: string,
): { error: string; fieldId: string } | null {
  if (squareFeetText.trim() === "") {
    measurements.push(blankMeasurement(label));
    return null;
  }
  const squareFeet = Number(squareFeetText);
  if (!Number.isFinite(squareFeet) || squareFeet <= 0) {
    return {
      error: `Enter the square footage for ${label}, or leave it blank.`,
      fieldId,
    };
  }
  measurements.push({
    label,
    length: null,
    width: null,
    squareFeet,
    linearFeet: null,
    unmeasured: false,
  });
  return null;
}

function optionalLinearFeet(
  label: string,
  linearFeetText: string,
  measurements: Measurement[],
  fieldId: string,
): { error: string; fieldId: string } | null {
  if (linearFeetText.trim() === "") {
    measurements.push(blankMeasurement(label));
    return null;
  }
  const linearFeet = Number(linearFeetText);
  if (!Number.isFinite(linearFeet) || linearFeet <= 0) {
    return {
      error: `Enter the linear feet for ${label}, or leave it blank.`,
      fieldId,
    };
  }
  measurements.push({
    label,
    length: null,
    width: null,
    squareFeet: null,
    linearFeet,
    unmeasured: false,
  });
  return null;
}

function collectQuantity(
  input: DiscoveryState,
  key: string,
  addOn: string,
  question: string,
  answers: { question: string; value: string }[],
): { error: string; fieldId: string } | null {
  const quantity = (input.addOnQuantity[key] ?? "").trim();
  const parsed = Number(quantity);
  if (quantity === "" || !Number.isFinite(parsed) || parsed <= 0) {
    return {
      error: `Enter how many ${unitForAddOn(addOn)} for ${addOn}.`,
      fieldId: fieldIdFor("qty", key),
    };
  }
  answers.push({ question, value: `${addOn}: ${quantity}` });
  return null;
}

const emailPattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function phoneInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Digits (at most 10) shown as the person types: 555 → (555, 5551234 → (555) 123-4. */
export function formatPhone(value: string): string {
  const digits = phoneInput(value);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function emailInput(value: string): string {
  return value.replace(/\s/g, "").slice(0, 254);
}

export function zipInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function decimalInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned.slice(0, 8);
  const whole = cleaned.slice(0, dot).slice(0, 8);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

function hasLetter(value: string): boolean {
  return /\p{L}/u.test(value);
}

export type ContactFields = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
};

export function contactProblems(input: ContactFields): Record<string, string> {
  const problems: Record<string, string> = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = phoneInput(input.phone);
  const email = input.email.trim();
  const street1 = input.street1.trim();
  const city = input.city.trim();
  if (firstName === "") problems.firstName = "Enter a first name.";
  else if (!hasLetter(firstName)) problems.firstName = "Use letters in the first name.";
  if (lastName === "") problems.lastName = "Enter a last name.";
  else if (!hasLetter(lastName)) problems.lastName = "Use letters in the last name.";
  if (phone.length !== 10) problems.phone = "Enter a 10-digit phone number.";
  else if (phone[0] === "0" || phone[0] === "1") {
    problems.phone = "Enter a 10-digit phone number that does not start with 0 or 1.";
  }
  if (!emailPattern.test(email)) {
    problems.email = "Enter an email like name@gmail.com.";
  }
  if (street1 === "") problems.street1 = "Enter a street address.";
  else if (!hasLetter(street1)) problems.street1 = "Enter a street name.";
  if (city === "") problems.city = "Enter a city.";
  else if (!hasLetter(city)) problems.city = "Use letters in the city.";
  if (!isUsState(input.state)) problems.state = "Choose a state.";
  if (!/^\d{5}(?:-\d{4})?$/.test(input.zip.trim())) {
    problems.zip = "Enter a 5-digit ZIP, or a ZIP+4.";
  }
  return problems;
}

export function requiredContact(input: DiscoveryState): string | null {
  const first = Object.values(contactProblems(input))[0];
  return first ?? null;
}

function storedSquareFeet(measurement: {
  length: number | null;
  width: number | null;
  squareFeet: number | null;
  unmeasured: boolean;
}): number | null {
  if (measurement.unmeasured) return null;
  if (measurement.squareFeet !== null && measurement.squareFeet > 0) return measurement.squareFeet;
  if (
    measurement.length !== null &&
    measurement.width !== null &&
    measurement.length > 0 &&
    measurement.width > 0
  ) {
    return measurement.length * measurement.width;
  }
  return null;
}

function blankMeasurement(label: string): Measurement {
  return {
    label,
    length: null,
    width: null,
    squareFeet: null,
    linearFeet: null,
    unmeasured: true,
  };
}

export function areaBandFor(squareFeet: number): string {
  if (squareFeet <= 299) return "299 SF & under";
  if (squareFeet <= 699) return "300-699";
  if (squareFeet <= 999) return "700-999";
  if (squareFeet <= 1499) return "1000-1499";
  if (squareFeet <= 1999) return "1500-1999";
  return "2000+";
}

export type SavedProject = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  services: string[];
  products: string[];
  answers: { question: string; value: string }[];
  notes: string;
  measurements: {
    label: string;
    length: number | null;
    width: number | null;
    squareFeet: number | null;
    linearFeet: number | null;
    unmeasured: boolean;
  }[];
};

export function projectToForm(project: SavedProject): {
  form: DiscoveryState;
  visitNote: string;
} {
  const form = emptyDiscovery();
  form.firstName = project.firstName;
  form.lastName = project.lastName;
  form.phone = phoneInput(project.phone);
  form.email = emailInput(project.email);
  form.street1 = project.street1;
  form.street2 = project.street2;
  form.city = project.city;
  form.state = project.state;
  form.zip = zipInput(project.zip);
  form.services = orderServices([
    ...new Set(
      project.services
        .map((name) => canonicalService(name))
        .filter((name) => (services as readonly string[]).includes(name)),
    ),
  ]);

  const customerType = project.answers.find((answer) => answer.question === "Customer type")?.value;
  if (customerType === "Homeowner" || customerType === "Contractor") {
    form.customerType = customerType;
  }

  const grassTypes = installTypes[grassService] ?? [];
  for (const service of services) {
    const questions =
      service === grassService
        ? [`${grassService} install type`, "Artificial Grass Installation install type"]
        : [`${service} install type`];
    const selected = project.answers
      .filter((answer) => questions.includes(answer.question))
      .map((answer) => answer.value);
    if (selected.length > 0) {
      form.installTypes[service] = selected;
    }
  }

  for (const answer of project.answers) {
    if (answer.question.endsWith(" area")) {
      const service = canonicalService(answer.question.slice(0, -" area".length));
      const separator = answer.value.indexOf(": ");
      if (separator > 0 && (services as readonly string[]).includes(service)) {
        const installType = answer.value.slice(0, separator);
        form.areaNames[selectionKey(service, installType)] = answer.value.slice(separator + 2);
      }
    }
    if (answer.question === `${grassService} work` || answer.question === "Artificial Grass Installation work") {
      form.grassWork = grassWork(answer.value);
    }
    if (answer.question === "Artificial Grass Replacement new installation") {
      form.replacementInstall[
        selectionKey(grassService, "Artificial Grass Replacement")
      ] = answer.value;
    }
    if (answer.question.endsWith(" product")) {
      const installType = answer.question.slice(0, -" product".length);
      if (grassTypes.includes(installType) || installType === "Artificial Grass Replacement") {
        form.product[selectionKey(grassService, installType)] = answer.value;
      }
    }
    if (answer.question.endsWith(" add-on")) {
      const owner = answer.question.slice(0, -" add-on".length);
      const key = grassAddOnOwner(owner) ? grassService : owner;
      const chosen = form.addOns[key] ?? [];
      if (!chosen.includes(answer.value)) form.addOns[key] = [...chosen, answer.value];
    }
    if (answer.question === "Low Voltage Lighting quantity") {
      const separator = answer.value.indexOf(": ");
      if (separator > 0) {
        const installType = answer.value.slice(0, separator);
        form.lightingQuantity[selectionKey("Low Voltage Lighting", installType)] =
          answer.value.slice(separator + 2);
      }
    }
    if (answer.question.endsWith(" add-on quantity")) {
      const owner = answer.question.slice(0, -" add-on quantity".length);
      const separator = answer.value.indexOf(": ");
      if (separator > 0) {
        const addOn = answer.value.slice(0, separator);
        const key = grassAddOnOwner(owner) ? `${grassService}::${addOn}` : `${owner}::${addOn}`;
        form.addOnQuantity[key] = answer.value.slice(separator + 2);
      }
    }
    if (answer.question.endsWith(" area known")) {
      const service = answer.question.slice(0, -" area known".length);
      if (answer.value === "yes" || answer.value === "no") {
        form.areaKnown[service] = answer.value;
      }
    }
    if (
      answer.question === "Underground length known" &&
      (answer.value === "yes" || answer.value === "no")
    ) {
      form.lengthKnown = answer.value;
    }
    if (answer.question === "Underground soil") {
      form.soil = soilCondition(answer.value);
    }
  }

  const puttingNames = new Set(
    productsFor("Putting Green", "PGA Putting Green").map((product) => product.name),
  );
  const puttingProduct = project.products.find((name) => puttingNames.has(name));
  if (puttingProduct !== undefined) {
    form.product["Putting Green"] = puttingProduct;
  }

  for (const measurement of project.measurements) {
    if (measurement.label === "Underground" && measurement.linearFeet !== null) {
      form.linearFeet = String(measurement.linearFeet);
    }
    if (
      (installTypes["Low Voltage Lighting"] ?? []).includes(measurement.label) &&
      measurement.linearFeet !== null &&
      measurement.linearFeet > 0
    ) {
      const key = selectionKey("Low Voltage Lighting", measurement.label);
      if ((form.lightingQuantity[key] ?? "") === "") {
        form.lightingQuantity[key] = String(measurement.linearFeet);
      }
    }
    const feet = storedSquareFeet(measurement);
    if (feet !== null) {
      form.squareFeet[measurement.label] = String(feet);
      if (measurement.label === "Demo" || measurement.label === "Putting Green") {
        for (const type of form.installTypes[measurement.label] ?? []) {
          form.squareFeet[type] ??= String(feet);
        }
      }
      for (const service of ["Demo", "Putting Green"] as const) {
        for (const type of form.installTypes[service] ?? []) {
          const areaName = form.areaNames[selectionKey(service, type)] ?? "";
          if (measurement.label === type || (areaName !== "" && measurement.label === areaName)) {
            form.squareFeet[type] = String(feet);
          }
        }
      }
    }
    for (const installType of grassTypes) {
      const key = selectionKey(grassService, installType);
      const areaName = form.areaNames[key] ?? "";
      const matches =
        measurement.label === installType || (areaName !== "" && measurement.label === areaName);
      if (matches && feet !== null) form.squareFeet[key] = String(feet);
      if (
        matches &&
        feet === null &&
        measurement.linearFeet !== null &&
        measurement.linearFeet > 0
      ) {
        form.squareFeet[key] = String(measurement.linearFeet);
      }
    }
    if (measurement.label === "Artificial Grass Repair" && feet !== null) {
      form.squareFeet[selectionKey(grassService, "Artificial Grass Repair")] = String(feet);
    }
    if (measurement.label === "Artificial Grass Replacement" && feet !== null) {
      form.squareFeet[selectionKey(grassService, "Artificial Grass Replacement")] = String(feet);
    }
    if (measurement.label === "Artificial Grass Replacement job" && feet !== null) {
      form.squareFeet[grassJobAreaKey("Artificial Grass Replacement")] = String(feet);
    }
  }

  const visitLines: string[] = [];
  for (const line of project.notes.split("\n")) {
    const separator = line.indexOf(": ");
    const prefix = separator > 0 ? line.slice(0, separator) : "";
    if (separator > 0 && asksForNotes(prefix)) {
      form.notes[prefix] = line.slice(separator + 2);
    } else if (line.trim() !== "") {
      visitLines.push(line);
    }
  }

  if (form.grassWork === "") {
    form.grassWork = grassWorkFromTypes(form.installTypes[grassService] ?? []);
  }
  return { form: normalizeDemoChoices(form), visitNote: visitLines.join("\n") };
}
