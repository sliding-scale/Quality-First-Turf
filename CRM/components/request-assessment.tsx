"use client";

/* The On-site assessment of a request (Jobber's request page): the visit to the property before the work is quoted. In this CRM it is
   a consultation on the Schedule, so booking one here and booking one from the Schedule are the same thing and the same clash checks
   apply. The pop-up collects the date, time, length, team and instructions; the caller books it (the New Request form after the request
   is saved, the request page straight away). The instructions are kept in the consultation's notes. */

import { useState } from "react";
import { fromInputs, inputParts, todayKey } from "@/lib/schedule";
import { quoteDateTime } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";

export type AssessmentDraft = { start: number; end: number; anytime: boolean; assigneeIds: string[]; instructions: string };

const DURATIONS = ["0.5", "1", "1.5", "2", "3", "4"];
const durationLabel = (h: string) => (Number(h) < 1 ? "30 minutes" : Number(h) === 1 ? "1 hour" : `${h} hours`);

/** A short line for a booked time: "Oct 19, 2026, 10:00 AM", or the day alone for an anytime visit. */
export function whenLabel(a: { start: number; anytime: boolean }): string {
  return a.anytime ? `${quoteDateTime(a.start).split(",").slice(0, 2).join(",")} · Anytime` : quoteDateTime(a.start);
}

export function AssessmentModal({ people, initial, onSave, onClose }: {
  people: { id: string; name: string }[] | undefined;
  initial: AssessmentDraft | null;
  /** Called with what was entered. May throw (a clash, say): the message is shown in the pop-up and nothing is lost. */
  onSave: (a: AssessmentDraft) => Promise<void> | void;
  onClose: () => void;
}) {
  const seeded = initial ? inputParts(initial.start) : { date: "", time: "10:00" };
  const [date, setDate] = useState(seeded.date);
  const [time, setTime] = useState(seeded.time);
  const [duration, setDuration] = useState(initial && !initial.anytime ? String((initial.end - initial.start) / 3_600_000) : "1");
  const [anytime, setAnytime] = useState(initial?.anytime ?? false);
  const [team, setTeam] = useState<string[]>(initial?.assigneeIds ?? []);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A length that is not in the list (a visit booked from the Schedule) still shows, as hours.
  const lengths = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration];

  async function save(close: () => void) {
    const next: Record<string, boolean> = {};
    if (!date) next.date = true;
    if (!anytime && !time) next.time = true;
    setBad(next);
    if (Object.keys(next).length) {
      document.getElementById(next.date ? "as-date" : "as-time")?.focus();
      return;
    }
    const start = anytime ? fromInputs(date, "00:00") : fromInputs(date, time);
    const end = anytime ? start + 86_400_000 : start + Number(duration) * 3_600_000;
    setBusy(true);
    setError("");
    try {
      await onSave({ start, end, anytime, assigneeIds: team, instructions: instructions.trim() });
      close();
    } catch (e) {
      setError(failure(e, "The assessment could not be saved."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="On-site assessment" onClose={onClose} busy={busy}>
      {(close) => (
        <form className="as-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(close); }}>
          <div className="as-row">
            <div className={`field${bad.date ? " bad" : ""}`}>
              <label htmlFor="as-date">Date</label>
              <input id="as-date" type="date" min={todayKey(clock())} aria-invalid={!!bad.date} value={date} onChange={(e) => { setDate(e.target.value); setBad((b) => ({ ...b, date: false })); }} />
              <span className="err">Pick a date.</span>
            </div>
            {!anytime && (
              <>
                <div className={`field${bad.time ? " bad" : ""}`}>
                  <label htmlFor="as-time">Start time</label>
                  <input id="as-time" type="time" aria-invalid={!!bad.time} value={time} onChange={(e) => { setTime(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
                  <span className="err">Pick a time.</span>
                </div>
                <div className="field">
                  <label htmlFor="as-length">Length</label>
                  <select id="as-length" value={duration} onChange={(e) => setDuration(e.target.value)}>
                    {lengths.map((h) => <option key={h} value={h}>{durationLabel(h)}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <label className="sc-check"><input type="checkbox" checked={anytime} onChange={(e) => setAnytime(e.target.checked)} /> Anytime that day</label>

          <fieldset className="as-team">
            <legend>Team</legend>
            {people === undefined ? (
              <div className="sk" style={{ height: 24, width: 160 }} />
            ) : people.length === 0 ? (
              <p className="muted">No one to assign yet.</p>
            ) : (
              people.map((p) => (
                <label key={p.id} className="sc-check">
                  <input type="checkbox" checked={team.includes(p.id)} onChange={(e) => setTeam(e.target.checked ? [...team, p.id] : team.filter((t) => t !== p.id))} /> {p.name}
                </label>
              ))
            )}
          </fieldset>

          <div className="field">
            <label htmlFor="as-notes">Instructions</label>
            <textarea id="as-notes" rows={4} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="as-bar">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/** The dashed box on the New Request form: empty it invites a booking; with one chosen it shows it, with Edit and Remove. */
export function AssessmentPicker({ value, people, onEdit, onRemove }: {
  value: AssessmentDraft | null;
  people: { id: string; name: string }[] | undefined;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!value) {
    return (
      <button type="button" className="as-empty" onClick={onEdit}>
        <span className="as-icon"><Icon name="visit" size={22} /></span>
        <span>Visit the property to assess the job before you do the work</span>
        <b>Schedule assessment</b>
      </button>
    );
  }
  const names = value.assigneeIds.map((id) => people?.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div className="as-card">
      <dl className="as-facts">
        <div><dt>Schedule</dt><dd>{whenLabel(value)}</dd></div>
        <div><dt>Team</dt><dd>{names || <i className="as-unassigned">Unassigned</i>}</dd></div>
        {value.instructions && <div className="wide"><dt>Instructions</dt><dd>{value.instructions}</dd></div>}
      </dl>
      <div className="as-actions">
        <button type="button" className="btn" onClick={onEdit}>Edit</button>
        <button type="button" className="btn" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
