"use client";

/* The only door to client data for the screens (D-013). It talks to Convex (convex/crm/): the lists are filtered, sorted,
   counted and cut into pages on the server, and every query is reactive, so a change shows up without reloading.
   Each business has its own list (D-031). Only the choice of business, a viewing preference, stays in the browser. */

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DAY_MS, type ClientStatusFilter } from "@/convex/crm/lib/stages";
import { useStoredString, writeItem } from "./store";

export type ClientDoc = Doc<"clients">;
export type BusinessDoc = Doc<"businesses">;

const BUSINESS_KEY = "qft-crm-business";

/** The start of today in this browser. Queries cannot read the clock, so callers pass it in. It is stable all day. */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days between a past moment and today (0 for today). */
export function daysAgoFrom(timestamp: number, today: number = startOfToday()): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - d.getTime()) / DAY_MS));
}

/** Keeps showing the last result while a new one loads, so a page change or a keystroke never flashes a skeleton. */
export function useKept<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState<T | undefined>(value);
  if (value !== undefined && value !== kept) setKept(value);
  return value ?? kept;
}

// ---------------------------------------------------------------------------------------------------------------------
// Businesses

export function useBusinesses(): BusinessDoc[] | undefined {
  return useQuery(api.crm.businesses.list, {});
}

export type Workspace =
  | { state: "loading" }
  | { state: "empty" } // the backend answered, but no businesses exist yet (the dev sample data has not been loaded)
  | { state: "ready"; business: BusinessDoc; businesses: BusinessDoc[] };

/** Which business the screens show: the one picked in the top bar, else the first. */
export function useWorkspace(): Workspace {
  const businesses = useBusinesses();
  const stored = useStoredString(BUSINESS_KEY, "");
  if (businesses === undefined) return { state: "loading" };
  const business = businesses.find((b) => b._id === stored) ?? businesses[0];
  return business ? { state: "ready", business, businesses } : { state: "empty" };
}

export function setBusiness(id: Id<"businesses">) {
  writeItem(BUSINESS_KEY, id);
}

// ---------------------------------------------------------------------------------------------------------------------
// Clients

export type ClientFilters = {
  status: ClientStatusFilter;
  type: "All" | "homeowner" | "contractor";
  search: string;
  sortKey: "name" | "lastActivity";
  dir: "asc" | "desc";
};

export function useClientList(businessId: Id<"businesses">, filters: ClientFilters, page: number, size: number) {
  return useKept(useQuery(api.crm.clients.list, { businessId, ...filters, page, size }));
}

export function useClientStats(businessId: Id<"businesses">) {
  return useKept(useQuery(api.crm.clients.stats, { businessId, today: startOfToday() }));
}

/** undefined while loading, null when there is no such client. */
export function useClient(id: string | undefined) {
  return useQuery(api.crm.clients.get, id === undefined ? "skip" : { id });
}

export function useClientNotes(clientId: Id<"clients"> | undefined) {
  return useQuery(api.crm.clients.notes, clientId ? { clientId } : "skip");
}

export function useClientProjects(clientId: Id<"clients"> | undefined) {
  return useQuery(api.crm.projects.byClient, clientId ? { clientId } : "skip");
}
