"use client";

/* New Job (design 2026-11-19-jobs): Jobber's form for a job made by hand, with no quote: a title, the client, the service details, Product /
   Service lines and an optional first visit. Saving makes a project that is already Closed Won (crm/jobs:create) with the next job number, and
   it goes to Preplanning like any won project. Nothing is flagged red until Save is pressed (D-035). */

import Link from "next/link";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useClient, useWorkspace, type BusinessDoc } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { clock, useMinute } from "@/lib/pipeline";
import { useClientSearch } from "@/lib/quotes";
import { failure } from "@/lib/requests";
import { fromInputs, todayKey } from "@/lib/schedule";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { NewClientDialog } from "./new-client-dialog";
import { NoteEditor } from "./note-editor";
import { RequestLinesEditor, checkRequestLines, type RequestLine } from "./request-lines";
import { NewRequestSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function NewJobPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <NewRequestSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Form key={workspace.business._id} business={workspace.business} />;
}

function Form({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useUI();
  const staff = useStaff();
  const now = useMinute();
  const create = useMutation(api.crm.jobs.create);
  const book = useMutation(api.crm.schedule.book);

  const presetId = params.get("clientId") ?? undefined;
  const preset = useClient(presetId);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<{ id: Id<"clients">; name: string } | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [details, setDetails] = useState("");
  const [lines, setLines] = useState<RequestLine[]>([]);
  const [badLines, setBadLines] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [hours, setHours] = useState("1");
  const [addingClient, setAddingClient] = useState(false);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const found = useClientSearch(business._id, clientQuery);

  // A client named in the address (Create > Job on a client's page) is the starting choice, if it belongs to this business.
  const client = picked ?? (preset && preset.businessId === business._id ? { id: preset._id, name: preset.name } : null);

  const dirty = !!(title || picked || details || lines.length || date);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!staff.can("jobs", "edit")) {
    return (
      <div className="empty-state">
        <h2>You can view jobs, not make them</h2>
        <p>Your role does not allow changes.</p>
        <Link className="btn primary" href="/jobs">Back to Jobs</Link>
      </div>
    );
  }

  const clear = (k: string) => setBad((b) => { const n = new Set(b); n.delete(k); return n; });

  async function save() {
    const missing = new Set<string>();
    if (!title.trim()) missing.add("title");
    if (!client) missing.add("client");
    const hrs = Number(hours);
    if (date && (!time || !Number.isFinite(hrs) || hrs <= 0 || hrs > 24)) missing.add("visit");
    setBad(missing);
    const checked = checkRequestLines(lines);
    setBadLines(checked.bad);
    if (missing.size || checked.bad.size) {
      const [lineKey, field] = ([...checked.bad][0] ?? "").split(":");
      const lineBox = `${field === "name" ? "rn" : field === "qty" ? "rq" : "rp"}-${lineKey}`;
      document.getElementById(missing.has("title") ? "jf-title" : missing.has("client") ? "jf-client" : missing.has("visit") ? "jf-time" : lineBox)?.focus();
      return;
    }
    setBusy(true);
    try {
      const id = await create({ businessId: business._id, clientId: client!.id, title, details, lines: checked.ok, now: clock() });
      // The first visit is booked on the Schedule once the job exists. If it clashes the job is still saved, and the person books it from the job page.
      if (date) {
        const start = fromInputs(date, time);
        try {
          await book({ businessId: business._id, type: "visit", title, start, end: start + hrs * 3_600_000, assigneeIds: [], opportunityId: id, clientId: client!.id, now: clock() });
          toast("Job saved.");
        } catch (e) {
          toast(`Job saved, but the visit was not booked. ${failure(e, "Book it again from the job page.")}`);
        }
      } else {
        toast("Job saved.");
      }
      router.push(`/jobs/${id}`);
    } catch (e) {
      toast(failure(e, "The job could not be saved."));
      setBusy(false);
    }
  }

  return (
    <div className="fade-in rf">
      <div className="page-head"><h1><Icon name="hammer" size={26} /> New Job</h1></div>

      <section className="qb-card qb-head">
        <div className={`field${bad.has("title") ? " bad" : ""}`}>
          <label htmlFor="jf-title">Title</label>
          <input id="jf-title" aria-invalid={bad.has("title")} maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); clear("title"); }} />
          <span className="err">Give the job a title.</span>
        </div>
        <div className="qb-headgrid">
          <div className="qb-left">
            <div className={`field${bad.has("client") ? " bad" : ""}`}>
              <label htmlFor="jf-client">Client</label>
              {client ? (
                <div className="sc-picked">
                  <span>{client.name}</span>
                  <button type="button" className="icon-btn" aria-label="Choose a different client" onClick={() => { setPicked(null); router.replace("/jobs/new"); }}><Icon name="x" size={18} /></button>
                </div>
              ) : (
                <>
                  <input id="jf-client" aria-invalid={bad.has("client")} placeholder="Select a client" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} autoComplete="off" />
                  {clientQuery.trim() && found && (
                    <div className="sc-results" role="listbox">
                      {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
                      {found.rows.map((c) => (
                        <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { setPicked({ id: c._id, name: c.name }); setClientQuery(""); clear("client"); }}>
                          <b>{c.name}</b> <span>{[c.street1, c.city].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                      <button type="button" className="sc-newclient" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client{clientQuery.trim() ? ` "${clientQuery.trim()}"` : ""}</button>
                    </div>
                  )}
                  {!(clientQuery.trim() && found) && <button type="button" className="btn link sc-newclient-link" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client</button>}
                  <span className="err">Pick the client this job is for.</span>
                </>
              )}
            </div>
          </div>
          <dl className="qb-meta">
            <div><dt>Job type</dt><dd>One-off job</dd></div>
            <div><dt>Created on</dt><dd>{quoteDate(now)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="qb-card">
        <h2>Overview</h2>
        <div className="field">
          <label htmlFor="jf-details">Service details</label>
          <NoteEditor id="jf-details" noFiles rows={6} placeholder="What the job is, and anything the crew should know" value={details} onChange={setDetails} files={[]} onFiles={() => undefined} />
        </div>
      </section>

      <section className="qb-card" aria-label="Product / Service">
        <h2 className="qb-h">Product / Service</h2>
        <RequestLinesEditor lines={lines} onChange={(l) => { setLines(l); setBadLines(new Set()); }} bad={badLines} />
      </section>

      <section className="qb-card">
        <h2>Schedule</h2>
        <p className="muted">Optional. Book the first visit now, or leave it and book it from the job page.</p>
        <div className={`jf-visit${bad.has("visit") ? " bad" : ""}`}>
          <div className="field">
            <label htmlFor="jf-date">First visit</label>
            <input id="jf-date" type="date" min={todayKey(now)} value={date} onChange={(e) => { setDate(e.target.value); clear("visit"); }} />
          </div>
          <div className="field">
            <label htmlFor="jf-time">Start time</label>
            <input id="jf-time" type="time" aria-invalid={bad.has("visit")} value={time} disabled={!date} onChange={(e) => { setTime(e.target.value); clear("visit"); }} />
          </div>
          <div className="field">
            <label htmlFor="jf-hours">Hours</label>
            <input id="jf-hours" inputMode="decimal" aria-invalid={bad.has("visit")} value={hours} disabled={!date} onChange={(e) => { setHours(e.target.value.replace(/[^0-9.]/g, "")); clear("visit"); }} />
          </div>
        </div>
        {bad.has("visit") && <p className="err-line">Give the visit a start time and a length in hours.</p>}
      </section>

      <div className="qb-bar">
        <button type="button" className="btn" disabled={busy} onClick={() => router.push("/jobs")}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save Job</button>
      </div>
      {addingClient && (
        <NewClientDialog
          businessId={business._id}
          typed={clientQuery}
          onClose={() => setAddingClient(false)}
          onCreated={(c) => { setPicked(c); setClientQuery(""); clear("client"); toast("Client saved."); }}
        />
      )}
    </div>
  );
}
