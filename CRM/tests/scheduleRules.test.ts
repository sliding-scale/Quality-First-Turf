import { describe, expect, it } from "vitest";
import { DEFAULT_HOURS, dayKey, expandRepeats, findConflicts, inWorkingHours, overlaps, zonedToMs } from "../../convex/crm/lib/schedule";

const TZ = "America/Los_Angeles";
const H = 3_600_000;
const at = (y: number, m: number, d: number, h: number, min = 0) => zonedToMs(y, m, d, h, min, TZ);

describe("overlaps and conflicts", () => {
  it("treats touching as free and one minute of overlap as a clash", () => {
    const ten = { start: at(2026, 11, 10, 10), end: at(2026, 11, 10, 11) };
    expect(overlaps(ten, { start: at(2026, 11, 10, 11), end: at(2026, 11, 10, 12) })).toBe(false);
    expect(overlaps(ten, { start: at(2026, 11, 10, 10, 59), end: at(2026, 11, 10, 12) })).toBe(true);
    expect(overlaps(ten, { start: at(2026, 11, 10, 9), end: at(2026, 11, 10, 18) })).toBe(true);
  });

  it("finds the clashing items and ignores the item being moved", () => {
    const cand = { start: at(2026, 11, 10, 10), end: at(2026, 11, 10, 11) };
    const existing = [
      { id: "a", start: at(2026, 11, 10, 10, 30), end: at(2026, 11, 10, 11, 30) },
      { id: "b", start: at(2026, 11, 10, 12), end: at(2026, 11, 10, 13) },
    ];
    expect(findConflicts(cand, existing).map((e) => e.id)).toEqual(["a"]);
    expect(findConflicts(cand, existing, "a")).toEqual([]);
  });
});

describe("zonedToMs and dayKey", () => {
  it("round-trips local clock time across both daylight saving changes", () => {
    expect(dayKey(at(2026, 11, 1, 10, 30), TZ)).toBe("2026-11-01");
    expect(dayKey(at(2026, 3, 8, 3, 30), TZ)).toBe("2026-03-08");
    expect(new Date(at(2026, 11, 10, 8)).toISOString()).toBe("2026-11-10T16:00:00.000Z"); // PST, UTC-8
    expect(new Date(at(2026, 7, 10, 8)).toISOString()).toBe("2026-07-10T15:00:00.000Z"); // PDT, UTC-7
  });
});

describe("expandRepeats", () => {
  const first = { start: at(2026, 11, 2, 10, 30), end: at(2026, 11, 2, 11, 0) }; // a Monday
  it("returns an item once when it does not repeat, and only inside the window", () => {
    expect(expandRepeats({ ...first, repeat: "none" }, at(2026, 11, 1, 0), at(2026, 11, 8, 0), TZ)).toHaveLength(1);
    expect(expandRepeats({ ...first, repeat: "none" }, at(2026, 11, 3, 0), at(2026, 11, 8, 0), TZ)).toHaveLength(0);
  });

  it("repeats on weekdays only, and a repeat that began before the window still shows in it", () => {
    const week = expandRepeats({ ...first, repeat: "weekdays" }, at(2026, 11, 8, 0), at(2026, 11, 15, 0), TZ);
    expect(week.map((o) => dayKey(o.start, TZ))).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("does not show a repeat before it starts, and stops at repeatUntil", () => {
    expect(expandRepeats({ ...first, repeat: "daily" }, at(2026, 10, 20, 0), at(2026, 11, 1, 0), TZ)).toHaveLength(0);
    const until = at(2026, 11, 4, 23);
    expect(expandRepeats({ ...first, repeat: "daily", repeatUntil: until }, at(2026, 11, 1, 0), at(2026, 11, 30, 0), TZ)).toHaveLength(3);
  });

  it("repeats weekly on the same weekday and monthly on the same date", () => {
    expect(expandRepeats({ ...first, repeat: "weekly" }, at(2026, 11, 1, 0), at(2026, 11, 30, 0), TZ).map((o) => dayKey(o.start, TZ))).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(expandRepeats({ ...first, repeat: "monthly" }, at(2026, 11, 1, 0), at(2027, 2, 1, 0), TZ).map((o) => dayKey(o.start, TZ))).toEqual(["2026-11-02", "2026-12-02", "2027-01-02"]);
  });

  it("keeps 10:30 local on the day the clocks go back", () => {
    const out = expandRepeats({ ...first, repeat: "daily" }, at(2026, 10, 31, 0), at(2026, 11, 3, 0), TZ);
    const local = out.map((o) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(o.start));
    expect(new Set(local)).toEqual(new Set(["10:30"]));
  });

  it("shows an item that crosses midnight in a window that only covers its second day", () => {
    const night = { start: at(2026, 11, 10, 22), end: at(2026, 11, 11, 2), repeat: "none" as const };
    expect(expandRepeats(night, at(2026, 11, 11, 0), at(2026, 11, 12, 0), TZ)).toHaveLength(1);
  });
});

describe("inWorkingHours", () => {
  it("uses the days and the hours", () => {
    expect(inWorkingHours({ start: at(2026, 11, 10, 9), end: at(2026, 11, 10, 10) }, DEFAULT_HOURS, TZ)).toBe(true); // Tuesday
    expect(inWorkingHours({ start: at(2026, 11, 14, 9), end: at(2026, 11, 14, 10) }, DEFAULT_HOURS, TZ)).toBe(false); // Saturday
    expect(inWorkingHours({ start: at(2026, 11, 10, 16, 30), end: at(2026, 11, 10, 17, 30) }, DEFAULT_HOURS, TZ)).toBe(false);
    expect(H).toBe(3_600_000);
  });
});
