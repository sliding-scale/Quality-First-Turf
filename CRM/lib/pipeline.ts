"use client";

/* The Sales pipeline board's data and small helpers (D-061). The backend (convex/crm/pipeline.ts) filters, sorts and totals; this
   file only asks, and turns a few numbers into the words Jobber uses. */

import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DAY_MS, type BoardGroup } from "@/convex/crm/lib/stages";
import { BUSINESS_TZ, dayKey } from "@/convex/crm/lib/schedule";
import { rangeBounds, type DateRange } from "./dates";
import { useKept } from "./clients";

export { LEAD_SOURCES, NO_SOURCE, PIPELINE_GROUPS, CLOSED_STAGES, type PipelineGroup, type BoardGroup } from "@/convex/crm/lib/stages";

export type SortKey = "timeInStage" | "createdDate" | "value";
export const SORT_LABEL: Record<SortKey, string> = { timeInStage: "Time in stage", createdDate: "Created date", value: "Value" };

export type BoardFilters = {
  sortKey: SortKey;
  dir: "asc" | "desc";
  /** A person, "unassigned", or null for everyone. */
  salespersonId: Id<"users"> | "unassigned" | null;
  /** [] means all sources. */
  leadSources: string[];
  range: DateRange;
  search: string;
};

/** The current time, refreshed each minute, so a query that needs "now" is not re-asked on every render. */
export function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 60_000) * 60_000), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The date range as the backend takes it (first and last moment, in ms; either may be open). */
export function rangeMs(range: DateRange): { from?: number; to?: number } {
  const { from, to } = rangeBounds(range);
  return { ...(from ? { from: from.getTime() } : {}), ...(to ? { to: to.getTime() + DAY_MS - 1 } : {}) };
}

export function useBoard(businessId: Id<"businesses">, f: BoardFilters, now: number) {
  const args = {
    businessId,
    sortKey: f.sortKey,
    dir: f.dir,
    leadSources: f.leadSources,
    search: f.search,
    now,
    ...(f.salespersonId ? { salespersonId: f.salespersonId } : {}),
    ...rangeMs(f.range),
  };
  return useKept(useQuery(api.crm.pipeline.board, args));
}

export function usePeople(businessId: Id<"businesses">) {
  return useQuery(api.crm.pipeline.people, { businessId });
}

/** "18h" the way Jobber's card shows it: minutes under an hour, hours under two days, then days. */
export function timeLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The message from a backend refusal, or a plain fallback. A refusal can also carry a code and a quote to open (Closed Won needs a signature). */
export function failure(e: unknown, fallback: string): string {
  if (!(e instanceof ConvexError)) return fallback;
  if (typeof e.data === "string") return e.data;
  if (e.data && typeof e.data === "object" && typeof (e.data as { message?: unknown }).message === "string") return (e.data as { message: string }).message;
  return fallback;
}

/** The quote to open when a move to Closed Won was refused because of it, if the refusal named one. */
export function wonBlock(e: unknown): { code: string; message: string; quoteId?: string } | null {
  if (!(e instanceof ConvexError) || !e.data || typeof e.data !== "object") return null;
  const d = e.data as { code?: unknown; message?: unknown; quoteId?: unknown };
  if (typeof d.code !== "string" || typeof d.message !== "string") return null;
  return { code: d.code, message: d.message, ...(typeof d.quoteId === "string" ? { quoteId: d.quoteId } : {}) };
}

export type BoardData = NonNullable<ReturnType<typeof useBoard>>;
export type BoardCard = BoardData["columns"][number]["cards"][number];

/** The start and end of today in ms, for the Tasks tab. */
export function todayBounds(): { todayStart: number; todayEnd: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return { todayStart: d.getTime(), todayEnd: d.getTime() + DAY_MS - 1 };
}

/** The moment of a click, passed to the backend (queries must not read the clock). A function of its own so event handlers can call it. */
export const clock = (): number => Date.now();

export type ViewAction = { key: "request" | "quote" | "schedule"; label: string; /** Where it goes; absent when there is nowhere to go yet. */ href?: string };

/** The "View ..." choices on a card: a quote's card offers View Quote (not View Request); a card whose consultation is scheduled also
 *  offers View Schedule. It opens the Schedule at the week of the project's consultation; with none booked it has no destination and is greyed. */
export function viewActions(card: { group: BoardGroup; stage: string; clientId: string; quoteId?: string; consultationAt?: number }): ViewAction[] {
  const quote = card.group === "Quotes" || (card.group === "Closed" && card.quoteId !== undefined);
  const list: ViewAction[] = quote
    ? [{ key: "quote", label: "View Quote", ...(card.quoteId ? { href: `/quotes/${card.quoteId}` } : {}) }]
    : [{ key: "request", label: "View Request", href: `/clients/${card.clientId}` }];
  if (card.stage === "Onsite Consultation") {
    list.push({ key: "schedule", label: "View Schedule", ...(card.consultationAt !== undefined ? { href: `/schedule?view=week&date=${dayKey(card.consultationAt, BUSINESS_TZ)}` } : {}) });
  }
  return list;
}

/** True on a touch screen (a coarse pointer). HTML5 drag and drop does not work there, so the board uses a long-press drag instead. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia("(pointer: coarse)");
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
