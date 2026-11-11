"use client";

/* The Schedule's data and date helpers (D-062). Every day is a "yyyy-mm-dd" key in the business time zone, so the calendar reads the same
   whatever the browser's own zone is. The backend (convex/crm/schedule.ts) does the filtering, repeats and availability. */

import { useQuery } from "convex/react";
import { useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BUSINESS_TZ, dayKey, zonedToMs } from "@/convex/crm/lib/schedule";
import { useKept } from "./clients";

export { BUSINESS_TZ, ITEM_LABEL, ITEM_TYPES, REPEAT_LABEL, REPEATS, dayKey, localClock, zonedToMs, inWorkingHours } from "@/convex/crm/lib/schedule";
export type { ItemType, Repeat, WorkingHours } from "@/convex/crm/lib/schedule";

export type View = "month" | "week" | "day";
export const VIEWS: View[] = ["month", "week", "day"];

export const HOUR_PX = 56;
export const DAY_PX = HOUR_PX * 24;

const DAY = 86_400_000;

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}
const utc = (key: string) => {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};
export const addDays = (key: string, n: number) => fromUtc(utc(key) + n * DAY);
export const weekday = (key: string) => new Date(utc(key)).getUTCDay();
export const startOfWeek = (key: string) => addDays(key, -weekday(key));
export const dayStartMs = (key: string) => {
  const { y, m, d } = parseKey(key);
  return zonedToMs(y, m, d, 0, 0, BUSINESS_TZ);
};
export const todayKey = (now: number) => dayKey(now, BUSINESS_TZ);
export const isKey = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Months move by calendar month, keeping the day where it fits. */
export function addMonths(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
}
export const monthTitle = (key: string) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(key));

/** The 6 weeks of days a month view shows, from the Sunday on or before the 1st. */
export function monthDays(key: string): string[] {
  const { y, m } = parseKey(key);
  const first = fromUtc(Date.UTC(y, m - 1, 1));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const weekDays = (key: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(key), i));

/** The first and last moment (exclusive end) the calendar must load for a view. */
export function windowOf(view: View, key: string): { from: number; to: number } {
  if (view === "day") return { from: dayStartMs(key), to: dayStartMs(addDays(key, 1)) };
  if (view === "week") return { from: dayStartMs(startOfWeek(key)), to: dayStartMs(addDays(startOfWeek(key), 7)) };
  const days = monthDays(key);
  return { from: dayStartMs(days[0]), to: dayStartMs(addDays(days[41], 1)) };
}

const clock = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" });
export const timeText = (ms: number) => clock.format(ms);
export const dateText = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, month: "short", day: "numeric", year: "numeric" }).format(ms);
export const hourLabel = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
export const dayLabel = (key: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(utc(key));

/** Date and time inputs for the booking form, in the business time zone. */
export function inputParts(ms: number): { date: string; time: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(ms);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}
export function fromInputs(date: string, time: string): number {
  const { y, m, d } = parseKey(date);
  const [h, min] = time.split(":").map(Number);
  return zonedToMs(y, m, d, h, min, BUSINESS_TZ);
}
/** Minutes after local midnight, clipped to a day, for placing an item in a day column. */
export function minutesIn(ms: number, key: string): number {
  return Math.max(0, Math.min(1440, (ms - dayStartMs(key)) / 60_000));
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Colours of an item by kind: a pale background, a strong edge and dark text. */
export const KIND_STYLE: Record<string, { bg: string; edge: string }> = {
  consultation: { bg: "#fdeccd", edge: "#e08a00" },
  visit: { bg: "#e1f1da", edge: "#388523" },
  task: { bg: "#e3e9f7", edge: "#3b57b8" },
  event: { bg: "#dcf0f5", edge: "#2b8da6" },
  reminder: { bg: "#f9e0e0", edge: "#b3261e" },
};

export type RangeFilters = { types: string[]; people: (Id<"users"> | "unassigned")[]; statuses: string[] };

export function useRange(businessId: Id<"businesses">, from: number, to: number, f: RangeFilters, now: number) {
  return useKept(useQuery(api.crm.schedule.range, { businessId, from, to, types: f.types, assigneeIds: f.people, statuses: f.statuses, now }));
}
export function useUnscheduled(businessId: Id<"businesses">, sort: "oldest" | "newest", enabled: boolean) {
  return useQuery(api.crm.schedule.unscheduled, enabled ? { businessId, sort } : "skip");
}
export function useScheduleSettings(businessId: Id<"businesses">) {
  return useQuery(api.crm.schedule.settings, { businessId });
}
export function useAvailability(businessId: Id<"businesses">, userIds: Id<"users">[], from: number, to: number, enabled: boolean) {
  return useQuery(api.crm.schedule.availability, enabled && userIds.length > 0 ? { businessId, userIds, from, to } : "skip");
}

export type ScheduleItem = NonNullable<ReturnType<typeof useRange>>["items"][number];

/** True on a narrow screen (up to 700px), where the Month view shows coloured dots instead of cramped labels. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia("(max-width: 700px)");
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 700px)").matches,
    () => false,
  );
}
