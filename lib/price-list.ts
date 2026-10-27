import type { CatalogueItem } from "./catalogue";
import { lightingUnit, unitForAddOn } from "./discovery";

/**
 * QFTC Artificial Grass Retail Price List 2026, transcribed from the PDF.
 * These are the retail (homeowner) prices; the PDF has no contractor prices.
 *
 * Grass, putting green, demolition and repair rows are six prices in the order of the
 * size bands: 299 SF & under, 300-699, 700-999, 1000-1499, 1500-1999, 2000+.
 */
type Bands = readonly [number, number, number, number, number, number];

const row = (first: number, middle: readonly [number, number, number, number], last: number): Bands => [
  first,
  ...middle,
  last,
];

const bandIndex: Record<string, number> = {
  "299 SF & under": 0,
  "300-699": 1,
  "700-999": 2,
  "1000-1499": 3,
  "1500-1999": 4,
  "2000+": 5,
};

// ---- Artificial grass, per product, for each install type ----------------------------------

const budgetFriendly: Record<string, Bands> = {
  "Players Choice": row(7.75, [7.0, 6.75, 6.5, 6.25], 6.0),
  "Olive Natural": row(8.0, [7.0, 6.75, 6.5, 6.25], 6.25),
  "Cali's Finest Light": row(8.0, [7.0, 6.75, 6.5, 6.5], 6.25),
  Hollywood: row(8.0, [7.0, 6.75, 6.5, 6.5], 6.25),
  "Spring Natural": row(8.0, [7.25, 7.0, 6.75, 6.5], 6.25),
};

const standardInstall: Record<string, Bands> = {
  "La Jolla Lush": row(8.5, [7.5, 7.25, 7.0, 6.75], 6.5),
  Pasadena: row(8.75, [7.75, 7.5, 7.25, 7.0], 6.75),
  "Cali's Finest": row(9.0, [8.0, 7.75, 7.5, 7.25], 7.0),
  "Hollywood Lush": row(9.0, [8.0, 7.75, 7.5, 7.25], 7.0),
  "Central Park": row(9.25, [8.25, 8.0, 7.75, 7.5], 7.25),
  Wimbledon: row(10.5, [9.25, 9.0, 8.75, 8.5], 8.25),
  Malibu: row(10.75, [9.5, 9.25, 9.0, 8.75], 8.25),
  "Big Sur": row(11.0, [9.75, 9.5, 9.0, 8.75], 8.5),
  Monterey: row(11.0, [9.75, 9.5, 9.0, 8.75], 8.5),
  "Sol Natural": row(11.75, [10.5, 10.0, 9.75, 9.5], 9.0),
  Brentwood: row(12.25, [11.0, 10.5, 10.25, 10.0], 9.5),
  Newport: row(14.25, [12.75, 12.25, 11.75, 11.5], 11.0),
};

const deluxeInstall: Record<string, Bands> = {
  "La Jolla Lush": row(10.0, [9.0, 8.75, 8.25, 8.0], 7.75),
  Pasadena: row(10.5, [9.25, 9.0, 8.75, 8.5], 8.25),
  "Cali's Finest": row(10.75, [9.5, 9.25, 8.75, 8.5], 8.25),
  "Hollywood Lush": row(10.75, [9.5, 9.25, 9.0, 8.75], 8.5),
  "Central Park": row(10.75, [9.75, 9.25, 9.0, 8.75], 8.5),
  Wimbledon: row(12.0, [10.75, 10.5, 10.0, 9.75], 9.5),
  Malibu: row(12.25, [11.0, 10.75, 10.25, 10.0], 9.75),
  "Big Sur": row(12.5, [11.25, 10.75, 10.5, 10.0], 9.75),
  Monterey: row(12.5, [11.25, 10.75, 10.5, 10.0], 9.75),
  "Sol Natural": row(13.25, [11.75, 11.5, 11.0, 10.75], 10.5),
  Brentwood: row(14.0, [12.5, 12.0, 11.5, 11.25], 10.75),
  Newport: row(15.75, [14.25, 13.75, 13.25, 12.75], 12.25),
};

const basicPet: Record<string, Bands> = {
  "Pets Choice": row(10.25, [9.25, 8.75, 8.5, 8.25], 8.0),
  "Kennels Best": row(11.5, [10.25, 9.75, 9.5, 9.25], 9.0),
  Fringe: row(12.5, [11.25, 10.75, 10.5, 10.25], 9.75),
};

const premiumPet: Record<string, Bands> = {
  "Pets Choice": row(11.0, [10.0, 9.5, 9.25, 9.0], 8.75),
  "Kennels Best": row(12.25, [11.0, 10.5, 10.25, 10.0], 9.5),
  Fringe: row(13.5, [12.0, 11.5, 11.25, 10.75], 10.5),
};

const playground: Record<string, Bands> = {
  "Kids Play": row(23.15, [20.75, 20.0, 19.25, 18.75], 18.0),
};

const glueDown: Record<string, Bands> = {
  "Players Choice": row(9.05, [8.25, 8.0, 7.75, 7.5], 7.25),
  "Olive Natural": row(9.15, [8.25, 8.0, 7.75, 7.5], 7.25),
  "Cali's Finest Light": row(9.15, [8.25, 8.0, 7.75, 7.5], 7.25),
  Hollywood: row(9.15, [8.25, 8.0, 7.75, 7.5], 7.25),
  "Spring Natural": row(9.35, [8.5, 8.25, 8.0, 7.75], 7.5),
  "La Jolla Lush": row(9.65, [8.75, 8.5, 8.0, 7.75], 7.5),
  Pasadena: row(10.0, [9.0, 8.75, 8.5, 8.25], 8.0),
  "Cali's Finest": row(10.25, [9.25, 9.0, 8.5, 8.25], 8.0),
  "Hollywood Lush": row(10.35, [9.25, 9.0, 8.75, 8.5], 8.25),
  "Central Park": row(10.45, [9.5, 9.0, 8.75, 8.5], 8.25),
  Wimbledon: row(11.9, [10.75, 10.25, 10.0, 9.75], 9.25),
  Malibu: row(12.15, [11.0, 10.5, 10.25, 9.75], 9.5),
  "Big Sur": row(12.35, [11.0, 10.75, 10.25, 10.0], 9.75),
  Monterey: row(12.35, [11.0, 10.75, 10.25, 10.0], 9.75),
  "Sol Natural": row(13.1, [11.75, 11.25, 11.0, 10.5], 10.25),
  Brentwood: row(13.7, [12.25, 12.0, 11.5, 11.0], 10.75),
  Newport: row(15.65, [14.0, 13.5, 13.0, 12.75], 12.25),
  "Pets Choice": row(10.6, [9.5, 9.25, 9.0, 8.75], 8.25),
  "Kennels Best": row(11.75, [10.5, 10.25, 9.75, 9.5], 9.25),
  Fringe: row(12.9, [11.5, 11.25, 10.75, 10.5], 10.25),
  "Kids Play": row(13.7, [12.25, 12.0, 11.5, 11.0], 10.75),
};

/** Turf strips are per linear foot, except Kids Play which is per square foot. */
const turfStrip: Record<string, Bands> = {
  "Players Choice": row(10.9, [9.75, 9.5, 9.25, 8.75], 8.5),
  "Olive Natural": row(10.95, [9.75, 9.5, 9.25, 9.0], 8.75),
  "Cali's Finest Light": row(11.0, [10.0, 9.5, 9.25, 9.0], 8.75),
  Hollywood: row(11.0, [10.0, 9.5, 9.25, 9.0], 8.75),
  "Spring Natural": row(11.2, [10.0, 9.75, 9.5, 9.0], 8.75),
  "La Jolla Lush": row(11.45, [10.25, 10.0, 9.75, 9.25], 9.0),
  Pasadena: row(11.85, [10.75, 10.25, 10.0, 9.75], 9.25),
  "Cali's Finest": row(12.1, [10.75, 10.5, 10.25, 9.75], 9.5),
  "Hollywood Lush": row(12.2, [11.0, 10.5, 10.25, 10.0], 9.5),
  "Central Park": row(12.25, [11.0, 10.75, 10.25, 10.0], 9.75),
  Wimbledon: row(13.55, [12.25, 11.75, 11.25, 11.0], 10.75),
  Malibu: row(13.8, [12.5, 12.0, 11.5, 11.25], 10.75),
  "Big Sur": row(14.0, [12.5, 12.25, 11.75, 11.25], 11.0),
  Monterey: row(14.0, [12.5, 12.25, 11.75, 11.25], 11.0),
  "Sol Natural": row(14.75, [13.25, 12.75, 12.25, 12.0], 11.5),
  Brentwood: row(15.35, [13.75, 13.25, 12.75, 12.5], 12.0),
  Newport: row(17.3, [15.5, 15.0, 14.5, 14.0], 13.5),
  "Pets Choice": row(11.7, [10.5, 10.25, 9.75, 9.5], 9.25),
  "Kennels Best": row(12.85, [11.5, 11.25, 10.75, 10.5], 10.0),
  Fringe: row(14.0, [12.5, 12.25, 11.75, 11.25], 11.0),
  "Kids Play": row(14.15, [12.75, 12.25, 11.75, 11.5], 11.0),
};

const grassByInstall: Record<string, Record<string, Bands>> = {
  "Budget Friendly": budgetFriendly,
  Standard: standardInstall,
  Deluxe: deluxeInstall,
  "Basic Pet": basicPet,
  "Premium Pet": premiumPet,
  Playground: playground,
  "Glue Down Over Concrete": glueDown,
  "Turf Strip": turfStrip,
};

// ---- Putting green ---------------------------------------------------------------------------

const puttingByInstall: Record<string, Record<string, Bands>> = {
  "Entertainment Putting Green": {
    "Champions Choice": row(14.3, [12.75, 12.5, 12.0, 11.5], 11.25),
    "Pro Putter": row(12.8, [11.5, 11.0, 10.75, 10.25], 10.0),
    "Poa Annua Natural": row(15.45, [13.75, 13.25, 13.0, 12.5], 12.0),
    "Poa Annua Max": row(16.1, [14.5, 14.0, 13.5, 13.0], 12.75),
  },
  "PGA Putting Green": {
    "Champions Choice": row(14.7, [13.25, 12.75, 12.25, 12.0], 11.5),
    "Pro Putter": row(13.15, [11.75, 11.5, 11.0, 10.75], 10.25),
    "Poa Annua Natural": row(15.8, [14.25, 13.75, 13.25, 12.75], 12.5),
    "Poa Annua Max": row(16.5, [14.75, 14.25, 13.75, 13.25], 13.0),
  },
};

// ---- Demolition and repairs ------------------------------------------------------------------

const demolition: Record<string, Bands> = {
  Demolition: row(3.1, [2.75, 2.75, 2.75, 2.5], 2.5),
  "Demolition & Regrade": row(4.1, [3.75, 3.75, 3.5, 3.5], 3.25),
};

const repairs: Record<string, Bands> = {
  "Artificial Grass Replacement": row(6.0, [5.5, 5.25, 5.0, 5.0], 4.75),
  "Artificial Grass Repair": row(5.0, [4.5, 4.5, 4.25, 4.0], 4.0),
};

// ---- Flat prices -----------------------------------------------------------------------------

const addOns: Record<string, number> = {
  "Additional #16 / #20 Silica Sand": 0.35,
  "Additional #60 Silica Sand": 0.3,
  "Additional Pet Deodorizer": 0.8,
  "Additional Camofill": 0.5,
  "Additional Seam Tape": 1.55,
  "Additional Weed Cloth": 1.55,
  "Gopher Wire": 2.25,
  "1 x 4 Bender Board": 9.5,
  "2 x 4 Pressure Treated Lumber": 9.0,
  "Black Aluminum Border": 12.0,
  "Aluminium Golf Cup / Flag Set": 180.0,
  "Unique Cup Set / Flag Light Set": 610.0,
  // Extras that the list charges per square foot on top of the base price.
  'Additional 2" of Base': 0.5,
  "Concrete / Rock": 0.25,
  // "Each additional 2" of Demo" is $1.05 under 300 SF, $1.00 above; "...& Regrade" is $1.55 / $1.50 / $1.25.
  'Additional 2" of Demolition': 1.0,
  'Additional 2" of Demolition & Regrade': 1.5,
};

/** Standard soil, rocky or clay soil; per linear foot. */
const underground: Record<string, [number, number]> = {
  '3" Drains': [15.0, 17.0],
  '4" Drains': [15.75, 17.5],
  '1" Mainline': [10.0, 12.5],
  '3/4" Waterline': [7.75, 10.25],
  "Pipe Sleeve": [9.0, 11.5],
  '2" Conduit': [12.5, 14.5],
  '3/4" Gas Line': [20.0, 22.75],
};

const lighting: Record<string, number> = {
  "Run Loose Lay Wire": 3.75,
  "Run Wire Through Conduit": 6.25,
  "Run Line Under Concrete": 24.5,
  "Install GFI": 150.0,
  "Install Conduit with 110V Line": 24.5,
  "Install Outlet": 150.0,
  "Install Controller": 175.0,
  "150 Watt Transformer": 525.0,
  "300 Watt Transformer": 600.0,
  "600 Watt Transformer": 950.0,
  "Corona Bullet Up Lights": 130.0,
  "Corona Path Lights": 200.0,
  "Step Lights, Pro-Trade LL1": 150.0,
  "Step Lights, Alliance SL35": 250.0,
  "Under Lights, Pro-Trade LL1": 150.0,
};

/**
 * The retail unit price of a catalogue item, or null when the price list does not cover it
 * (contractor prices, and services such as SOD or pavers that are quoted by hand).
 */
export function retailPrice(item: CatalogueItem): number | null {
  if (item.customerType !== "Homeowner") return null;
  const band = item.areaBand === null ? undefined : bandIndex[item.areaBand];

  if (item.addOn !== null) return addOns[item.addOn] ?? null;

  switch (item.service) {
    case "Artificial Grass": {
      if (item.installType === null) return null;
      const repair = repairs[item.installType];
      if (repair !== undefined) return band === undefined ? null : repair[band];
      const bands = item.product === null ? undefined : grassByInstall[item.installType]?.[item.product];
      return bands === undefined || band === undefined ? null : bands[band];
    }
    case "Putting Green": {
      const bands =
        item.installType === null || item.product === null
          ? undefined
          : puttingByInstall[item.installType]?.[item.product];
      return bands === undefined || band === undefined ? null : bands[band];
    }
    case "Demo": {
      const bands = item.installType === null ? undefined : demolition[item.installType];
      return bands === undefined || band === undefined ? null : bands[band];
    }
    case "Underground": {
      const prices = item.installType === null ? undefined : underground[item.installType];
      if (prices === undefined) return null;
      return item.soil === "Rocky or clay soil" ? prices[1] : prices[0];
    }
    case "Low Voltage Lighting":
      return item.installType === null ? null : (lighting[item.installType] ?? null);
    default:
      return null;
  }
}

/** The unit a price is quoted in: SF, LF or EA. */
export function priceUnit(item: CatalogueItem): "SF" | "LF" | "EA" {
  if (item.addOn !== null) {
    const unit = unitForAddOn(item.addOn);
    return unit === "sq ft" ? "SF" : unit === "linear ft" ? "LF" : "EA";
  }
  if (item.service === "Low Voltage Lighting" && item.installType !== null) {
    return lightingUnit(item.installType) === "lin ft" ? "LF" : "EA";
  }
  if (item.measure === "square feet") return "SF";
  if (item.measure === "linear feet") return "LF";
  return "EA";
}
