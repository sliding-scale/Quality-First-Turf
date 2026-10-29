"use client";

import { useAction } from "convex/react";
import { CalendarCheck, CalendarPlus, X } from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { friendlyError } from "@/lib/errors";

export type Consultation = {
  assessmentId: string;
  date: string;
  time: string;
  minutes: number;
  instructions: string;
  salesperson?: string;
};

const lengths = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 45, label: "45 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1 hour 30 minutes" },
  { minutes: 120, label: "2 hours" },
];

const defaultMinutes = 60;

/** Quarter-hour start times across the day, as "HH:MM". */
const startTimes = Array.from({ length: 96 }, (_, index) => {
  const total = index * 15;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});

function clock(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function day(date: string, long = false): string {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  return new Date(year, month - 1, dayOfMonth).toLocaleDateString("en-US", {
    weekday: long ? "long" : "short",
    month: long ? "long" : "short",
    day: "numeric",
  });
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ConsultationButton({
  sessionToken,
  projectId,
  canSchedule,
  assignment,
  assignedToName,
  email,
  consultation,
}: {
  sessionToken: string;
  projectId: Id<"projects">;
  canSchedule: boolean;
  assignment: "none" | "me" | "other";
  assignedToName: string | null;
  email: string;
  consultation: Consultation | undefined;
}) {
  const book = useAction(api.projects.consultation.book);
  const cancel = useAction(api.projects.consultation.cancel);
  const loadBusy = useAction(api.projects.consultation.busy);
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"book" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // What this salesperson already has on the chosen day; null while it loads.
  const [busy, setBusy] = useState<{ start: string; end: string; title: string; isBreak: boolean }[] | null>(null);
  const [opens, setOpens] = useState(0);

  useEffect(() => {
    if (date === "") return;
    let current = true;
    loadBusy({ sessionToken, projectId, date })
      .then((items) => {
        if (current) setBusy(items);
      })
      .catch(() => {
        if (current) setBusy([]);
      });
    return () => {
      current = false;
    };
  }, [date, opens, loadBusy, sessionToken, projectId]);

  const wanted = minutesOf(time);
  const clash =
    busy?.find((item) => {
      const start = minutesOf(item.start);
      const end = minutesOf(item.end) <= start ? minutesOf(item.end) + 1440 : minutesOf(item.end);
      return wanted < end && start < wanted + minutes;
    }) ?? null;

  // Opens on the booked appointment when there is one, otherwise on a blank form.
  function open() {
    setDate(consultation?.date ?? "");
    setTime(consultation?.time ?? "09:00");
    setMinutes(consultation?.minutes ?? defaultMinutes);
    setInstructions(consultation?.instructions ?? "");
    setError(null);
    setConfirmingCancel(false);
    setBusy(null);
    setOpens((count) => count + 1);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (date === "") {
      setError("Choose a date.");
      return;
    }
    setError(null);
    setPending("book");
    try {
      await book({ sessionToken, projectId, date, time, minutes, instructions });
      close();
    } catch (failure) {
      setError(friendlyError(failure, "The consultation could not be booked. Check your connection and try again."));
    } finally {
      setPending(null);
    }
  }

  async function onCancel() {
    setError(null);
    setPending("cancel");
    try {
      await cancel({ sessionToken, projectId });
      close();
    } catch (failure) {
      setError(friendlyError(failure, "The consultation could not be cancelled. Try again."));
    } finally {
      setPending(null);
      setConfirmingCancel(false);
    }
  }

  const booked = consultation !== undefined;
  const tipId = useId();
  const tip = !canSchedule
    ? "Available once this project has reached Jobber."
    : assignment === "none"
      ? "Assign this lead to yourself first."
      : assignment === "other"
        ? `Assigned to ${assignedToName ?? "another salesperson"}. Only they can book it.`
        : undefined;
  const Icon = booked ? CalendarCheck : CalendarPlus;

  return (
    <>
      <span className="consultation-tip" data-tip={tip}>
        <button
          type="button"
          className={`consultation-btn${booked ? " is-booked" : ""}`}
          onClick={open}
          disabled={!canSchedule || assignment !== "me"}
          aria-describedby={tip === undefined ? undefined : tipId}
        >
          <Icon size={18} aria-hidden="true" />
          <span className="consultation-btn__text">
            {booked ? (
              <>
                <small>Consultation</small>
                {`${day(consultation.date)} · ${clock(consultation.time)}`}
              </>
            ) : (
              "Consultation"
            )}
          </span>
        </button>
        {tip === undefined ? null : (
          <span id={tipId} className="visually-hidden">
            {tip}
          </span>
        )}
      </span>

      <dialog
        ref={dialog}
        className="consultation-dialog"
        aria-labelledby="consultation-title"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <form className="consultation-form" onSubmit={onSubmit} noValidate>
          <header className="consultation-form__head">
            <h2 id="consultation-title">{booked ? "Reschedule consultation" : "Schedule consultation"}</h2>
            <button type="button" className="visit-icon-btn" onClick={close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {booked ? (
            <p className="consultation-form__current">
              Booked for {day(consultation.date, true)} at {clock(consultation.time)}
              {consultation.salesperson === undefined ? "" : ` with ${consultation.salesperson}`}.
            </p>
          ) : null}

          <div className="consultation-form__grid">
            <label className="consultation-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                min={today()}
                onChange={(event) => {
                  setBusy(null);
                  setDate(event.target.value);
                }}
                required
              />
            </label>
            <label className="consultation-field">
              <span>Start time</span>
              <select value={time} onChange={(event) => setTime(event.target.value)}>
                {startTimes.map((slot) => (
                  <option key={slot} value={slot}>
                    {clock(slot)}
                  </option>
                ))}
              </select>
            </label>
            <label className="consultation-field consultation-field--wide">
              <span>Length</span>
              <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                {lengths.map((length) => (
                  <option key={length.minutes} value={length.minutes}>
                    {length.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="consultation-field consultation-field--wide">
              <span>Notes for the visit (optional)</span>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Gate code, parking, who to ask for"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>
          </div>

          {date === "" ? null : (
            <div className="consultation-busy" aria-live="polite">
              {busy === null ? (
                <p>Checking your calendar…</p>
              ) : busy.length === 0 ? (
                <p>Your calendar is free on {day(date)}.</p>
              ) : (
                <>
                  <p>Already booked or on a break on {day(date)}:</p>
                  <ul>
                    {busy.map((item, index) => (
                      <li key={`${item.start}-${index}`}>
                        <span>{`${clock(item.start)} – ${clock(item.end)}`}</span>
                        {item.isBreak ? `On a break · ${item.title}` : item.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {clash === null ? null : (
                <p className="consultation-busy__clash" role="alert">
                  {clash.isBreak
                    ? `That time falls in a break (${clock(clash.start)} – ${clock(clash.end)}). Choose another time.`
                    : `That time overlaps ${clash.title}. Choose another time.`}
                </p>
              )}
            </div>
          )}

          <p className="consultation-form__note">
            {email.trim() === ""
              ? "There is no email on file for this customer, so Jobber cannot send a confirmation."
              : `Jobber adds this to the calendar and emails ${email.trim()}.`}
          </p>

          {error !== null ? (
            <p className="visit-alert" role="alert">
              {error}
            </p>
          ) : null}

          <div className="consultation-form__actions">
            {booked ? (
              confirmingCancel ? (
                <button type="button" className="visit-danger" onClick={onCancel} disabled={pending !== null}>
                  {pending === "cancel" ? "Cancelling…" : "Yes, cancel it"}
                </button>
              ) : (
                <button
                  type="button"
                  className="visit-secondary"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={pending !== null}
                >
                  Cancel consultation
                </button>
              )
            ) : null}
            <button type="submit" className="visit-primary" disabled={pending !== null || clash !== null}>
              {pending === "book" ? "Saving…" : booked ? "Save new time" : "Schedule"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
