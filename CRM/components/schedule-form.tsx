"use client";

/* "Find a Time" and Edit (D-062): one pop-up to book a consultation, a follow-up visit, a task, an event or a reminder, with Jobber's
   fields (project, title, instructions, who, when, how long, repeat) and the "Show availability" switch, which greys the times the chosen
   people are busy on the calendar behind it. A clash is refused by the server and shown in red; a time outside working hours is a warning. */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ITEM_LABEL, REPEATS, REPEAT_LABEL, fromInputs, inWorkingHours, inputParts, BUSINESS_TZ, type ItemType, type Repeat, type ScheduleItem, type WorkingHours } from "@/lib/schedule";
import { clock, failure } from "@/lib/pipeline";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import type { Person } from "./schedule-grid";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Kind = ItemType | "task";
const KINDS: Kind[] = ["consultation", "visit", "task", "event", "reminder"];
const TAB_LABEL: Record<Kind, string> = { consultation: "Request", visit: "Visit", task: "Task", event: "Event", reminder: "Reminder" };

export type FormStart = { start?: number; personId?: string; kind?: Kind; projectId?: Id<"opportunities">; title?: string };

export function ScheduleForm({ businessId, people, hours, initial, editing, showAvailability, picked, onClose, onAvailability }: {
  businessId: Id<"businesses">;
  people: Person[];
  hours: WorkingHours;
  initial: FormStart;
  editing?: ScheduleItem;
  showAvailability?: boolean;
  /** A slot clicked on the calendar while this is open: it becomes the start (and the person, in Day view). `n` changes on every click. */
  picked?: { start: number; personId?: string; n: number };
  onClose: () => void;
  /** Tells the calendar behind which people to show busy times for (null: none). */
  onAvailability: (userIds: Id<"users">[] | null) => void;
}) {
  const staff = useStaff();
  const { popover, toast } = useUI();
  const book = useMutation(api.crm.schedule.book);
  const update = useMutation(api.crm.schedule.update);
  const addTask = useMutation(api.crm.opportunityTasks.addTask);
  const createTask = useMutation(api.crm.opportunityTasks.createTask);
  const setTime = useMutation(api.crm.opportunityTasks.setTime);

  const [kind, setKind] = useState<Kind>(editing?.kind ?? initial.kind ?? "consultation");
  const startParts = inputParts(editing?.start ?? initial.start ?? defaultStart());
  const [date, setDate] = useState(startParts.date);
  const [time, setTime2] = useState(startParts.time);
  const [duration, setDuration] = useState(editing ? String(Math.round(((editing.end - editing.start) / 3_600_000) * 100) / 100) : "1");
  const [anytime, setAnytime] = useState(editing?.anytime ?? false);
  const [title, setTitle] = useState(editing?.title ?? initial.title ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [repeat, setRepeat] = useState<Repeat>(editing?.repeat ?? "none");
  const [assignees, setAssignees] = useState<string[]>(editing ? editing.assigneeIds : initial.personId ? [initial.personId] : staff._id ? [staff._id] : []);
  const [projectId, setProjectId] = useState<Id<"opportunities"> | undefined>(editing?.opportunityId ?? initial.projectId);
  const [search, setSearch] = useState("");
  const [avail, setAvail] = useState(showAvailability ?? true);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useQuery(api.crm.schedule.projectOptions, kind === "event" || kind === "reminder" ? "skip" : { businessId, search });
  const chosen = useQuery(api.crm.schedule.projectOptions, projectId ? { businessId, search: "" } : "skip");
  const project = projectId ? (options ?? chosen)?.find((o) => o.id === projectId) : undefined;

  // A slot clicked on the calendar while this is open becomes the start (adjusting state while rendering, as React advises).
  const [seen, setSeen] = useState(picked?.n ?? 0);
  if (picked && picked.n !== seen) {
    const parts = inputParts(picked.start);
    setSeen(picked.n);
    setDate(parts.date);
    setTime2(parts.time);
    setAnytime(false);
    if (picked.personId) setAssignees([picked.personId]);
  }

  // Show the chosen people's busy times behind the form while the switch is on.
  useEffect(() => {
    onAvailability(avail && assignees.length > 0 ? (assignees as Id<"users">[]) : null);
    return () => onAvailability(null);
  }, [avail, assignees, onAvailability]);

  const start = date && time && !anytime ? fromInputs(date, time) : date ? fromInputs(date, "00:00") : NaN;
  const hrs = Number(duration);
  const end = anytime ? start + 86_400_000 : start + hrs * 3_600_000;
  const outside = kind !== "reminder" && !anytime && Number.isFinite(start) && Number.isFinite(end) && end > start && !inWorkingHours({ start, end }, hours, BUSINESS_TZ);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const mine = useMemo(() => people.filter((p) => !assignees.includes(p.id)), [people, assignees]);

  async function save() {
    const next: Record<string, boolean> = {};
    if (kind !== "task" || !editing) if (!title.trim()) next.title = true;
    if (!date) next.date = true;
    if (!anytime && (!time || !(hrs > 0))) next.time = true;
    if (kind === "consultation" && !projectId && !editing) next.project = true;
    setBad(next);
    if (Object.keys(next).length) {
      document.getElementById(next.title ? "sc-title" : next.project ? "sc-project" : "sc-date")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (kind === "task") {
        if (editing) {
          await setTime({ taskId: editing.id as Id<"opportunityTasks">, startAt: start, endAt: end });
        } else {
          const extra = { ...(assignees[0] ? { assigneeId: assignees[0] as Id<"users"> } : {}) };
          const id = projectId ? await addTask({ id: projectId, title, ...extra }) : await createTask({ businessId, title, ...extra });
          if (!anytime) await setTime({ taskId: id, startAt: start, endAt: end });
        }
      } else if (editing) {
        await update({ id: editing.id as Id<"calendarEvents">, title, start, end, anytime, assigneeIds: assignees as Id<"users">[], notes, repeat, now: clock() });
      } else {
        await book({
          businessId, type: kind, title, start, end, anytime, assigneeIds: assignees as Id<"users">[], notes, repeat, now: clock(),
          ...(projectId ? { opportunityId: projectId } : {}), ...(project ? { clientId: project.clientId } : {}),
        });
        if (kind === "consultation") toast("The consultation is booked.");
      }
      onClose();
    } catch (e) {
      setError(failure(e, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={editing ? `Edit ${ITEM_LABEL[kind].toLowerCase()}` : "Find a Time"} onClose={onClose} busy={busy} className="sc-pop">
      {(close) => (
        <form className="sc-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {!editing && (
            <div className="sc-tabs" role="tablist" aria-label="What to book">
              <button type="button" className="sc-tab" disabled data-tip="Jobs are not built yet">Job</button>
              {KINDS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} className={`sc-tab${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>{TAB_LABEL[k]}</button>
              ))}
            </div>
          )}

          {kind !== "event" && kind !== "reminder" && !editing && (
            <div className={`field${bad.project ? " bad" : ""}`}>
              <label htmlFor="sc-project">{kind === "consultation" ? "Project" : "Project (optional)"}</label>
              {projectId ? (
                <div className="sc-picked">
                  <span>{project ? `${project.title} · ${project.code} · ${project.clientName}` : "Selected"}</span>
                  <button type="button" className="icon-btn" aria-label="Choose a different project" onClick={() => setProjectId(undefined)}><Icon name="x" size={18} /></button>
                </div>
              ) : (
                <>
                  <input id="sc-project" aria-invalid={!!bad.project} placeholder="Search client, address or code" value={search} onChange={(e) => { setSearch(e.target.value); setBad((b) => ({ ...b, project: false })); }} autoComplete="off" />
                  {options && options.length > 0 && (
                    <div className="sc-results" role="listbox">
                      {options.slice(0, 6).map((o) => (
                        <button key={o.id} type="button" role="option" aria-selected={false} onClick={() => { setProjectId(o.id); if (!title.trim()) setTitle(kind === "consultation" ? `Consultation: ${o.title}` : o.title); }}>
                          <b>{o.title}</b> <span>{o.code} · {o.clientName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <span className="err">Pick the project this is for.</span>
            </div>
          )}

          {(!editing || kind !== "task") && (
            <div className={`field${bad.title ? " bad" : ""}`}>
              <label htmlFor="sc-title">Title</label>
              <input id="sc-title" aria-invalid={!!bad.title} maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); setBad((b) => ({ ...b, title: false })); }} />
              <span className="err">Give it a title.</span>
            </div>
          )}

          {kind !== "task" && (
            <div className="field">
              <label htmlFor="sc-notes">Instructions</label>
              <textarea id="sc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}

          <div className="sc-assign">
            <span className="sc-label">Assign</span>
            <div className="sc-chips">
              {assignees.map((id) => (
                <span key={id} className="sc-teamchip">{nameOf(id)}<button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => setAssignees((a) => a.filter((x) => x !== id))}><Icon name="x" size={14} /></button></span>
              ))}
              {(kind !== "task" || assignees.length === 0) && mine.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={(e) =>
                    popover(e.currentTarget, (closeMenu) => (
                      <FilterMenu placeholder="Search people" options={mine.map((m) => ({ label: m.name }))} selected="" onSelect={(l) => { const p = mine.find((m) => m.name === l); if (p) setAssignees((a) => [...a, p.id]); }} close={closeMenu} />
                    ), { className: "filter" })
                  }
                >
                  <Icon name="plus" size={16} /> Assign
                </button>
              )}
            </div>
          </div>

          <div className="sc-when">
            <div className={`field${bad.date ? " bad" : ""}`}>
              <label htmlFor="sc-date">Start date</label>
              <input id="sc-date" type="date" aria-invalid={!!bad.date} value={date} onChange={(e) => { setDate(e.target.value); setBad((b) => ({ ...b, date: false })); }} />
              <span className="err">Pick a date.</span>
            </div>
            {!anytime && (
              <div className={`field${bad.time ? " bad" : ""}`}>
                <label htmlFor="sc-time">Start time</label>
                <input id="sc-time" type="time" aria-invalid={!!bad.time} value={time} onChange={(e) => { setTime2(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
              </div>
            )}
            {!anytime && (
              <div className={`field${bad.time ? " bad" : ""}`}>
                <label htmlFor="sc-dur">Duration in hours</label>
                <input id="sc-dur" type="number" min="0.25" step="0.25" value={duration} onChange={(e) => { setDuration(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
                <span className="err">Enter how long it takes.</span>
              </div>
            )}
          </div>
          {kind !== "task" && (
            <label className="sc-check"><input type="checkbox" checked={anytime} onChange={(e) => setAnytime(e.target.checked)} /> Anytime that day</label>
          )}
          {kind === "task" && !editing && (
            <label className="sc-check"><input type="checkbox" checked={anytime} onChange={(e) => setAnytime(e.target.checked)} /> No time yet (leave it unscheduled)</label>
          )}

          {kind !== "task" && (
            <div className="field">
              <label htmlFor="sc-repeat">Repeat</label>
              <select id="sc-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                {REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
              </select>
            </div>
          )}

          <label className="sc-switch">
            <input type="checkbox" role="switch" checked={avail} onChange={(e) => setAvail(e.target.checked)} />
            <span className="track" aria-hidden="true" />
            Show availability
            <span className="sc-help" data-tip="Greys the times the chosen people are busy on the calendar behind this pop-up. Zoho Calendar is not connected yet, so only bookings made here show.">?</span>
          </label>

          {outside && <p className="sc-warn" role="status">This is outside working hours. You can still save it.</p>}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

function defaultStart(): number {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime() + 3_600_000;
}
