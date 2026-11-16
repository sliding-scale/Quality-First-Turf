"use client";

/* The opportunity page (D-077, PRD 3.4): one page per project, at its own address (/opportunities/<id>), opened from "View opportunity" in
   the card window. Overview, Quotes, Visit, Files and Activity, all read from what already exists; the Request page stays as it is and is where
   a request's details are edited. Files are the one new thing kept here: site plans, photos and contract papers on the project. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { clock, failure, timeLabel, useMinute } from "@/lib/pipeline";
import { ConstructionTab } from "./construction-tab";
import { QUOTE_PILL } from "@/lib/quotes";
import { Icon } from "./icon";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NoteBody } from "./note-view";
import { OpportunitySkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const TABS = ["overview", "construction", "quotes", "visit", "files", "activity"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", construction: "Construction", quotes: "Quotes", visit: "Visit", files: "Files", activity: "Activity" };
/** A project in Construction opens on its Construction tab; the others have no such tab (D-081). */
const parseTab = (s: string | null, pipeline: string): Tab => {
  const wanted = (TABS as readonly string[]).includes(s ?? "") ? (s as Tab) : pipeline === "Construction" ? "construction" : "overview";
  return wanted === "construction" && pipeline !== "Construction" ? "overview" : wanted;
};

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
  const quotes = useQuery(api.crm.opportunityPage.quotes, { id: o.id });
  const files = useQuery(api.crm.opportunityPage.files, { id: o.id });
  // The first tab of the project has the plain address; every other tab has ?tab=.
  const first: Tab = o.pipeline === "Construction" ? "construction" : "overview";
  const go = (t: Tab) => router.replace(t === first ? `/opportunities/${o.id}` : `/opportunities/${o.id}?tab=${t}`, { scroll: false });
  const tabs = TABS.filter((t) => t !== "construction" || o.pipeline === "Construction");
  const at = o.stages.indexOf(o.stage);
  const lost = o.stage === "Closed Lost";
  const timeIn = Math.max(0, now - o.stageEnteredAt);

  return (
    <div className="fade-in op">
      <div className="op-top">
        <Link className="rq-back" href={o.pipeline === "Preplanning" ? "/pipeline/preplanning" : o.pipeline === "Construction" ? "/pipeline/construction" : "/pipeline"}><Icon name="chevleft" size={18} /> {o.pipeline}</Link>
        <div className="op-actions">
          {/* A won project keeps its request page after it moves on to Preplanning or Construction; a project that never was a request has none. */}
          {(o.pipeline === "Sales" || o.outcome === "won") && <Link className="btn" href={`/requests/${o.id}`}><Icon name="pencil" size={18} /> Edit request</Link>}
          <Link className="btn primary" href={`/quotes/new?clientId=${o.clientId}&projectId=${o.id}`}><Icon name="quote" size={18} /> New quote</Link>
        </div>
      </div>
      <div className="op-title">
        <h1>{o.title}</h1>
        <span className="op-code">{o.code}</span>
        <span className={`pill tag ${o.outcome === "won" ? "active" : lost ? "overdue" : "lead"}`}><span className="dot" />{o.stage}</span>
        {o.archivedAt !== null && <span className="pill tag draft"><span className="dot" />Archived</span>}
      </div>
      <ol className="op-stages" aria-label={`${o.pipeline} pipeline`}>
        {o.stages.map((s, i) => (
          <li key={s} className={s === o.stage ? (lost ? "now lost" : "now") : i < at && !lost ? "done" : undefined} aria-current={s === o.stage ? "step" : undefined}>{s}</li>
        ))}
      </ol>
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
      {tab === "construction" && <ConstructionTab id={o.id} businessId={o.businessId} title={o.title} />}
      {tab === "quotes" && <QuotesTab o={o} />}
      {tab === "visit" && <VisitTab id={o.id} />}
      {tab === "files" && <FilesTab o={o} />}
      {tab === "activity" && <ActivityTab id={o.id} />}
    </div>
  );
}

/* ---- Overview ---- */

const CONTRACT: Record<Overview["contract"]["state"], { label: string; cls: string }> = {
  signed: { label: "Signed", cls: "active" }, uploaded: { label: "Signed contract uploaded", cls: "active" }, out: { label: "Out for signature", cls: "lead" },
  none: { label: "No open quote", cls: "draft" }, noquote: { label: "No quote yet", cls: "draft" },
};

function nextStep(o: Overview): string {
  if (o.pipeline === "Preplanning") return `In Preplanning: ${o.stage}.`;
  if (o.pipeline === "Construction") return o.stage === "100% Completed & Sign-off" ? "Construction is signed off." : `In Construction: ${o.stage}.`;
  if (o.outcome === "won") return "Closed Won. Next is Preplanning.";
  if (o.outcome === "lost") return o.lostReason ? `Closed Lost: ${o.lostReason}` : "Closed Lost.";
  if (o.contract.state === "noquote") return "Next step: make a quote for this project.";
  if (o.contract.state === "out") return "Next step: get the quote signed. Closed Won needs the signed contract" + (o.deposit.required ? " and the deposit." : ".");
  if (o.contract.state === "signed" || o.contract.state === "uploaded") return o.deposit.required && !o.deposit.collected ? "Next step: record the deposit, then close the project as won." : "Ready to close as won.";
  return "Next step: send or update a quote.";
}

function OverviewTab({ o, timeIn }: { o: Overview; timeIn: number }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const extras = useQuery(api.crm.opportunityTasks.listForProject, { id: o.id });
  const addNote = useMutation(api.crm.opportunityTasks.addNote);
  const toggleLine = useMutation(api.crm.opportunityTasks.toggleNoteLine);
  const upload = useUploadPending();
  const [note, setNote] = useState("");
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const c = o.client;
  const city = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const confirmedTotal = o.confirmed?.lines.reduce((n, l) => n + l.totalCents, 0) ?? 0;
  const contract = CONTRACT[o.contract.state];

  return (
    <div className="op-body">
      <div className="op-col">
        <section className="card op-card"><h2>Overview</h2><h3>Service details</h3><p className="op-text">{o.details || "—"}</p></section>

        <section className="card op-card">
          <h2>On-site assessment</h2>
          {o.assessment ? (
            <dl className="op-facts">
              <div><dt>Schedule</dt><dd>{o.assessment.anytime ? `${quoteDate(o.assessment.start)} · Anytime` : quoteDateTime(o.assessment.start)} <span className={`pill tag ${o.assessment.status === "completed" ? "active" : "draft"}`}>{o.assessment.status === "completed" ? "Completed" : "Upcoming"}</span></dd></div>
              {o.assessment.instructions && <div><dt>Instructions</dt><dd className="op-text">{o.assessment.instructions}</dd></div>}
            </dl>
          ) : (
            <p className="muted">No assessment is booked yet.</p>
          )}
        </section>

        {o.requestedLines.length > 0 && (
          <section className="card op-card">
            <h2>Requested services</h2>
            <div className="op-scroll">
              <table className="table op-table">
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

        <section className="card op-card">
          <h2>Notes</h2>
          {canEdit && (
            <form
              className="pl-noteform"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim() && noteFiles.length === 0) return;
                setSaving(true);
                upload(noteFiles)
                  .then((files) => addNote({ id: o.id, text: note, files }))
                  .then(() => { noteFiles.forEach((f) => URL.revokeObjectURL(f.url)); setNote(""); setNoteFiles([]); })
                  .catch((err) => toast(failure(err, "The note could not be saved.")))
                  .finally(() => setSaving(false));
              }}
            >
              <NoteEditor value={note} onChange={setNote} files={noteFiles} onFiles={setNoteFiles} disabled={saving} rows={5} />
              <button type="submit" className="btn primary" disabled={saving || (!note.trim() && noteFiles.length === 0)}>{saving ? "Saving…" : "Save note"}</button>
            </form>
          )}
          {extras === undefined ? <div className="sk" style={{ height: 40 }} /> : extras.notes.length === 0 && !canEdit ? <p className="muted">No notes yet.</p> : extras.notes.map((n) => (
            <div key={n._id} className="pl-note fade-in">
              <NoteBody text={n.text} files={n.files} canEdit={canEdit} onToggle={(line) => void toggleLine({ noteId: n._id, line }).catch((err) => toast(failure(err, "The checkbox could not be changed.")))} />
              <small>{n.author} · {quoteDateTime(n.createdAt)}</small>
            </div>
          ))}
        </section>
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
        <div className="op-next" role="status">{nextStep(o)}</div>
      </div>
    </div>
  );
}

/* ---- Quotes ---- */

function QuotesTab({ o }: { o: Overview }) {
  const quotes = useQuery(api.crm.opportunityPage.quotes, { id: o.id });
  const { canEdit } = useStaff();
  return (
    <div className="op-body one">
      <section className="card op-card">
        <div className="op-sechead"><h2>Quotes for this project</h2>{canEdit && <Link className="btn primary" href={`/quotes/new?clientId=${o.clientId}&projectId=${o.id}`}>New quote</Link>}</div>
        {quotes === undefined ? <div className="sk" style={{ height: 80 }} /> : quotes.length === 0 ? <p className="muted">No quotes yet.</p> : (
          <div className="op-scroll">
            <table className="table op-table">
              <thead><tr><th>#</th><th>Title</th><th>Status</th><th>Sent</th><th className="num">Total</th></tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td><Link href={`/quotes/${q.id}`}>#{q.number}</Link></td>
                    <td>{q.title}</td>
                    <td><span className={`pill tag ${QUOTE_PILL[q.status]}`}><span className="dot" />{q.status}</span></td>
                    <td>{q.sentAt ? quoteDate(q.sentAt) : "—"}</td>
                    <td className="num">{moneyCents(q.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---- Visit ---- */

function VisitTab({ id }: { id: Id<"opportunities"> }) {
  const visit = useQuery(api.crm.opportunityPage.visit, { id });
  if (visit === undefined) return <div className="op-body one"><div className="sk" style={{ height: 160 }} /></div>;
  if (visit === null || !visit.available) {
    return <div className="op-body one"><section className="card op-card"><h2>Visit</h2><p className="muted">{visit?.reason ?? "There is no site visit to show."}</p></section></div>;
  }
  const dims = (w: { length: number | null; width: number | null; quantity: number | null }) =>
    [w.length !== null && w.width !== null ? `${w.length} × ${w.width} ft` : "", w.quantity !== null ? `${w.quantity} total` : ""].filter(Boolean).join(" · ") || "—";
  return (
    <div className="op-body one">
      <section className="card op-card">
        <h2>Site visit{visit.visitedAt ? <small className="op-sub"> · {quoteDate(visit.visitedAt)}</small> : null}</h2>
        <dl className="op-facts">
          <div><dt>Services</dt><dd>{visit.services.join(", ") || "—"}</dd></div>
          {visit.products.length > 0 && <div><dt>Products</dt><dd>{visit.products.join(", ")}</dd></div>}
          {visit.addOns.length > 0 && <div><dt>Add-ons</dt><dd>{visit.addOns.join(", ")}</dd></div>}
          {visit.notes && <div><dt>Notes</dt><dd className="op-text">{visit.notes}</dd></div>}
        </dl>
      </section>
      <section className="card op-card">
        <h2>Measurements</h2>
        {visit.measurements.length === 0 ? <p className="muted">No measurements.</p> : (
          <div className="op-scroll">
            <table className="table op-table">
              <thead><tr><th>Area</th><th>Service</th><th className="num">Size</th></tr></thead>
              <tbody>{visit.measurements.map((m, i) => <tr key={i}><td>{m.label}</td><td>{m.service || "—"}</td><td className="num">{m.unmeasured ? "Not measured" : m.squareFeet !== null ? `${m.squareFeet} sq ft` : m.linearFeet !== null ? `${m.linearFeet} ft` : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card op-card">
        <h2>Work areas</h2>
        {visit.workAreas.length === 0 ? <p className="muted">No work areas were recorded.</p> : visit.workAreas.map((w, i) => (
          <div key={i} className="op-area">
            <h3>{w.label || "Area"}{w.service ? <small className="op-sub"> · {w.service}{w.installType ? `, ${w.installType}` : ""}</small> : null}</h3>
            <div className="muted">{dims(w)}</div>
            {w.notes && <p className="op-text">{w.notes}</p>}
            {w.photos.length > 0 && (
              <div className="op-photos">
                {w.photos.map((p, j) => (
                  <a key={j} href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored file served by Convex */}
                    <img src={p.url} alt={`${w.label || "Work area"} photo ${j + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---- Files ---- */

const KIND_LABEL = { plan: "Site plan", photo: "Photo", contract: "Contract", other: "Other" } as const;
type Kind = keyof typeof KIND_LABEL;

function FilesTab({ o }: { o: Overview }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const files = useQuery(api.crm.opportunityPage.files, { id: o.id });
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  const add = useMutation(api.crm.opportunityPage.addFile);
  const remove = useMutation(api.crm.opportunityPage.removeFile);
  const picker = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("plan");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [busy, setBusy] = useState(false);

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
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
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  const shown = (files ?? []).filter((f) => filter === "all" || f.kind === filter);
  return (
    <div className="op-body one">
      <section className="card op-card">
        <div className="op-sechead">
          <h2>Files</h2>
          {canEdit && (
            <div className="op-upload">
              <select aria-label="What kind of file" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as Kind)}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input ref={picker} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => void pick(e.target.files)} />
              <button type="button" className="btn primary" disabled={busy} onClick={() => picker.current?.click()}><Icon name="upload" size={18} /> {busy ? "Uploading…" : "Add files"}</button>
            </div>
          )}
        </div>
        <div className="op-chips" role="group" aria-label="Filter files">
          {(["all", "plan", "photo", "contract", "other"] as const).map((k) => (
            <button key={k} type="button" className={`chip outline${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "all" ? "All" : KIND_LABEL[k]}</button>
          ))}
        </div>
        {files === undefined ? <div className="sk" style={{ height: 80 }} /> : shown.length === 0 ? (
          <p className="muted">{files.length === 0 ? "No files yet. Add site plans, photos and contract papers here." : "No files of that kind."}</p>
        ) : (
          <ul className="op-files">
            {shown.map((f) => (
              <li key={f.key}>
                <span className={`op-ft${f.contentType.startsWith("image/") ? " img" : ""}`}>{f.contentType.startsWith("image/") ? "IMG" : "PDF"}</span>
                <span className="op-fname">
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : f.name}
                  <small>{KIND_LABEL[f.kind]}{f.from ? ` · ${f.from}` : ""}{f.by ? ` · ${f.by}` : ""} · {quoteDate(f.at)}{size(f.size) ? ` · ${size(f.size)}` : ""}</small>
                </span>
                {canEdit && f.fileId && (
                  <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => void remove({ fileId: f.fileId! }).then(() => toast("File removed.")).catch((e) => toast(failure(e, "The file could not be removed.")))}><Icon name="trash" size={20} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="op-hint">The signed contract and a quote&apos;s attachments show here too, marked with where they came from. They stay on that quote or checklist.</p>
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
