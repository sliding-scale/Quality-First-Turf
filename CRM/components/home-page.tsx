"use client";

/* Home: greeting, workflow cards, today's appointments, my messages, upcoming consultations. Sample data. */

import { useState, type CSSProperties } from "react";
import { money0 } from "@/lib/format";
import { useIsClient } from "@/lib/store";
import { Icon } from "./icon";
import { HomeSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type Card = { bar: string; icon: string; name: string; big: number | string; label: string; lines: [string, number | string][] };

const CARDS: Card[] = [
  { bar: "var(--orange)", icon: "inbox", name: "Requests", big: 4, label: "New leads", lines: [["Approved leads", 2], ["Overdue follow-ups", 1]] },
  { bar: "var(--burgundy)", icon: "quote", name: "Quotes", big: 4, label: "Pending", lines: [["Draft (2)", money0(5200)], ["Changes requested (1)", ""]] },
  { bar: "var(--green)", icon: "hammer", name: "Jobs", big: 2, label: "Awaiting invoicing", lines: [["Active (5)", money0(38420)], ["Action required (1)", ""]] },
  { bar: "var(--navy)", icon: "receipt", name: "Invoices", big: money0(12300), label: "Outstanding", lines: [["Draft (1)", ""], ["Past due (2)", money0(4150)]] },
];

type ApptState = "completed" | "active" | "upcoming";
type Appt = { time: string; title: string; client: string; where: string; who: string; state: ApptState };

const APPTS: Appt[] = [
  { time: "8:30 AM", title: "Consultation", client: "Maria Alvarez", where: "1840 Oak Ridge Dr, Temecula", who: "Sal", state: "completed" },
  { time: "11:00 AM", title: "Follow-up visit 1", client: "David Kim", where: "27310 Canyon View Rd, Murrieta", who: "Sal", state: "active" },
  { time: "2:30 PM", title: "Consultation", client: "Rivera Landscape", where: "9120 Hillcrest Ave, Upland", who: "Robert", state: "upcoming" },
];

// PRD: texts and WhatsApp are logged against the client and the user.
const MESSAGES = [
  { who: "Maria Alvarez", ch: "Text", t: "Can we move Thursday's visit to the afternoon?", ago: "10 min ago", unread: true },
  { who: "Crew A", ch: "WhatsApp", t: "Work package received, we start at 7:30 tomorrow.", ago: "1 h ago", unread: false },
  { who: "David Kim", ch: "Text", t: "Thanks, I will review the quote tonight.", ago: "3 h ago", unread: true },
  { who: "Rivera Landscape", ch: "Text", t: "The gate will be open at 2 PM for the consultation.", ago: "Yesterday", unread: false },
];

const CONSULTS = [
  { d: "Tomorrow, 9:00 AM", t: "Linda Foster", w: "Glendora · Sal" },
  { d: "Fri, 1:30 PM", t: "Summit Builders", w: "Corona · Robert" },
  { d: "Mon, 10:00 AM", t: "Kevin Tran", w: "Menifee · Sal" },
];

const count = (s: ApptState) => APPTS.filter((a) => a.state === s).length;

function Row({ a }: { a: Appt }) {
  return (
    <div className="appt">
      <div className="time">{a.time}</div>
      <div className="t">
        <b>
          {a.title} · {a.client}
        </b>
        <span className="muted">{a.where}</span>
      </div>
      <span className={`pill ${a.state === "completed" ? "active" : a.state === "active" ? "lead" : "draft"}`}>
        {a.state === "completed" ? "Completed" : a.state === "active" ? "In progress" : "Upcoming"}
      </span>
    </div>
  );
}

function Group({ label, list, emptyText }: { label: string; list: Appt[]; emptyText: string }) {
  return (
    <>
      <div className="group-label">
        {label} ({list.length})
      </div>
      {list.length ? list.map((a) => <Row key={a.time} a={a} />) : <div className="empty">{emptyText}</div>}
    </>
  );
}

export function HomePage() {
  // The greeting and date depend on the visitor's clock, so they render in the browser only.
  return useIsClient() ? <Home /> : <HomeSkeleton />;
}

function Home() {
  const { soon } = useUI();
  const [mode, setMode] = useState<"Visit" | "Employee">("Visit");
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <div className="fade-in">
      <div className="home-top">
        <div className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="greeting">Good {part}, Sal</h1>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Workflow</h2>
      <div className="wf-grid">
        {CARDS.map((c) => (
          <div className="wf-card" key={c.name} style={{ "--bar": c.bar } as CSSProperties}>
            <div className="top">
              <Icon name={c.icon} size={20} />
              <span>{c.name}</span>
            </div>
            <div className="big">{c.big}</div>
            <div className="lbl">{c.label}</div>
            {c.lines.map((l) => (
              <div className="ln" key={l[0]}>
                <span>{l[0]}</span>
                <span>{l[1]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="home-grid">
        <div className="col">
          <h2 className="section-title">Today&apos;s appointments</h2>
          <div className="card">
            <div className="stats">
              <div className="stat"><div className="k">Total</div><div className="v">{APPTS.length}</div></div>
              <div className="stat"><div className="k">Active</div><div className="v">{count("active")}</div></div>
              <div className="stat"><div className="k">Completed</div><div className="v">{count("completed")}</div></div>
              <div className="stat"><div className="k">Overdue</div><div className="v">0</div></div>
              <div className="stat"><div className="k">Remaining</div><div className="v">{count("upcoming") + count("active")}</div></div>
              <a
                className="btn"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  soon("Schedule");
                }}
              >
                View Schedule
              </a>
            </div>
            <div className="seg" role="tablist">
              <button type="button" className={mode === "Visit" ? "on" : ""} onClick={() => setMode("Visit")}>Visit</button>
              <button type="button" className={mode === "Employee" ? "on" : ""} onClick={() => setMode("Employee")}>Employee</button>
            </div>
            {mode === "Visit" ? (
              <div key="visit" className="fade-in">
                <Group label="OVERDUE" list={[]} emptyText="No overdue events" />
                <Group label="ACTIVE" list={APPTS.filter((a) => a.state === "active")} emptyText="No active events" />
                <Group label="UPCOMING" list={APPTS.filter((a) => a.state === "upcoming")} emptyText="No upcoming events" />
                <Group label="COMPLETED" list={APPTS.filter((a) => a.state === "completed")} emptyText="Nothing completed yet" />
              </div>
            ) : (
              <div key="employee" className="fade-in">
                {["Sal", "Robert"].map((w) => (
                  <Group key={w} label={w.toUpperCase()} list={APPTS.filter((a) => a.who === w)} emptyText="No events" />
                ))}
              </div>
            )}
            <div style={{ height: 8 }} />
          </div>
        </div>

        <div className="col aside">
          <h2 className="section-title">My messages</h2>
          <div className="card list-card">
            {MESSAGES.map((m) => (
              <a
                key={m.who}
                className={`msgrow${m.unread ? " unread" : ""}`}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  soon("Messages");
                }}
              >
                <span className="dot-u" />
                <div className="m">
                  <div className="top">
                    <b>{m.who}</b>
                    <span className="d">{m.ago}</span>
                  </div>
                  <div className="s">{m.t}</div>
                  <span className="pill tag">{m.ch}</span>
                </div>
              </a>
            ))}
          </div>
          <h2 className="section-title" style={{ marginTop: 0 }}>Upcoming consultations</h2>
          <div className="card list-card">
            {CONSULTS.map((c) => (
              <div className="task" key={c.t}>
                <div>
                  <b style={{ color: "var(--ink)" }}>{c.t}</b>
                  <div className="d">
                    {c.d} · {c.w}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
