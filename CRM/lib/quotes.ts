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
  Converted: "lead",
  Archived: "draft",
};
export const QUOTE_DOT: Record<QuoteStatus, string> = {
  Draft: "var(--muted)",
  "Awaiting response": "var(--orange)",
  "Changes requested": "var(--red)",
  Approved: "var(--green)",
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
