import { findDummyItem } from "./dummy-catalogue";
import {
  areaBandFor,
  canonicalService,
  grassService,
  grassUsesLinearFeet,
  hasFollowUp,
  productsFor,
  serviceLabel,
  services,
  turfInstallTypes,
  type CustomerType,
} from "./discovery";

type Answer = { question: string; value: string };

type StoredMeasurement = {
  label: string;
  squareFeet: number | null;
  linearFeet: number | null;
  unmeasured: boolean;
};

type StoredWorkArea = {
  label: string;
  length: number | null;
  width: number | null;
  quantity: number | null;
  service?: string;
  installType?: string;
};

export type QuoteProject = {
  services: string[];
  products: string[];
  answers: Answer[];
  measurements: StoredMeasurement[];
  workAreas: StoredWorkArea[];
};

export type PlannedLine = {
  name: string;
  quantity: number;
};

export function planQuoteLines(project: QuoteProject): {
  lines: PlannedLine[];
  missing: string | null;
} {
  const customerType = project.answers.find((answer) => answer.question === "Customer type")?.value;
  if (customerType !== "Homeowner" && customerType !== "Contractor") {
    return { lines: [], missing: "Customer type is missing." };
  }

  const lines: PlannedLine[] = [];
  const gaps: string[] = [];
  const usedLabels = new Set<string>();

  for (const service of services) {
    if (!project.services.some((name) => canonicalService(name) === service)) continue;
    if (service === grassService) {
      planGrass(project, customerType, lines, gaps, usedLabels);
      continue;
    }
    if (!hasFollowUp(service)) {
      planCount(customerType, service, null, service, project, lines, gaps, usedLabels);
      continue;
    }
    const selected = values(project.answers, `${service} install type`);
    if (selected.length === 0) {
      gaps.push(`Choose an installation type for ${serviceLabel(service)}.`);
      continue;
    }
    if (service === "Demo" || service === "Putting Green") {
      planAreaService(project, customerType, service, selected, lines, gaps, usedLabels);
      continue;
    }
    if (service === "Underground") {
      const soil =
        project.answers.find((answer) => answer.question === "Underground soil")?.value ?? "";
      const knownSoil = soil === "Standard soil" || soil === "Rocky or clay soil";
      if (!knownSoil) {
        gaps.push("Soil is still missing for Underground.");
      }
      const quantity = measure(project, "Underground", "linear feet", usedLabels);
      if (quantity === null) {
        gaps.push("Length is still missing for Underground.");
      }
      for (const installType of selected) {
        if (quantity === null || !knownSoil) continue;
        addLine(
          lines,
          gaps,
          { customerType, service, installType, soil },
          quantity,
          `${service} / ${installType} / ${soil}`,
        );
      }
      continue;
    }
    if (service === "Low Voltage Lighting") {
      for (const installType of selected) {
        const prefix = `${installType}: `;
        const stated = project.answers.find(
          (answer) =>
            answer.question === "Low Voltage Lighting quantity" && answer.value.startsWith(prefix),
        );
        const parsed = stated === undefined ? NaN : Number(stated.value.slice(prefix.length));
        const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        addLine(
          lines,
          gaps,
          { customerType, service, installType },
          quantity,
          `${service} / ${installType}`,
        );
      }
      continue;
    }
    for (const installType of selected) {
      planCount(customerType, service, installType, installType, project, lines, gaps, usedLabels);
    }
  }

  for (const area of project.workAreas) {
    const quantity = areaQuantity(area);
    if (quantity === null || usedLabels.has(area.label)) continue;
    gaps.push(`Work area ${area.label} is not matched to a service.`);
  }

  if (lines.length === 0 && gaps.length === 0) {
    gaps.push("Choose at least one service.");
  }
  if (gaps.length > 0) {
    return { lines: [], missing: gaps.join(" ").slice(0, 500) };
  }
  return { lines: mergeLines(lines), missing: null };
}

function planGrass(
  project: QuoteProject,
  customerType: CustomerType,
  lines: PlannedLine[],
  gaps: string[],
  usedLabels: Set<string>,
) {
  const selected = [
    ...values(project.answers, `${grassService} install type`),
    ...values(project.answers, "Artificial Grass Installation install type"),
  ];
  if (selected.length === 0) {
    gaps.push(`Choose an installation type for ${serviceLabel(grassService)}.`);
    return;
  }
  for (const installType of selected) {
    if (installType === "Artificial Grass Repair" || installType === "Artificial Grass Replacement") {
      addLine(
        lines,
        gaps,
        { customerType, service: grassService, installType },
        1,
        `${grassService} / ${installType}`,
      );
    }
    if (installType === "Artificial Grass Repair") continue;

    const productInstall =
      installType === "Artificial Grass Replacement"
        ? project.answers.find(
            (answer) => answer.question === "Artificial Grass Replacement new installation",
          )?.value ?? ""
        : installType;
    if (
      installType === "Artificial Grass Replacement" &&
      !(turfInstallTypes as readonly string[]).includes(productInstall)
    ) {
      gaps.push("Choose the new turf installation for the replacement.");
      continue;
    }
    const product =
      project.answers.find((answer) => answer.question === `${installType} product`)?.value ?? "";
    const areaName = areaNameFor(project.answers, grassService, installType);
    const label = areaName || installType;
    const linear = grassUsesLinearFeet(productInstall, product);
    const quantity = measure(project, label, linear ? "linear feet" : "square feet", usedLabels, {
      service: grassService,
      installType,
    });
    if (quantity === null) {
      gaps.push(`Size is still missing for ${label}.`);
      continue;
    }
    addLine(
      lines,
      gaps,
      {
        customerType,
        service: grassService,
        installType: productInstall,
        product,
        areaBand: linear ? null : areaBandFor(quantity),
      },
      quantity,
      `${installType} / ${product}`,
    );
    planAddOns(
      project,
      customerType,
      grassService,
      `${installType} add-on`,
      `${installType} add-on quantity`,
      lines,
      gaps,
    );
  }
  planAddOns(
    project,
    customerType,
    grassService,
    `${grassService} add-on`,
    `${grassService} add-on quantity`,
    lines,
    gaps,
  );
}

function planAreaService(
  project: QuoteProject,
  customerType: CustomerType,
  service: "Demo" | "Putting Green",
  selected: string[],
  lines: PlannedLine[],
  gaps: string[],
  usedLabels: Set<string>,
) {
  const installType = selected[0] ?? "";
  const productNames = new Set(productsFor(service, installType).map((product) => product.name));
  const product =
    service === "Putting Green"
      ? project.products.find((name) => productNames.has(name)) ?? null
      : null;
  if (service === "Putting Green" && product === null) {
    gaps.push("Choose a product for Putting Green.");
    return;
  }
  const shared = project.measurements.find(
    (item) => item.label === service && !item.unmeasured && item.squareFeet !== null && item.squareFeet > 0,
  );
  for (const type of selected) {
    const named = areaNameFor(project.answers, service, type);
    const own =
      (named === "" ? null : measure(project, named, "square feet", usedLabels, { service, installType: type })) ??
      measure(project, type, "square feet", usedLabels, { service, installType: type });
    const quantity = own ?? shared?.squareFeet ?? null;
    if (quantity === null) {
      gaps.push(`Size is still missing for ${type}.`);
      continue;
    }
    addLine(
      lines,
      gaps,
      {
        customerType,
        service,
        installType: type,
        product: service === "Putting Green" ? product : null,
        areaBand: areaBandFor(quantity),
      },
      quantity,
      `${service} / ${type}`,
    );
  }
  planAddOns(
    project,
    customerType,
    service,
    `${service} add-on`,
    `${service} add-on quantity`,
    lines,
    gaps,
  );
}

function planCount(
  customerType: CustomerType,
  service: string,
  installType: string | null,
  label: string,
  project: QuoteProject,
  lines: PlannedLine[],
  gaps: string[],
  usedLabels: Set<string>,
) {
  const measured = measure(project, label, "count", usedLabels);
  addLine(
    lines,
    gaps,
    { customerType, service, installType },
    measured ?? 1,
    installType === null ? service : `${service} / ${installType}`,
  );
}

function planAddOns(
  project: QuoteProject,
  customerType: CustomerType,
  service: string,
  question: string,
  quantityQuestion: string,
  lines: PlannedLine[],
  gaps: string[],
) {
  for (const addOn of values(project.answers, question)) {
    const stated = project.answers.find(
      (answer) =>
        answer.question === quantityQuestion && answer.value.startsWith(`${addOn}: `),
    );
    const parsed = stated === undefined ? 1 : Number(stated.value.slice(addOn.length + 2));
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    addLine(lines, gaps, { customerType, service, addOn }, quantity, `${service} add-on ${addOn}`);
  }
}

function addLine(
  lines: PlannedLine[],
  gaps: string[],
  query: {
    customerType: CustomerType;
    service: string;
    installType?: string | null;
    product?: string | null;
    areaBand?: string | null;
    addOn?: string | null;
    soil?: string | null;
  },
  quantity: number,
  label: string,
) {
  const item = findDummyItem(query);
  if (item === null || quantity <= 0) {
    gaps.push(`No catalogue item for ${label}.`);
    return;
  }
  lines.push({ name: item.name, quantity });
}

function measure(
  project: QuoteProject,
  label: string,
  kind: "square feet" | "linear feet" | "count",
  usedLabels: Set<string>,
  owner?: { service: string; installType: string },
): number | null {
  // An area belongs to a service and installation type whatever it is named.
  const areas = project.workAreas.filter(
    (area) =>
      area.label === label ||
      (owner !== undefined &&
        owner.installType !== "" &&
        area.service === owner.service &&
        area.installType === owner.installType),
  );
  if (areas.length > 0) {
    let total = 0;
    let found = false;
    for (const area of areas) {
      const quantity = kind === "linear feet" ? area.quantity : areaQuantity(area);
      if (quantity === null) continue;
      total += quantity;
      found = true;
    }
    if (found) {
      usedLabels.add(label);
      for (const area of areas) usedLabels.add(area.label);
      return total;
    }
  }
  if (kind === "count") return null;
  const measurement = project.measurements.find((item) => item.label === label);
  usedLabels.add(label);
  if (measurement === undefined || measurement.unmeasured) return null;
  const quantity = kind === "square feet" ? measurement.squareFeet : measurement.linearFeet;
  if (quantity === null || quantity <= 0) return null;
  return quantity;
}

function areaQuantity(area: StoredWorkArea): number | null {
  if (area.quantity !== null && area.quantity > 0) return area.quantity;
  if (
    area.length !== null &&
    area.width !== null &&
    area.length > 0 &&
    area.width > 0
  ) {
    return area.length * area.width;
  }
  return null;
}

function areaNameFor(answers: Answer[], service: string, installType: string): string {
  const prefix = `${installType}: `;
  const questions =
    service === grassService ? [`${grassService} area`, "Artificial Grass Installation area"] : [`${service} area`];
  const answer = answers.find(
    (item) => questions.includes(item.question) && item.value.startsWith(prefix),
  );
  return answer === undefined ? "" : answer.value.slice(prefix.length);
}

function values(answers: Answer[], question: string): string[] {
  return answers.filter((answer) => answer.question === question).map((answer) => answer.value);
}

function mergeLines(lines: PlannedLine[]): PlannedLine[] {
  const merged: PlannedLine[] = [];
  for (const line of lines) {
    const existing = merged.find((item) => item.name === line.name);
    if (existing === undefined) merged.push({ ...line });
    else existing.quantity += line.quantity;
  }
  return merged;
}
