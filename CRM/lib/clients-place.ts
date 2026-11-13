/* Where the Clients list was, so Back from a client page returns to the same page, search and filters (May, 2026-11-11).
   The address is the source of truth when it names a page. A bare /clients restores the last place in this tab, except right after the sidebar
   tab was clicked, which forgets it: a sidebar tab always opens the first page. */

import { CLIENT_STATUS_FILTERS, type ClientStatusFilter } from "@/convex/crm/lib/stages";

const KEY = "qft-clients-list";
const SIZES = [10, 25, 50, 100];

export type ClientsPlace = {
  page: number;
  size: number;
  q: string;
  status: ClientStatusFilter;
  tags: string[];
  sortKey: "name" | "lastActivity";
  dir: "asc" | "desc";
};

export type ClientsSearch = {
  page?: string;
  size?: string;
  status?: string;
  sort?: string;
  dir?: string;
  tags?: string;
};

function isStatus(s: string): s is ClientStatusFilter {
  return (CLIENT_STATUS_FILTERS as readonly string[]).includes(s);
}

function clean(p: Partial<ClientsPlace>, q = ""): ClientsPlace {
  const size = SIZES.includes(p.size ?? 0) ? p.size! : 10;
  return {
    page: Math.max(1, Math.floor(p.page ?? 1) || 1),
    size,
    q,
    status: p.status && isStatus(p.status) ? p.status : "Leads and Active",
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : [],
    sortKey: p.sortKey === "name" ? "name" : "lastActivity",
    dir: p.dir === "asc" ? "asc" : "desc",
  };
}

/** The list address for this place. Defaults are left off so page 1 of an unfiltered list is /clients. */
export function clientsListHref(place: ClientsPlace | null): string {
  if (!place) return "/clients";
  const q = new URLSearchParams();
  if (place.q) q.set("q", place.q);
  if (place.page > 1) q.set("page", String(place.page));
  if (place.size !== 10) q.set("size", String(place.size));
  if (place.status !== "Leads and Active") q.set("status", place.status);
  if (place.tags.length) q.set("tags", place.tags.join(","));
  if (place.sortKey !== "lastActivity") q.set("sort", place.sortKey);
  if (place.dir !== "desc") q.set("dir", place.dir);
  const s = q.toString();
  return s ? `/clients?${s}` : "/clients";
}

/** What the address is asking for, or null when it names nothing and the last place should be used. */
export function placeFromSearch(q: string, list: ClientsSearch): ClientsPlace | null {
  if (!q && !list.page && !list.size && !list.status && !list.sort && !list.dir && !list.tags) return null;
  const size = Number(list.size);
  return clean(
    {
      page: Number(list.page),
      size: SIZES.includes(size) ? size : 10,
      status: list.status && isStatus(list.status) ? list.status : "Leads and Active",
      tags: list.tags ? list.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      sortKey: list.sort === "name" ? "name" : "lastActivity",
      dir: list.dir === "asc" ? "asc" : "desc",
    },
    q,
  );
}

export function readClientsPlace(): ClientsPlace | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ClientsPlace>;
    if (!p || typeof p.page !== "number") return null;
    return clean(p, typeof p.q === "string" ? p.q : "");
  } catch {
    return null;
  }
}

export function writeClientsPlace(place: ClientsPlace) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    /* storage unavailable: the address still carries the page */
  }
}

/** The list to go back to. /clients until the browser can read the saved place, which a bare /clients then restores. */
export function clientsReturnHref(): string {
  return clientsListHref(readClientsPlace());
}

/** Drops the saved place, so the next bare /clients opens page 1 with the default filters (the sidebar's Clients tab does this). */
export function forgetClientsPlace() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing was saved */
  }
}
