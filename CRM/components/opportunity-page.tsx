"use client";

/* The opportunity page (D-077, PRD 3.4): one page per project, at its own address (/opportunities/<id>), opened from "View opportunity" in
   the card window. Overview, Quotes, Visit, Files and Activity, all read from what already exists; the Request page stays as it is and is where
   a request's details are edited. Files are the one new thing kept here: site plans, photos and contract papers on the project. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useRequest, usePeople } from "@/lib/requests";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { clock, failure, timeLabel, useMinute } from "@/lib/pipeline";
import { pipelineLabel } from "@/convex/crm/lib/stages";
import { BillingTab } from "./billing-tab";
import { ConstructionTab } from "./construction-tab";
import { AssessmentSection } from "./assessment-section";
import { Icon } from "./icon";
import { QuoteContent } from "./quote-content";
import { StageSteps } from "./stage-steps";
import { ProjectNotes } from "./project-notes";
import { TakeoffTab } from "./takeoff-tab";
import { VisitTab } from "./visit-tab";
import { WorkPackageTab } from "./work-package-tab";
import { OpportunitySkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

// In the order the work happens: Sales (visit, quote), Preplanning (takeoff, work package), Construction, Backend (billing); then what spans them all.
const TABS = ["overview", "visit", "quotes", "takeoff", "package", "construction", "billing", "files", "activity"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", takeoff: "Takeoff", package: "Work package", construction: "Construction", billing: "Billing", quotes: "Quotes", visit: "Visit", files: "Files", activity: "Activity" };
/** A project in Construction opens on its Construction tab and one in Finance on its Billing tab; the others have no such tab (D-081, PRD 5.1).
 *  Billing shows once the sale is won (Preplanning, Construction, Finance). */
const firstTab = (pipeline: string): Tab => (pipeline === "Construction" ? "construction" : pipeline === "Finance" ? "billing" : "overview");
const hasTab = (t: Tab, pipeline: string) => (t === "construction" ? pipeline === "Construction" : t === "billing" ? pipeline !== "Sales" : (t === "takeoff" || t === "package") ? pipeline !== "Sales" : true);
const parseTab = (s: string | null, pipeline: string): Tab => {
  const wanted = (TABS as readonly string[]).includes(s ?? "") ? (s as Tab) : firstTab(pipeline);
  return hasTab(wanted, pipeline) ? wanted : "overview";
};

/** A request is quoted only after its on-site consultation is booked (user, 2026-11-25, D-129); the server refuses it too. */
const quotable = (o: { pipeline: string; stage: string }) => !(o.pipeline === "Sales" && (o.stage === "New Request" || o.stage === "Schedule Onsite Consultation"));

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : n ? `${n} B` : "");

export function OpportunityPage({ id }: { id: string }) {
  const overview = useQuery(api.crm.opportunityPage.overview, { id: id as Id<"opportunities"> });
  if (overview === undefined) return <OpportunitySkeleton />;
  if (overview === null) {
    return (
      <div className="empty-state">
        <h2>Opportunity not found</h2>
        <p>This opportunity does not exist, or it was removed.</p>
        <Link className="btn primary" href="/pipeline">Back to the pipeline</Link>
      </div>
    );
  }
  return <OpportunityView key={overview.id} o={overview} />;
}

type Overview = NonNullable<FunctionReturnType<typeof api.crm.opportunityPage.overview>>;

function OpportunityView({ o }: { o: Overview }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"), o.pipeline);
  const now = useMinute();
  const staff = useStaff();
  // Quotes are prices: a person without the Quotes module (an Installer) neither sees the tab nor asks for the list.
  const seesQuotes = staff.can("quotes");
  const quotes = useQuery(api.crm.opportunityPage.quotes, seesQuotes ? { id: o.id } : "skip");
  const files = useQuery(api.crm.opportunityPage.files, { id: o.id });
  // The first tab of the project has the plain address; every other tab has ?tab=.
  const first: Tab = firstTab(o.pipeline);
  const go = (t: Tab) => router.replace(t === first ? `/opportunities/${o.id}` : `/opportunities/${o.id}?tab=${t}`, { scroll: false });
  const tabs = TABS.filter((t) => hasTab(t, o.pipeline) && (t !== "quotes" || seesQuotes) && (t !== "billing" || staff.can("invoices")) && (t !== "takeoff" || staff.can("pipelinePreplanning")) && (t !== "package" || staff.can("pipelinePreplanning")));
  const lost = o.stage === "Closed Lost";
  const timeIn = Math.max(0, now - o.stageEnteredAt);

  return (
    <div className="fade-in op">
      <div className="op-top">
        <Link className="rq-back" href={o.pipeline === "Preplanning" ? "/pipeline/preplanning" : o.pipeline === "Construction" ? "/pipeline/construction" : o.pipeline === "Finance" ? "/pipeline/backend" : "/pipeline"}><Icon name="chevleft" size={18} /> {pipelineLabel(o.pipeline)}</Link>
        <div className="op-actions">
          {/* A won project keeps its request page after it moves on to Preplanning or Construction; a project that never was a request has none. */}
          {staff.can("requests") && (o.pipeline === "Sales" || o.outcome === "won") && <Link className="btn" href={`/requests/${o.id}`}><Icon name="inbox" size={18} /> View request</Link>}
          {o.outcome === "won" && staff.can("jobs") && <Link className="btn" href={`/jobs/${o.id}`}><Icon name="hammer" size={18} /> View job</Link>}
        </div>
      </div>
      <div className="op-title">
        <h1>{o.title}</h1>
        <span className="op-code">{o.code}</span>
        <span className={`pill tag ${o.outcome === "won" ? "active" : lost ? "overdue" : "lead"}`}><span className="dot" />{o.stage}</span>
        {o.archivedAt !== null && <span className="pill tag draft"><span className="dot" />Archived</span>}
      </div>
      <StageSteps stages={o.stages} stage={o.stage} label={`${pipelineLabel(o.pipeline)} pipeline`} />
      <div className="tabs op-tabs" role="tablist" aria-label="Opportunity sections">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? " active" : ""}`} onClick={() => go(t)}>
            {TAB_LABEL[t]}
            {t === "quotes" && quotes && quotes.length > 0 && <small>{quotes.length}</small>}
            {t === "files" && files && files.length > 0 && <small>{files.length}</small>}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab o={o} timeIn={timeIn} />}
      {tab === "takeoff" && staff.can("pipelinePreplanning") && <TakeoffTab id={o.id} businessId={o.businessId} title={o.title} />}
      {tab === "package" && staff.can("pipelinePreplanning") && <WorkPackageTab id={o.id} businessId={o.businessId} title={o.title} />}
      {tab === "construction" && <ConstructionTab id={o.id} businessId={o.businessId} title={o.title} />}
      {tab === "billing" && staff.can("invoices") && <BillingTab id={o.id} />}
      {tab === "quotes" && seesQuotes && <QuotesTab o={o} />}
      {tab === "visit" && <VisitTab project={{ id: o.id, businessId: o.businessId, clientId: o.clientId, title: o.title, salespersonId: o.salespersonId }} />}
      {tab === "files" && <FilesTab o={o} />}
      {tab === "activity" && <ActivityTab id={o.id} />}
    </div>
  );
}

/* ---- Overview ---- */

const CONTRACT: Record<Overview["contract"]["state"], { label: string; cls: string }> = {
  signed: { label: "Signed", cls: "active" }, uploaded: { label: "Uploaded", cls: "active" }, out: { label: "Out for signature", cls: "lead" },
  none: { label: "No open quote", cls: "draft" }, noquote: { label: "No quote yet", cls: "draft" },
};

function OverviewTab({ o, timeIn }: { o: Overview; timeIn: number }) {
  const { canEdit, can } = useStaff();
  // A request (still in Sales, or won from it) has a request record: its answers and its assessment card come from there (D-129).
  const isRequest = (o.pipeline === "Sales" || o.outcome === "won") && can("requests");
  const r = useRequest(isRequest ? o.id : null);
  const request = isRequest ? r : null;
  const people = usePeople(o.businessId);
  const [assessing, setAssessing] = useState(false);
  const c = o.client;
  const city = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const confirmedTotal = o.confirmed?.lines.reduce((n, l) => n + l.totalCents, 0) ?? 0;
  const contract = CONTRACT[o.contract.state];

  return (
    <div className="op-body">
      <div className="op-col">
        <section className="card op-card">
          <h2>Overview</h2>
          {request ? (
            <>
              <div className="rq-qa-source">{request.overview.source}</div>
              {request.overview.heading && <h3 className="rq-qa-head">{request.overview.heading}</h3>}
              <div className="rq-qa">
                {request.overview.fields.length === 0 ? <p className="muted">No answers were given.</p> : request.overview.fields.map((f, i) => (
                  <div key={i} className="rq-qa-row">
                    <div className="rq-label">{f.label}</div>
                    <p className="rq-text">{f.value || "—"}</p>
                  </div>
                ))}
              </div>
            </>
          ) : request === undefined && isRequest ? <div className="sk" style={{ height: 80 }} /> : (
            <><h3>Service details</h3><p className="op-text">{o.details || "—"}</p></>
          )}
        </section>

        {request ? (
          <AssessmentSection r={request} people={people} canEdit={canEdit} editing={assessing} onEditing={setAssessing} />
        ) : (
        <section className="card op-card">
          <h2>On-site assessment</h2>
          {o.assessment ? (
            <dl className="op-facts">
              <div><dt>Schedule</dt><dd>{o.assessment.anytime ? `${quoteDate(o.assessment.start)} · Anytime` : quoteDateTime(o.assessment.start)} <span className={`pill tag ${o.assessment.status === "completed" ? "active" : "draft"}`}>{o.assessment.status === "completed" ? "Completed" : o.assessment.status === "lost" ? "Lost" : "Upcoming"}</span></dd></div>
              {o.assessment.instructions && <div><dt>Instructions</dt><dd className="op-text">{o.assessment.instructions}</dd></div>}
            </dl>
          ) : (
            <p className="muted">No assessment is booked yet.</p>
          )}
        </section>
        )}

        {o.requestedLines.length > 0 && (
          <section className="card op-card">
            <h2>Requested services</h2>
            <div className="op-scroll">
              <table className="table op-table">
                <colgroup><col style={{ width: "46%" }} /><col style={{ width: "12%" }} /><col style={{ width: "21%" }} /><col style={{ width: "21%" }} /></colgroup>
                <thead><tr><th>Service</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
                <tbody>{o.requestedLines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num">{l.quantity}</td><td className="num">{moneyCents(l.unitPriceCents)}</td><td className="num">{moneyCents(l.totalCents)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        <section className="card op-card">
          <div className="op-sechead"><h2>Confirmed services</h2>{o.confirmed && <Link className="pill tag active" href={`/quotes/${o.confirmed.quoteId}`}><span className="dot" />From quote #{o.confirmed.number}, {o.confirmed.status.toLowerCase()}</Link>}</div>
          {o.confirmed ? (
            <div className="op-scroll">
              <table className="table op-table">
                <colgroup><col style={{ width: "46%" }} /><col style={{ width: "12%" }} /><col style={{ width: "21%" }} /><col style={{ width: "21%" }} /></colgroup>
                <thead><tr><th>Service</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {o.confirmed.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num">{l.quantity}</td><td className="num">{moneyCents(l.unitPriceCents)}</td><td className="num">{moneyCents(l.totalCents)}</td></tr>)}
                  <tr className="op-sum"><td colSpan={3}>Lines total</td><td className="num">{moneyCents(confirmedTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Nothing is confirmed yet. Once a quote is approved, its services show here.</p>
          )}
        </section>

        <ProjectNotes id={o.id} canEdit={canEdit} />
      </div>

      <div className="op-col">
        <section className="card op-card op-client">
          <Link href={`/clients/${o.clientId}`} className="rq-clientname">{c.name}</Link>
          {c.street1 && <div>{c.street1}</div>}
          {city && <div>{city}</div>}
          {c.phone && <div className="rq-gap"><a href={`tel:${c.phone}`}>{c.phone}</a></div>}
          {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
        </section>
        <section className="card op-card">
          <dl className="op-facts">
            <div><dt>Salesperson</dt><dd>{o.salespersonName}</dd></div>
            <div><dt>Lead source</dt><dd>{o.leadSource || "None"}</dd></div>
            <div><dt>Requested</dt><dd>{quoteDate(o.requestedAt)}</dd></div>
            <div><dt>Time in stage</dt><dd>{timeLabel(timeIn)}</dd></div>
            <div><dt>Contract</dt><dd><span className={`pill tag ${contract.cls}`}><span className="dot" />{contract.label}</span></dd></div>
            <div><dt>Deposit</dt><dd>{o.deposit.required ? (o.deposit.collected ? `Received ${o.deposit.collectedAt ? quoteDate(o.deposit.collectedAt) : ""}` : "Required, not received") : "Not asked for"}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

/* ---- Quotes ---- */

/** Every quote of the project in full, newest first (user, 2026-11-26, D-130). Quotes are made from the request page or the Quotes list, not here. */
function QuotesTab({ o }: { o: Overview }) {
  const quotes = useQuery(api.crm.opportunityPage.quotes, { id: o.id });
  if (quotes === undefined) return <div className="op-body one"><div className="sk" style={{ height: 200 }} /></div>;
  return (
    <div className="op-body one">
      {quotes.length === 0 ? (
        <section className="card op-card op-wide"><h2>Quotes</h2><p className="muted">{quotable(o) ? "No quotes yet." : "No quotes yet. A quote can be made once the on-site consultation is booked."}</p></section>
      ) : quotes.map((q) => <QuoteContent key={q.id} id={q.id} />)}
    </div>
  );
}

/* ---- Files ---- */

type Kind = "plan" | "photo" | "contract" | "other";
/** One card per kind of file, each with its own Add button (user, 2026-11-25, D-129; it was one list with filter chips). */
const KIND_CARD: Record<Kind, { title: string; empty: string; accept: string }> = {
  plan: { title: "Site plans", empty: "No site plans yet.", accept: "application/pdf,image/*" },
  photo: { title: "Photos", empty: "No photos yet.", accept: "image/*" },
  contract: { title: "Contracts", empty: "No contract papers yet. The signed contract from a quote shows here too.", accept: "application/pdf,image/*" },
  other: { title: "Other files", empty: "No other files yet.", accept: "application/pdf,image/*" },
};

function FilesTab({ o }: { o: Overview }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const files = useQuery(api.crm.opportunityPage.files, { id: o.id });
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  const add = useMutation(api.crm.opportunityPage.addFile);
  const remove = useMutation(api.crm.opportunityPage.removeFile);
  const pickers = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<Kind | null>(null);

  async function pick(kind: Kind, list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(kind);
    try {
      for (const f of Array.from(list)) {
        const url = await makeUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!res.ok) throw new Error("A file could not be uploaded.");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        await add({ id: o.id, storageId, name: f.name, kind, now: clock() });
      }
      toast(list.length === 1 ? "File added." : `${list.length} files added.`);
    } catch (e) {
      toast(failure(e, "The file could not be added."));
    } finally {
      setBusy(null);
      const input = pickers.current[kind];
      if (input) input.value = "";
    }
  }

  return (
    <div className="op-body one op-files-grid">
      {(Object.keys(KIND_CARD) as Kind[]).map((kind) => {
        const card = KIND_CARD[kind];
        const mine = (files ?? []).filter((f) => f.kind === kind);
        return (
          <section key={kind} className="card op-card op-wide" aria-label={card.title}>
            <div className="op-sechead">
              <h2>{card.title}{mine.length > 0 && <small className="op-sub"> · {mine.length}</small>}</h2>
              {canEdit && (
                <>
                  <input ref={(el) => { pickers.current[kind] = el; }} type="file" accept={card.accept} multiple hidden onChange={(e) => void pick(kind, e.target.files)} />
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => pickers.current[kind]?.click()}><Icon name="upload" size={18} /> {busy === kind ? "Uploading…" : "Add"}</button>
                </>
              )}
            </div>
            {files === undefined ? <div className="sk" style={{ height: 48 }} /> : mine.length === 0 ? (
              <p className="muted">{card.empty}</p>
            ) : (
              <ul className="op-files">
                {mine.map((f) => (
                  <li key={f.key}>
                    <span className={`op-ft${f.contentType.startsWith("image/") ? " img" : ""}`}>{f.contentType.startsWith("image/") ? "IMG" : "PDF"}</span>
                    <span className="op-fname">
                      {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : f.name}
                      <small>{[f.from, f.by, quoteDate(f.at), size(f.size)].filter(Boolean).join(" · ")}</small>
                    </span>
                    {canEdit && f.fileId && (
                      <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => void remove({ fileId: f.fileId! }).then(() => toast("File removed.")).catch((e) => toast(failure(e, "The file could not be removed.")))}><Icon name="trash" size={20} /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="op-hint">A quote&apos;s attachments and the signed contract show here too, marked with where they came from. They stay on that quote or checklist.</p>
    </div>
  );
}

/* ---- Activity ---- */

function ActivityTab({ id }: { id: Id<"opportunities"> }) {
  const items = useQuery(api.crm.opportunityPage.activity, { id });
  return (
    <div className="op-body one">
      <section className="card op-card">
        <h2>Activity</h2>
        {items === undefined ? <div className="sk" style={{ height: 120 }} /> : (
          <ul className="op-tl">
            {items.map((a) => (
              <li key={a.key}>
                <i className={a.kind} aria-hidden="true" />
                <span>
                  <b>{a.title}</b>{a.detail ? <span className="op-detail"> {a.detail}</span> : null}
                  <small>{[a.who, quoteDateTime(a.at)].filter(Boolean).join(" · ")}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
