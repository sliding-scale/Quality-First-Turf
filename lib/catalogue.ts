import { retailPrice } from "./price-list";
import {
  addOnsFor,
  grassService,
  grassUsesLinearFeet,
  installTypes,
  productsFor,
  services,
  turfInstallTypes,
  type CustomerType,
} from "./discovery";

/**
 * The Jobber product and service names the quote is built from, one per priced combination.
 * Retail (RP) items covered by the 2026 price list use their real names. Contractor (CP) items,
 * and services the price list does not cover (SOD, Pavers and the rest), are still placeholders
 * whose names start with DUMMY so they are not mistaken for live items. Prices live in
 * `price-list.ts` and in Jobber; this file only decides the names.
 */

export type CatalogueMeasure = "square feet" | "linear feet" | "count";

export type CatalogueItem = {
  name: string;
  measure: CatalogueMeasure;
  customerType: CustomerType;
  service: string;
  installType: string | null;
  product: string | null;
  areaBand: string | null;
  addOn: string | null;
  soil: string | null;
};

const customerTypes: CustomerType[] = ["Homeowner", "Contractor"];

const areaBands = [
  "299 SF & under",
  "300-699",
  "700-999",
  "1000-1499",
  "1500-1999",
  "2000+",
];

const bandInName: Record<string, string> = {
  "299 SF & under": "299 SF & UNDER",
  "300-699": "300-699",
  "700-999": "700-999",
  "1000-1499": "1000-1499",
  "1500-1999": "1500-1999",
  "2000+": "2000+",
};

/** The price list's own wording for items whose on-screen name is shorter. */
const lightingNames: Record<string, string> = {
  "Run Loose Lay Wire": "Run Loose Lay Wire",
  "Run Wire Through Conduit": "Run Wire Through Conduit",
  "Run Line Under Concrete": "Run Line Under Concrete",
  "Install Outlet": "Outlet Installation",
  "Install GFI": "Install GFI + Circuit + Running and Connecting Line",
  "Install Conduit with 110V Line": "Install Conduit with 110 Voltage Line",
  "Install Controller": "Controller Installation",
  "150 Watt Transformer": "150 Watt Transformer Installation",
  "300 Watt Transformer": "300 Watt Transformer Installation",
  "600 Watt Transformer": "600 Watt Transformer Installation",
  "Corona Bullet Up Lights": "Corona Bullet Up Lights Installation",
  "Corona Path Lights": "Corona Path Lights Installation",
  "Step Lights, Pro-Trade LL1":
    "Step Lights Installation [Pro-Trade LL1 7 in. Ledge Light Bronze Finish 1.25W 100 Lumen]",
  "Step Lights, Alliance SL35":
    "Step Lights Installation [Alliance SL35 Step Light, Black, Integrated LED, 2700K, Brass]",
  "Under Lights, Pro-Trade LL1":
    "Under Lights Installation [Pro-Trade LL1 7 in. Ledge Light Bronze Finish 1.25W 100 Lumen]",
};

const undergroundNames: Record<string, string> = {
  '3" Drains': '3" Drains Installed',
  '4" Drains': '4" Drains Installed',
  '1" Mainline': '1" Mainline PVC Schedule 40 Installed (12" Deep)',
  '3/4" Waterline': '3/4" Waterline PVC Schedule 40 Installed',
  "Pipe Sleeve": "Pipe Sleeve PVC Schedule 40 Installed",
  '2" Conduit': '2" Conduit Installed (18" Deep)',
  '3/4" Gas Line': '3/4" Gas Line Installed',
};

function priceCode(customerType: CustomerType): "RP" | "CP" {
  return customerType === "Homeowner" ? "RP" : "CP";
}

function item(partial: Omit<CatalogueItem, "soil"> & { soil?: string | null }): CatalogueItem {
  return { soil: null, ...partial };
}

function buildCatalogue(): CatalogueItem[] {
  const items: CatalogueItem[] = [];

  for (const customerType of customerTypes) {
    const code = priceCode(customerType);

    for (const installType of turfInstallTypes) {
      for (const product of productsFor(grassService, installType)) {
        const linear = grassUsesLinearFeet(installType, product.name);
        for (const areaBand of areaBands) {
          items.push(
            item({
              name: `DUMMY ${code} - AG ${installType} Install - ${product.name} [${bandInName[areaBand]}]`,
              measure: linear ? "linear feet" : "square feet",
              customerType,
              service: grassService,
              installType,
              product: product.name,
              areaBand,
              addOn: null,
            }),
          );
        }
      }
    }

    for (const [short, installType] of [
      ["Replacement", "Artificial Grass Replacement"],
      ["Repair", "Artificial Grass Repair"],
    ] as const) {
      for (const areaBand of areaBands) {
        items.push(
          item({
            name: `DUMMY ${code} - AG ${short} [${bandInName[areaBand]}]`,
            measure: "square feet",
            customerType,
            service: grassService,
            installType,
            product: null,
            areaBand,
            addOn: null,
          }),
        );
      }
    }

    for (const addOn of addOnsFor(grassService, "Budget Friendly")) {
      items.push(
        item({
          name: `DUMMY ${code} - AG Add-on - ${addOn}`,
          measure: "count",
          customerType,
          service: grassService,
          installType: null,
          product: null,
          areaBand: null,
          addOn,
        }),
      );
    }

    for (const installType of installTypes["Putting Green"] ?? []) {
      for (const product of productsFor("Putting Green", installType)) {
        for (const areaBand of areaBands) {
          items.push(
            item({
              name: `DUMMY ${code} - Putting Green ${installType} - ${product.name} [${bandInName[areaBand]}]`,
              measure: "square feet",
              customerType,
              service: "Putting Green",
              installType,
              product: product.name,
              areaBand,
              addOn: null,
            }),
          );
        }
      }
    }
    for (const addOn of addOnsFor("Putting Green", "PGA Putting Green")) {
      items.push(
        item({
          name: `DUMMY ${code} - Putting Green Add-on - ${addOn}`,
          measure: "count",
          customerType,
          service: "Putting Green",
          installType: null,
          product: null,
          areaBand: null,
          addOn,
        }),
      );
    }

    const demoAddOns = new Set<string>();
    for (const installType of installTypes.Demo ?? []) {
      for (const addOn of addOnsFor("Demo", installType)) demoAddOns.add(addOn);
    }
    for (const addOn of demoAddOns) {
      items.push(
        item({
          name: `DUMMY ${code} - Demolition Add-on - ${addOn}`,
          measure: "count",
          customerType,
          service: "Demo",
          installType: null,
          product: null,
          areaBand: null,
          addOn,
        }),
      );
    }

    for (const installType of installTypes.Demo ?? []) {
      for (const areaBand of areaBands) {
        items.push(
          item({
            name: `DUMMY ${code} - Demolition ${installType} [${bandInName[areaBand]}]`,
            measure: "square feet",
            customerType,
            service: "Demo",
            installType,
            product: null,
            areaBand,
            addOn: null,
          }),
        );
      }
    }

    for (const installType of installTypes.Underground ?? []) {
      for (const soil of ["Standard soil", "Rocky or clay soil"]) {
        items.push(
          item({
            name: `DUMMY ${code} - Underground ${undergroundNames[installType] ?? installType} [${soil}]`,
            measure: "linear feet",
            customerType,
            service: "Underground",
            installType,
            product: null,
            areaBand: null,
            addOn: null,
            soil,
          }),
        );
      }
    }

    for (const installType of installTypes["Low Voltage Lighting"] ?? []) {
      items.push(
        item({
          name: `DUMMY ${code} - Lighting ${lightingNames[installType] ?? installType}`,
          measure: "count",
          customerType,
          service: "Low Voltage Lighting",
          installType,
          product: null,
          areaBand: null,
          addOn: null,
        }),
      );
    }

    for (const service of services) {
      if (
        service === "Demo" ||
        service === grassService ||
        service === "Putting Green" ||
        service === "Underground" ||
        service === "Low Voltage Lighting"
      ) {
        continue;
      }
      items.push(
        item({
          name: `DUMMY ${code} - ${service}`,
          measure: "count",
          customerType,
          service,
          installType: null,
          product: null,
          areaBand: null,
          addOn: null,
        }),
      );
    }
  }

  return items;
}

export const catalogue: CatalogueItem[] = buildCatalogue().map((entry) =>
  // Priced retail items drop the placeholder prefix; everything else keeps it.
  entry.customerType === "Homeowner" && retailPrice(entry) !== null
    ? { ...entry, name: entry.name.replace(/^DUMMY /, "") }
    : entry,
);

export function findCatalogueItem(query: {
  customerType: CustomerType;
  service: string;
  installType?: string | null;
  product?: string | null;
  areaBand?: string | null;
  addOn?: string | null;
  soil?: string | null;
}): CatalogueItem | null {
  return (
    catalogue.find(
      (entry) =>
        entry.customerType === query.customerType &&
        entry.service === query.service &&
        entry.installType === (query.installType ?? null) &&
        entry.product === (query.product ?? null) &&
        entry.areaBand === (query.areaBand ?? null) &&
        entry.addOn === (query.addOn ?? null) &&
        entry.soil === (query.soil ?? null),
    ) ?? null
  );
}
