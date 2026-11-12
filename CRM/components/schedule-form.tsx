"use client";

/* "Find a Time" and Edit (D-062), in Jobber's layout: search, title, Add Instructions, Add Line Item, Assign, an Unscheduled
   date (its own calendar) beside duration, Show availability, and More Options for the start time, all-day and repeat. Line items are
   kept in the notes. A clash is refused by the server and shown in red; a time outside working hours is a warning. */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ITEM_LABEL, REPEATS, REPEAT_LABEL, addMonths, fromInputs, inWorkingHours, inputParts, monthDays, monthTitle, parseKey, todayKey, BUSINESS_TZ, type ItemType, type Repeat, type ScheduleItem, type WorkingHours } from "@/lib/schedule";
import { clock, failure } from "@/lib/pipeline";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import type { Person } from "./schedule-grid";
import { useUI } from "./ui-provider";

type Kind = ItemType | "task";
type Line = { name: string; qty: string };
const KINDS: Kind[] = ["consultation", "visit", "task", "event", "reminder"];
const TAB_LABEL: Record<Kind, string> = { consultation: "Request", visit: "Visit", task: "Task", event: "Event", reminder: "Reminder" };
const LINE_MARK = "\n\nLine items:\n";

/** Instructions and line items share the notes field. The line-item block is only the trailing section this form writes. */
function splitNotes(notes: string): { text: string; lines: Line[] } {
  const at = notes.startsWith("Line items:\n") ? 0 : notes.indexOf(LINE_MARK);
  if (at < 0) return { text: notes, lines: [] };
  const from = at === 0 ? "Line items:\n".length : at + LINE_MARK.length;
  const lines = notes.slice(from).split("\n").flatMap((row) => {
    const m = /^•\s+(.+?)\s+×\s+(\S+)\s*$/.exec(row);
    return m ? [{ name: m[1], qty: m[2] }] : [];
  });
  return { text: at === 0 ? "" : notes.slice(0, at), lines };
}
function joinNotes(text: string, lines: Line[]): string {
  const kept = lines.filter((l) => l.name.trim());
  const body = text.trim();
  if (kept.length === 0) return body;
  const block = kept.map((l) => `• ${l.name.trim()} × ${l.qty.trim() || "1"}`).join("\n");
  return body ? `${body}${LINE_MARK}${block}` : `Line items:\n${block}`;
}
function dateLabel(key: string): string {
  const { y, m, d } = parseKey(key);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

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
  const { popover, toast } = useUI();
  const book = useMutation(api.crm.schedule.book);
  const update = useMutation(api.crm.schedule.update);
  const addTask = useMutation(api.crm.opportunityTasks.addTask);
  const createTask = useMutation(api.crm.opportunityTasks.createTask);
  const setTime = useMutation(api.crm.opportunityTasks.setTime);

  const [kind, setKind] = useState<Kind>(editing?.kind ?? initial.kind ?? "consultation");
  const seeded = editing?.start ?? initial.start;
  const startParts = seeded !== undefined ? inputParts(seeded) : { date: "", time: inputParts(defaultStart()).time };
  const [date, setDate] = useState(startParts.date);
  const [time, setTime2] = useState(startParts.time);
  const [duration, setDuration] = useState(editing ? String(Math.round(((editing.end - editing.start) / 3_600_000) * 100) / 100) : "1");
  const [anytime, setAnytime] = useState(editing?.anytime ?? false);
  const [title, setTitle] = useState(editing?.title ?? initial.title ?? "");
  const parsedNotes = splitNotes(editing?.notes ?? "");
  const [notes, setNotes] = useState(parsedNotes.text);
  const [lines, setLines] = useState<Line[]>(parsedNotes.lines);
  const [showNotes, setShowNotes] = useState(parsedNotes.text.trim().length > 0);
  const [more, setMore] = useState(!!editing);
  const [repeat, setRepeat] = useState<Repeat>(editing?.repeat ?? "none");
  const [assignees, setAssignees] = useState<string[]>(editing ? editing.assigneeIds : initial.personId ? [initial.personId] : []);
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
    if (next.time) setMore(true);
    if (Object.keys(next).length) {
      document.getElementById(next.title ? "sc-title" : next.project ? "sc-project" : "sc-date")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (kind === "task") {
        const assigneeId = assignees[0] ? (assignees[0] as Id<"users">) : null;
        if (editing) {
          await setTime({ taskId: editing.id as Id<"opportunityTasks">, startAt: start, endAt: end, assigneeId });
        } else {
          const extra = { ...(assigneeId ? { assigneeId } : {}) };
          const id = projectId ? await addTask({ id: projectId, title, ...extra }) : await createTask({ businessId, title, ...extra });
          if (!anytime) await setTime({ taskId: id, startAt: start, endAt: end });
        }
      } else if (editing) {
        await update({ id: editing.id as Id<"calendarEvents">, title, start, end, anytime, assigneeIds: assignees as Id<"users">[], notes: joinNotes(notes, lines), repeat, now: clock() });
      } else {
        await book({
          businessId, type: kind, title, start, end, anytime, assigneeIds: assignees as Id<"users">[], notes: joinNotes(notes, lines), repeat, now: clock(),
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
      {(_close) => (
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
              {projectId ? (
                <div className="sc-picked">
                  <span>{project ? `${project.title} · ${project.code} · ${project.clientName}` : "Selected"}</span>
                  <button type="button" className="icon-btn" aria-label="Choose a different project" onClick={() => setProjectId(undefined)}><Icon name="x" size={18} /></button>
                </div>
              ) : (
                <>
                  <input id="sc-project" aria-label={kind === "consultation" ? "Search client or address" : "Search client or address (optional)"} aria-invalid={!!bad.project} placeholder="Search client or address" value={search} onChange={(e) => { setSearch(e.target.value); setBad((b) => ({ ...b, project: false })); }} autoComplete="off" />
                  {search.trim() && options && options.length > 0 && (
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
              <input id="sc-title" aria-label="Title" aria-invalid={!!bad.title} maxLength={200} placeholder="Title" value={title} onChange={(e) => { setTitle(e.target.value); setBad((b) => ({ ...b, title: false })); }} />
              <span className="err">Give it a title.</span>
            </div>
          )}

          {kind !== "task" && (showNotes ? (
            <div className="field">
              <textarea id="sc-notes" aria-label="Instructions" placeholder="Instructions" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          ) : (
            <button type="button" className="sc-addlink" onClick={() => setShowNotes(true)}><Icon name="plus" size={16} /> Add Instructions</button>
          ))}

          {kind !== "task" && (
            <>
              {lines.map((line, i) => (
                <div className="sc-line" key={i}>
                  <input aria-label="Line item" placeholder="Name" maxLength={120} value={line.name} onChange={(e) => setLines((ls) => ls.map((l, n) => n === i ? { ...l, name: e.target.value } : l))} />
                  <input aria-label="Quantity" inputMode="decimal" value={line.qty} onChange={(e) => setLines((ls) => ls.map((l, n) => n === i ? { ...l, qty: e.target.value } : l))} />
                  <button type="button" className="icon-btn" aria-label="Remove line item" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}><Icon name="x" size={16} /></button>
                </div>
              ))}
              <button type="button" className="sc-addlink" onClick={() => setLines((ls) => [...ls, { name: "", qty: "1" }])}><Icon name="plus" size={16} /> Add Line Item</button>
            </>
          )}

          <div className="sc-assign">
            {assignees.length > 0 && (
              <div className="sc-chips">
                {assignees.map((id) => (
                  <span key={id} className="sc-teamchip">{nameOf(id)}<button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => setAssignees((a) => a.filter((x) => x !== id))}><Icon name="x" size={14} /></button></span>
                ))}
              </div>
            )}
            {(kind === "task" ? people.length > 0 : mine.length > 0) && (
              <button
                type="button"
                className="btn sc-assignbtn"
                onClick={(e) => {
                  const pool = kind === "task" ? people : mine;
                  popover(e.currentTarget, (closeMenu) => (
                    <FilterMenu placeholder="Search people" options={pool.map((m) => ({ label: m.name }))} selected="" onSelect={(l) => {
                      const p = pool.find((m) => m.name === l);
                      if (!p) return;
                      setAssignees((a) => kind === "task" ? [p.id] : [...a, p.id]);
                    }} close={closeMenu} />
                  ), { className: "filter" });
                }}
              >
                <Icon name="plus" size={16} /> Assign
              </button>
            )}
          </div>

          <div className="sc-when">
            <div className={`field${bad.date ? " bad" : ""}`}>
              <button
                type="button"
                id="sc-date"
                className={`sc-date${date ? "" : " blank"}`}
                aria-invalid={!!bad.date}
                aria-haspopup="dialog"
                onClick={(e) => popover(e.currentTarget, (closeMenu) => (
                  <DayPicker selected={date} onPick={(d) => { setDate(d); setBad((b) => ({ ...b, date: false })); closeMenu(); }} />
                ), { className: "sc-cal" })}
              >
                {date ? dateLabel(date) : "Unscheduled"}
              </button>
              <span className="err">Pick a date.</span>
            </div>
            {!anytime && (
              <label className={`sc-durbox${bad.time && !(hrs > 0) ? " bad" : ""}`}>
                <span>Duration in hours</span>
                <input id="sc-dur" aria-label="Duration in hours" type="number" min="0.25" step="0.25" value={duration} onChange={(e) => { setDuration(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
              </label>
            )}
          </div>
          {bad.time && !(hrs > 0) && <span className="sc-inline-err">Enter how long it takes.</span>}

          {more && (
            <div className="sc-moreopts">
              {!anytime && (
                <div className={`field${bad.time ? " bad" : ""}`}>
                  <label htmlFor="sc-time">Start time</label>
                  <input id="sc-time" type="time" aria-invalid={!!bad.time} value={time} onChange={(e) => { setTime2(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
                </div>
              )}
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
            </div>
          )}

          <div className="sc-avail">
            <span id="sc-avail-label">Show availability</span>
            <label className="sc-switch">
              <input type="checkbox" role="switch" aria-labelledby="sc-avail-label" checked={avail} onChange={(e) => setAvail(e.target.checked)} />
              <span className="track" aria-hidden="true" />
            </label>
            <span className="sc-help" tabIndex={0} data-tip="Display your team's combined available time slots. Use the Team filter to narrow who is shown. Drive times are not connected yet, so only bookings made here show. Clearest in the Week and Day views.">?</span>
          </div>

          {outside && <p className="sc-warn" role="status">This is outside working hours. You can still save it.</p>}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn sc-morebtn" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Fewer options" : "More Options"}</button>
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

function DayPicker({ selected, onPick }: { selected: string; onPick: (key: string) => void }) {
  const [today] = useState(() => todayKey(Date.now()));
  const [shown, setShown] = useState(selected || today);
  const days = monthDays(shown);
  const month = parseKey(shown).m;
  return (
    <div className="mini-cal">
      <div className="mini-head">
        <button type="button" aria-label="Previous month" onClick={() => setShown((k) => addMonths(k, -1))}><Icon name="chevleft" size={18} /></button>
        <span>{monthTitle(shown)}</span>
        <button type="button" aria-label="Next month" onClick={() => setShown((k) => addMonths(k, 1))}><Icon name="chevright" size={18} /></button>
      </div>
      <div className="mini-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="mini-dow">{d}</span>)}
        {days.map((d) => (
          <button key={d} type="button" className={`mini-day${parseKey(d).m !== month ? " out" : ""}${d === today ? " today" : ""}${d === selected ? " sel" : ""}`} onClick={() => onPick(d)}>{parseKey(d).d}</button>
        ))}
      </div>
    </div>
  );
}
