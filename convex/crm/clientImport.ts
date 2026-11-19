import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireModule } from "./lib/access";
import { clientSearchText, normalizeClientInput } from "./lib/clientInput";
import { formatPhone, isValidEmail, phoneDigits } from "./lib/fields";
import { CLIENT_TAGS } from "./lib/stages";

/** Importing clients from a Jobber CSV (plan 2026-11-20-client-import). The file is read in the browser (lib/clientImport.ts); this checks each row with the
 *  client form's own rules, skips a client that is already here (same email, then same phone) and creates the rest. `preview` writes nothing; `run` does it.
 *  Both take at most 100 rows. Every row comes back with what happened to it, so nothing is dropped silently (CRM rule 6). Needs the Clients module at
 *  the Edit and delete level. */

const MAX_ROWS = 100;

const rowV = v.object({
  line: v.number(),
  type: v.union(v.literal("homeowner"), v.literal("contractor")),
  isCompany: v.boolean(),
  country: v.string(),
  extraProperties: v.array(v.object({ street1: v.string(), street2: v.string(), city: v.string(), state: v.string(), zip: v.string(), country: v.string() })),
  balanceCents: v.optional(v.number()),
  first: v.string(), last: v.string(), company: v.string(), phone: v.string(), email: v.string(),
  street1: v.string(), street2: v.string(), city: v.string(), state: v.string(), zip: v.string(), notes: v.string(),
  extraPhones: v.array(v.object({ number: v.string(), description: v.string() })),
  extraEmails: v.array(v.object({ address: v.string(), description: v.string() })),
  tags: v.array(v.string()),
  status: v.union(v.literal("lead"), v.literal("active"), v.literal("archived")),
  createdAt: v.optional(v.number()),
});
type Row = typeof rowV.type;

type Result = { line: number; name: string; status: "new" | "duplicate" | "error"; message: string; clientId?: Id<"clients"> };

async function existing(ctx: QueryCtx, businessId: Id<"businesses">, email: string, phone: string): Promise<{ client: Doc<"clients">; why: string } | null> {
  if (email) {
    const c = await ctx.db.query("clients").withIndex("by_business_and_email", (q) => q.eq("businessId", businessId).eq("email", email)).first();
    if (c) return { client: c, why: "the same email" };
  }
  if (phone) {
    const c = await ctx.db.query("clients").withIndex("by_business_and_phone", (q) => q.eq("businessId", businessId).eq("phone", phone)).first();
    if (c) return { client: c, why: "the same phone number" };
  }
  return null;
}

/** Checks one row and, when `write` is given, creates the client. */
async function one(ctx: QueryCtx, businessId: Id<"businesses">, row: Row, write: MutationCtx | null, now: number): Promise<Result> {
  const shown = [row.first, row.last].filter(Boolean).join(" ") || row.company;
  let f: ReturnType<typeof normalizeClientInput>;
  try {
    f = normalizeClientInput(row);
  } catch (e) {
    return { line: row.line, name: shown, status: "error", message: e instanceof ConvexError && typeof e.data === "string" ? e.data : "The row could not be read." };
  }
  const hit = await existing(ctx, businessId, f.email, f.phone);
  if (hit) return { line: row.line, name: f.name, status: "duplicate", message: `Already a client (${hit.client.name}) with ${hit.why}. Skipped.`, clientId: hit.client._id };

  const notes: string[] = [];
  const phones = [...(f.phone ? [{ number: f.phone, description: "Main" }] : [])];
  for (const p of row.extraPhones) {
    const number = formatPhone(p.number);
    if (phoneDigits(number) >= 10) phones.push({ number, description: p.description.trim().slice(0, 30) || "Other" });
    else notes.push(`the phone "${p.number}" was left out`);
  }
  const emails = [...(f.email ? [{ address: f.email, description: "Main" }] : [])];
  for (const m of row.extraEmails) {
    const address = m.address.trim().toLowerCase();
    if (isValidEmail(address)) emails.push({ address, description: m.description.trim().slice(0, 30) || "Other" });
    else notes.push(`the email "${m.address}" was left out`);
  }
  const known = row.tags.flatMap((t) => CLIENT_TAGS.filter((k) => k.toLowerCase() === t.trim().toLowerCase()));
  const tags = known.length ? [...new Set(known)] : f.type === "homeowner" ? ["Homeowner"] : f.company ? ["Company"] : [];
  // More than one address: the first stays the client's own (street1..zip) and is also the first property, as the client page expects.
  const properties = row.extraProperties.slice(0, 20).map((p) => ({ street1: p.street1.trim(), street2: p.street2.trim(), city: p.city.trim(), state: p.state.trim().toUpperCase(), zip: p.zip.trim(), country: p.country.trim(), lawnSize: "", lockedGate: false }));
  if (properties.length) properties.unshift({ street1: f.street1, street2: f.street2, city: f.city, state: f.state, zip: f.zip, country: row.country.trim(), lawnSize: "", lockedGate: false });
  if (row.extraProperties.length > 20) notes.push("only the first 20 extra addresses were kept");
  const message = notes.length ? `Imported; ${notes.join("; ")}.` : "Imported.";
  if (write === null) return { line: row.line, name: f.name, status: "new", message: notes.length ? `Will be imported; ${notes.join("; ")}.` : "Will be imported." };

  const createdAt = row.createdAt !== undefined && row.createdAt <= now ? row.createdAt : now;
  const clientId = await write.db.insert("clients", {
    businessId, ...f, status: row.status, tags, createdAt, lastActivityAt: createdAt, searchText: clientSearchText(f),
    firstName: row.first.trim(), lastName: row.last.trim(), isCompany: row.isCompany || (row.type === "contractor" && !row.first.trim() && !row.last.trim()),
    ...(phones.length ? { phones } : {}), ...(emails.length ? { emails } : {}), ...(properties.length ? { properties } : {}),
    ...(row.balanceCents !== undefined ? { balanceCents: row.balanceCents } : {}),
  });
  return { line: row.line, name: f.name, status: "new", message, clientId };
}

function checkSize(rows: unknown[]) {
  if (rows.length > MAX_ROWS) throw new ConvexError(`Send at most ${MAX_ROWS} rows at a time.`);
}

/** What would happen to each row, without writing anything. */
export const preview = query({
  args: { businessId: v.id("businesses"), rows: v.array(rowV) },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "clients", "full");
    checkSize(args.rows);
    const results: Result[] = [];
    for (const row of args.rows) results.push(await one(ctx, args.businessId, row, null, 0));
    return results;
  },
});

/** Creates the clients that are new. A row that is a duplicate or has an error is returned with why and nothing is written for it. */
export const run = mutation({
  args: { businessId: v.id("businesses"), rows: v.array(rowV), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "clients", "full");
    checkSize(args.rows);
    const results: Result[] = [];
    for (const row of args.rows) results.push(await one(ctx, args.businessId, row, ctx, args.now));
    return results;
  },
});
