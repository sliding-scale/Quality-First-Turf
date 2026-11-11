"use client";

/* The Schedule (D-062): Jobber's calendar with the PRD's rules. Month, Week and Day (kept in the address as ?view= and ?date=), filters by
   type, team and status, Find a Time, the Unscheduled list, working hours, and the pop-ups. The backend does the repeats, the filtering
   and the double-booking checks; this file only asks and shows. */

import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { clock, failure, useMinute, usePeople } from "@/lib/pipeline";
import {
  BUSINESS_TZ, ITEM_TYPES, VIEWS, addDays, addMonths, isKey, monthDays, monthTitle, parseKey, todayKey, useAvailability, useRange, useScheduleSettings, useUnscheduled, windowOf,
  type RangeFilters, type ScheduleItem, type View,
} from "@/lib/schedule";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { FeedbackDialog } from "./pipeline-dialogs";
import { ScheduleForm, type FormStart } from "./schedule-form";
import { ScheduleGrid, type DropPayload } from "./schedule-grid";
import { RescheduleDialog, ScheduleSettings, UnscheduledPanel } from "./schedule-panels";
import { SchedulePopup } from "./schedule-popup";
import { ScheduleSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const TYPE_OPTIONS = [...ITEM_TYPES, "task"] as const;
const TYPE_NAME: Record<string, string> = { consultation: "Requests", visit: "Visits", task: "Tasks", event: "Events", reminder: "Reminders" };
const STATUS_OPTIONS = [["completed", "Completed"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["confirmed", "Confirmed by client"]] as const;

export function SchedulePage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <ScheduleSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Schedule business={workspace.business} />;
}

function Schedule({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { popover, dropdown, toast } = useUI();
  const staff = useStaff();
  const now = useMinute();
  const people = usePeople(business._id);
  const hours = useScheduleSettings(business._id);
  const book = useMutation(api.crm.schedule.book);
  const update = useMutation(api.crm.schedule.update);
  const setTaskTime = useMutation(api.crm.opportunityTasks.setTime);

  const today = todayKey(now);
  const rawView = params.get("view");
  const view: View = (VIEWS as string[]).includes(rawView ?? "") ? (rawView as View) : "week";
  const dateKey = isKey(params.get("date")) ? params.get("date")! : today;
  const go = useCallback((v: View, d: string) => router.replace(`/schedule?view=${v}&date=${d}`, { scroll: false }), [router]);

  const [types, setTypes] = useState<string[]>([]);
  const [team, setTeam] = useState<(Id<"users"> | "unassigned")[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [popup, setPopup] = useState<{ item: ScheduleItem; rect: DOMRect } | null>(null);
  const [form, setForm] = useState<{ n: number; initial: FormStart; editing?: ScheduleItem; availability: boolean } | null>(null);
  const [picked, setPicked] = useState<{ start: number; personId?: string; n: number } | undefined>();
  const [availUsers, setAvailUsers] = useState<Id<"users">[] | null>(null);
  const [dialog, setDialog] = useState<"settings" | "reschedule" | "feedback" | null>(null);

  const filters: RangeFilters = useMemo(() => ({ types, people: team, statuses }), [types, team, statuses]);
  const win = windowOf(view, dateKey);
  const data = useRange(business._id, win.from, win.to, filters, now);
  const unscheduled = useUnscheduled(business._id, "oldest", true);
  const avail = useAvailability(business._id, availUsers ?? [], win.from, win.to, availUsers !== null);

  // An old address without a view: show the week of today.
  useEffect(() => {
    if (!params.get("view") || !isKey(params.get("date"))) go(view, dateKey);
  }, [params, go, view, dateKey]);

  if (people === undefined || hours === undefined || data === undefined) return <ScheduleSkeleton />;

  const roster = people.map((p) => ({ id: p.id as string, name: p.name }));
  const dayPeople = team.length > 0 ? roster.filter((p) => (team as string[]).includes(p.id)) : roster;
  const step = (dir: 1 | -1) => go(view, view === "month" ? addMonths(dateKey, dir) : addDays(dateKey, dir * (view === "week" ? 7 : 1)));
  const teamLabel = team.length === 0 ? "All" : team.length === 1 ? (team[0] === "unassigned" ? "Unassigned" : (roster.find((p) => p.id === team[0])?.name ?? "1 selected")) : `${team.length} selected`;
  const typeLabel = types.length === 0 ? "All" : types.length === 1 ? TYPE_NAME[types[0]] : `${types.length} selected`;
  const statusLabel = statuses.length === 0 ? "All" : statuses.length === 1 ? (STATUS_OPTIONS.find((s) => s[0] === statuses[0])?.[1] ?? "") : `${statuses.length} selected`;

  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));

  function openForm(initial: FormStart, editing?: ScheduleItem, availability = true) {
    setPopup(null);
    setForm((f) => ({ n: (f?.n ?? 0) + 1, initial, editing, availability }));
  }

  function emptySlot(start: number, personId?: string) {
    if (form) return setPicked((p) => ({ start, personId: personId || undefined, n: (p?.n ?? 0) + 1 }));
    openForm({ start, personId: personId || undefined });
  }

  async function moveItem(item: ScheduleItem, start: number, personId?: string) {
    const shiftTo = (s: number) => ({ start: item.seriesStart + (s - item.start), end: item.seriesEnd + (s - item.start) });
    try {
      if (item.kind === "task") {
        await setTaskTime({ taskId: item.id as Id<"opportunityTasks">, startAt: start, endAt: start + (item.end - item.start) });
        return;
      }
      const ids = personId === undefined || item.assigneeIds.includes(personId as never) ? undefined : personId === "" ? [] : [personId as Id<"users">];
      await update({ id: item.id as Id<"calendarEvents">, ...shiftTo(start), ...(ids ? { assigneeIds: ids } : {}), now: clock() });
    } catch (e) {
      fail(e, "That could not be moved.");
    }
  }

  async function resizeItem(item: ScheduleItem, end: number) {
    try {
      await update({ id: item.id as Id<"calendarEvents">, end: item.seriesEnd + (end - item.end), now: clock() });
    } catch (e) {
      fail(e, "That could not be resized.");
    }
  }

  async function dropUnscheduled(payload: DropPayload, start: number, personId?: string) {
    const row = unscheduled?.find((r) => r.id === payload.id);
    try {
      if (payload.kind === "task") {
        await setTaskTime({ taskId: payload.id as Id<"opportunityTasks">, startAt: start, endAt: start + 3_600_000 });
        return;
      }
      await book({
        businessId: business._id, type: "consultation", title: `Consultation: ${row?.title ?? "Project"}`, start, end: start + 3_600_000, anytime: false,
        assigneeIds: personId ? [personId as Id<"users">] : personId === "" ? [] : [staff._id as Id<"users">], notes: "", opportunityId: payload.opportunityId as Id<"opportunities">, ...(row?.clientId ? { clientId: row.clientId } : {}), now: clock(),
      });
      toast("The consultation is booked.");
    } catch (e) {
      fail(e, "That could not be booked.");
    }
  }

  const multi = (anchor: HTMLElement, label: string, options: { value: string; label: string }[], selected: string[], set: (v: string[]) => void) =>
    popover(anchor, () => <MultiMenu label={label} options={options} selected={selected} onChange={set} />, { className: "filter" });

  return (
    <div className="sc fade-in">
      <div className="sc-bar">
        <div className="sc-nav">
          <button
            type="button"
            className="sc-month-btn"
            onClick={(e) => popover(e.currentTarget, (close) => <MiniCalendar dateKey={dateKey} today={today} onPick={(d) => { go(view, d); close(); }} />, { className: "mini" })}
          >
            {monthTitle(dateKey)} <Icon name="chevdown" size={16} />
          </button>
          <button type="button" className="btn icon" aria-label="Previous" data-tip="Previous" onClick={() => step(-1)}><Icon name="arrowleft" size={18} /></button>
          <button type="button" className="btn icon" aria-label="Next" data-tip="Next" onClick={() => step(1)}><span style={{ display: "inline-grid", transform: "rotate(180deg)" }}><Icon name="arrowleft" size={18} /></span></button>
          <button type="button" className="btn" onClick={() => go(view, today)}>Today</button>
          <button
            type="button"
            className="btn primary"
            disabled={!staff.canEdit}
            onClick={() => {
              if (form && !form.editing) {
                setForm(null);
                setPicked(undefined);
                setAvailUsers(null);
                return;
              }
              openForm({});
            }}
          >
            Find a Time
          </button>
          <button type="button" className="chip" onClick={(e) => multi(e.currentTarget, "Search", TYPE_OPTIONS.map((t) => ({ value: t, label: TYPE_NAME[t] })), types, setTypes)}>Type<span className="sep" /><b>{typeLabel}</b></button>
          <button type="button" className="chip" onClick={(e) => multi(e.currentTarget, "Search", [...roster.map((p) => ({ value: p.id, label: p.name })), { value: "unassigned", label: "Unassigned" }], team as string[], (v) => setTeam(v as typeof team))}>Team<span className="sep" /><b>{teamLabel}</b></button>
          <button type="button" className="chip" onClick={(e) => multi(e.currentTarget, "Search", STATUS_OPTIONS.map((s) => ({ value: s[0], label: s[1] })), statuses, setStatuses)}>Status<span className="sep" /><b>{statusLabel}</b></button>
        </div>
        <div className="sc-tools">
          <span className="sc-info" tabIndex={0} aria-label={`Times shown are in the business time zone (${BUSINESS_TZ})`} data-tip={`Times shown are in the business time zone (${BUSINESS_TZ})`}><Icon name="help" size={20} /></span>
          <div className="sc-views" role="tablist" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={`sc-viewbtn${view === v ? " on" : ""}`} onClick={() => go(v, dateKey)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <button type="button" className={`btn icon sc-unbtn${showUnscheduled ? " on" : ""}`} aria-label="Unscheduled appointments" data-tip="Unscheduled appointments" aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled((s) => !s)}>
            <Icon name="calendar" size={18} /><span className="pl-badge small">{unscheduled?.length ?? 0}</span>
          </button>
          <button type="button" className="btn icon" disabled aria-label="Map" data-tip="The map needs a map service, which is not set up yet"><Icon name="pin" size={18} /></button>
          <button
            type="button"
            className="btn sc-toolmore"
            aria-label="More"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                [
                  { label: "Reschedule and reassign", icon: "timeline", disabled: !staff.canEdit, onSelect: () => setDialog("reschedule") },
                  { label: "Create new visits", icon: "hammer", disabled: true },
                  { label: "Manage crews", icon: "crew", disabled: true },
                  { label: "Schedule Settings", icon: "sliders", disabled: !staff.canEdit, onSelect: () => setDialog("settings") },
                  { divider: true },
                  { label: "Give feedback", icon: "message", onSelect: () => setDialog("feedback") },
                ],
                { alignRight: true },
              )
            }
          >
            <Icon name="more" size={18} /> <span>More</span>
          </button>
        </div>
      </div>

      <div className="sc-main">
        <ScheduleGrid
          view={view}
          dateKey={dateKey}
          items={data.items}
          people={view === "day" ? dayPeople : roster}
          hours={hours}
          now={now}
          busy={avail?.busy ?? []}
          canEdit={staff.canEdit}
          onOpenItem={(item, rect) => setPopup((p) => (p?.item.key === item.key ? null : { item, rect }))}
          onEmptySlot={emptySlot}
          onMoveItem={(i, s, p) => void moveItem(i, s, p)}
          onResizeItem={(i, e) => void resizeItem(i, e)}
          onDropUnscheduled={(p, s, who) => void dropUnscheduled(p, s, who)}
          onOpenDay={(d) => go("day", d)}
        />
        {showUnscheduled && <UnscheduledPanel
            businessId={business._id}
            canEdit={staff.canEdit}
            onClose={() => setShowUnscheduled(false)}
            onPick={(row) => openForm(row.kind === "task" ? { kind: "task", title: row.title } : { kind: "consultation", projectId: row.opportunityId as Id<"opportunities">, title: `Consultation: ${row.title}` })}
          />}
      </div>

      {popup && (
        <SchedulePopup
          key={popup.item.key}
          item={popup.item}
          anchor={popup.rect}
          people={roster}
          canEdit={staff.canEdit}
          onClose={() => setPopup(null)}
          onFindTime={() => openForm({ start: popup.item.start, personId: popup.item.assigneeIds[0] }, popup.item, true)}
          onEdit={() => openForm({}, popup.item, false)}
        />
      )}
      {form && (
        <ScheduleForm
          key={form.n}
          businessId={business._id}
          people={roster}
          hours={hours}
          initial={form.initial}
          editing={form.editing}
          showAvailability={form.availability}
          picked={picked}
          onClose={() => { setForm(null); setPicked(undefined); setAvailUsers(null); }}
          onAvailability={setAvailUsers}
        />
      )}
      {dialog === "settings" && <ScheduleSettings businessId={business._id} hours={hours} onClose={() => setDialog(null)} />}
      {dialog === "reschedule" && <RescheduleDialog businessId={business._id} people={roster} todayKey={today} onClose={() => setDialog(null)} />}
      {dialog === "feedback" && <FeedbackDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

/** A searchable list of ticks with "N selected", Clear and Select all (Jobber's Type, Team and Status filters). */
function MultiMenu({ options, selected, onChange }: { label: string; options: { value: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  return (
    <>
      <input className="menu-search" type="search" placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="pl-leadhead">
        <span>{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
        <span style={{ display: "flex", gap: 12 }}>
          <button type="button" className="pl-clear" onClick={() => onChange(options.map((o) => o.value))} disabled={selected.length === options.length}>Select all</button>
          <button type="button" className="pl-clear" onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
        </span>
      </div>
      <div className="menu-list" role="listbox" aria-multiselectable="true">
        {shown.map((o) => (
          <button key={o.value} type="button" role="option" aria-selected={selected.includes(o.value)} className="opt" onClick={() => toggle(o.value)}>
            <span>{o.label}</span>
            {selected.includes(o.value) && <Icon name="check" size={22} className="tick" />}
          </button>
        ))}
        {shown.length === 0 && <div className="menu-empty">No matches</div>}
      </div>
    </>
  );
}

/** The little calendar under the month title: pick any day. */
function MiniCalendar({ dateKey, today, onPick }: { dateKey: string; today: string; onPick: (d: string) => void }) {
  const [shown, setShown] = useState(dateKey);
  const days = monthDays(shown);
  const month = parseKey(shown).m;
  return (
    <div className="mini-cal">
      <div className="mini-head">
        <span>{monthTitle(shown)}</span>
        <span>
          <button type="button" aria-label="Previous month" onClick={() => setShown(addMonths(shown, -1))}><Icon name="chevleft" size={18} /></button>
          <button type="button" aria-label="Next month" onClick={() => setShown(addMonths(shown, 1))}><Icon name="chevright" size={18} /></button>
        </span>
      </div>
      <div className="mini-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="mini-dow">{d}</span>)}
        {days.map((d) => (
          <button key={d} type="button" className={`mini-day${parseKey(d).m !== month ? " out" : ""}${d === today ? " today" : ""}${d === dateKey ? " sel" : ""}`} onClick={() => onPick(d)}>{parseKey(d).d}</button>
        ))}
      </div>
    </div>
  );
}

