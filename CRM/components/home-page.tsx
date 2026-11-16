"use client";

/* Home (PRD 3.1): the greeting, the workflow cards, today's appointments, my tasks and upcoming consultations. Everything comes from real
   records (D-076): requests and quotes from their stats, appointments from the Schedule, tasks from the Tasks tab. Jobs and Invoices
   are not built yet, so their cards say so instead of showing numbers. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { failure, todayBounds, useMinute, usePeople } from "@/lib/pipeline";
import { useQuoteStats } from "@/lib/quotes";
import { useRequestStats } from "@/lib/requests";
import { BUSINESS_TZ } from "@/lib/schedule";
import { useIsClient } from "@/lib/store";
import { Icon } from "./icon";
import { HomeSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const DAY_MS = 86_400_000;
const MAX_TASKS_SHOWN = 5;
const MAX_CONSULTS_SHOWN = 5;

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TZ });
const dayTime = (ms: number) =>
  `${new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: BUSINESS_TZ })}, ${clockTime(ms)}`;

type Item = NonNullable<ReturnType<typeof useToday>>["items"][number];
type ApptState = "completed" | "active" | "upcoming" | "overdue";

function useToday(businessId: string, now: number) {
  const { todayStart, todayEnd } = todayBounds();
  return useQuery(
    api.crm.schedule.range,
    { businessId: businessId as never, from: todayStart, to: todayEnd + 1, types: ["consultation", "visit", "event"], assigneeIds: [], statuses: [], now },
  );
}

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
      <div className="time">{a.anytime ? "Anytime" : clockTime(a.start)}</div>
      <div className="t">
        <b>{a.title}{a.clientName && a.clientName !== a.title ? ` · ${a.clientName}` : ""}</b>
      </div>
      <span className={`pill ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
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
  const [mode, setMode] = useState<"Visit" | "Employee">("Visit");
  const d = new Date();
  const part = d.getHours() < 12 ? "morning" : d.getHours() < 18 ? "afternoon" : "evening";
  const first = staff.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="fade-in">
      <div className="home-top">
        <div className="eyebrow">{d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="greeting">Good {part}, {first}</h1>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Workflow</h2>
      {businessId ? <Workflow businessId={businessId} /> : <div className="wf-grid"><div className="sk" style={{ height: 150, gridColumn: "1 / -1" }} /></div>}

      <div className="home-grid">
        <div className="col">
          <h2 className="section-title">Today&apos;s appointments</h2>
          {businessId ? <Appointments businessId={businessId} now={now} mode={mode} setMode={setMode} /> : <div className="card"><div className="sk" style={{ height: 160, margin: 12 }} /></div>}
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
  const loading = requests === undefined || quotes === undefined;
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
        <div className="lbl muted" style={{ marginTop: 14 }}>Jobs are not available yet.</div>
      </div>
      <div className="wf-card" style={bar("var(--navy)")}>
        <div className="top"><Icon name="receipt" size={20} /><span>Invoices</span></div>
        <div className="lbl muted" style={{ marginTop: 14 }}>Invoices are not available yet.</div>
      </div>
    </div>
  );
}

/* ---- Today's appointments ---- */

function Appointments({ businessId, now, mode, setMode }: { businessId: string; now: number; mode: "Visit" | "Employee"; setMode: (m: "Visit" | "Employee") => void }) {
  const data = useToday(businessId, now);
  const people = usePeople(businessId as never);
  if (data === undefined) {
    return <div className="card"><div className="stats"><span className="sk" style={{ display: "block", height: 44, width: "100%" }} /></div><div className="sk" style={{ height: 120, margin: 12 }} /></div>;
  }
  const items = data.items;
  const states = items.map((i) => ({ i, s: stateOf(i, now) }));
  const of = (s: ApptState) => states.filter((x) => x.s === s).map((x) => x.i);
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? "Someone";
  const byPerson = new Map<string, Item[]>();
  for (const i of items) {
    const keys = i.assigneeIds.length ? i.assigneeIds.map(nameOf) : ["Unassigned"];
    for (const k of keys) byPerson.set(k, [...(byPerson.get(k) ?? []), i]);
  }
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
      <div className="seg" role="tablist">
        <button type="button" className={mode === "Visit" ? "on" : ""} onClick={() => setMode("Visit")}>Visit</button>
        <button type="button" className={mode === "Employee" ? "on" : ""} onClick={() => setMode("Employee")}>Employee</button>
      </div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: "20px 16px" }}>Nothing is scheduled for today.</div>
      ) : mode === "Visit" ? (
        <div key="visit" className="fade-in">
          <Group label="OVERDUE" list={of("overdue")} emptyText="No overdue events" now={now} />
          <Group label="ACTIVE" list={of("active")} emptyText="No active events" now={now} />
          <Group label="UPCOMING" list={of("upcoming")} emptyText="No upcoming events" now={now} />
          <Group label="COMPLETED" list={of("completed")} emptyText="Nothing completed yet" now={now} />
        </div>
      ) : (
        <div key="employee" className="fade-in">
          {[...byPerson.entries()].map(([who, list]) => <Group key={who} label={who.toUpperCase()} list={list} emptyText="No events" now={now} />)}
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
  const { _id: me, canEdit } = useStaff();
  const ws = useWorkspace();
  const now = useMinute();
  const { todayStart, todayEnd } = todayBounds();
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const data = useQuery(api.crm.opportunityTasks.listAll, ws.state === "ready" ? { businessId: ws.business._id, assigneeId: me, now, todayStart, todayEnd } : "skip");
  const rows = data?.rows ?? [];
  const label = (due: number | undefined) => (due === undefined ? "No due date" : due < todayStart ? `Overdue · ${quoteDate(due)}` : due <= todayEnd ? "Due today" : `Due ${quoteDate(due)}`);

  return (
    <>
      <h2 className="section-title">My tasks</h2>
      <div className="card list-card">
        {ws.state === "loading" || (ws.state === "ready" && data === undefined) ? (
          <div className="task"><div style={{ flex: 1 }}><span className="sk" style={{ display: "block", height: 16, width: "70%" }} /><span className="sk" style={{ display: "block", height: 12, width: "40%", marginTop: 6 }} /></div></div>
        ) : rows.length === 0 ? (
          <div className="empty">No open tasks. Nice work.</div>
        ) : (
          rows.slice(0, MAX_TASKS_SHOWN).map((t) => (
            <div className="task" key={t.id}>
              <input type="checkbox" checked={false} disabled={!canEdit} aria-label={`Complete ${t.title}`} onChange={() => void setDone({ taskId: t.id, done: true }).catch((e) => toast(failure(e, "The task could not be updated.")))} />
              <div>
                <b style={{ color: "var(--ink)" }}>{t.title}</b>
                <div className="d" style={t.dueAt !== undefined && t.dueAt < todayStart ? { color: "#b3261e" } : undefined}>
                  {label(t.dueAt)}{t.clientName ? ` · ${t.clientName}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
        {rows.length > 0 && (
          <div className="task"><Link href="/tasks" className="btn link">{rows.length > MAX_TASKS_SHOWN ? `View all ${rows.length} tasks` : "View all tasks"}</Link></div>
        )}
      </div>
    </>
  );
}

/* ---- Upcoming consultations ---- */

/** Consultations booked in the next two weeks, soonest first. */
function Consultations({ businessId, now }: { businessId: string; now: number }) {
  const people = usePeople(businessId as never);
  const data = useQuery(api.crm.schedule.range, { businessId: businessId as never, from: now, to: now + 14 * DAY_MS, types: ["consultation"], assigneeIds: [], statuses: [], now });
  const list = (data?.items ?? []).filter((i) => i.status !== "completed").slice(0, MAX_CONSULTS_SHOWN);
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
                <b style={{ color: "var(--ink)" }}>{c.clientName || c.title}</b>
                <div className="d">{c.anytime ? `${dayTime(c.start).split(",")[0]} · Anytime` : dayTime(c.start)}{c.assigneeIds.length ? ` · ${c.assigneeIds.map(nameOf).filter(Boolean).join(", ")}` : ""}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
