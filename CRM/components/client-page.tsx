"use client";

/* Client page (PRD client profile): details, related projects, activity history, notes. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addNote, clientStatus, findClient, useAllClients, useSavedNotes } from "@/lib/clients";
import { fullDate, money, shortCode } from "@/lib/format";
import { PREPLANNING_STAGES, SALES_STAGES } from "@/lib/sample-data";
import { useIsClient } from "@/lib/store";
import { Icon } from "./icon";
import { ClientSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type Tab = "info" | "activity";

export function ClientPage({ id }: { id: string }) {
  return useIsClient() ? <ClientView id={id} /> : <ClientSkeleton />;
}

function ClientView({ id }: { id: string }) {
  const all = useAllClients();
  const { dropdown, soon } = useUI();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<Tab>(() => (location.hash === "#activity" ? "activity" : "info"));

  // Same fallback as the approved mockup: an unknown id shows the first client.
  const c = findClient(all, id) ?? all[0];
  const saved = useSavedNotes(c.id);

  useEffect(() => {
    document.title = `${c.name} · Quality First Turf CRM`;
  }, [c.name]);

  const code = shortCode(c.id);
  // Sample figures, derived from the id so they stay the same between page loads.
  const lifetime = c.id === 1001 ? 0 : ((c.id * 7919) % 24 + 3) * 900;
  const balance = c.id % 5 === 0 ? ((c.id % 7) + 1) * 350 : 0;
  const addr = [c.street1, c.street2, c.city, `${c.state} ${c.zip}`].filter(Boolean).join(", ");
  const S = SALES_STAGES;
  const P = PREPLANNING_STAGES;

  // Related projects: one record per project, shown with the pipeline and stage it is in now.
  const projects = [{ code, title: `${c.name} · ${c.city}`, pipeline: "Sales", stage: S[c.id % S.length], owner: "Sal", daysAgo: c.daysAgo + 2 }];
  if (c.id % 3 === 0) projects.push({ code: shortCode(c.id + 500), title: `${c.name} · patio`, pipeline: "Preplanning", stage: P[c.id % P.length], owner: "May", daysAgo: c.daysAgo + 30 });

  const visits = [
    { daysAgo: -1, time: "9:00 AM", title: `Follow-up visit 1 · ${code}`, who: "Sal", done: false },
    { daysAgo: 2, time: "9:00 AM", title: `Onsite consultation · ${code}`, who: "Sal", done: true },
  ];
  const activity = [
    { i: "sms", t: `Text sent: appointment reminder for ${fullDate(-1, "9:00 AM")}`, by: "Sal", daysAgo: 2 },
    { i: "stage", t: `Stage changed: ${S[0]} → ${S[1]}`, by: "Sal", daysAgo: 4 },
    { i: "note", t: "Note added: customer wants a pet-friendly turf option", by: "Sal", daysAgo: 5 },
    { i: "inbox", t: `Project ${code} created from the customer form`, by: "System", daysAgo: c.daysAgo + 2 },
    { i: "contact", t: "Client created", by: "System", daysAgo: c.daysAgo + 2 },
  ];
  const notes = saved.concat(c.notes ? [{ t: c.notes, d: "From the client form" }] : []);

  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", "#" + t);
  };

  return (
    <div className="fade-in">
      <div className="client-head">
        <div className="left">
          <div className="who">
            <span className="pill tag">{c.type}</span>
            <span className={`pill tag ${clientStatus(c) === "Lead" ? "lead" : clientStatus(c) === "Active" ? "active" : "draft"}`}>{clientStatus(c)}</span>
            <Link href="/clients" className="btn link plain" style={{ marginLeft: 8 }}>
              <Icon name="chevleft" size={18} /> All clients
            </Link>
          </div>
          <div className="name-row">
            <h1>{c.name}</h1>
            <Link className="btn" href={`/clients/${c.id}/edit`} aria-label="Edit client">
              <Icon name="pencil" size={22} />
            </Link>
          </div>
        </div>
        <div className="page-head" style={{ margin: 0 }}>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              onClick={(e) =>
                dropdown(
                  e.currentTarget,
                  [["Quote", "quote"], ["Job", "hammer"], ["Invoice", "receipt"]].map(([l, ic]) => ({ label: l, icon: ic, onSelect: () => soon(l + "s") })),
                  { alignRight: true },
                )
              }
            >
              <Icon name="plus" size={18} /> Create
            </button>
          </div>
        </div>
      </div>

      <dl className="fields">
        <div className="f"><dt>Phone</dt><dd><a href={`tel:${c.phone}`}>{c.phone}</a></dd></div>
        <div className="f"><dt>Client type</dt><dd>{c.type}</dd></div>
        <div className="f"><dt>Email</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></div>
        <div className="f"><dt>Company</dt><dd>{c.company || "None"}</dd></div>
        <div className="f"><dt>Address</dt><dd>{addr}</dd></div>
        <div className="f"><dt>Business</dt><dd>{c.business}</dd></div>
      </dl>

      <div className="tabs" role="tablist">
        <button className={`tab${tab === "info" ? " active" : ""}`} role="tab" aria-selected={tab === "info"} onClick={() => pick("info")}>Client information</button>
        <button className={`tab${tab === "activity" ? " active" : ""}`} role="tab" aria-selected={tab === "activity"} onClick={() => pick("activity")}>Activity</button>
      </div>

      <div className="layout-2col">
        <div className="main-col fade-in" key={tab}>
          {tab === "info" ? (
            <>
              <section className="card panel">
                <div className="ph"><h3>Related projects</h3></div>
                <div className="table-wrap">
                  <table className="table">
                    <colgroup><col style={{ width: "30%" }} /><col style={{ width: "14%" }} /><col style={{ width: "30%" }} /><col style={{ width: "11%" }} /><col style={{ width: "15%" }} /></colgroup>
                    <thead><tr><th>Project</th><th>Pipeline</th><th>Stage</th><th>Assigned</th><th>Created</th></tr></thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.code}>
                          <td><b style={{ color: "var(--ink)" }}>{p.title}</b><br /><span className="muted">{p.code}</span></td>
                          <td>{p.pipeline}</td>
                          <td><span className="pill stage-pill">{p.stage}</span></td>
                          <td>{p.owner}</td>
                          <td>{fullDate(p.daysAgo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card panel">
                <div className="ph"><h3>Scheduled visits</h3></div>
                <div className="table-wrap">
                  <table className="table">
                    <colgroup><col style={{ width: "34%" }} /><col style={{ width: "46%" }} /><col style={{ width: "20%" }} /></colgroup>
                    <thead><tr><th>Schedule</th><th>Title</th><th>Assigned</th></tr></thead>
                    <tbody>
                      {visits.map((v) => (
                        <tr key={v.title}>
                          <td>
                            <b style={{ color: "var(--ink)" }}>{fullDate(v.daysAgo, v.time)}</b>
                            {v.done && <><br /><span className="muted">Completed</span></>}
                          </td>
                          <td>{v.title}</td>
                          <td>{v.who}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="card panel">
              <div className="ph"><h3>Activity history</h3></div>
              <div className="timeline">
                {activity.map((a) => (
                  <div className="tl" key={a.t}>
                    <span className="badge-ic"><Icon name={a.i} size={20} /></span>
                    <div className="t">
                      <b>{a.t}</b>
                      <div className="d">{a.by} · {fullDate(a.daysAgo)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="aside">
          <div className="card">
            <h3>Overview</h3>
            <div className="amt">{money(lifetime)}<small>Lifetime value</small></div>
            <div className="amt">{money(balance)}<small>Current balance</small></div>
          </div>
          <div className="card">
            <h3>Notes</h3>
            <div className="note-box">
              <textarea ref={noteRef} placeholder="Leave an internal note for yourself or a team member" aria-label="New note" />
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  const t = noteRef.current?.value.trim();
                  if (!t) return;
                  addNote(c.id, { t, d: "Sal · " + new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) });
                  if (noteRef.current) noteRef.current.value = "";
                }}
              >
                Add note
              </button>
            </div>
            <div>
              {notes.map((n, i) => (
                <div className="note-item" key={i}>
                  {n.t}
                  <div className="d">{n.d}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
