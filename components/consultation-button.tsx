"use client";

import { useAction } from "convex/react";
import { CalendarCheck, CalendarPlus, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { friendlyError } from "@/lib/errors";

export type Consultation = {
  assessmentId: string;
  date: string;
  time: string;
  minutes: number;
  instructions: string;
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

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ConsultationButton({
  sessionToken,
  projectId,
  canSchedule,
  email,
  consultation,
}: {
  sessionToken: string;
  projectId: Id<"projects">;
  canSchedule: boolean;
  email: string;
  consultation: Consultation | undefined;
}) {
  const book = useAction(api.projects.consultation.book);
  const cancel = useAction(api.projects.consultation.cancel);
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"book" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Opens on the booked appointment when there is one, otherwise on a blank form.
  function open() {
    setDate(consultation?.date ?? "");
    setTime(consultation?.time ?? "09:00");
    setMinutes(consultation?.minutes ?? defaultMinutes);
    setInstructions(consultation?.instructions ?? "");
    setError(null);
    setConfirmingCancel(false);
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
  const Icon = booked ? CalendarCheck : CalendarPlus;

  return (
    <>
      <button
        type="button"
        className={`consultation-btn${booked ? " is-booked" : ""}`}
        onClick={open}
        disabled={!canSchedule}
        title={canSchedule ? undefined : "Available once this project has reached Jobber."}
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
              Booked for {day(consultation.date, true)} at {clock(consultation.time)}.
            </p>
          ) : null}

          <div className="consultation-form__grid">
            <label className="consultation-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                min={today()}
                onChange={(event) => setDate(event.target.value)}
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
            <button type="submit" className="visit-primary" disabled={pending !== null}>
              {pending === "book" ? "Saving…" : booked ? "Save new time" : "Schedule"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
