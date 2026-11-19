/* The products and services list (design 2026-11-19-jobs, spec "Products and services catalogue"): Jobber's Settings > Products & Services.
   Pure TypeScript with no Convex or React imports, so the backend, the import screen and the tests share one set of rules.
   Money is whole cents. Jobber keeps Cost, Markup % and Unit Price together: change one and the others follow. */

export type ItemKind = "service" | "product";

/** What the import and the edit dialog send: one product or service, already in cents. */
export type CatalogueInput = {
  name: string;
  description: string;
  kind: ItemKind;
  costCents?: number;
  markupPercent?: number;
  unitPriceCents: number;
  taxExempt: boolean;
  available: boolean;
  durationMinutes?: number;
  customersSelectQuantity: boolean;
};

export const MAX_CENTS = 100_000_000_00;

/** The unit price that a cost and a markup give, rounded to the cent. */
export const priceFromMarkup = (costCents: number, markupPercent: number): number => Math.round(costCents * (1 + markupPercent / 100));

/** The markup a cost and a price give (five decimals, as Jobber shows it), or undefined when there is no cost to mark up. */
export function markupFromPrice(costCents: number, priceCents: number): number | undefined {
  if (!(costCents > 0)) return undefined;
  return Math.round(((priceCents - costCents) / costCents) * 100 * 100000) / 100000;
}

/** "111.87", "$1,000.5" or "8" as cents, or null when it is not a money amount. */
export function centsFromText(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 5000;

/** The key two names are compared by: the same item with different capitals or spacing is the same item. */
export const nameKeyOf = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/** The reason an item cannot be saved, or null. */
export function itemProblem(i: CatalogueInput): string | null {
  const name = i.name.trim();
  if (!name) return "Give the item a name.";
  if (name.length > NAME_MAX) return `The name is longer than ${NAME_MAX} characters.`;
  if (i.description.length > DESCRIPTION_MAX) return `The description is longer than ${DESCRIPTION_MAX} characters.`;
  const money = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0 && n <= MAX_CENTS);
  if (!money(i.costCents)) return "Check the cost.";
  if (!Number.isInteger(i.unitPriceCents) || i.unitPriceCents < 0 || i.unitPriceCents > MAX_CENTS) return "Check the unit price.";
  if (i.markupPercent !== undefined && (!Number.isFinite(i.markupPercent) || i.markupPercent < -100 || i.markupPercent > 1_000_000)) return "Check the markup.";
  if (i.durationMinutes !== undefined && (!Number.isInteger(i.durationMinutes) || i.durationMinutes < 1 || i.durationMinutes > 1440)) return "The service duration is between 1 minute and 24 hours.";
  return null;
}

/* ---- CSV ---- */

/** RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. A blank line is skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The columns of our own file (the export and the sample), in order. The import also understands common spellings of each. */
export const CSV_COLUMNS = ["Name", "Description", "Type", "Cost", "Markup (%)", "Unit Price", "Exempt from Tax", "Available", "Service Duration", "Allow customers to select quantity"] as const;

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function toCsv(items: (CatalogueInput & { costCents?: number })[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const i of items) {
    lines.push([
      i.name, i.description, i.kind === "product" ? "Product" : "Service", i.costCents === undefined ? "" : dollars(i.costCents), i.markupPercent === undefined ? "" : String(i.markupPercent),
      dollars(i.unitPriceCents), i.taxExempt ? "Yes" : "No", i.available ? "Yes" : "No", i.durationMinutes === undefined ? "" : String(i.durationMinutes), i.customersSelectQuantity ? "Yes" : "No",
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

type Field = "name" | "description" | "kind" | "cost" | "markup" | "price" | "exempt" | "taxable" | "available" | "duration" | "quantity";
const HEADERS: Record<Field, string[]> = {
  name: ["name", "product / service", "product/service", "item", "item name", "service name", "product name"],
  description: ["description", "details"],
  kind: ["type", "item type", "category"],
  cost: ["cost", "cost ($)", "unit cost", "unit cost ($)", "internal unit cost"],
  markup: ["markup", "markup (%)", "markup %"],
  price: ["unit price", "unit price ($)", "price", "default unit price", "unit price/rate"],
  exempt: ["exempt from tax", "tax exempt"],
  taxable: ["taxable"],
  available: ["available", "available on quotes, quote templates, jobs, invoices & online booking", "visible", "visible in online booking"],
  duration: ["service duration", "duration", "duration (minutes)"],
  quantity: ["allow customers to select quantity", "allow quantity"],
};

export type ImportRow = CatalogueInput & { line: number };
export type ImportProblem = { line: number; name: string; message: string; raw: string[] };

const yes = (s: string | undefined, whenBlank: boolean) => {
  const t = (s ?? "").trim().toLowerCase();
  if (!t) return whenBlank;
  return ["yes", "y", "true", "1", "x", "available"].includes(t);
};

/** Reads a products CSV: the first row names the columns. Every row that cannot be read is returned with its line, its name and why, and
 *  its own cells, so nothing is dropped silently (CRM rule 6). Line numbers are the file's own, the header being line 1. */
export function rowsFromCsv(text: string): { rows: ImportRow[]; problems: ImportProblem[]; headerProblem: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], problems: [], headerProblem: "The file is empty." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const at = (f: Field) => header.findIndex((h) => HEADERS[f].includes(h));
  const col = Object.fromEntries((Object.keys(HEADERS) as Field[]).map((f) => [f, at(f)])) as Record<Field, number>;
  if (col.name < 0) return { rows: [], problems: [], headerProblem: 'The first row needs a "Name" column.' };
  if (col.price < 0 && col.cost < 0) return { rows: [], problems: [], headerProblem: 'The first row needs a "Unit Price" column (or a "Cost" and "Markup (%)").' };
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const get = (f: Field) => (col[f] >= 0 ? (cells[col[f]] ?? "").trim() : "");
    const name = get("name");
    const fail = (message: string) => problems.push({ line: r + 1, name, message, raw: cells });
    const cost = get("cost");
    const markup = get("markup");
    const price = get("price");
    const costCents = cost ? centsFromText(cost) : undefined;
    if (cost && costCents === null) { fail(`"${cost}" is not a cost.`); continue; }
    let markupPercent: number | undefined;
    if (markup) {
      markupPercent = Number(markup.replace(/%/g, ""));
      if (!Number.isFinite(markupPercent)) { fail(`"${markup}" is not a markup.`); continue; }
    }
    const typedPrice = price ? centsFromText(price) : undefined;
    if (price && typedPrice === null) { fail(`"${price}" is not a price.`); continue; }
    const unitPriceCents =
      typedPrice ?? (costCents !== undefined && costCents !== null && markupPercent !== undefined ? priceFromMarkup(costCents, markupPercent) : undefined);
    if (unitPriceCents === undefined) { fail("Give a unit price (or a cost and a markup)."); continue; }
    const duration = get("duration");
    const durationMinutes = duration ? Number(duration) : undefined;
    if (duration && !Number.isInteger(durationMinutes)) { fail(`"${duration}" is not a number of minutes.`); continue; }
    const kindText = get("kind").toLowerCase();
    const taxExempt = col.exempt >= 0 ? yes(get("exempt"), false) : col.taxable >= 0 ? !yes(get("taxable"), true) : false;
    const item: ImportRow = {
      line: r + 1, name, description: get("description"), kind: kindText === "product" ? "product" : "service",
      ...(costCents !== undefined && costCents !== null ? { costCents } : {}),
      ...(markupPercent !== undefined ? { markupPercent } : costCents && unitPriceCents ? { markupPercent: markupFromPrice(costCents, unitPriceCents) } : {}),
      unitPriceCents, taxExempt, available: yes(get("available"), true),
      ...(durationMinutes !== undefined ? { durationMinutes } : {}), customersSelectQuantity: yes(get("quantity"), false),
    };
    const why = itemProblem(item);
    if (why) { fail(why); continue; }
    rows.push(item);
  }
  return { rows, problems, headerProblem: null };
}
