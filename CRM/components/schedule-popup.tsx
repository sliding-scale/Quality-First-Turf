"use client";

/* The pop-up that opens when an item on the calendar is clicked (D-062): title and type, a Completed tick (tasks) or a status (the rest),
   the team with chips to add or remove, start and end, and Find a time, Edit, Details and Delete. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failure } from "@/lib/pipeline";
import { ITEM_LABEL, KIND_STYLE, REPEAT_LABEL, dateText, timeText, type ScheduleItem } from "@/lib/schedule";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import type { Person } from "./schedule-grid";
import { useUI } from "./ui-provider";

const EXIT_MS = 140; // keep in step with sc-pop-out in schedule.css
const STATUS_LABEL = { upcoming: "Upcoming", completed: "Completed", confirmed: "Confirmed by client" } as const;

export function SchedulePopup({ item, anchor, people, canEdit, onClose, onFindTime, onEdit }: {
  item: ScheduleItem;
  anchor: DOMRect;
  people: Person[];
  canEdit: boolean;
  onClose: () => void;
  onFindTime: () => void;
  onEdit: () => void;
}) {
  const { popover, toast } = useUI();
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const setStatus = useMutation(api.crm.schedule.setStatus);
  const assign = useMutation(api.crm.schedule.assign);
  const remove = useMutation(api.crm.schedule.remove);
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const isTask = item.kind === "task";
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const wanted = anchor.right + 8 + w > window.innerWidth ? anchor.left - w - 8 : anchor.right + 8;
    el.style.left = `${Math.max(8, Math.min(wanted, window.innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(64, Math.min(anchor.top, window.innerHeight - h - 12))}px`;
  }, [anchor, item.key]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setLeaving(true); };
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current && !box.current.contains(t) && !t.closest(".menu, .modal")) setLeaving(true);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", down); };
  }, []);

  const run = (p: Promise<unknown>, fallback: string) => p.catch((e) => toast(failure(e, fallback)));
  const style = KIND_STYLE[item.kind];

  return (
    <div ref={box} className={`sc-popup${leaving ? " leaving" : ""}`} role="dialog" aria-label={item.title} style={{ borderTopColor: style.edge }}>
      <div className="sc-pophead">
        <div>
          <h3>{item.title}</h3>
          <div className="sc-poptype">{ITEM_LABEL[item.kind]}{item.repeat !== "none" ? ` · ${REPEAT_LABEL[item.repeat]}` : ""}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setLeaving(true)}><Icon name="x" size={20} /></button>
      </div>

      {isTask ? (
        <label className="sc-check">
          <input type="checkbox" checked={item.status === "completed"} disabled={!canEdit} onChange={(e) => void run(setDone({ taskId: item.id as Id<"opportunityTasks">, done: e.target.checked }), "The task could not be updated.")} />
          Completed
        </label>
      ) : (
        <div className="sc-statusrow">
          <span className="sc-label">Status</span>
          <select aria-label="Status" value={item.status} disabled={!canEdit} onChange={(e) => void run(setStatus({ id: item.id as Id<"calendarEvents">, status: e.target.value as ScheduleItem["status"] }), "The status could not be changed.")}>
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {item.overdue && <span className="sc-overduetag">Overdue</span>}
        </div>
      )}

      {item.clientName && <div className="sc-popclient"><Icon name="contact" size={16} /> {item.clientName}</div>}

      <div className="sc-label">Team</div>
      <div className="sc-chips">
        {item.assigneeIds.length === 0 && <span className="sc-muted">Unassigned</span>}
        {item.assigneeIds.map((id) => (
          <span key={id} className="sc-teamchip">
            {nameOf(id)}
            {canEdit && !isTask && (
              <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => void run(assign({ id: item.id as Id<"calendarEvents">, assigneeIds: item.assigneeIds.filter((x) => x !== id), now: Date.now() }), "That person could not be removed.")}><Icon name="x" size={14} /></button>
            )}
          </span>
        ))}
        {canEdit && !isTask && (
          <button
            type="button"
            className="sc-addperson"
            aria-label="Add a person"
            data-tip="Add a person"
            onClick={(e) =>
              popover(e.currentTarget, (close) => (
                <FilterMenu
                  placeholder="Search people"
                  options={people.filter((p) => !item.assigneeIds.includes(p.id as never)).map((p) => ({ label: p.name }))}
                  selected=""
                  onSelect={(l) => { const p = people.find((x) => x.name === l); if (p) void run(assign({ id: item.id as Id<"calendarEvents">, assigneeIds: [...item.assigneeIds, p.id as Id<"users">], now: Date.now() }), "That person could not be added."); }}
                  close={close}
                />
              ), { className: "filter" })
            }
          ><Icon name="plus" size={16} /></button>
        )}
      </div>

      <div className="sc-times">
        <div><span className="sc-label">Start</span><div>{dateText(item.start)}</div><div>{item.anytime ? "Anytime" : timeText(item.start)}</div></div>
        <div><span className="sc-label">End</span><div>{dateText(item.end)}</div><div>{item.anytime ? "Anytime" : timeText(item.end)}</div></div>
      </div>
      {item.notes && <p className="sc-notes">{item.notes}</p>}

      <div className="sc-popfoot">
        {canEdit && <button type="button" className="btn" onClick={onFindTime}><Icon name="calendar" size={16} /> Find a time</button>}
        {canEdit && <button type="button" className="btn" onClick={onEdit}>Edit</button>}
        {item.clientId ? <Link className="btn primary" href={`/clients/${item.clientId}`}>Details</Link> : <button type="button" className="btn primary" disabled>Details</button>}
      </div>
      {canEdit && !isTask && (
        <button type="button" className="sc-delete" onClick={() => void run(remove({ id: item.id as Id<"calendarEvents"> }).then(() => setLeaving(true)), "The item could not be deleted.")}>
          <Icon name="trash" size={16} /> Delete{item.repeat !== "none" ? " (all repeats)" : ""}
        </button>
      )}
    </div>
  );
}
