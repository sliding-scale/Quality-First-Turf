"use client";

/* The Schedule's calendars (D-062): the time grid for Week and Day (hour rows, an Anytime row, working hours white and the rest grey,
   items side by side when they overlap, a line for the current time) and the Month grid. Items can be dragged to a new time (or, in Day,
   to another person), stretched by their bottom edge, and the unscheduled cards can be dropped on a column. */

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  BUSINESS_TZ, DAY_PX, HOUR_PX, KIND_STYLE, addDays, dayLabel, dayStartMs, hourLabel, initials, localClock, minutesIn, monthDays, parseKey, timeText, todayKey, weekDays, weekday,
  type ScheduleItem, type View, type WorkingHours, useNarrow,
} from "@/lib/schedule";
import { Icon } from "./icon";

export type Person = { id: string; name: string };
export type Busy = { userId: string; start: number; end: number; title: string };
/** What an unscheduled card carries when it is dragged onto the grid. */
export type DropPayload = { type: "unscheduled"; kind: "request" | "task"; id: string; opportunityId?: string };
export type ItemDrag = { type: "item"; key: string; id: string; kind: ScheduleItem["kind"]; start: number; end: number; grabMin: number; occurrenceStart: number };

export type GridProps = {
  view: View;
  dateKey: string;
  items: ScheduleItem[];
  people: Person[];
  hours: WorkingHours;
  now: number;
  busy: Busy[];
  canEdit: boolean;
  onOpenItem: (item: ScheduleItem, anchor: DOMRect) => void;
  /** An empty slot was clicked: a start time (ms), and in Day view the person whose column it is ("" for Unassigned). */
  onEmptySlot: (start: number, personId?: string) => void;
  onMoveItem: (item: ScheduleItem, start: number, personId?: string) => void;
  onResizeItem: (item: ScheduleItem, end: number) => void;
  onDropUnscheduled: (payload: DropPayload, start: number, personId?: string) => void;
  onOpenDay: (key: string) => void;
};

const SNAP = 15;
const snap = (min: number) => Math.round(min / SNAP) * SNAP;
const DRAG_TYPE = "application/x-qft-schedule";

type Seg = { item: ScheduleItem; startMin: number; endMin: number; lane: number; lanes: number };

/** The parts of items that fall on one day, laid out in side by side lanes where they overlap. */
function layout(items: ScheduleItem[], key: string): Seg[] {
  const segs = items
    .filter((i) => !i.anytime)
    .map((item) => ({ item, startMin: minutesIn(item.start, key), endMin: Math.max(minutesIn(item.end, key), minutesIn(item.start, key) + 20) }))
    .filter((s) => s.endMin > 0 && s.startMin < 1440)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Seg[] = [];
  let cluster: Seg[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((s) => s.lane + 1));
    for (const s of cluster) out.push({ ...s, lanes });
    cluster = [];
  };
  for (const s of segs) {
    if (cluster.length && s.startMin >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.endMin > s.startMin).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  flush();
  return out;
}

const onDay = (i: ScheduleItem, key: string) => i.start < dayStartMs(addDays(key, 1)) && i.end > dayStartMs(key) && !(i.anytime && i.start >= dayStartMs(addDays(key, 1)));

export function ScheduleGrid(p: GridProps) {
  return p.view === "month" ? <MonthGrid {...p} /> : <TimeGrid {...p} />;
}

/* ------------------------------------------------------------------ Week and Day */

type Column = { key: string; day: string; person?: Person | "unassigned" };

function TimeGrid(p: GridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayKey(p.now);
  const columns: Column[] = useMemo(() => {
    if (p.view === "week") return weekDays(p.dateKey).map((d) => ({ key: d, day: d }));
    return [{ key: "unassigned", day: p.dateKey, person: "unassigned" as const }, ...p.people.map((pe) => ({ key: pe.id, day: p.dateKey, person: pe }))];
  }, [p.view, p.dateKey, p.people]);
  const [resizing, setResizing] = useState<{ key: string; end: number } | null>(null);

  useLayoutEffect(() => {
    const s = scroller.current;
    // On a narrow screen the whole grid scrolls (sideways too); otherwise the hours do.
    const el = s && getComputedStyle(s).overflowY === "visible" ? s.parentElement : s;
    if (el) el.scrollTop = Math.max(0, (p.hours.startMin / 60) * HOUR_PX - 16);
    // Only when the view or the day changes, not on every refresh of the items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.view, p.dateKey]);

  const itemsFor = (c: Column) =>
    p.items.filter((i) => {
      if (!onDay(i, c.day)) return false;
      if (c.person === undefined) return true;
      return c.person === "unassigned" ? i.assigneeIds.length === 0 : i.assigneeIds.includes(c.person.id as never);
    });

  const anytimeOf = (c: Column) => itemsFor(c).filter((i) => i.anytime);
  const nowMin = today === p.dateKey || p.view === "week" ? minutesIn(p.now, today) : -1;

  function minutesAt(e: { clientY: number }, body: HTMLElement) {
    const r = body.getBoundingClientRect();
    return ((e.clientY - r.top) / HOUR_PX) * 60;
  }

  function dropOn(e: DragEvent<HTMLDivElement>, c: Column) {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw || !p.canEdit) return;
    e.preventDefault();
    const payload = JSON.parse(raw) as DropPayload | ItemDrag;
    const personId = c.person === undefined ? undefined : c.person === "unassigned" ? "" : c.person.id;
    const grab = payload.type === "item" ? payload.grabMin : 0;
    const min = Math.max(0, Math.min(1440 - SNAP, snap(minutesAt(e, e.currentTarget) - grab)));
    const start = dayStartMs(c.day) + min * 60_000;
    if (payload.type === "unscheduled") return p.onDropUnscheduled(payload, start, personId);
    const item = p.items.find((i) => i.key === payload.key);
    if (item) p.onMoveItem(item, start - (payload.start - payload.occurrenceStart), personId);
  }

  function startResize(e: ReactPointerEvent<HTMLElement>, seg: Seg, c: Column) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startEnd = seg.item.end;
    const move = (ev: PointerEvent) => {
      const deltaMin = snap(((ev.clientY - startY) / HOUR_PX) * 60);
      const end = Math.max(seg.item.start + SNAP * 60_000, startEnd + deltaMin * 60_000);
      setResizing({ key: seg.item.key, end });
    };
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.releasePointerCapture(ev.pointerId);
      const deltaMin = snap(((ev.clientY - startY) / HOUR_PX) * 60);
      const end = Math.max(seg.item.start + SNAP * 60_000, startEnd + deltaMin * 60_000);
      setResizing(null);
      if (end !== startEnd) p.onResizeItem(seg.item, end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    void c;
  }

  return (
    <div className={`sc-grid ${p.view}`} style={{ "--cols": columns.length } as CSSProperties}>
      <div className="sc-headrow">
        <div className="sc-gutter" />
        {columns.map((c) => (
          <div key={c.key} className={`sc-colhead${c.day === today && p.view === "week" ? " today" : ""}`}>
            {p.view === "week" ? (
              <button type="button" className="sc-daybtn" onClick={() => p.onOpenDay(c.day)} data-tip="Open this day">
                <span className={`sc-daypill${c.day === today ? " today" : ""}`}>{parseKey(c.day).d} {dayLabel(c.day)}</span>
              </button>
            ) : c.person === "unassigned" ? (
              <span className="sc-person"><span className="sc-avatar none"><Icon name="userx" size={14} /></span>Unassigned</span>
            ) : (
              <span className="sc-person"><span className="sc-avatar">{initials((c.person as Person).name)}</span>{(c.person as Person).name}</span>
            )}
          </div>
        ))}
      </div>
      {p.view === "day" && (
        <div className="sc-dayline"><span className={`sc-daypill${p.dateKey === today ? " today" : ""}`}>{parseKey(p.dateKey).d} {dayLabel(p.dateKey)}</span></div>
      )}
      <div className="sc-anytime">
        <div className="sc-gutter"><span>Anytime</span></div>
        {columns.map((c) => (
          <div key={c.key} className="sc-anycell">
            {anytimeOf(c).map((i) => (
              <button key={i.key} type="button" className="sc-chip" style={{ background: KIND_STYLE[i.kind].bg, borderLeftColor: KIND_STYLE[i.kind].edge }} onClick={(e) => p.onOpenItem(i, e.currentTarget.getBoundingClientRect())}>
                {i.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="sc-scroll" ref={scroller}>
        <div className="sc-body" style={{ height: DAY_PX }}>
          <div className="sc-gutter sc-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="sc-hour" style={{ top: h * HOUR_PX }}>{h === 0 ? "" : hourLabel(h)}</div>
            ))}
          </div>
          {columns.map((c) => {
            const segs = layout(itemsFor(c), c.day);
            const dow = weekday(c.day);
            const working = p.hours.days.includes(dow);
            return (
              <div
                key={c.key}
                className="sc-colbody"
                onClick={(e) => {
                  if (!p.canEdit || e.target !== e.currentTarget) return;
                  const min = Math.max(0, Math.min(1440 - 30, Math.floor(minutesAt(e, e.currentTarget) / 30) * 30));
                  p.onEmptySlot(dayStartMs(c.day) + min * 60_000, c.person === undefined ? undefined : c.person === "unassigned" ? "" : c.person.id);
                }}
                onDragOver={(e) => { if (p.canEdit && e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
                onDrop={(e) => dropOn(e, c)}
              >
                {!working ? (
                  <div className="sc-off" style={{ top: 0, height: DAY_PX }} />
                ) : (
                  <>
                    <div className="sc-off" style={{ top: 0, height: (p.hours.startMin / 60) * HOUR_PX }} />
                    <div className="sc-off" style={{ top: (p.hours.endMin / 60) * HOUR_PX, height: DAY_PX - (p.hours.endMin / 60) * HOUR_PX }} />
                  </>
                )}
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="sc-line" style={{ top: h * HOUR_PX }} />)}
                {p.busy
                  .filter((b) => (c.person === undefined || c.person === "unassigned" ? c.person === undefined : b.userId === c.person.id) && b.end > dayStartMs(c.day) && b.start < dayStartMs(addDays(c.day, 1)))
                  .map((b, i) => {
                    const s = minutesIn(b.start, c.day);
                    const e = minutesIn(b.end, c.day);
                    return <div key={i} className="sc-busy" style={{ top: (s / 60) * HOUR_PX, height: ((e - s) / 60) * HOUR_PX }} data-tip={`Busy: ${b.title}`} />;
                  })}
                {segs.map((s) => {
                  const live = resizing?.key === s.item.key ? resizing.end : s.item.end;
                  const endMin = Math.max(s.startMin + 20, minutesIn(live, c.day));
                  const style = KIND_STYLE[s.item.kind];
                  const names = s.item.assigneeIds;
                  return (
                    <article
                      key={s.item.key}
                      className={`sc-item${s.item.status === "completed" ? " done" : ""}${s.item.overdue ? " overdue" : ""}`}
                      style={{
                        top: (s.startMin / 60) * HOUR_PX, height: Math.max(22, ((endMin - s.startMin) / 60) * HOUR_PX - 2),
                        left: `calc(${(s.lane / s.lanes) * 100}% + 2px)`, width: `calc(${100 / s.lanes}% - 4px)`, background: style.bg, borderLeftColor: style.edge,
                      }}
                      draggable={p.canEdit}
                      tabIndex={0}
                      onDragStart={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const drag: ItemDrag = { type: "item", key: s.item.key, id: s.item.id, kind: s.item.kind, start: s.item.start, end: s.item.end, grabMin: ((e.clientY - r.top) / HOUR_PX) * 60, occurrenceStart: s.item.start };
                        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => { e.stopPropagation(); p.onOpenItem(s.item, e.currentTarget.getBoundingClientRect()); }}
                      onKeyDown={(e) => { if (e.key === "Enter") p.onOpenItem(s.item, e.currentTarget.getBoundingClientRect()); }}
                    >
                      <div className="sc-itemtop">
                        <span className="sc-ini">{names.length ? initials(p.people.find((x) => x.id === names[0])?.name ?? "") : <Icon name="userx" size={11} />}</span>
                        <b>{s.item.title}</b>
                        {s.item.zoho && <span className="sc-zoho" title="From Zoho Calendar">Zoho</span>}
                      </div>
                      <div className="sc-itemtime">{timeText(s.item.start)} – {timeText(live)}</div>
                      {p.canEdit && s.item.kind !== "task" && (
                        <span className="sc-resize" onPointerDown={(e) => startResize(e, s, c)} onClick={(e) => e.stopPropagation()} aria-hidden="true" draggable={false} />
                      )}
                    </article>
                  );
                })}
                {nowMin >= 0 && c.day === today && <div className="sc-now" style={{ top: (nowMin / 60) * HOUR_PX }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Month */

function MonthGrid(p: GridProps) {
  const days = monthDays(p.dateKey);
  const today = todayKey(p.now);
  const month = parseKey(p.dateKey).m;
  const narrow = useNarrow();
  // The day whose "+N more" is open; it closes when the month changes.
  const [more, setOpenMore] = useState<{ month: string; day: string } | null>(null);
  const openMore = more && more.month === p.dateKey.slice(0, 7) ? more.day : null;
  const perDay = (key: string) => p.items.filter((i) => onDay(i, key)).sort((a, b) => Number(b.anytime) - Number(a.anytime) || a.start - b.start);
  const open = (e: React.MouseEvent<HTMLElement>, i: ScheduleItem) => { e.stopPropagation(); p.onOpenItem(i, e.currentTarget.getBoundingClientRect()); };

  return (
    <div className="sc-month">
      <div className="sc-mhead">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="sc-mgrid">
        {days.map((key) => {
          const list = perDay(key);
          const shown = narrow ? [] : openMore === key ? list : list.slice(0, 3);
          const outside = parseKey(key).m !== month;
          const off = !p.hours.days.includes(weekday(key));
          return (
            <div
              key={key}
              className={`sc-mcell${outside ? " outside" : ""}${off ? " off" : ""}${!narrow && openMore === key ? " open" : ""}`}
              onClick={() => (narrow ? p.onOpenDay(key) : p.canEdit && p.onEmptySlot(dayStartMs(key) + 9 * 3_600_000))}
              aria-label={narrow ? `${parseKey(key).d}, ${list.length} item${list.length === 1 ? "" : "s"}` : undefined}
              onDragOver={(e) => { if (p.canEdit && e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData(DRAG_TYPE);
                if (!raw || !p.canEdit) return;
                e.preventDefault();
                const payload = JSON.parse(raw) as DropPayload | ItemDrag;
                const nine = dayStartMs(key) + 9 * 3_600_000;
                if (payload.type === "unscheduled") return p.onDropUnscheduled(payload, nine);
                const item = p.items.find((i) => i.key === payload.key);
                // Keep the time of day; move to this date.
                if (item) {
                  const clock = localClock(payload.start, BUSINESS_TZ).minutes;
                  p.onMoveItem(item, dayStartMs(key) + clock * 60_000 - (payload.start - payload.occurrenceStart));
                }
              }}
            >
              <button type="button" className={`sc-mnum${key === today ? " today" : ""}`} onClick={(e) => { e.stopPropagation(); p.onOpenDay(key); }} data-tip="Open this day">{parseKey(key).d}</button>
              {narrow && list.length > 0 && (
                <div className="sc-mdots" aria-hidden="true">
                  {list.slice(0, 4).map((i) => <span key={i.key} className="sc-mdot" style={{ background: KIND_STYLE[i.kind].edge }} />)}
                  {list.length > 4 && <span className="sc-mcount">+{list.length - 4}</span>}
                </div>
              )}
              {shown.map((i) => (
                <article
                  key={i.key}
                  className={`sc-mchip${i.status === "completed" ? " done" : ""}`}
                  style={{ background: KIND_STYLE[i.kind].bg, borderLeftColor: KIND_STYLE[i.kind].edge }}
                  draggable={p.canEdit}
                  tabIndex={0}
                  onDragStart={(e) => {
                    const drag: ItemDrag = { type: "item", key: i.key, id: i.id, kind: i.kind, start: i.start, end: i.end, grabMin: 0, occurrenceStart: i.start };
                    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => open(e, i)}
                  onKeyDown={(e) => { if (e.key === "Enter") p.onOpenItem(i, e.currentTarget.getBoundingClientRect()); }}
                >
                  {!i.anytime && <span className="sc-mtime">{timeText(i.start)}</span>} <span className="sc-mtitle">{i.title}</span>
                </article>
              ))}
              {!narrow && list.length > 3 && (
                <button
                  type="button"
                  className="sc-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    const monthKey = p.dateKey.slice(0, 7);
                    setOpenMore((m) => (m?.month === monthKey && m.day === key ? null : { month: monthKey, day: key }));
                  }}
                >
                  {openMore === key ? "Show less" : `+${list.length - 3} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DRAG_TYPE };
