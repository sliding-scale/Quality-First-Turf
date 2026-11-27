"use client";

/* One field for the day and the time of a booking (user, 2026-11-26, D-130): the button reads "Thu, Nov 26 · 9:00 AM – 10:00 AM", or "Pick a
   date and time", and opens a calendar with the start and end time pickers under it. Used by Find a Time and the pipeline card's Schedule
   consultation. The values are a "YYYY-MM-DD" day and "HH:MM" times in the business time zone. */

import { useState } from "react";
import { addMonths, monthDays, monthTitle, parseKey, todayKey } from "@/lib/schedule";
import { Icon } from "./icon";
import { TimePicker, addMinutesTo, timeText } from "./time-picker";
import { useUI } from "./ui-provider";

export type When = { date: string; start: string; end: string; anytime: boolean };

const dayText = (key: string) => {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

/** What the button says. */
export function whenText(w: When): string {
  if (!w.date) return "";
  if (w.anytime) return `${dayText(w.date)} · Anytime`;
  return `${dayText(w.date)} · ${timeText(w.start)} – ${timeText(w.end)}`;
}

export function WhenField({ id, value, onChange, bad, allowAnytime, minDate }: {
  id?: string;
  value: When;
  onChange: (next: When) => void;
  bad?: boolean;
  /** Offers "Anytime that day" (not for a consultation booked from a card, which needs a time). */
  allowAnytime?: boolean;
  /** The first day that can be picked ("YYYY-MM-DD"). */
  minDate?: string;
}) {
  const { popover } = useUI();
  return (
    <button
      id={id}
      type="button"
      className={`when-btn${value.date ? "" : " blank"}${bad ? " bad" : ""}`}
      aria-haspopup="dialog"
      onClick={(e) => popover(e.currentTarget, (close) => <WhenPanel initial={value} onChange={onChange} close={close} allowAnytime={allowAnytime} minDate={minDate} />, { className: "when-pop" })}
    >
      <Icon name="calendar" size={18} />
      <span>{value.date ? whenText(value) : "Pick a date and time"}</span>
    </button>
  );
}

/** The popover keeps its own copy: it is drawn once and does not see the form's state change, so every change is also sent up at once. */
function WhenPanel({ initial, onChange, close, allowAnytime, minDate }: { initial: When; onChange: (w: When) => void; close: () => void; allowAnytime?: boolean; minDate?: string }) {
  const [w, setW] = useState<When>(initial);
  const [today] = useState(() => todayKey(Date.now()));
  const [shown, setShown] = useState(initial.date || today);
  const set = (patch: Partial<When>) => {
    const next = { ...w, ...patch };
    setW(next);
    onChange(next);
  };
  const days = monthDays(shown);
  const month = parseKey(shown).m;
  const length = minutesBetween(w.start, w.end);
  return (
    <div className="when-panel">
      <div className="when-cal">
        <div className="when-head">
          <button type="button" aria-label="Previous month" onClick={() => setShown((k) => addMonths(k, -1))}><Icon name="chevleft" size={18} /></button>
          <span>{monthTitle(shown)}</span>
          <button type="button" aria-label="Next month" onClick={() => setShown((k) => addMonths(k, 1))}><Icon name="chevright" size={18} /></button>
        </div>
        <div className="when-grid" role="grid" aria-label={monthTitle(shown)}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="when-dow">{d}</span>)}
          {days.map((d) => {
            const past = !!minDate && d < minDate;
            return (
              <button
                key={d}
                type="button"
                disabled={past}
                aria-pressed={d === w.date}
                className={`when-day${parseKey(d).m !== month ? " out" : ""}${d === today ? " today" : ""}${d === w.date ? " sel" : ""}`}
                onClick={() => set({ date: d })}
              >
                {parseKey(d).d}
              </button>
            );
          })}
        </div>
      </div>
      {!w.anytime && (
        <div className="tp-pair when-times">
          <div className="field">
            <label>Start time</label>
            <TimePicker label="Start time" value={w.start} onChange={(v) => set({ start: v, end: addMinutesTo(v, length > 0 ? length : 60) })} />
          </div>
          <div className={`field${length > 0 ? "" : " bad"}`}>
            <label>End time</label>
            <TimePicker label="End time" value={w.end} bad={!(length > 0)} onChange={(v) => set({ end: v })} />
          </div>
        </div>
      )}
      {!w.anytime && !(length > 0) && <p className="when-err">The end has to be after the start.</p>}
      <div className="when-foot">
        {allowAnytime ? (
          <label className="when-any"><input type="checkbox" checked={w.anytime} onChange={(e) => set({ anytime: e.target.checked })} /> Anytime that day</label>
        ) : <span />}
        <button type="button" className="btn small primary" onClick={close}>Done</button>
      </div>
    </div>
  );
}
