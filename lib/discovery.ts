import { isUsState } from "./us-states";

export const services = [
  "Demo",
  "Artificial Grass Installation",
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

const followUpServices = [
  "Demo",
  "Artificial Grass Installation",
  "Putting Green",
  "Underground",
  "Low Voltage Lighting",
] as const;

type ProductOption = { name: string; mark: string | null };

const budgetFriendly = [
  "Players Choice",
  "Olive Natural",
  "Cali's Finest Light",
  "Hollywood",
  "Spring Natural",
].map((name) => ({ name, mark: null }));

const standardAndDeluxe: ProductOption[] = [
  ["La Jolla Lush", "Standard"],
  ["Pasadena", "Standard"],
  ["Cali's Finest", "Standard"],
  ["Hollywood Lush", "Standard"],
  ["Central Park", "Standard"],
  ["Wimbledon", "Premium"],
  ["Malibu", "Premium"],
  ["Big Sur", "Premium"],
  ["Monterey", "Premium"],
  ["Sol Natural", "Premium"],
  ["Brentwood", "Premium"],
  ["Newport", "Premium"],
].map(([name, mark]) => ({ name, mark }));

const petTurf = ["Pets Choice", "Kennels Best", "Fringe"].map((name) => ({
  name,
  mark: null,
}));

const playgroundTurf: ProductOption[] = [{ name: "Kids Play", mark: null }];

const everyGrassProduct = [
  ...budgetFriendly,
  ...standardAndDeluxe,
  ...petTurf,
  ...playgroundTurf,
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
];

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

const notesInstallTypes = new Set([
  "Artificial Grass Replacement",
  "Artificial Grass Repair",
]);

export const installTypes: Record<string, string[]> = {
  Demo: [
    "Demo",
    "Demo & Regrade",
    "Concrete / Rock Demo",
    "Concrete / Rock Demo & Regrade",
  ],
  "Artificial Grass Installation": [
    "Budget Friendly",
    "Standard and Deluxe",
    "Basic Pet and Premium Pet",
    "Playground",
    "Glue Down Over Concrete",
    "Turf Stip",
    "Artificial Grass Replacement",
    "Artificial Grass Repair",
  ],
  "Putting Green": ["Entertaintment Putting Green", "PGA Putting Green"],
  Underground: [
    'Drains (3" or 4")',
    '1" Mainline',
    '3/4" Waterline',
    '1" Pipe Sleeve',
    '2" Conduit',
    '3/4" Gas Line',
  ],
  "Low Voltage Lighting": [
    "Run Wire",
    "Install Outlet",
    "Install GFI",
    "Install Conduit",
    "Install Controller",
    "Install Transformer",
    "Install Bullet up Lights",
    "Install Path Lights",
    "Install Step Lights",
    "Install Under Lights",
  ],
};

const grassProducts: Record<string, ProductOption[]> = {
  "Budget Friendly": budgetFriendly,
  "Standard and Deluxe": standardAndDeluxe,
  "Basic Pet and Premium Pet": petTurf,
  Playground: playgroundTurf,
  "Glue Down Over Concrete": everyGrassProduct,
  "Turf Stip": everyGrassProduct,
};

export type CustomerType = "Homeowner" | "Contractor";

export const turfInstallTypes = [
  "Budget Friendly",
  "Standard and Deluxe",
  "Basic Pet and Premium Pet",
  "Playground",
  "Glue Down Over Concrete",
  "Turf Stip",
];

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
  customerType: CustomerType;
  services: string[];
  installTypes: Record<string, string[]>;
  areaNames: Record<string, string>;
  replacementInstall: Record<string, string>;
  product: Record<string, string>;
  addOns: Record<string, string[]>;
  addOnQuantity: Record<string, string>;
  areaKnown: Record<string, "" | "yes" | "no">;
  length: Record<string, string>;
  width: Record<string, string>;
  lengthKnown: "" | "yes" | "no";
  linearFeet: string;
  notes: Record<string, string>;
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
    areaKnown: {},
    length: {},
    width: {},
    lengthKnown: "",
    linearFeet: "",
    notes: {},
  };
}

export function selectionKey(service: string, installType: string): string {
  return `${service}::${installType}`;
}

export function allowsMultipleInstallTypes(service: string): boolean {
  return service !== "Putting Green";
}

export function hasFollowUp(service: string): boolean {
  return (followUpServices as readonly string[]).includes(service);
}

export function productsFor(service: string, installType: string): ProductOption[] {
  if (service === "Artificial Grass Installation") {
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
  if (service === "Artificial Grass Installation") {
    return grassAddOns;
  }
  if (service === "Putting Green") {
    return puttingAddOns;
  }
  return [];
}

export function asksForArea(service: string, installType: string): boolean {
  if (installType === "" || notesInstallTypes.has(installType)) {
    return false;
  }
  return (
    service === "Demo" ||
    service === "Artificial Grass Installation" ||
    service === "Putting Green"
  );
}

export function asksForNotes(installType: string): boolean {
  return notesInstallTypes.has(installType);
}

export function areaPreview(length: string, width: string): string | null {
  const parsedLength = Number(length);
  const parsedWidth = Number(width);
  if (!Number.isFinite(parsedLength) || !Number.isFinite(parsedWidth)) {
    return null;
  }
  if (parsedLength <= 0 || parsedWidth <= 0) {
    return null;
  }
  const squareFeet = parsedLength * parsedWidth;
  return `${squareFeet} square feet, ${areaBandFor(squareFeet)}`;
}

type Measurement = {
  label: string;
  length: number | null;
  width: number | null;
  squareFeet: null;
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

export function buildDiscovery(input: DiscoveryState): {
  error: string | null;
  payload: DiscoveryPayload | null;
} {
  const contactError = requiredContact(input);
  if (contactError !== null) {
    return { error: contactError, payload: null };
  }
  if (input.services.length === 0) {
    return { error: "Choose at least one service.", payload: null };
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
    const selected = input.installTypes[service] ?? [];
    if (selected.length === 0) {
      return { error: `Choose an install type for ${service}.`, payload: null };
    }
    if (service === "Artificial Grass Installation") {
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
        return { error: grassError, payload: null };
      }
      continue;
    }

    for (const installType of selected) {
      answers.push({ question: `${service} install type`, value: installType });
    }
    const installType = selected[0];

    const productChoices = productsFor(service, installType);
    if (productChoices.length > 0) {
      const product = input.product[service] ?? "";
      if (!productChoices.some((choice) => choice.name === product)) {
        return { error: `Choose a product for ${service}.`, payload: null };
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
      const known = input.areaKnown[service] ?? "";
      if (known !== "yes" && known !== "no") {
        return {
          error: `Tell us whether you know the area for ${service}.`,
          payload: null,
        };
      }
      answers.push({ question: `${service} area known`, value: known });
      if (known === "no") {
        measurements.push(blankMeasurement(service));
      } else {
        const length = Number(input.length[service]);
        const width = Number(input.width[service]);
        if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
          return {
            error: `Enter a length and width for ${service}.`,
            payload: null,
          };
        }
        measurements.push({
          label: service,
          length,
          width,
          squareFeet: null,
          linearFeet: null,
          unmeasured: false,
        });
      }
    }

    for (const addOn of input.addOns[service] ?? []) {
      if (!addOnsFor(service, installType).includes(addOn)) {
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
        return { error: quantityError, payload: null };
      }
    }
  }

  if (input.services.includes("Underground")) {
    if (input.lengthKnown !== "yes" && input.lengthKnown !== "no") {
      return {
        error: "Tell us whether you know the underground length.",
        payload: null,
      };
    }
    answers.push({
      question: "Underground length known",
      value: input.lengthKnown,
    });
    if (input.lengthKnown === "no") {
      measurements.push(blankMeasurement("Underground"));
    } else {
      const linearFeet = Number(input.linearFeet);
      if (!Number.isFinite(linearFeet) || linearFeet <= 0) {
        return { error: "Enter the underground length in linear feet.", payload: null };
      }
      measurements.push({
        label: "Underground",
        length: null,
        width: null,
        squareFeet: null,
        linearFeet,
        unmeasured: false,
      });
    }
  }

  return {
    error: null,
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
): string | null {
  const service = "Artificial Grass Installation";
  const needsAreaName = selected.length > 1;
  for (const installType of selected) {
    const key = selectionKey(service, installType);
    const areaName = (input.areaNames[key] ?? "").trim();
    if (needsAreaName && areaName === "") {
      return `Name the area for ${installType}.`;
    }
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
    if (installType === "Artificial Grass Repair") {
      continue;
    }

    const productInstall =
      installType === "Artificial Grass Replacement"
        ? (input.replacementInstall[key] ?? "")
        : installType;
    if (installType === "Artificial Grass Replacement") {
      if (!turfInstallTypes.includes(productInstall)) {
        return "Choose the new turf installation for the replacement.";
      }
      answers.push({
        question: "Artificial Grass Replacement new installation",
        value: productInstall,
      });
    }

    const product = input.product[key] ?? "";
    if (!productsFor(service, productInstall).some((choice) => choice.name === product)) {
      return `Choose a turf product for ${installType}.`;
    }
    products.push(product);
    answers.push({ question: `${installType} product`, value: product });

    const areaError = optionalArea(
      areaName || installType,
      input.length[key] ?? "",
      input.width[key] ?? "",
      measurements,
    );
    if (areaError !== null) {
      return areaError;
    }

    for (const addOn of input.addOns[key] ?? []) {
      if (!addOnsFor(service, productInstall).includes(addOn)) {
        continue;
      }
      answers.push({ question: `${installType} add-on`, value: addOn });
      if (!addOns.includes(addOn)) {
        addOns.push(addOn);
      }
      const quantityError = collectQuantity(
        input,
        `${key}::${addOn}`,
        addOn,
        `${installType} add-on quantity`,
        answers,
      );
      if (quantityError !== null) {
        return quantityError;
      }
    }
  }
  return null;
}

function optionalArea(
  label: string,
  lengthText: string,
  widthText: string,
  measurements: Measurement[],
): string | null {
  if (lengthText.trim() === "" && widthText.trim() === "") {
    measurements.push(blankMeasurement(label));
    return null;
  }
  const length = Number(lengthText);
  const width = Number(widthText);
  if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
    return `Enter both length and width for ${label}, or leave both blank.`;
  }
  measurements.push({
    label,
    length,
    width,
    squareFeet: null,
    linearFeet: null,
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
): string | null {
  const quantity = (input.addOnQuantity[key] ?? "").trim();
  if (quantity === "") {
    return null;
  }
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return `Enter a quantity for ${addOn}, or leave it blank.`;
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
  if (!/^\d{5}(?:-\d{4})?$/.test(input.zip.trim())) problems.zip = "Enter a 5-digit ZIP code.";
  return problems;
}

export function requiredContact(input: DiscoveryState): string | null {
  const first = Object.values(contactProblems(input))[0];
  return first ?? null;
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
  form.services = [...project.services];

  const customerType = project.answers.find((answer) => answer.question === "Customer type")?.value;
  if (customerType === "Homeowner" || customerType === "Contractor") {
    form.customerType = customerType;
  }

  const grassTypes = installTypes["Artificial Grass Installation"] ?? [];
  for (const service of services) {
    const selected = project.answers
      .filter((answer) => answer.question === `${service} install type`)
      .map((answer) => answer.value);
    if (selected.length > 0) {
      form.installTypes[service] = selected;
    }
  }

  for (const answer of project.answers) {
    if (answer.question === "Artificial Grass Installation area") {
      const separator = answer.value.indexOf(": ");
      if (separator > 0) {
        const installType = answer.value.slice(0, separator);
        form.areaNames[selectionKey("Artificial Grass Installation", installType)] =
          answer.value.slice(separator + 2);
      }
    }
    if (answer.question === "Artificial Grass Replacement new installation") {
      form.replacementInstall[
        selectionKey("Artificial Grass Installation", "Artificial Grass Replacement")
      ] = answer.value;
    }
    if (answer.question.endsWith(" product")) {
      const installType = answer.question.slice(0, -" product".length);
      if (grassTypes.includes(installType)) {
        form.product[selectionKey("Artificial Grass Installation", installType)] = answer.value;
      }
    }
    if (answer.question.endsWith(" add-on")) {
      const owner = answer.question.slice(0, -" add-on".length);
      const key = grassTypes.includes(owner)
        ? selectionKey("Artificial Grass Installation", owner)
        : owner;
      form.addOns[key] = [...(form.addOns[key] ?? []), answer.value];
    }
    if (answer.question.endsWith(" add-on quantity")) {
      const owner = answer.question.slice(0, -" add-on quantity".length);
      const separator = answer.value.indexOf(": ");
      if (separator > 0) {
        const addOn = answer.value.slice(0, separator);
        const key = grassTypes.includes(owner)
          ? `${selectionKey("Artificial Grass Installation", owner)}::${addOn}`
          : `${owner}::${addOn}`;
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
      form.services.includes(measurement.label) &&
      measurement.length !== null &&
      measurement.width !== null &&
      !measurement.unmeasured
    ) {
      form.length[measurement.label] = String(measurement.length);
      form.width[measurement.label] = String(measurement.width);
    }
    for (const installType of grassTypes) {
      const key = selectionKey("Artificial Grass Installation", installType);
      const areaName = form.areaNames[key] ?? "";
      const matches =
        measurement.label === installType || (areaName !== "" && measurement.label === areaName);
      if (
        matches &&
        measurement.length !== null &&
        measurement.width !== null &&
        !measurement.unmeasured
      ) {
        form.length[key] = String(measurement.length);
        form.width[key] = String(measurement.width);
      }
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

  return { form, visitNote: visitLines.join("\n") };
}
