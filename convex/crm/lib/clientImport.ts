/* Reading a Jobber clients CSV (plan 2026-11-20-client-import). Pure TypeScript, no Convex or React imports. It only reads and shapes the rows; the backend
   (crm/clientImport.ts) checks each one with the client form's rules and against the clients already there. The column names are Jobber's own, taken from the
   sample file in its "Import clients" window (Client First Name, Client Main Phone, Property Street 1, Billing Street 1 ...); common plain spellings work too. */

import { US_STATES } from "../../shared/usStates";
import { parseCsv } from "./catalogue";

export type Property = { street1: string; street2: string; city: string; state: string; zip: string; country: string };

export type ImportClient = {
  line: number;
  type: "homeowner" | "contractor";
  isCompany: boolean;
  first: string;
  last: string;
  company: string;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
  extraPhones: { number: string; description: string }[];
  extraEmails: { address: string; description: string }[];
  /** More addresses of the same client (Jobber writes one row per property, repeating the client). */
  extraProperties: Property[];
  tags: string[];
  status: "lead" | "active" | "archived";
  createdAt?: number;
  balanceCents?: number;
};

export type ImportProblem = { line: number; name: string; message: string };

type Field = "first" | "last" | "company" | "display" | "isCompany" | "email" | "email2" | "phone" | "phone2" | "street1" | "street2" | "city" | "state" | "zip" | "country" | "notes" | "tags" | "created" | "status" | "archived" | "balance";

/** Header spellings, compared after lower-casing and dropping everything but letters and digits. The first match for a field wins. */
const HEADERS: Record<Field, string[]> = {
  first: ["clientfirstname", "firstname", "first"],
  last: ["clientlastname", "lastname", "last", "surname"],
  company: ["clientcompanyname", "companyname", "company", "businessname"],
  display: ["clientfullnamedisplayonly", "displayname", "name", "clientname", "fullname", "customername"],
  isCompany: ["clientiscompany", "iscompany"],
  email: ["clientemail", "email", "mainemail", "emailaddress", "email1", "primaryemail"],
  email2: ["otheremail", "email2", "secondaryemail", "workemail", "personalemail"],
  phone: ["clientmainphone", "mainphone", "phone", "phonenumber", "phone1", "clientmobilephone", "mobilephone", "mobile", "cell", "cellphone", "primaryphone"],
  phone2: ["clientworkphone", "clienthomephone", "clientotherphone", "workphone", "homephone", "otherphone", "phone2", "secondaryphone"],
  street1: ["propertystreet1", "street1", "address1", "addressline1", "streetaddress", "address", "servicestreet1"],
  street2: ["propertystreet2", "street2", "address2", "addressline2", "servicestreet2"],
  city: ["propertycity", "city", "servicecity"],
  state: ["propertystateprovince", "state", "province", "stateprovince", "servicestate"],
  zip: ["propertyzippostalcode", "zipcode", "zip", "postalcode", "zippostalcode", "servicezipcode"],
  country: ["propertycountry", "country"],
  notes: ["clientinternalnotes", "notes", "note", "comments", "clientnotes"],
  tags: ["tags", "tag", "labels"],
  created: ["clientcreateddate", "createddate", "created", "datecreated", "createdat", "clientsince"],
  status: ["clientstatus", "status"],
  archived: ["archivedtruefalse", "archived"],
  balance: ["accountbalance", "balance"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const labelOf = (header: string, fallback: string): string =>
  /main/.test(header) ? "Main" : /home/.test(header) ? "Home" : /work/.test(header) ? "Work" : /(mobile|cell)/.test(header) ? "Mobile" : /fax/.test(header) ? "Fax" : /other/.test(header) ? "Other" : fallback;
const yes = (s: string) => ["true", "yes", "y", "1"].includes(s.trim().toLowerCase());

/** A US state as the two letters, from the letters or the whole name ("California"). Anything else is returned as typed, for the row check to refuse. */
export function stateAbbr(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const hit = US_STATES.find((s) => s.abbr.toLowerCase() === t.toLowerCase() || s.name.toLowerCase() === t.toLowerCase());
  return hit ? hit.abbr : t;
}

/** A date as UTC midnight: 2024-03-05, 3/5/2024, 3/5/24 or "Mar 5, 2024". Undefined when it is not one. */
export function dayFromText(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [y, m, d] = [Number(hit[3].length === 2 ? `20${hit[3]}` : hit[3]), Number(hit[1]), Number(hit[2])];
  else {
    const parsed = Date.parse(`${t} UTC`);
    if (Number.isNaN(parsed)) return undefined;
    const p = new Date(parsed);
    [y, m, d] = [p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate()];
  }
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return undefined;
  return y >= 1990 && ms <= Date.UTC(2100, 0, 1) ? ms : undefined;
}

/** "$1,250.50" or "-75" as whole cents; undefined when blank or not an amount. */
export function centsFromAmount(text: string): number | undefined {
  const t = text.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

const CONTRACTOR_TAG = /contractor/i;
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

/** Reads the file. `recognised` and `ignored` are the column names as the file spells them, so the screen can say what it understood. */
export function readClientsCsv(text: string): { rows: ImportClient[]; problems: ImportProblem[]; headerProblem: string | null; recognised: string[]; ignored: string[] } {
  const table = parseCsv(text);
  const empty = { rows: [], problems: [], recognised: [] as string[], ignored: [] as string[] };
  if (table.length === 0) return { ...empty, headerProblem: "The file is empty." };
  const header = table[0].map(squash);
  const used = new Set<number>();
  const colOf = (f: Field): number => {
    for (const h of HEADERS[f]) {
      const i = header.findIndex((x, k) => x === h && !used.has(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) {
    col[f] = colOf(f);
    if (col[f] >= 0) used.add(col[f]);
  }
  // Every other phone or email column is kept as an additional one. Jobber's "SMS Enabled Phone Number" only repeats one of the others.
  const phoneCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => !used.has(i) && /(phone|mobile|cell|fax)/.test(h) && !/(count|type|sms|enabled|reminder|followup)/.test(h));
  const emailCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => !used.has(i) && /email/.test(h) && !/(count|type)/.test(h));
  for (const { i } of [...phoneCols, ...emailCols]) used.add(i);
  const hasName = col.first >= 0 || col.last >= 0 || col.company >= 0 || col.display >= 0;
  if (!hasName) return { ...empty, headerProblem: 'The first row needs a name column: "Client First Name" and "Client Last Name", "Client Company Name" or "Client Full Name".' };

  const recognised = table[0].filter((_, i) => used.has(i)).map((h) => h.trim());
  const ignored = table[0].filter((_, i) => !used.has(i) && table[0][i].trim() !== "").map((h) => h.trim());
  const rows: ImportClient[] = [];
  const problems: ImportProblem[] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const get = (f: Field) => (col[f] >= 0 ? (cells[col[f]] ?? "").trim() : "");
    let first = get("first");
    let last = get("last");
    let company = get("company");
    const display = get("display");
    const tags = get("tags").split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
    const isCompany = yes(get("isCompany"));
    if (!first && !last && !company && display) {
      if (isCompany || tags.some((t) => CONTRACTOR_TAG.test(t))) company = display; // a company's display name is its company
      else {
        const parts = display.split(/\s+/);
        first = parts.length > 1 ? parts.slice(0, -1).join(" ") : display;
        last = parts.length > 1 ? (parts.at(-1) ?? "") : "";
      }
    }
    const name = [first, last].filter(Boolean).join(" ") || company;
    if (!name) {
      problems.push({ line: r + 1, name: "", message: "No name: the row needs a first name, last name, company or display name." });
      continue;
    }
    const type: "homeowner" | "contractor" = isCompany || tags.some((t) => CONTRACTOR_TAG.test(t)) || (company && !first && !last) ? "contractor" : "homeowner";
    const seenPhone = new Set<string>();
    const phones = [col.phone, col.phone2, ...phoneCols.map((p) => p.i)].filter((i) => i >= 0).map((i) => ({ number: (cells[i] ?? "").trim(), description: labelOf(header[i], i === col.phone ? "Main" : "Other") }))
      .filter((p) => {
        const d = digits(p.number);
        if (!p.number || (d.length === 10 && seenPhone.has(d))) return false; // the same number under two labels is kept once
        seenPhone.add(d);
        return true;
      });
    const emails = [col.email, col.email2, ...emailCols.map((e) => e.i)].filter((i) => i >= 0).map((i) => ({ address: (cells[i] ?? "").trim(), description: i === col.email ? "Main" : "Other" })).filter((e) => e.address);
    const rawStatus = get("status").toLowerCase();
    const created = get("created");
    const balance = get("balance");
    const row: ImportClient = {
      line: r + 1, type, isCompany, first, last, company, phone: phones[0]?.number ?? "", email: emails[0]?.address ?? "", street1: get("street1"), street2: get("street2"), city: get("city"),
      state: stateAbbr(get("state")), zip: get("zip"), country: get("country"), notes: get("notes"), extraPhones: phones.slice(1), extraEmails: emails.slice(1), extraProperties: [], tags,
      status: yes(get("archived")) || rawStatus.startsWith("archiv") ? "archived" : rawStatus.startsWith("lead") ? "lead" : "active",
    };
    if (dayFromText(created) !== undefined) row.createdAt = dayFromText(created);
    if (centsFromAmount(balance) !== undefined) row.balanceCents = centsFromAmount(balance);
    rows.push(row);
    if (created && dayFromText(created) === undefined) problems.push({ line: r + 1, name, message: `"${created}" is not a date, so the created date is left out. The client is still imported.` });
    if (balance && centsFromAmount(balance) === undefined) problems.push({ line: r + 1, name, message: `"${balance}" is not an amount, so the balance is left out. The client is still imported.` });
  }
  return { rows, problems, headerProblem: null, recognised, ignored };
}

const sameAddress = (a: Property, b: Property) => `${a.street1} ${a.street2} ${a.zip}`.toLowerCase().replace(/\s+/g, " ").trim() === `${b.street1} ${b.street2} ${b.zip}`.toLowerCase().replace(/\s+/g, " ").trim();
const propertyOf = (r: ImportClient): Property => ({ street1: r.street1, street2: r.street2, city: r.city, state: r.state, zip: r.zip, country: r.country });

/** Rows that repeat an earlier row of the same file (same email, or the same ten-digit phone). Jobber writes one row per property, so a repeat with a different
 *  address is not lost: that address is added to the first row as another property. The report line says which happened. */
export function fileDuplicates(rows: ImportClient[]): { keep: ImportClient[]; repeats: { row: ImportClient; of: number; why: string; message: string }[] } {
  const byEmail = new Map<string, ImportClient>();
  const byPhone = new Map<string, ImportClient>();
  const keep: ImportClient[] = [];
  const repeats: { row: ImportClient; of: number; why: string; message: string }[] = [];
  for (const row of rows) {
    const e = row.email.trim().toLowerCase();
    const p = digits(row.phone);
    const hitE = e ? byEmail.get(e) : undefined;
    const hitP = p.length === 10 ? byPhone.get(p) : undefined;
    const first = hitE ?? hitP;
    if (first) {
      const why = hitE ? "the same email" : "the same phone number";
      const mine = propertyOf(row);
      const known = [propertyOf(first), ...first.extraProperties];
      let message = `Repeats line ${first.line} of this file (${why}). Skipped.`;
      if (mine.street1.trim() && !known.some((k) => sameAddress(k, mine))) {
        first.extraProperties.push(mine);
        message = `Repeats line ${first.line} of this file (${why}); its address "${mine.street1}" was added to that client as another property.`;
      }
      repeats.push({ row, of: first.line, why, message });
      continue;
    }
    if (e) byEmail.set(e, row);
    if (p.length === 10) byPhone.set(p, row);
    keep.push(row);
  }
  return { keep, repeats };
}

/** The columns of the sample file the screen offers: Jobber's own, so a Jobber file and ours read the same way. */
export const SAMPLE_COLUMNS = [
  "Client Created Date", "Client Is Company?", "Client First Name", "Client Last Name", "Client Company Name", "Client Email", "Client Main Phone", "Client Mobile Phone",
  "Property Street 1", "Property Street 2", "Property City", "Property State/Province", "Property Zip/Postal Code", "Property Country", "Archived (True/False)", "Account Balance",
  "Client Internal Notes", "Tags",
] as const;
