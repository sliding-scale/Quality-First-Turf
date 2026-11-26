"use client";

import { useAction } from "convex/react";
import { CalendarCheck, CalendarPlus, X } from "lucide-react";
import { FormEvent, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { friendlyError } from "@/convex/shared/errors";
import { TimePicker, addMinutesTo, minutesBetween } from "@/components/time-picker";
import { visitLabel } from "@/convex/shared/visits";

export type Consultation = {
  assessmentId: string;
  date: string;
  time: string;
  minutes: number;
  instructions: string;
  salesperson?: string;
};


const defaultMinutes = 60;


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
  assignment,
  assignedToName,
  consultation,
  visit,
}: {
  sessionToken: string;
  projectId: Id<"projects">;
  canSchedule: boolean;
  assignment: "none" | "me" | "other";
  assignedToName: string | null;
  /** The customer's email. Kept for the callers; the booking no longer emails them (it went through Jobber, D-126). */
  email: string;
  /** The booking for the visit being scheduled; undefined when that visit has not been booked yet. */
  consultation: Consultation | undefined;
  /** Which visit this button schedules: 0 is the consultation, 1 and up are follow-ups. */
  visit: number;
}) {
  const label = visitLabel(visit);
  const lowerLabel = label.toLowerCase();
  const book = useAction(api.projects.consultation.book);
  const cancel = useAction(api.projects.consultation.cancel);
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [endTime, setEndTime] = useState(addMinutesTo("09:00", defaultMinutes));
  const minutes = minutesBetween(time, endTime);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"book" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Opens on the booked appointment when there is one, otherwise on a blank form.
  function open() {
    setDate(consultation?.date ?? "");
    setTime(consultation?.time ?? "09:00");
    setEndTime(addMinutesTo(consultation?.time ?? "09:00", consultation?.minutes ?? defaultMinutes));
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
    if (minutes < 15) {
      setError("The end has to be at least 15 minutes after the start.");
      return;
    }
    setError(null);
    setPending("book");
    try {
      await book({ sessionToken, projectId, date, time, minutes, instructions });
      close();
    } catch (failure) {
      setError(friendlyError(failure, `The ${lowerLabel} could not be booked. Check your connection and try again.`));
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
      setError(friendlyError(failure, `The ${lowerLabel} could not be cancelled. Try again.`));
    } finally {
      setPending(null);
      setConfirmingCancel(false);
    }
  }

  const booked = consultation !== undefined;
  const tipId = useId();
  const tip = !canSchedule
    ? "This project cannot be scheduled yet."
    : assignment === "none"
      ? "Assign this lead to yourself first."
      : assignment === "other"
        ? `Assigned to ${assignedToName ?? "another salesperson"}. They need to unassign it before you can schedule.`
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
                <small>{label}</small>
                {`${day(consultation.date)} · ${clock(consultation.time)}`}
              </>
            ) : (
              label
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
            <h2 id="consultation-title">{booked ? `Reschedule ${lowerLabel}` : `Schedule ${lowerLabel}`}</h2>
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
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <div className="consultation-field">
              <span>Start time</span>
              <TimePicker label="Start time" value={time} onChange={(next) => { setEndTime(addMinutesTo(next, minutes > 0 ? minutes : defaultMinutes)); setTime(next); }} />
            </div>
            <div className="consultation-field">
              <span>End time</span>
              <TimePicker label="End time" value={endTime} bad={!(minutes > 0)} onChange={setEndTime} />
            </div>
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
            Goes on your Launchpad calendar, and on your Zoho Calendar when it is connected.
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
                  Cancel {lowerLabel}
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
