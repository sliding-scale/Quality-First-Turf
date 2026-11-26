"use client";

/* The time picker for the sales form's Schedule consultation (D-129 in CRM/docs/decisions.md). The same picker as the Launchpad CRM's
   (CRM/components/time-picker.tsx), in this app's dark look: 12-hour, AM/PM, a "Now" button, modelled on the 21st.dev / HextaUI time picker the
   user pointed to. The value is "HH:MM" in 24-hour time. */

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const EXIT_MS = 120;

const pad = (n: number) => String(n).padStart(2, "0");

function parts(value: string): { h12: number; m: number; pm: boolean } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  return { h12: h % 12 === 0 ? 12 : h % 12, m: Number(match[2]), pm: h >= 12 };
}
const join = (h12: number, m: number, pm: boolean) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(m)}`;

export function timeText(value: string): string {
  const p = parts(value);
  return p ? `${p.h12}:${pad(p.m)} ${p.pm ? "PM" : "AM"}` : "";
}

/** A "HH:MM" an amount of minutes later, kept within the day. */
export function addMinutesTo(value: string, minutes: number): string {
  const p = parts(value);
  if (!p) return "";
  const total = Math.min(23 * 60 + 55, ((p.h12 % 12) + (p.pm ? 12 : 0)) * 60 + p.m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Minutes from one "HH:MM" to another (negative when the second is earlier). */
export function minutesBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return 0;
  const at = (p: { h12: number; m: number; pm: boolean }) => ((p.h12 % 12) + (p.pm ? 12 : 0)) * 60 + p.m;
  return at(b) - at(a);
}

export function TimePicker({ value, onChange, label, bad }: { value: string; onChange: (value: string) => void; label: string; bad?: boolean }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = parts(value);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setLeaving(true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setLeaving(true);
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !box.current) return;
    box.current.querySelectorAll<HTMLElement>(".ftp-col .on").forEach((el) => el.scrollIntoView({ block: "center" }));
  }, [open]);

  const set = (patch: Partial<{ h12: number; m: number; pm: boolean }>) => {
    const next = { ...(current ?? { h12: 9, m: 0, pm: false }), ...patch };
    onChange(join(next.h12, next.m, next.pm));
  };
  const now = () => {
    const d = new Date();
    const m = Math.round(d.getMinutes() / 5) * 5;
    const h = d.getHours() + (m === 60 ? 1 : 0);
    onChange(`${pad(h % 24)}:${pad(m % 60)}`);
  };

  return (
    <div className={`ftp${bad ? " bad" : ""}`} ref={box}>
      <button type="button" className="ftp-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open && !leaving} onClick={() => (open ? setLeaving(true) : setOpen(true))}>
        <Clock size={16} aria-hidden="true" />
        <span>{value ? timeText(value) : label}</span>
      </button>
      {open && (
        <div className={`ftp-panel${leaving ? " leaving" : ""}`} role="dialog" aria-label={label}>
          <div className="ftp-cols">
            <div className="ftp-col" role="listbox" aria-label="Hour">
              {HOURS.map((h) => (
                <button key={h} type="button" role="option" aria-selected={current?.h12 === h} className={current?.h12 === h ? "on" : ""} onClick={() => set({ h12: h })}>{h}</button>
              ))}
            </div>
            <div className="ftp-col" role="listbox" aria-label="Minute">
              {MINUTES.map((m) => (
                <button key={m} type="button" role="option" aria-selected={current?.m === m} className={current?.m === m ? "on" : ""} onClick={() => set({ m })}>{pad(m)}</button>
              ))}
            </div>
            <div className="ftp-col" role="listbox" aria-label="AM or PM">
              {(["AM", "PM"] as const).map((x) => {
                const on = current ? current.pm === (x === "PM") : false;
                return <button key={x} type="button" role="option" aria-selected={on} className={on ? "on" : ""} onClick={() => set({ pm: x === "PM" })}>{x}</button>;
              })}
            </div>
          </div>
          <div className="ftp-foot">
            <button type="button" className="ftp-now" onClick={now}>Now</button>
            <button type="button" className="ftp-done" onClick={() => setLeaving(true)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
