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
 * Placeholder Jobber names. Replace this file with the real catalogue.
 * Names start with DUMMY so they are not mistaken for live Jobber items.
 * Prices are not stored here. Jobber prices the item once the real name exists.
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
        if (grassUsesLinearFeet(installType, product.name)) {
          items.push(
            item({
              name: `DUMMY ${code} - AG ${installType} Install - ${product.name}`,
              measure: "linear feet",
              customerType,
              service: grassService,
              installType,
              product: product.name,
              areaBand: null,
              addOn: null,
            }),
          );
          continue;
        }
        for (const areaBand of areaBands) {
          items.push(
            item({
              name: `DUMMY ${code} - AG ${installType} Install - ${product.name} [${bandInName[areaBand]}]`,
              measure: "square feet",
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

    items.push(
      item({
        name: `DUMMY ${code} - AG Replacement`,
        measure: "count",
        customerType,
        service: grassService,
        installType: "Artificial Grass Replacement",
        product: null,
        areaBand: null,
        addOn: null,
      }),
    );
    items.push(
      item({
        name: `DUMMY ${code} - AG Repair`,
        measure: "count",
        customerType,
        service: grassService,
        installType: "Artificial Grass Repair",
        product: null,
        areaBand: null,
        addOn: null,
      }),
    );

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
            name: `DUMMY ${code} - Underground ${installType} [${soil}]`,
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
          name: `DUMMY ${code} - Lighting ${installType}`,
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

export const dummyCatalogue: CatalogueItem[] = buildCatalogue();

export function findDummyItem(query: {
  customerType: CustomerType;
  service: string;
  installType?: string | null;
  product?: string | null;
  areaBand?: string | null;
  addOn?: string | null;
  soil?: string | null;
}): CatalogueItem | null {
  return (
    dummyCatalogue.find(
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
