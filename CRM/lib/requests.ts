"use client";

/* Requests (D-039). A request is NOT its own record: it is a project in the Sales pipeline, seen through its stage. The
   backend (convex/crm/requests.ts) works out the status; this file only asks for it. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RequestStatus } from "@/convex/crm/lib/stages";
import { startOfToday, useKept } from "./clients";

export { OVERDUE_AFTER_DAYS, REQUEST_STATUSES, type RequestStatus } from "@/convex/crm/lib/stages";

export type RequestFilters = {
  status: "All" | RequestStatus;
  /** Inclusive range of request dates, in ms. null is open-ended. */
  from: number | null;
  to: number | null;
  search: string;
  sortKey: "client" | "title" | "requestedAt" | "status";
  dir: "asc" | "desc";
};

export function useRequestList(businessId: Id<"businesses">, filters: RequestFilters, page: number, size: number) {
  return useKept(useQuery(api.crm.requests.list, { businessId, ...filters, today: startOfToday(), page, size }));
}

export function useRequestStats(businessId: Id<"businesses">) {
  return useKept(useQuery(api.crm.requests.stats, { businessId, today: startOfToday() }));
}
