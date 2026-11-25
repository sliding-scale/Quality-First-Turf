"use client";

/* The small pop-ups on the pipeline: why a project was lost, adding a task. Same style and motion as the other
   dialogs (D-037): a closing pop-up stays mounted for the length of its exit animation. Invalid fields turn red on submit (D-035). */

import { useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { zonedToInstant, zonedWallClock } from "@/convex/shared/zonedTime";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { fromInputs, todayKey } from "@/lib/schedule";
import { Icon } from "./icon";
import { useDialogFocus } from "./use-dialog-focus";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

/** `className` lets a pop-up change its look: "sc-pop" (the Schedule form) leaves the page behind it visible and usable. */
export function PipelineModal({ title, onClose, busy, className, children }: { title: string; onClose: () => void; busy?: boolean; className?: string; children: (close: () => void) => ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);
  const close = () => setLeaving(true);
  const box = useDialogFocus(!className);
  return (
    <div className={`modal-back${leaving ? " leaving" : ""}${className ? ` ${className}` : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal={className ? undefined : "true"} aria-label={title} tabIndex={-1} ref={box}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>
        {children(close)}
      </div>
    </div>
  );
}

/** Closed Lost needs a reason (PRD 3.3). `onConfirm` does the move and throws the server's message when refused. */
export function LostReasonDialog({ project, onConfirm, onClose }: { project: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Mark as lost" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason.trim()) {
              setBad(true);
              document.getElementById("lost-reason")?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onConfirm(reason.trim());
              close();
            } catch (err) {
              setError(failure(err, "Could not mark the project as lost. Try again."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">{project}</p>
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="lost-reason">Why was it lost?</label>
            <textarea id="lost-reason" aria-invalid={bad} value={reason} onChange={(e) => { setReason(e.target.value); setBad(false); }} />
            <span className="err">Say why the project was lost.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Mark as lost"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

export type EditableTask = { id: Id<"opportunityTasks">; title: string; description?: string; dueAt?: number; assigneeId?: Id<"users"> };

/** yyyy-mm-dd of a moment, in the business's day (the same day Home and Tasks use for "Due today"), for a date box. */
const dateBox = (ms: number | undefined) => (ms === undefined ? "" : zonedWallClock(new Date(ms), BUSINESS_TIME_ZONE).date);

/** A task on a project (`projectId`), or, with none, a task of the business's own from the Tasks page or Home (PRD 3.5). With `task` it
 *  edits that task, and offers Delete (after a second click to be sure). `defaultAssignee` is who a new task starts with. */
export function AddTaskDialog({ projectId, businessId, people, task, defaultAssignee, onClose }: {
  projectId?: Id<"opportunities">; businessId: Id<"businesses">; people: { id: Id<"users">; name: string }[]; task?: EditableTask; defaultAssignee?: Id<"users">; onClose: () => void;
}) {
  const addTask = useMutation(api.crm.opportunityTasks.addTask);
  const createTask = useMutation(api.crm.opportunityTasks.createTask);
  const updateTask = useMutation(api.crm.opportunityTasks.updateTask);
  const removeTask = useMutation(api.crm.opportunityTasks.removeTask);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignee, setAssignee] = useState<string>(task ? (task.assigneeId ?? "") : (defaultAssignee ?? ""));
  const [due, setDue] = useState(dateBox(task?.dueAt));
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title={task ? "Edit task" : "New task"} onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) {
              setBad(true);
              document.getElementById("task-title")?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              // Noon on the chosen day in the business's time zone, so the due date is the same day wherever the person's browser is.
              const dueAt = due ? zonedToInstant(due, "12:00", BUSINESS_TIME_ZONE).getTime() : undefined;
              if (task) await updateTask({ taskId: task.id, title, description, dueAt: dueAt ?? null, assigneeId: assignee ? (assignee as Id<"users">) : null });
              else {
                const extra = { ...(description.trim() ? { description } : {}), ...(assignee ? { assigneeId: assignee as Id<"users"> } : {}), ...(dueAt ? { dueAt } : {}) };
                if (projectId) await addTask({ id: projectId, title, ...extra });
                else await createTask({ businessId, title, ...extra });
              }
              close();
            } catch (err) {
              setError(failure(err, "The task could not be saved. Try again."));
              setBusy(false);
            }
          }}
        >
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="task-title">Title</label>
            <input id="task-title" aria-invalid={bad} maxLength={200} autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setBad(false); }} />
            <span className="err">Give the task a title.</span>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="task-description">Description</label>
            <textarea id="task-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="task-assignee">Assignee</label>
            <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="task-due">Due date</label>
            <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            {task && (
              sure ? (
                <>
                  <span className="muted" style={{ marginRight: "auto" }}>Delete this task? This cannot be undone.</span>
                  <button type="button" className="btn plain" onClick={() => setSure(false)} disabled={busy}>Cancel</button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await removeTask({ taskId: task.id });
                        close();
                      } catch (err) {
                        setError(failure(err, "The task could not be deleted. Try again."));
                        setBusy(false);
                        setSure(false);
                      }
                    }}
                  >Yes, delete</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => setSure(true)} disabled={busy}>Delete</button>
                  <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
                  <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                </>
              )
            )}
            {!task && (
              <>
                <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              </>
            )}
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

const CONSULT_LENGTHS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 45, label: "45 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1 hour 30 minutes" },
  { minutes: 120, label: "2 hours" },
];
/** Quarter-hour start times, as "HH:MM". */
const CONSULT_TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const clockLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Schedule consultation from a card in "Schedule Onsite Consultation" (client, 2026-11-25): the person, the day, the time, the length and
 *  notes for the visit. Booking it puts it on that person's calendar (and their Zoho Calendar when connected) and moves the project to
 *  "Onsite Consultation" (crm/schedule.book, D-085). A clash with another booking is refused by the server and shown here. */
export function ScheduleConsultationDialog({ businessId, project, people, defaultAssignee, onClose, onBooked }: {
  businessId: Id<"businesses">;
  project: { id: Id<"opportunities">; title: string; clientId: Id<"clients"> };
  people: { id: Id<"users">; name: string }[];
  defaultAssignee?: Id<"users">;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const book = useMutation(api.crm.schedule.book);
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(60);
  const [notes, setNotes] = useState("");
  const [bad, setBad] = useState<{ assignee?: boolean; date?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = todayKey(clock());
  return (
    <PipelineModal title="Schedule consultation" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const next: { assignee?: boolean; date?: string } = {};
            if (!assignee) next.assignee = true;
            const start = date ? fromInputs(date, time) : NaN;
            if (!date) next.date = "Choose a date.";
            else if (start <= clock()) next.date = "That time has already passed. Choose a later one.";
            setBad(next);
            if (next.assignee || next.date) {
              document.getElementById(next.assignee ? "sc-cons-who" : "sc-cons-date")?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              await book({
                businessId, type: "consultation", title: `Consultation: ${project.title}`, start, end: start + minutes * 60_000, anytime: false,
                assigneeIds: [assignee as Id<"users">], opportunityId: project.id, clientId: project.clientId, notes: notes.trim(), now: clock(),
              });
              onBooked?.();
              close();
            } catch (err) {
              setError(failure(err, "The consultation could not be booked. Try again."));
              setBusy(false);
            }
          }}
        >
          <p className="muted" style={{ marginTop: 0 }}>For {project.title}. Booking it moves the project to Onsite Consultation.</p>
          <div className={`field${bad.assignee ? " bad" : ""}`}>
            <label htmlFor="sc-cons-who">Who is going</label>
            <select id="sc-cons-who" aria-invalid={!!bad.assignee} value={assignee} onChange={(e) => { setAssignee(e.target.value); setBad((b) => ({ ...b, assignee: false })); }}>
              <option value="">Choose a person</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="err">Choose who is going.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <div className={`field${bad.date ? " bad" : ""}`}>
              <label htmlFor="sc-cons-date">Date</label>
              <input id="sc-cons-date" type="date" min={today} aria-invalid={!!bad.date} value={date} onChange={(e) => { setDate(e.target.value); setBad((b) => ({ ...b, date: undefined })); }} />
              <span className="err">{bad.date ?? "Choose a date."}</span>
            </div>
            <div className="field">
              <label htmlFor="sc-cons-time">Start time</label>
              <select id="sc-cons-time" value={time} onChange={(e) => { setTime(e.target.value); setBad((b) => ({ ...b, date: undefined })); }}>
                {CONSULT_TIMES.map((t) => <option key={t} value={t}>{clockLabel(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="sc-cons-len">Length</label>
            <select id="sc-cons-len" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {CONSULT_LENGTHS.map((l) => <option key={l.minutes} value={l.minutes}>{l.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="sc-cons-notes">Notes for the visit</label>
            <textarea id="sc-cons-notes" rows={3} maxLength={1000} placeholder="Optional: gate code, parking, who to ask for" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Times are in the business time zone ({BUSINESS_TIME_ZONE}).</p>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Booking…" : "Schedule"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
