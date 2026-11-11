"use client";

/* One request (D-039), laid out like Jobber's request page: status, "Title · CODE", the client's card beside a table of facts (source,
   requested, salesperson, assessment). The pencil opens the facts for editing: Jobber's Salesperson dropdown with Cancel and Save. It
   writes through crm/pipeline:setSalesperson, the same mutation as the Pipeline card, so the board and this page always agree. */

import Link from "next/link";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { failure, usePeople, useRequest } from "@/lib/requests";
import { quoteDate, quoteDateTime } from "@/lib/format";
import { Icon } from "./icon";
import { RequestSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const PILL = { New: "lead", Overdue: "overdue", Consultation: "consult", Converted: "active", Lost: "draft" } as const;
const UNASSIGNED = "";

export function RequestPage({ id }: { id: string }) {
  const request = useRequest(id);
  if (request === undefined) return <RequestSkeleton />;
  if (request === null) {
    return (
      <div className="empty-state">
        <h2>Request not found</h2>
        <p>This request does not exist, or it was removed.</p>
        <Link className="btn primary" href="/requests">Back to requests</Link>
      </div>
    );
  }
  return <RequestView r={request} />;
}

type Request = NonNullable<ReturnType<typeof useRequest>>;

function RequestView({ r }: { r: Request }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const people = usePeople(r.businessId);
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string>(UNASSIGNED);
  const [saving, setSaving] = useState(false);

  const c = r.client;
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  function edit() {
    setPick(r.salespersonId ?? UNASSIGNED);
    setEditing(true);
  }
  async function save() {
    setSaving(true);
    try {
      await setSalesperson({ id: r.id, salespersonId: pick === UNASSIGNED ? null : (people?.find((p) => p.id === pick)?.id ?? null) });
      setEditing(false);
      toast(pick === UNASSIGNED ? "Request unassigned." : "Salesperson saved.");
    } catch (e) {
      toast(failure(e, "The salesperson could not be changed."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-in rq">
      <div className="rq-top">
        <Link className="rq-back" href="/requests"><Icon name="chevleft" size={18} /> Requests</Link>
        <span className={`pill ${PILL[r.status]}`}><span className="dot" />{r.status}</span>
      </div>
      <div className="rq-title">
        <h1>{r.title} · {r.code}</h1>
        {canEdit && !editing && (
          <button type="button" className="icon-btn" aria-label="Edit request details" onClick={edit}><Icon name="pencil" size={20} /></button>
        )}
      </div>

      <div className="rq-grid">
        <section className="card rq-client">
          <Link href={`/clients/${r.clientId}`} className="rq-clientname">{c.name}</Link>
          {c.street1 && <div>{c.street1}</div>}
          {cityLine && <div>{cityLine}</div>}
          {c.phone && <div className="rq-gap"><a href={`tel:${c.phone}`}>{c.phone}</a></div>}
          {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
        </section>

        <dl className="rq-facts">
          <div><dt>Request Source</dt><dd>{r.leadSource || "None"}</dd></div>
          <div><dt>Requested</dt><dd>{quoteDate(r.requestedAt)}</dd></div>
          <div>
            <dt>Salesperson</dt>
            <dd>
              {editing ? (
                <div className="field rq-select">
                  <select aria-label="Salesperson" value={pick} disabled={saving || people === undefined} onChange={(e) => setPick(e.target.value)}>
                    <option value={UNASSIGNED}>Unassigned</option>
                    {people?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ) : (
                r.salespersonName
              )}
            </dd>
          </div>
          <div><dt>Assessment</dt><dd>{r.assessmentAt ? quoteDateTime(r.assessmentAt) : "Unscheduled"}</dd></div>
          {editing && (
            <div className="rq-editbar">
              <button type="button" className="btn" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>Save</button>
            </div>
          )}
        </dl>
      </div>

      {r.details && (
        <section className="card rq-overview">
          <h2>Overview</h2>
          <h3>Service details</h3>
          <p>{r.details}</p>
        </section>
      )}
    </div>
  );
}
