"use client";

/* Home (PRD 3.1): the greeting, the workflow cards, today's appointments, my tasks and upcoming consultations. Everything comes from real
   records (D-076): requests, quotes and invoices from their stats, appointments from the Schedule, tasks from the Tasks tab. Jobs do not
   exist (a project is the job), so that card says so. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/lib/clients";
import { moneyCents, quoteDate } from "@/lib/format";
import { failure, todayBounds, useMinute, usePeople } from "@/lib/pipeline";import { useInvoiceStats } from "@/lib/invoices";
import { useJobCounts } from "@/lib/jobs";
import { useQuoteStats } from "@/lib/quotes";
import { useRequestStats } from "@/lib/requests";
import { BUSINESS_TZ, itemName, todayKey } from "@/lib/schedule";
import { useIsClient } from "@/lib/store";
import { Icon } from "./icon";
import { AddTaskDialog } from "./pipeline-dialogs";
import { HomeSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const DAY_MS = 86_400_000;
const MAX_CONSULTS_SHOWN = 5;

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TZ });
const dayTime = (ms: number) =>
  `${new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: BUSINESS_TZ })}, ${clockTime(ms)}`;

type Item = NonNullable<ReturnType<typeof useToday>>["items"][number];
type ApptState = "completed" | "active" | "upcoming" | "overdue";

const OVERDUE_LOOKBACK_DAYS = 30;

/** Today's items plus anything from the last 30 days that was never completed, so a missed visit does not vanish at midnight.
 *  Someone who is not an Admin sees only their own (Admins see everyone's). */
function useToday(businessId: string, now: number, mineOnly: string | undefined) {
  const { todayStart, todayEnd } = todayBounds();
  return useQuery(
    api.crm.schedule.range,
    {
      businessId: businessId as never, from: todayStart - OVERDUE_LOOKBACK_DAYS * DAY_MS, to: todayEnd + 1, types: ["consultation", "visit", "event"],
      assigneeIds: mineOnly ? [mineOnly as never] : [], statuses: [], now,
    },
  );
}

const dayText = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: BUSINESS_TZ });
const monthDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: BUSINESS_TZ });

/** "Wed, Nov 25, 9:00 AM – 10:30 AM", "Nov 25, 9:00 AM – Nov 26, 10:00 AM", or with Anytime in place of the times. */
function whenText(i: Item): string {
  const sameDay = todayKey(i.start) === todayKey(Math.max(i.start, i.end - 1));
  if (i.anytime) return sameDay ? `${dayText(i.start)} · Anytime` : `${monthDay(i.start)} – ${monthDay(i.end - 1)} · Anytime`;
  return sameDay ? `${dayText(i.start)}, ${clockTime(i.start)} – ${clockTime(i.end)}` : `${monthDay(i.start)}, ${clockTime(i.start)} – ${monthDay(i.end)}, ${clockTime(i.end)}`;
}

/** How long ago something ended: "25 min", "2 h 10 min", "3 days 4 h". */
function lateText(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} ${d === 1 ? "day" : "days"} ${h % 24} h` : `${d} ${d === 1 ? "day" : "days"}`;
}

/** Opens the Schedule on the item's day with its pop-up open. */
const openHref = (i: Item) => `/schedule?view=day&date=${todayKey(i.start)}&open=${encodeURIComponent(i.key)}`;

/** Where an appointment is now: finished, under way, late, or still to come. */
function stateOf(i: Item, now: number): ApptState {
  if (i.status === "completed") return "completed";
  if (i.overdue) return "overdue";
  if (!i.anytime && i.start <= now && now < i.end) return "active";
  return "upcoming";
}

const STATE_LABEL: Record<ApptState, string> = { completed: "Completed", active: "In progress", upcoming: "Upcoming", overdue: "Overdue" };
const STATE_PILL: Record<ApptState, string> = { completed: "active", active: "lead", upcoming: "draft", overdue: "overdue" };

function Row({ a, now }: { a: Item; now: number }) {
  const state = stateOf(a, now);
  return (
    <div className="appt">
      <div className="t">
        <b>{itemName(a)}{a.clientName && a.clientName !== a.title ? ` · ${a.clientName}` : ""}</b>
        <span className="when">{whenText(a)}</span>
      </div>
      <span className={`pill ${STATE_PILL[state]}`}>{state === "overdue" ? `Overdue by ${lateText(now - a.end)}` : STATE_LABEL[state]}</span>
      <Link className="btn small" href={openHref(a)} aria-label={`Open ${a.title} on the Schedule`}>Open</Link>
    </div>
  );
}

function Group({ label, list, emptyText, now }: { label: string; list: Item[]; emptyText: string; now: number }) {
  return (
    <>
      <div className="group-label">{label} ({list.length})</div>
      {list.length ? list.map((a) => <Row key={a.key} a={a} now={now} />) : <div className="empty">{emptyText}</div>}
    </>
  );
}

export function HomePage() {
  // The greeting and date depend on the visitor's clock, so they render in the browser only.
  return useIsClient() ? <Home /> : <HomeSkeleton />;
}

function Home() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const now = useMinute();
  const d = new Date();
  const part = d.getHours() < 12 ? "morning" : d.getHours() < 18 ? "afternoon" : "evening";
  const first = staff.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="fade-in">
      <div className="home-top">
        <div className="eyebrow">{d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: BUSINESS_TZ })}</div>
        <h1 className="greeting">Good {part}, {first}</h1>
      </div>

      {/* The workflow cards read requests, quotes, jobs and invoices, so they show only to someone who can look at all four (PRD 5.5). */}
      {staff.can("requests") && staff.can("quotes") && staff.can("jobs") && staff.can("invoices") && (
        <>
          <h2 className="section-title" style={{ marginTop: 0 }}>Workflow</h2>
          {businessId ? <Workflow businessId={businessId} /> : <div className="wf-grid"><div className="sk" style={{ height: 150, gridColumn: "1 / -1" }} /></div>}
        </>
      )}

      <div className="home-grid">
        <div className="col">
          <h2 className="section-title">My appointments</h2>
          {businessId ? <Appointments businessId={businessId} now={now} /> : <div className="card"><div className="sk" style={{ height: 160, margin: 12 }} /></div>}
        </div>
        <div className="col aside">
          <MyTasks />
          {businessId && <Consultations businessId={businessId} now={now} />}
        </div>
      </div>
    </div>
  );
}

/* ---- Workflow cards ---- */

function Workflow({ businessId }: { businessId: Parameters<typeof useRequestStats>[0] }) {
  const requests = useRequestStats(businessId);
  const quotes = useQuoteStats(businessId);
  const invoices = useInvoiceStats(businessId);
  const jobs = useJobCounts(businessId);
  const loading = requests === undefined || quotes === undefined || invoices === undefined || jobs === undefined;
  const bar = (c: string) => ({ "--bar": c }) as CSSProperties;
  const num = (n: number | undefined) => (n === undefined ? "–" : n);
  const q = quotes?.counts;
  const r = requests?.counts;
  return (
    <div className="wf-grid">
      <div className="wf-card" style={bar("var(--orange)")}>
        <div className="top"><Icon name="inbox" size={20} /><span>Requests</span></div>
        <div className="big">{loading ? <span className="sk sk-inline" style={{ width: 40, height: 32 }} /> : num(r?.New)}</div>
        <div className="lbl">New requests</div>
        <div className="ln"><span>Overdue follow-ups</span><span>{num(r?.Overdue)}</span></div>
        <div className="ln"><span>In consultation</span><span>{num(r?.Consultation)}</span></div>
      </div>
      <div className="wf-card" style={bar("var(--burgundy)")}>
        <div className="top"><Icon name="quote" size={20} /><span>Quotes</span></div>
        <div className="big">{loading ? <span className="sk sk-inline" style={{ width: 40, height: 32 }} /> : num(q ? q["Awaiting response"] + q["Changes requested"] : undefined)}</div>
        <div className="lbl">Pending</div>
        <div className="ln"><span>Draft</span><span>{num(q?.Draft)}</span></div>
        <div className="ln"><span>Approved</span><span>{num(q?.Approved)}</span></div>
      </div>
      <div className="wf-card" style={bar("var(--green)")}>
        <div className="top"><Icon name="hammer" size={20} /><span>Jobs</span></div>
        <div className="big">{loading ? <span className="sk sk-inline" style={{ width: 40, height: 32 }} /> : num(jobs ? jobs.all - jobs.byStatus.Archived : undefined)}</div>
        <div className="lbl">Active jobs</div>
        <div className="ln"><span>Late</span><span>{num(jobs?.byStatus.Late)}</span></div>
        <div className="ln"><span>Requires invoicing</span><span>{num(jobs?.byStatus["Requires Invoicing"])}</span></div>
      </div>
      <div className="wf-card" style={bar("var(--navy)")}>
        <div className="top"><Icon name="receipt" size={20} /><span>Invoices</span></div>
        <div className="big">{loading ? <span className="sk sk-inline" style={{ width: 40, height: 32 }} /> : num(invoices ? invoices.pastDue.count + invoices.notDue.count : undefined)}</div>
        <div className="lbl">Pending payments{invoices && invoices.pastDue.cents + invoices.notDue.cents > 0 ? ` · ${moneyCents(invoices.pastDue.cents + invoices.notDue.cents).replace(/\.00$/, "")}` : ""}</div>
        <div className="ln"><span>Past due</span><span>{num(invoices?.pastDue.count)}</span></div>
        <div className="ln"><span>Awaiting invoicing</span><span>{num(invoices?.awaitingInvoicing)}</span></div>
      </div>
    </div>
  );
}

/* ---- My appointments ---- */

function Appointments({ businessId, now }: { businessId: string; now: number }) {
  const staff = useStaff();
  const data = useToday(businessId, now, staff.isAdmin ? undefined : staff._id);
  if (data === undefined) {
    return <div className="card"><div className="stats"><span className="sk" style={{ display: "block", height: 44, width: "100%" }} /></div><div className="sk" style={{ height: 120, margin: 12 }} /></div>;
  }
  const { todayStart, todayEnd } = todayBounds();
  // Today's items, and earlier ones still not done (shown under Overdue). A lost project has no visits to do.
  const items = data.items.filter((i) => i.status !== "lost" && ((i.start <= todayEnd && i.end >= todayStart) || stateOf(i, now) === "overdue"));
  const states = items.map((i) => ({ i, s: stateOf(i, now) }));
  const of = (s: ApptState) => states.filter((x) => x.s === s).map((x) => x.i);
  return (
    <div className="card">
      <div className="stats">
        <div className="stat"><div className="k">Total</div><div className="v">{items.length}</div></div>
        <div className="stat"><div className="k">Active</div><div className="v">{of("active").length}</div></div>
        <div className="stat"><div className="k">Completed</div><div className="v">{of("completed").length}</div></div>
        <div className="stat"><div className="k">Overdue</div><div className="v">{of("overdue").length}</div></div>
        <div className="stat"><div className="k">Remaining</div><div className="v">{of("upcoming").length + of("active").length}</div></div>
        <Link className="btn" href="/schedule">View Schedule</Link>
      </div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: "20px 16px" }}>Nothing is scheduled for today.</div>
      ) : (
        <div className="fade-in">
          <Group label="OVERDUE" list={of("overdue")} emptyText="No overdue events" now={now} />
          <Group label="ACTIVE" list={of("active")} emptyText="No active events" now={now} />
          <Group label="UPCOMING" list={of("upcoming")} emptyText="No upcoming events" now={now} />
          <Group label="COMPLETED" list={of("completed")} emptyText="Nothing completed yet" now={now} />
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ---- My tasks ---- */

/** The signed-in person's open tasks, overdue and soonest first, from the Tasks tab's data. Tick one to complete it. */
function MyTasks() {
  const { toast } = useUI();
  const { _id: me, canEdit, can } = useStaff();
  const ws = useWorkspace();
  const [adding, setAdding] = useState(false);
  const now = useMinute();
  const { todayStart, todayEnd } = todayBounds();
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const data = useQuery(api.crm.opportunityTasks.listAll, ws.state === "ready" ? { businessId: ws.business._id, assigneeId: me, now, todayStart, todayEnd } : "skip");
  const rows = data?.rows ?? [];
  // Pending tasks are only the incomplete ones (user, 2026-11-25). One ticked while the page is open stays, struck through, until the page is
  // left, so a slip of the finger can be undone; it is gone the next time Home opens.
  const [justDone, setJustDone] = useState<Set<string>>(() => new Set());
  const doneToday = (data?.completed ?? []).filter((t) => justDone.has(t.id));
  const people = useQuery(api.crm.pipeline.people, ws.state === "ready" ? { businessId: ws.business._id } : "skip");
  const overdue = data?.counts.overdue ?? 0;
  const label = (due: number | undefined) => (due === undefined ? "No due date" : due < todayStart ? `Overdue · ${quoteDate(due)}` : due <= todayEnd ? "Due today" : `Due ${quoteDate(due)}`);

  return (
    <>
      <h2 className="section-title">Pending tasks{overdue > 0 ? <span className="pill overdue" style={{ marginLeft: 10, verticalAlign: "middle" }}>{overdue} overdue</span> : null}</h2>
      <div className="card list-card">
        {ws.state === "loading" || (ws.state === "ready" && data === undefined) ? (
          <div className="task"><div style={{ flex: 1 }}><span className="sk" style={{ display: "block", height: 16, width: "70%" }} /><span className="sk" style={{ display: "block", height: 12, width: "40%", marginTop: 6 }} /></div></div>
        ) : rows.length === 0 && doneToday.length === 0 ? (
          <div className="empty">No pending tasks. Nice work.</div>
        ) : (
          <>
            {rows.map((t) => (
              <div className="task" key={t.id}>
                <input type="checkbox" checked={false} disabled={!canEdit} aria-label={`Complete ${t.title}`} onChange={() => { setJustDone((d) => new Set(d).add(t.id)); void setDone({ taskId: t.id, done: true }).catch((e) => toast(failure(e, "The task could not be updated."))); }} />
                <div>
                  <Link className="task-link" href={`/tasks?task=${t.id}`}><b>{t.title}</b></Link>
                  {t.description && <div className="d task-desc" title={t.description}>{t.description}</div>}
                  <div className="d" style={t.dueAt !== undefined && t.dueAt < todayStart ? { color: "#b3261e" } : undefined}>
                    {label(t.dueAt)}{t.clientName ? ` · ${t.clientName}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {doneToday.map((t) => (
              <div className="task done" key={t.id}>
                <input type="checkbox" checked disabled={!canEdit} aria-label={`Reopen ${t.title}`} onChange={() => void setDone({ taskId: t.id, done: false }).catch((e) => toast(failure(e, "The task could not be updated.")))} />
                <div>
                  <Link className="task-link" href={`/tasks?task=${t.id}`}><b>{t.title}</b></Link>
                  {t.description && <div className="d task-desc" title={t.description}>{t.description}</div>}
                  <div className="d">Completed</div>
                </div>
              </div>
            ))}
          </>
        )}
        <div className="task task-foot">
          {can("tasks", "edit") && ws.state === "ready" && people !== undefined && <button type="button" className="btn small" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> New task</button>}
          {rows.length > 0 && <Link href="/tasks" className="btn link">View all tasks</Link>}
        </div>
      </div>
      {adding && ws.state === "ready" && people !== undefined && <AddTaskDialog businessId={ws.business._id} people={people} defaultAssignee={me} onClose={() => setAdding(false)} />}
    </>
  );
}

/* ---- Upcoming consultations ---- */

/** Consultations booked in the next two weeks, soonest first. */
function Consultations({ businessId, now }: { businessId: string; now: number }) {
  const people = usePeople(businessId as never);
  const data = useQuery(api.crm.schedule.range, { businessId: businessId as never, from: now, to: now + 14 * DAY_MS, types: ["consultation"], assigneeIds: [], statuses: [], now });
  const list = (data?.items ?? []).filter((i) => i.status !== "completed" && i.status !== "lost").slice(0, MAX_CONSULTS_SHOWN);
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? "";
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 0 }}>Upcoming consultations</h2>
      <div className="card list-card">
        {data === undefined ? (
          <div className="task"><div style={{ flex: 1 }}><span className="sk" style={{ display: "block", height: 16, width: "60%" }} /></div></div>
        ) : list.length === 0 ? (
          <div className="empty">No consultations in the next two weeks.</div>
        ) : (
          list.map((c) => (
            <div className="task" key={c.key}>
              <div>
                {/* The name opens the project's Visit tab (D-130). */}
                {c.opportunityId ? (
                  <Link className="task-link" href={`/opportunities/${c.opportunityId}?tab=visit`}><b>{c.clientName || c.title}{c.code ? ` · ${c.code}` : ""}</b></Link>
                ) : <b style={{ color: "var(--ink)" }}>{c.clientName || c.title}</b>}
                <div className="d">{c.anytime ? `${dayTime(c.start).split(",")[0]} · Anytime` : dayTime(c.start)}{c.assigneeIds.length ? ` · ${c.assigneeIds.map(nameOf).filter(Boolean).join(", ")}` : ""}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
