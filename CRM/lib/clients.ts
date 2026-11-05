"use client";

/* The only door to client data for the screens (D-013). Today it is sample data plus clients saved in this
   browser; Convex replaces the body of these functions later. Each business has its own list (D-031). */

import { useMemo } from "react";
import { BUSINESSES, SALES_STAGES, SAMPLE_CLIENTS, type Client } from "./sample-data";
import { readItem, useStoredString, writeItem } from "./store";

const CLIENTS_KEY = "qft-mock-clients";
const BUSINESS_KEY = "qft-mock-business";
const noteKey = (id: number) => "qft-mock-notes-" + id;

function parseExtras(raw: string): Client[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Client[]) : [];
  } catch {
    return [];
  }
}

/** Saved or edited clients win over the generated ones with the same id. */
function merge(raw: string): Client[] {
  const extras = parseExtras(raw).reverse();
  const seen = new Set(extras.map((c) => String(c.id)));
  return extras.concat(SAMPLE_CLIENTS.filter((c) => !seen.has(String(c.id))));
}

export function useAllClients(): Client[] {
  const raw = useStoredString(CLIENTS_KEY, "[]");
  return useMemo(() => merge(raw), [raw]);
}

/** The business picked in the top-bar switcher. */
export function useBusiness(): string {
  return useStoredString(BUSINESS_KEY, BUSINESSES[0]);
}

export function setBusiness(name: string) {
  writeItem(BUSINESS_KEY, name);
}

export function currentBusiness(): string {
  return readItem(BUSINESS_KEY) ?? BUSINESSES[0];
}

/** Only the clients of the selected business. */
export function useBusinessClients(): Client[] {
  const business = useBusiness();
  const all = useAllClients();
  return useMemo(() => all.filter((c) => c.business === business), [all, business]);
}

export function findClient(all: Client[], id: string | number | null | undefined): Client | undefined {
  return id == null ? undefined : all.find((c) => String(c.id) === String(id));
}

export function saveClient(c: Client) {
  const rest = parseExtras(readItem(CLIENTS_KEY) ?? "[]").filter((x) => String(x.id) !== String(c.id));
  rest.push(c);
  writeItem(CLIENTS_KEY, JSON.stringify(rest));
}

export type ClientStatus = "Lead" | "Active" | "Archived";

/** Lead: no work has been won yet. Active: has a won sales project or a project in Preplanning or later. Archived: hidden by staff.
    Derived from the sample projects, using the same rules as the client page's Related projects table. */
export function clientStatus(c: Client): ClientStatus {
  if (c.archived) return "Archived";
  const wonSales = SALES_STAGES[c.id % SALES_STAGES.length] === "Closed Won";
  const hasLaterProject = c.id % 3 === 0;
  return wonSales || hasLaterProject ? "Active" : "Lead";
}

export const CLIENT_STATUS_FILTERS = ["All", "Leads and Active", "Leads", "Active", "Archived"] as const;

export function matchesStatusFilter(c: Client, filter: string): boolean {
  const s = clientStatus(c);
  switch (filter) {
    case "Leads and Active": return s !== "Archived";
    case "Leads": return s === "Lead";
    case "Active": return s === "Active";
    case "Archived": return s === "Archived";
    default: return true;
  }
}

export type Note = { t: string; d: string };

export function useSavedNotes(id: number): Note[] {
  const raw = useStoredString(noteKey(id), "[]");
  return useMemo(() => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as Note[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

export function addNote(id: number, note: Note) {
  let list: Note[] = [];
  try {
    list = JSON.parse(readItem(noteKey(id)) ?? "[]");
  } catch {
    /* ignore */
  }
  list.unshift(note);
  writeItem(noteKey(id), JSON.stringify(list));
}
