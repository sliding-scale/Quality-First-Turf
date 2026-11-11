"use client";

/* Quotes (D-056). The backend (convex/crm/quotes.ts) filters, sorts, counts and pages; this file only asks for it. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { QuoteStatus } from "@/convex/crm/lib/stages";
import { startOfToday, useKept } from "./clients";

export { QUOTE_OPEN_STATUSES, QUOTE_STATUSES, type QuoteStatus } from "@/convex/crm/lib/stages";

export type QuoteFilters = {
  status: "All" | QuoteStatus;
  /** Inclusive range of created dates, in ms. null is open-ended. */
  from: number | null;
  to: number | null;
  salesperson: string | null;
  search: string;
  sortKey: "client" | "number" | "createdAt" | "status" | "total";
  dir: "asc" | "desc";
};

/** The pill and dot for each status, matching Jobber: grey draft, amber awaiting, red changes, green approved, blue converted. */
export const QUOTE_PILL: Record<QuoteStatus, string> = {
  Draft: "draft",
  "Awaiting response": "consult",
  "Changes requested": "overdue",
  Approved: "active",
  Rejected: "overdue",
  Converted: "lead",
  Archived: "draft",
};
export const QUOTE_DOT: Record<QuoteStatus, string> = {
  Draft: "var(--muted)",
  "Awaiting response": "var(--orange)",
  "Changes requested": "var(--red)",
  Approved: "var(--green)",
  Rejected: "var(--red)",
  Converted: "var(--blue)",
  Archived: "var(--line)",
};

export function useQuoteList(businessId: Id<"businesses">, filters: QuoteFilters, page: number, size: number) {
  return useKept(useQuery(api.crm.quotes.list, { businessId, ...filters, page, size }));
}

export function useQuoteStats(businessId: Id<"businesses">) {
  return useKept(useQuery(api.crm.quotes.stats, { businessId, today: startOfToday() }));
}

export function useSalespeople(businessId: Id<"businesses">) {
  return useQuery(api.crm.quotes.salespeople, { businessId });
}

export function useQuote(id: string) {
  return useQuery(api.crm.quotes.get, { id: id as Id<"quotes"> });
}

/* ---- The builder (D-063) ---- */

export { quoteTotals, lineTotalCents, lineIncluded } from "@/convex/crm/lib/quoteMath";

/** "$1,250.50" or "1250.5" typed in a box, as whole cents; NaN when it is not a number. */
export function dollarsToCents(text: string): number {
  const clean = text.replace(/[$,\s]/g, "");
  if (clean === "") return NaN;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export function useQuoteEvents(id: string) {
  return useQuery(api.crm.quoteFlow.events, { id: id as Id<"quotes"> });
}
export function useQuoteRevisions(id: string) {
  return useQuery(api.crm.quoteFlow.revisions, { id: id as Id<"quotes"> });
}
export function usePriceSearch(businessId: Id<"businesses">, clientId: Id<"clients"> | undefined, search: string, enabled: boolean) {
  return useQuery(api.crm.quotePrices.search, enabled ? { businessId, ...(clientId ? { clientId } : {}), search } : "skip");
}
export function useClientSearch(businessId: Id<"businesses">, search: string) {
  return useQuery(api.crm.clients.list, { businessId, status: "Leads and Active", type: "All", search, sortKey: "name", dir: "asc", page: 1, size: 8 });
}

/** Uploads a file to a Convex storage URL and returns its id. */
export async function uploadFile(url: string, file: File): Promise<Id<"_storage">> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error("The file could not be uploaded.");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}
