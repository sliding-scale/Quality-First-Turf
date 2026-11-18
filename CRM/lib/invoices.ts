"use client";

/* Invoices and payments (PRD 5.2, design 2026-11-18-finance). The backend (convex/crm/invoices.ts, payments.ts, billing.ts) filters, sorts,
   counts and pages and does all the money; this file only asks for it and holds a few display helpers. Money is whole cents. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InvoiceStatus } from "@/convex/crm/lib/invoiceMath";
import { useKept } from "./clients";
import { BUSINESS_TIME_ZONE } from "./format";
import { useMinute } from "./pipeline";

export { balanceOf, dueDateFor, INVOICE_STATUS_FILTERS, invoiceTotals, PAYMENT_METHODS, PAYMENT_TERMS, spreadDue, type InvoiceStatus } from "@/convex/crm/lib/invoiceMath";
export { centsToInput, dollarsToCents, uploadFile } from "./quotes";

/** The pill and dot for each status, matching Jobber: grey draft, amber awaiting, red past due, green paid. */
export const INVOICE_PILL: Record<InvoiceStatus, string> = {
  Draft: "draft", "Awaiting payment": "consult", "Past due": "overdue", Paid: "active", "Bad debt": "overdue", Void: "draft",
};
export const INVOICE_DOT: Record<InvoiceStatus, string> = {
  Draft: "var(--muted)", "Awaiting payment": "var(--orange)", "Past due": "var(--red)", Paid: "var(--green)", "Bad debt": "var(--red)", Void: "var(--line)",
};

/* Dates on invoices and payments are whole days, kept as UTC midnight so a day is the same day for everyone. A date typed or shown is the
   business's own calendar date (America/Los_Angeles, as everywhere in the CRM, see lib/format.ts). */
export const utcDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "2026-11-18": today's date in the business's time zone. */
export const todayInput = () => new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE });
export const inputToUtc = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const utcToInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const todayUtc = () => inputToUtc(todayInput());

export type InvoiceFilters = {
  status: string;
  from?: number;
  to?: number;
  search: string;
  sortKey: "client" | "number" | "dueAt" | "status" | "total" | "balance";
  dir: "asc" | "desc";
};

export function useInvoiceList(businessId: Id<"businesses">, f: InvoiceFilters, page: number, size: number) {
  const now = useMinute();
  return useKept(useQuery(api.crm.invoices.list, { businessId, ...f, page: page - 1, size, now }));
}
export function useInvoiceStats(businessId: Id<"businesses">) {
  const now = useMinute();
  return useKept(useQuery(api.crm.invoices.stats, { businessId, now }));
}
export function useInvoice(id: string | undefined) {
  const now = useMinute();
  return useQuery(api.crm.invoices.get, id ? { id: id as Id<"invoices">, now } : "skip");
}
export function useInvoiceDefaults(businessId: Id<"businesses">) {
  return useQuery(api.crm.invoices.defaults, { businessId });
}

export type PaymentFilters = {
  method: string;
  from?: number;
  to?: number;
  search: string;
  sortKey: "client" | "paidAt" | "method" | "amount";
  dir: "asc" | "desc";
};
export function usePaymentList(businessId: Id<"businesses">, f: PaymentFilters, page: number, size: number) {
  return useKept(useQuery(api.crm.payments.list, { businessId, ...f, page: page - 1, size }));
}
export function usePaymentStats(businessId: Id<"businesses">) {
  const now = useMinute();
  return useKept(useQuery(api.crm.payments.stats, { businessId, now }));
}
export function useOutstanding(clientId: Id<"clients"> | undefined) {
  const now = useMinute();
  return useQuery(api.crm.payments.outstanding, clientId ? { clientId, now } : "skip");
}
export function useDeposits(clientId: Id<"clients"> | undefined, opportunityId?: Id<"opportunities">) {
  return useQuery(api.crm.payments.deposits, clientId ? { clientId, ...(opportunityId ? { opportunityId } : {}) } : "skip");
}
export function useBilling(opportunityId: Id<"opportunities"> | undefined) {
  const now = useMinute();
  return useQuery(api.crm.billing.get, opportunityId ? { opportunityId, now } : "skip");
}
export function useInvoiceSettings(businessId: Id<"businesses">) {
  return useQuery(api.crm.invoiceSettings.get, { businessId });
}
