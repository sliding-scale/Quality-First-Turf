import { v } from "convex/values";
import { query } from "../_generated/server";
import { canSee, requireStaff } from "./lib/access";
import { allows, canSeeRecord } from "./lib/permissions";

/* The client page's Activity history tab (PRD 2.1, D-113): one timeline, newest first. It reads the client's own `activities` and the
   logs that already exist (notes, the client's requests and their stage moves, quote events, invoice events) instead of copying them.
   A source is left out for someone who may not see it: quotes need Quotes view, invoices need Invoices view, requests and stage moves
   need Requests view (and, for an assigned-only person, a project assigned to them). */

const PER_SOURCE = 100;
const MAX_ENTRIES = 150;

export type ClientActivityKind = "client" | "note" | "request" | "stage" | "quote" | "invoice";
type Entry = { key: string; at: number; kind: ClientActivityKind; title: string; detail: string; who: string };

export const list = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, a): Promise<Entry[]> => {
    const staff = await requireStaff(ctx);
    const client = await ctx.db.get(a.clientId);
    // A client in a business the person does not belong to looks the same as one that does not exist.
    if (!client || !canSee(staff, client.businessId) || !allows(staff.levels.clients, "view")) return [];
    const out: Entry[] = [];

    for (const e of await ctx.db.query("activities").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).order("desc").take(PER_SOURCE)) {
      out.push({ key: e._id, at: e.at, kind: "client", title: e.title, detail: e.detail, who: e.byName });
    }
    for (const n of await ctx.db.query("clientNotes").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).order("desc").take(PER_SOURCE)) {
      out.push({ key: n._id, at: n._creationTime, kind: "note", title: "Note", detail: n.text.length > 240 ? `${n.text.slice(0, 239)}…` : n.text, who: n.author });
    }

    if (allows(staff.levels.requests, "view")) {
      const projects = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).take(PER_SOURCE);
      for (const p of projects) {
        if (!canSeeRecord({ assignedOnly: staff.assignedOnly, userId: staff.userId }, p)) continue;
        out.push({ key: `created-${p._id}`, at: p.requestedAt, kind: "request", title: `Request created: ${p.title}`, detail: p.sourceProjectId ? "From the customer form" : "", who: "" });
        for (const h of await ctx.db.query("stageHistory").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(PER_SOURCE)) {
          out.push({ key: h._id, at: h.at, kind: "stage", title: `${p.title}: moved to ${h.to}`, detail: `From ${h.from}${h.note ? `. ${h.note}` : ""}`, who: h.byName });
        }
      }
    }

    if (allows(staff.levels.quotes, "view")) {
      for (const qt of await ctx.db.query("quotes").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).take(PER_SOURCE)) {
        for (const e of await ctx.db.query("quoteEvents").withIndex("by_quoteId", (q) => q.eq("quoteId", qt._id)).take(50)) {
          out.push({ key: e._id, at: e.at, kind: "quote", title: `Quote #${qt.number}: ${e.kind}`, detail: e.detail, who: e.byName });
        }
      }
    }

    if (allows(staff.levels.invoices, "view")) {
      for (const inv of await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).take(PER_SOURCE)) {
        for (const e of await ctx.db.query("invoiceEvents").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).take(50)) {
          out.push({ key: e._id, at: e.at, kind: "invoice", title: `Invoice #${inv.number}: ${e.kind}`, detail: e.detail, who: e.byName });
        }
      }
    }

    return out.sort((x, y) => y.at - x.at).slice(0, MAX_ENTRIES);
  },
});
