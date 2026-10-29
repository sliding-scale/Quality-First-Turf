/**
 * Wall-clock helpers for one IANA time zone, so Jobber's UTC timestamps and the app's
 * "date + time" pairs can be compared without depending on the server's own zone.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** The date ("YYYY-MM-DD") and time ("HH:MM") a UTC instant shows on a wall clock in `timeZone`. */
export function zonedWallClock(instant: Date | string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour")}:${read("minute")}`,
  };
}

/** The UTC instant at which a `timeZone` wall clock shows `date` and `time`. */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  // Two passes settle the offset, including across a daylight-saving change.
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = zonedWallClock(new Date(guess), timeZone);
    const [shownYear, shownMonth, shownDay] = shown.date.split("-").map(Number);
    const [shownHour, shownMinute] = shown.time.split(":").map(Number);
    const shownMs = Date.UTC(shownYear, shownMonth - 1, shownDay, shownHour, shownMinute);
    guess += wanted - shownMs;
  }
  return new Date(guess);
}

/** Minutes from midnight of `date` to the wall-clock moment of `instant` (negative before, over 1440 after). */
export function minutesFromDayStart(date: string, instant: Date | string, timeZone: string): number {
  const shown = zonedWallClock(instant, timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const [shownYear, shownMonth, shownDay] = shown.date.split("-").map(Number);
  const [hour, minute] = shown.time.split(":").map(Number);
  const days = (Date.UTC(shownYear, shownMonth - 1, shownDay) - Date.UTC(year, month - 1, day)) / 86_400_000;
  return days * 1440 + hour * 60 + minute;
}

/** "HH:MM" for a minute count, wrapping past midnight. */
export function clockFromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** Whether two half-open minute ranges share any time. */
export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}
