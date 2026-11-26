"use client";

/* Schedule consultation on the last step of the New Request flow (D-084). The same fields as the sales form's Schedule consultation
   (forms/components/consultation-button.tsx: date, start time, length, notes for the visit) and its look, but the booking is for the
   person the request is assigned to, on their CRM calendar (which mirrors to their Zoho Calendar when they have connected it, D-069).
   Nothing is checked while the fields are being filled in: only the Schedule button reads that person's calendar for the chosen time.
   A clash with a CRM booking is refused; a busy time from their Zoho Calendar or a time outside working hours is a warning that can be
   overridden, as on the Schedule (D-062, D-069). The request does not exist yet, so the flow books it right after the save, where the
   server checks the clash again. */

import { useConvex } from "convex/react";
import { CalendarCheck, CalendarPlus, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock as now } from "@/lib/pipeline";
import { failure } from "@/lib/requests";
import { BUSINESS_TZ, fromInputs, inWorkingHours, todayKey } from "@/lib/schedule";
import { TimePicker, addMinutesTo } from "@/components/time-picker";

export type ConsultationDraft = { date: string; time: string; minutes: number; instructions: string; start: number; end: number };

function clock(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function day(date: string, long = false): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric" });
}

const timeOf = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" }).format(ms);

type Clash = { title: string; start: number; end: number };
type Check = { kind: "busy"; clashes: Clash[] } | { kind: "warn"; lines: string[]; draft: ConsultationDraft };

export function ConsultationPicker({ businessId, assignee, value, onChange, disabled }: {
  businessId: Id<"businesses">;
  assignee: { id: Id<"users">; name: string };
  value: ConsultationDraft | null;
  onChange: (next: ConsultationDraft | null) => void;
  disabled?: boolean;
}) {
  const convex = useConvex();
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const minutes = (() => { const [ah, am] = time.split(":").map(Number); const [bh, bm] = endTime.split(":").map(Number); return bh * 60 + bm - (ah * 60 + am); })();
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);

  function open() {
    setDate(value?.date ?? "");
    setTime(value?.time ?? "09:00");
    setEndTime(addMinutesTo(value?.time ?? "09:00", value?.minutes ?? 60));
    setInstructions(value?.instructions ?? "");
    setError(null);
    setCheck(null);
    dialog.current?.showModal();
  }

  const close = () => dialog.current?.close();

  // Any change to the time makes an earlier answer about it stale, so it goes away until Schedule is pressed again.
  function edited<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setCheck(null); setError(null); };
  }

  function accept(draft: ConsultationDraft) {
    onChange(draft);
    close();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    if (date === "") return setError("Choose a date.");
    if (!(minutes > 0)) return setError("The end has to be after the start.");
    const start = fromInputs(date, time);
    const end = start + minutes * 60_000;
    if (start <= now()) return setError("That time has already passed. Choose a later one.");
    setError(null);
    setCheck(null);
    setChecking(true);
    try {
      const { busy, hours } = await convex.query(api.crm.schedule.availability, { businessId, userIds: [assignee.id], from: start, to: end });
      const overlapping = busy.filter((b) => b.userId === assignee.id && b.start < end && b.end > start);
      const booked = overlapping.filter((b) => !b.external);
      if (booked.length > 0) {
        setCheck({ kind: "busy", clashes: booked });
        return;
      }
      const draft: ConsultationDraft = { date, time, minutes, instructions: instructions.trim(), start, end };
      const lines = overlapping.map((b) => `Their Zoho Calendar has "${b.title}" from ${timeOf(b.start)} to ${timeOf(b.end)}.`);
      if (!inWorkingHours({ start, end }, hours, BUSINESS_TZ)) lines.push("This is outside working hours.");
      if (lines.length > 0) setCheck({ kind: "warn", lines, draft });
      else accept(draft);
    } catch (e) {
      setError(failure(e, `${assignee.name}'s calendar could not be checked. Check your connection and try again.`));
    } finally {
      setChecking(false);
    }
  }

  const Icon = value ? CalendarCheck : CalendarPlus;

  return (
    <>
      <div className="nrf-consult">
        <button type="button" className={value ? "consultation-btn is-booked" : "consultation-btn"} disabled={disabled} onClick={open}>
          <Icon size={18} aria-hidden="true" />
          <span className="consultation-btn__text">
            {value ? (
              <>
                <small>Consultation</small>
                {`${day(value.date)} · ${clock(value.time)} – ${clock(addMinutesTo(value.time, value.minutes))}`}
              </>
            ) : (
              "Schedule consultation"
            )}
          </span>
        </button>
        {value && (
          <button type="button" className="nrf-consult__remove" disabled={disabled} onClick={() => onChange(null)} aria-label="Remove the consultation">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="nrf-consult__note">
        {value
          ? `On ${assignee.name}'s calendar once the request is saved.`
          : `Goes on ${assignee.name}'s calendar. Their availability is checked when you press Schedule.`}
      </p>

      <dialog ref={dialog} className="consultation-dialog" aria-labelledby="nrf-consult-title" onClick={(e) => { if (e.target === dialog.current) close(); }}>
        <form className="consultation-form" onSubmit={onSubmit} noValidate>
          <header className="consultation-form__head">
            <h2 id="nrf-consult-title">{value ? "Reschedule consultation" : "Schedule consultation"}</h2>
            <button type="button" className="visit-icon-btn" onClick={close} aria-label="Close"><X size={18} aria-hidden="true" /></button>
          </header>

          {value ? <p className="consultation-form__current">Chosen for {day(value.date, true)} at {clock(value.time)} with {assignee.name}.</p> : null}

          <div className="consultation-form__grid">
            <label className="consultation-field">
              <span>Date</span>
              <input type="date" value={date} min={todayKey(now())} onChange={(e) => edited(setDate)(e.target.value)} required />
            </label>
            <div className="consultation-field">
              <span>Start time</span>
              <TimePicker label="Start time" value={time} onChange={(v) => { setEndTime(addMinutesTo(v, minutes > 0 ? minutes : 60)); edited(setTime)(v); }} />
            </div>
            <div className="consultation-field">
              <span>End time</span>
              <TimePicker label="End time" value={endTime} bad={!(minutes > 0)} onChange={(v) => edited(setEndTime)(v)} />
            </div>
            <label className="consultation-field consultation-field--wide">
              <span>Notes for the visit (optional)</span>
              <textarea rows={3} maxLength={1000} placeholder="Gate code, parking, who to ask for" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </label>
          </div>

          <p className="consultation-form__note">Booked on {assignee.name}&apos;s calendar, in Pacific time.</p>

          {check?.kind === "busy" && (
            <div className="consultation-busy" role="alert">
              <p className="consultation-busy__clash">{assignee.name} is not available then. Choose another time.</p>
              <ul>
                {check.clashes.map((c, i) => <li key={i}><span>{timeOf(c.start)} to {timeOf(c.end)}</span>{c.title}</li>)}
              </ul>
            </div>
          )}
          {check?.kind === "warn" && (
            <div className="consultation-busy" role="alert">
              {check.lines.map((line, i) => <p key={i}>{line}</p>)}
              <p>You can still book it, or choose another time.</p>
            </div>
          )}
          {error !== null ? <p className="visit-alert" role="alert">{error}</p> : null}

          <div className="consultation-form__actions">
            {check?.kind === "warn" ? (
              <button type="button" className="visit-primary" onClick={() => accept({ ...check.draft, instructions: instructions.trim() })}>Schedule anyway</button>
            ) : (
              <button type="submit" className="visit-primary" disabled={checking}>{checking ? "Checking the calendar…" : value ? "Save new time" : "Schedule"}</button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
