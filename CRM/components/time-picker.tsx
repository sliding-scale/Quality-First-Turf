"use client";

/* The time picker used wherever a consultation or visit is booked (user, 2026-11-25, D-129). Modelled on the 21st.dev / HextaUI "Time picker"
   the user pointed to (12-hour, AM/PM, a "Now" button), built here in plain CSS because the CRM does not use Tailwind or shadcn (D-019, CLAUDE.md).
   The value is "HH:MM" in 24-hour time, the same as a native time input, so it drops in where one was. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const EXIT_MS = 120; // keep in step with tp-out in globals.css

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:30" -> { h12: 2, m: 30, pm: true }; "" -> null. */
function parts(value: string): { h12: number; m: number; pm: boolean } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  return { h12: h % 12 === 0 ? 12 : h % 12, m: Number(match[2]), pm: h >= 12 };
}
const join = (h12: number, m: number, pm: boolean) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(m)}`;

/** "2:30 PM", for showing a "HH:MM" value. */
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

export function TimePicker({ id, value, onChange, label, disabled, bad, placeholder }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  bad?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Where the panel is drawn: the page, or the native <dialog> it sits in (the top layer would hide it otherwise). Read when it opens.
  const [host, setHost] = useState<Element | null>(null);
  const openPanel = () => {
    setHost(box.current?.closest("dialog") ?? document.body);
    setOpen(true);
  };
  const current = parts(value);

  const close = () => {
    if (!open || leaving) return;
    setLeaving(true);
  };
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => { setOpen(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || panel.current?.contains(t)) return;
      setLeaving(true);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); /* closes the picker, not the dialog it is in */ setLeaving(true); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  // The panel is drawn over the page, not inside the form, so it never makes a dialog scroll (user, 2026-11-26). It sits under the button,
  // or above it when there is no room below, and follows it while the page scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = panel.current;
      const trigger = box.current?.querySelector(".tp-trigger");
      if (!el || !trigger) return;
      const r = trigger.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const top = below < el.offsetHeight + 12 && r.top > below ? r.top - el.offsetHeight - 6 : r.bottom + 6;
      el.style.top = `${Math.max(8, top)}px`;
      el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))}px`;
    };
    place();
    // The chosen hour and minute show in their columns, by scrolling only the columns (scrollIntoView would scroll the dialog too).
    panel.current?.querySelectorAll<HTMLElement>(".tp-col .on").forEach((on) => {
      const col = on.parentElement;
      if (col) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2;
    });
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  const set = (patch: Partial<{ h12: number; m: number; pm: boolean }>) => {
    const base = current ?? { h12: 9, m: 0, pm: false };
    const next = { ...base, ...patch };
    onChange(join(next.h12, next.m, next.pm));
  };
  const now = () => {
    const d = new Date();
    const m = Math.round(d.getMinutes() / 5) * 5;
    const h = d.getHours() + (m === 60 ? 1 : 0);
    onChange(`${pad(h % 24)}:${pad(m % 60)}`);
  };

  return (
    <div className={`tp${bad ? " bad" : ""}`} ref={box}>
      <button
        id={id}
        type="button"
        className="tp-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open && !leaving}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
      >
        <Icon name="timeline" size={18} />
        <span className={value ? "" : "tp-placeholder"}>{value ? timeText(value) : (placeholder ?? label)}</span>
      </button>
      {open && host && createPortal(
        <div ref={panel} className={`tp-panel${leaving ? " leaving" : ""}`} role="dialog" aria-label={label}>
          <div className="tp-cols">
            <div className="tp-col" role="listbox" aria-label="Hour">
              {HOURS.map((h) => (
                <button key={h} type="button" role="option" aria-selected={current?.h12 === h} className={current?.h12 === h ? "on" : ""} onClick={() => set({ h12: h })}>{h}</button>
              ))}
            </div>
            <div className="tp-col" role="listbox" aria-label="Minute">
              {MINUTES.map((m) => (
                <button key={m} type="button" role="option" aria-selected={current?.m === m} className={current?.m === m ? "on" : ""} onClick={() => set({ m })}>{pad(m)}</button>
              ))}
            </div>
            <div className="tp-col tp-ampm" role="listbox" aria-label="AM or PM">
              {(["AM", "PM"] as const).map((x) => {
                const on = current ? current.pm === (x === "PM") : false;
                return <button key={x} type="button" role="option" aria-selected={on} className={on ? "on" : ""} onClick={() => set({ pm: x === "PM" })}>{x}</button>;
              })}
            </div>
          </div>
          <div className="tp-foot">
            <button type="button" className="linkbtn" onClick={now}>Now</button>
            <button type="button" className="btn small primary" onClick={close}>Done</button>
          </div>
        </div>,
        host,
      )}
    </div>
  );
}
