import { ConvexError, v } from "convex/values";
import { US_STATES } from "../../shared/usStates";
import { cleanEmail, cleanName, cleanZip, formatPhone, isValidEmail, phoneDigits } from "./fields";

/** What the client form sends. The server works out the display name, search text and sort key itself. */
export const clientInputFields = {
  type: v.union(v.literal("homeowner"), v.literal("contractor")),
  first: v.string(),
  last: v.string(),
  company: v.string(),
  phone: v.string(),
  email: v.string(),
  street1: v.string(),
  street2: v.string(),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  notes: v.string(),
};

type Input = {
  type: "homeowner" | "contractor";
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
  notes: string;
};

/** Cleans every field with the same rules as the form, rejects what is still wrong, and adds the derived fields. */
export function normalizeClientInput(input: Input) {
  const first = cleanName(input.first).trim();
  const last = cleanName(input.last).trim();
  const company = input.company.trim();
  const phone = formatPhone(input.phone);
  const email = cleanEmail(input.email).trim().toLowerCase();
  const zip = cleanZip(input.zip);
  const state = input.state.trim().toUpperCase();

  const contactName = [first, last].filter(Boolean).join(" ") || company;
  if (!contactName) throw new ConvexError("Enter a first name, last name or company name.");
  if (phone !== "" && phoneDigits(phone) < 10) throw new ConvexError("Enter a 10-digit phone number.");
  if (email !== "" && !isValidEmail(email)) throw new ConvexError("Enter a valid email address.");
  if (input.zip.trim() !== "" && zip.length < 5) throw new ConvexError("Enter a 5-digit ZIP code.");
  if (state !== "" && !US_STATES.some((s) => s.abbr === state)) throw new ConvexError("Choose a state from the list.");

  const name = input.type === "contractor" && company ? company : contactName;
  return {
    type: input.type,
    name,
    nameKey: name.toLowerCase(),
    contactName,
    company,
    phone,
    email,
    street1: input.street1.trim(),
    street2: input.street2.trim(),
    city: cleanName(input.city).trim(),
    state,
    zip,
    notes: input.notes.trim(),
  };
}

type SearchableClient = { name: string; contactName: string; company: string; phone: string; email: string; street1: string; street2: string; city: string; state: string; zip: string };

export function clientSearchText(c: SearchableClient): string {
  return [c.name, c.contactName, c.company, c.phone, c.email, c.street1, c.street2, c.city, c.state, c.zip].filter(Boolean).join(" ");
}

/** The search text of a project: its client's details plus its own title, code and stage. */
export function opportunitySearchText(c: SearchableClient, o: { title: string; code: string; stage: string }): string {
  return [clientSearchText(c), o.title, o.code, o.stage].join(" ");
}
