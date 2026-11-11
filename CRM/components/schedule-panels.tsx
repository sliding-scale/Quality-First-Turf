"use client";

/* The side panel and the dialogs of the Schedule (D-062): the Unscheduled panel (projects waiting for a consultation and tasks with no
   time, draggable onto the calendar), Schedule Settings (working days and hours) and Reschedule and reassign. */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failure, clock } from "@/lib/pipeline";
import { ITEM_LABEL, KIND_STYLE, addDays, dayStartMs, timeText, useUnscheduled, BUSINESS_TZ, type WorkingHours } from "@/lib/schedule";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { DRAG_TYPE, type DropPayload, type Person } from "./schedule-grid";
import { useUI } from "./ui-provider";

export function UnscheduledPanel({ businessId, canEdit, onClose, onPick }: {
  businessId: Id<"businesses">;
  canEdit: boolean;
  onClose: () => void;
  /** A tap on a card (the way to schedule it on a touch screen, where it cannot be dragged). */
  onPick: (row: { kind: "request" | "task"; id: string; title: string; opportunityId?: string }) => void;
}) {
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const rows = useUnscheduled(businessId, sort, true);
  return (
    <aside className="sc-side" aria-label="Unscheduled">
      <div className="sc-sidehead">
        <h2>Unscheduled <span className="pl-badge small">{rows?.length ?? 0}</span></h2>
        <button type="button" className="icon-btn" aria-label="Close the unscheduled list" onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
      <select className="sc-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "oldest" | "newest")}>
        <option value="oldest">Oldest first</option>
        <option value="newest">Newest first</option>
      </select>
      <div className="sc-sidelist">
        {rows === undefined ? (
          <div className="sk" style={{ height: 70 }} />
        ) : rows.length === 0 ? (
          <p className="pl-none">Nothing is waiting to be scheduled.</p>
        ) : (
          rows.map((r) => (
            <article
              key={`${r.kind}:${r.id}`}
              className="sc-ucard"
              style={{ borderLeftColor: KIND_STYLE[r.kind === "request" ? "consultation" : "task"].edge, background: KIND_STYLE[r.kind === "request" ? "consultation" : "task"].bg }}
              draggable={canEdit}
              role="button"
              tabIndex={0}
              onClick={() => canEdit && onPick(r)}
              onKeyDown={(e) => { if (e.key === "Enter" && canEdit) onPick(r); }}
              onDragStart={(e) => {
                const payload: DropPayload = { type: "unscheduled", kind: r.kind, id: r.id, ...(r.opportunityId ? { opportunityId: r.opportunityId } : {}) };
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <b>{r.kind === "request" ? `Consultation: ${r.title}` : r.title}</b>
              <span>{r.clientName || (r.kind === "task" ? "Task" : "")}</span>
            </article>
          ))
        )}
      </div>
      {canEdit && <p className="sc-hint">Drag a card onto the calendar, or tap it, to book it.</p>}
    </aside>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromTime = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export function ScheduleSettings({ businessId, hours, onClose }: { businessId: Id<"businesses">; hours: WorkingHours; onClose: () => void }) {
  const save = useMutation(api.crm.schedule.saveSettings);
  const { toast } = useUI();
  const [days, setDays] = useState<number[]>(hours.days);
  const [start, setStart] = useState(toTime(hours.startMin));
  const [end, setEnd] = useState(toTime(hours.endMin));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <PipelineModal title="Schedule Settings" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await save({ businessId, days, startMin: fromTime(start), endMin: fromTime(end) });
              toast("Working hours saved.");
              close();
            } catch (err) {
              setError(failure(err, "The settings could not be saved."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">Working days and hours are shown white on the calendar. Bookings outside them show a warning.</p>
          <div className="sc-days" role="group" aria-label="Working days">
            {DOW.map((d, i) => (
              <button key={d} type="button" className={`chip outline${days.includes(i) ? " on" : ""}`} aria-pressed={days.includes(i)} onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}>{d}</button>
            ))}
          </div>
          <div className="sc-when" style={{ marginTop: 16 }}>
            <div className="field"><label htmlFor="sc-ws">Start of the working day</label><input id="sc-ws" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="field"><label htmlFor="sc-we">End of the working day</label><input id="sc-we" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <p className="sc-muted" style={{ marginTop: 12 }}>Times are shown in the business time zone ({BUSINESS_TZ}).</p>
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

/** More > Reschedule and reassign: pick a day, tick the items, move them by some days and/or give them to someone else. All or nothing. */
export function RescheduleDialog({ businessId, people, todayKey, onClose }: { businessId: Id<"businesses">; people: Person[]; todayKey: string; onClose: () => void }) {
  const bulk = useMutation(api.crm.schedule.bulkReschedule);
  const { toast } = useUI();
  const [day, setDay] = useState(todayKey);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [shift, setShift] = useState("0");
  const [who, setWho] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const items = useQuery(api.crm.schedule.range, { businessId, from: dayStartMs(day), to: dayStartMs(addDays(day, 1)), types: [], assigneeIds: [], statuses: [], now: clock() });
  const movable = (items?.items ?? []).filter((i) => i.kind !== "task");
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  return (
    <PipelineModal title="Reschedule and reassign" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const days = Number(shift) || 0;
            if (ticked.size === 0) return setError("Tick at least one item.");
            if (days === 0 && !who) return setError("Choose a number of days to move them, or someone to give them to.");
            setBusy(true);
            setError("");
            try {
              const n = await bulk({ businessId, ids: [...ticked] as Id<"calendarEvents">[], ...(days ? { shiftMs: days * 86_400_000 } : {}), ...(who ? { assigneeIds: who === "none" ? [] : [who as Id<"users">] } : {}), now: clock() });
              toast(`${n} item${n === 1 ? "" : "s"} updated.`);
              close();
            } catch (err) {
              setError(failure(err, "Nothing was changed. Try again."));
              setBusy(false);
            }
          }}
        >
          <div className="field"><label htmlFor="rs-day">Items on</label><input id="rs-day" type="date" value={day} onChange={(e) => { setDay(e.target.value || todayKey); setTicked(new Set()); }} /></div>
          <div className="sc-reslist">
            {items === undefined ? <div className="sk" style={{ height: 50 }} /> : movable.length === 0 ? <p className="pl-none">Nothing to move on this day.</p> : movable.map((i) => (
              <label key={i.key} className="sc-resrow">
                <input type="checkbox" checked={ticked.has(i.id)} onChange={() => setTicked((t) => { const n = new Set(t); if (!n.delete(i.id)) n.add(i.id); return n; })} />
                <span className="sc-dot" style={{ background: KIND_STYLE[i.kind].edge }} />
                <span><b>{i.title}</b> <small>{ITEM_LABEL[i.kind]} · {i.anytime ? "Anytime" : timeText(i.start)} · {i.assigneeIds.map(nameOf).join(", ") || "Unassigned"}</small></span>
              </label>
            ))}
          </div>
          <div className="sc-when" style={{ marginTop: 14 }}>
            <div className="field"><label htmlFor="rs-shift">Move by (days)</label><input id="rs-shift" type="number" step="1" value={shift} onChange={(e) => setShift(e.target.value)} /></div>
            <div className="field"><label htmlFor="rs-who">Give to</label>
              <select id="rs-who" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Keep as they are</option>
                <option value="none">Unassigned</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <p className="sc-muted" style={{ marginTop: 10 }}>If any item would double-book someone, none of them is changed.</p>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Apply"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
