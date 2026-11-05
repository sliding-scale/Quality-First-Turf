"use client";

/* Client page (PRD client profile): details, related projects, activity history, notes. The client, its projects and its
   notes come from the backend. The scheduled visits, the activity history and the two overview figures are still sample
   content: the tables behind them arrive with the visit and activity work. */

import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CLIENT_STATUS_LABEL, CLIENT_TYPE_LABEL, SALES_STAGES } from "@/convex/crm/lib/stages";
import { daysAgoFrom, useBusinesses, useClient, useClientNotes, useClientProjects, type ClientDoc } from "@/lib/clients";
import { fullDate, money } from "@/lib/format";
import { useStaff } from "./staff-context";
import { Icon } from "./icon";
import { ClientSkeleton, Sk } from "./skeletons";
import { useUI } from "./ui-provider";

type Tab = "info" | "activity";

export function ClientPage({ id }: { id: string }) {
  const client = useClient(id);
  if (client === undefined) return <ClientSkeleton />;
  if (client === null) {
    return (
      <div className="empty-state">
        <h2>Client not found</h2>
        <p>This client does not exist, or it was removed.</p>
        <Link className="btn primary" href="/clients">Back to clients</Link>
      </div>
    );
  }
  return <ClientView c={client} />;
}

/** A stable number from an id, so the sample figures stay the same between page loads. */
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const noteDate = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function ClientView({ c }: { c: ClientDoc }) {
  const { canEdit } = useStaff();
  const { dropdown, soon, toast } = useUI();
  const addNote = useMutation(api.crm.clients.addNote);
  const businesses = useBusinesses();
  const projects = useClientProjects(c._id);
  const savedNotes = useClientNotes(c._id);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<Tab>(() => (location.hash === "#activity" ? "activity" : "info"));

  useEffect(() => {
    document.title = `${c.name} · Quality First Turf CRM`;
  }, [c.name]);

  const h = hash(c._id);
  const lifetime = (h % 24 + 3) * 900;
  const balance = h % 5 === 0 ? ((h % 7) + 1) * 350 : 0;
  const addr = [c.street1, c.street2, c.city, `${c.state} ${c.zip}`].filter(Boolean).join(", ");
  const businessName = businesses?.find((b) => b._id === c.businessId)?.name ?? "";
  const code = projects?.find((p) => p.pipeline === "Sales")?.code ?? "";
  const clientAge = daysAgoFrom(c.createdAt);

  const visits = [
    { daysAgo: -1, time: "9:00 AM", title: `Follow-up visit 1 · ${code}`, who: "Sal", done: false },
    { daysAgo: 2, time: "9:00 AM", title: `Onsite consultation · ${code}`, who: "Sal", done: true },
  ];
  const activity = [
    { i: "sms", t: `Text sent: appointment reminder for ${fullDate(-1, "9:00 AM")}`, by: "Sal", daysAgo: 2 },
    { i: "stage", t: `Stage changed: ${SALES_STAGES[0]} → ${SALES_STAGES[1]}`, by: "Sal", daysAgo: 4 },
    { i: "note", t: "Note added: customer wants a pet-friendly turf option", by: "Sal", daysAgo: 5 },
    { i: "inbox", t: `Project ${code} created from the customer form`, by: "System", daysAgo: clientAge },
    { i: "contact", t: "Client created", by: "System", daysAgo: clientAge },
  ];
  const notes = (savedNotes ?? []).map((n) => ({ t: n.text, d: `${n.author} · ${noteDate(n._creationTime)}` }));
  if (c.notes) notes.push({ t: c.notes, d: "From the client form" });

  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", "#" + t);
  };

  async function submitNote() {
    const text = noteRef.current?.value.trim();
    if (!text) return;
    try {
      await addNote({ clientId: c._id, text });
      if (noteRef.current) noteRef.current.value = "";
    } catch (e) {
      toast(e instanceof ConvexError && typeof e.data === "string" ? e.data : "The note could not be saved.");
    }
  }

  const statusClass = c.status === "lead" ? "lead" : c.status === "active" ? "active" : "draft";

  return (
    <div className="fade-in">
      <div className="client-head">
        <div className="left">
          <div className="who">
            <span className="pill tag">{CLIENT_TYPE_LABEL[c.type]}</span>
            <span className={`pill tag ${statusClass}`}>{CLIENT_STATUS_LABEL[c.status]}</span>
            <Link href="/clients" className="btn link plain" style={{ marginLeft: 8 }}>
              <Icon name="chevleft" size={18} /> All clients
            </Link>
          </div>
          <div className="name-row">
            <h1>{c.name}</h1>
            {canEdit && (
              <Link className="btn" href={`/clients/${c._id}/edit`} aria-label="Edit client">
                <Icon name="pencil" size={22} />
              </Link>
            )}
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
        <div className="f"><dt>Client type</dt><dd>{CLIENT_TYPE_LABEL[c.type]}</dd></div>
        <div className="f"><dt>Email</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></div>
        <div className="f"><dt>Company</dt><dd>{c.company || "None"}</dd></div>
        <div className="f"><dt>Address</dt><dd>{addr}</dd></div>
        <div className="f"><dt>Business</dt><dd>{businessName}</dd></div>
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
                      {projects === undefined ? (
                        <tr>
                          <td><Sk w="70%" h={16} /></td><td><Sk w="60%" h={16} /></td><td><Sk w="80%" h={22} r={999} /></td><td><Sk w="50%" h={16} /></td><td><Sk w="70%" h={16} /></td>
                        </tr>
                      ) : projects.length ? (
                        projects.map((p) => (
                          <tr key={p._id}>
                            <td><b style={{ color: "var(--ink)" }}>{c.name} · {p.title}</b><br /><span className="muted">{p.code}</span></td>
                            <td>{p.pipeline}</td>
                            <td><span className="pill stage-pill">{p.stage}</span></td>
                            <td>{p.owner}</td>
                            <td>{fullDate(daysAgoFrom(p.requestedAt))}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5}><div className="empty" style={{ margin: "12px 0" }}>No projects yet.</div></td></tr>
                      )}
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
            {canEdit && (
              <div className="note-box">
                <textarea ref={noteRef} placeholder="Leave an internal note for yourself or a team member" aria-label="New note" />
                <button className="btn small" type="button" onClick={() => void submitNote()}>
                  Add note
                </button>
              </div>
            )}
            <div>
              {savedNotes === undefined ? (
                <div className="note-item"><Sk w="80%" h={14} /></div>
              ) : (
                notes.map((n, i) => (
                  <div className="note-item" key={i}>
                    {n.t}
                    <div className="d">{n.d}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
