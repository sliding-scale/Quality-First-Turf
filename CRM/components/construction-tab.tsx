"use client";

/* The Construction tab of a project in Construction (D-081, PRD 4.6), built for a phone on site: what stands between the project and
   sign-off, the punch list, progress updates with photos, job walks and installation days, the project manager and crews, and the
   customer's completion sign-off. Everything is read from `construction.get`; each action is a call that checks the person's role. */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDate, quoteDateTime } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { NoteEditor, type PendingFile } from "./note-editor";
import { ConstructionSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";
import {
  CrewsModal, FixedModal, PhotoPicker, PhotoRow, PunchModal, RequestSignoffModal, SignOnDeviceModal, VISIT_LABEL, VisitModal, useSiteUpload,
  type Site, type VisitKind,
} from "./construction-dialogs";

type Punch = Site["punch"][number];

const PUNCH_PILL = { open: "overdue", fixed: "lead", verified: "active" } as const;
const PUNCH_LABEL = { open: "Open", fixed: "Fixed", verified: "Verified" } as const;

export function ConstructionTab({ id, businessId, title }: { id: Id<"opportunities">; businessId: Id<"businesses">; title: string }) {
  const site = useQuery(api.crm.construction.get, { id });
  if (site === undefined) return <ConstructionSkeleton />;
  if (site === null) return <div className="op-body one"><section className="card op-card"><p className="muted">This project no longer exists.</p></section></div>;
  return (
    <div className="op-body one cn">
      <Status site={site} />
      <PunchList site={site} id={id} />
      <Progress site={site} id={id} />
      <Visits site={site} id={id} businessId={businessId} />
      <Team site={site} id={id} businessId={businessId} />
      <Signoff site={site} id={id} title={title} />
    </div>
  );
}

/* ---- What stands between the project and sign-off ---- */

function Status({ site }: { site: Site }) {
  const done = site.completion.ready && site.stage === "100% Completed & Sign-off";
  return (
    <div className={`op-next cn-status${done ? " done" : site.completion.ready ? "" : " wait"}`} role="status">
      {done ? "Signed off. The customer has approved the completed work." : site.completion.ready ? "Signed off by the customer." : site.completion.openRequired === 0 ? "Every required punch item is verified. When the work is done, start the customer sign-off below." : site.completion.block}
    </div>
  );
}

/* ---- Punch list ---- */

function PunchList({ site, id }: { site: Site; id: Id<"opportunities"> }) {
  const { toast } = useUI();
  const setStatus = useMutation(api.crm.construction.setPunchStatus);
  const remove = useMutation(api.crm.construction.deletePunch);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Punch | null>(null);
  const [fixing, setFixing] = useState<Punch | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const open = site.punch.filter((p) => p.status !== "verified").length;

  const act = (what: Promise<unknown>, done: string) => what.then(() => toast(done)).catch((e) => toast(failure(e, "That could not be done.")));
  return (
    <section className="card op-card" aria-labelledby="cn-punch">
      <div className="op-sechead">
        <h2 id="cn-punch">Punch list{site.punch.length > 0 && <small className="op-sub"> · {open} to do of {site.punch.length}</small>}</h2>
        {site.canWork && <button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add item</button>}
      </div>
      {site.punch.length === 0 ? <p className="muted">Nothing to correct yet. Add what needs fixing before the customer signs off.</p> : (
        <ul className="cn-list">
          {site.punch.map((p) => (
            <li key={p.id} className={`cn-item ${p.status}`}>
              <div className="cn-item-head">
                <b>{p.title}</b>
                <span className={`pill tag ${PUNCH_PILL[p.status]}`}><span className="dot" />{PUNCH_LABEL[p.status]}</span>
                {p.required ? <span className="cn-req">Required</span> : <span className="cn-opt">Optional</span>}
              </div>
              {p.details && <p className="op-text">{p.details}</p>}
              <PhotoRow files={p.files} label={`Photo of ${p.title}`} />
              {p.fixFiles.length > 0 && <><small className="cn-cap">Photos of the fix</small><PhotoRow files={p.fixFiles} label={`Fix for ${p.title}`} /></>}
              <small className="cn-meta">
                {[p.assigneeName && `Assigned to ${p.assigneeName}`, `Added by ${p.createdBy}, ${quoteDate(p.createdAt)}`, p.fixedBy && p.fixedAt && `Fixed by ${p.fixedBy}, ${quoteDate(p.fixedAt)}`, p.verifiedBy && p.verifiedAt && `Verified by ${p.verifiedBy}, ${quoteDate(p.verifiedAt)}`].filter(Boolean).join(" · ")}
              </small>
              {site.canWork && (
                <div className="cn-actions">
                  {p.status === "open" && <button type="button" className="btn primary" onClick={() => setFixing(p)}>Mark as fixed</button>}
                  {p.status === "fixed" && <button type="button" className="btn primary" onClick={() => void act(setStatus({ punchId: p.id, status: "verified", now: clock() }), "Verified.")}>Verify</button>}
                  {p.status !== "open" && <button type="button" className="btn" onClick={() => void act(setStatus({ punchId: p.id, status: "open", now: clock() }), "Reopened.")}>Reopen</button>}
                  <button type="button" className="btn" onClick={() => setEditing(p)}>Edit</button>
                  {confirming === p.id ? (
                    <>
                      <button type="button" className="btn danger" onClick={() => { setConfirming(null); void act(remove({ punchId: p.id }), "Punch item deleted."); }}>Delete for good</button>
                      <button type="button" className="btn" onClick={() => setConfirming(null)}>Keep</button>
                    </>
                  ) : <button type="button" className="btn" onClick={() => setConfirming(p.id)}>Delete</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <PunchModal site={site} projectId={id} initial={null} onClose={() => setAdding(false)} />}
      {editing && <PunchModal site={site} projectId={id} initial={editing} onClose={() => setEditing(null)} />}
      {fixing && <FixedModal punch={fixing} projectId={id} onClose={() => setFixing(null)} />}
    </section>
  );
}

/* ---- Progress ---- */

function Progress({ site, id }: { site: Site; id: Id<"opportunities"> }) {
  const { toast } = useUI();
  const add = useMutation(api.crm.construction.addProgress);
  const remove = useMutation(api.crm.construction.deleteProgress);
  const upload = useSiteUpload(id);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function post() {
    setBusy(true);
    try {
      await add({ id, text, files: await upload(photos), now: clock() });
      setText("");
      setPhotos([]);
      toast("Progress update added.");
    } catch (e) {
      toast(failure(e, "The update could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card op-card" aria-labelledby="cn-progress">
      <h2 id="cn-progress">Progress</h2>
      {site.canWork && (
        <div className="cn-compose">
          <NoteEditor id="cn-progress-text" noFiles rows={3} placeholder="What was done today?" value={text} onChange={setText} files={[]} onFiles={() => undefined} />
          <PhotoPicker files={photos} onChange={setPhotos} disabled={busy} />
          <div><button type="button" className="btn primary" disabled={busy || (!text.trim() && photos.length === 0)} onClick={() => void post()}>{busy ? "Posting…" : "Post update"}</button></div>
        </div>
      )}
      {site.progress.length === 0 ? <p className="muted">No updates yet.</p> : (
        <ul className="op-tl cn-tl">
          {site.progress.map((u) => (
            <li key={u.id}>
              <i className="note" aria-hidden="true" />
              <span>
                {u.text && <span className="op-text">{u.text}</span>}
                <PhotoRow files={u.files} label="Progress photo" />
                <small>{u.author} · {quoteDateTime(u.at)} · {u.stage}</small>
                {site.canWork && (confirming === u.id ? (
                  <span className="cn-inline">
                    <button type="button" className="btn danger" onClick={() => { setConfirming(null); void remove({ updateId: u.id }).then(() => toast("Update deleted.")).catch((e) => toast(failure(e, "The update could not be deleted."))); }}>Delete for good</button>
                    <button type="button" className="btn" onClick={() => setConfirming(null)}>Keep</button>
                  </span>
                ) : <button type="button" className="cn-link" onClick={() => setConfirming(u.id)}>Delete</button>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---- Job walks, installation days and reinspections ---- */

function Visits({ site, id, businessId }: { site: Site; id: Id<"opportunities">; businessId: Id<"businesses"> }) {
  const [booking, setBooking] = useState<VisitKind | null>(null);
  return (
    <section className="card op-card" aria-labelledby="cn-visits">
      <div className="op-sechead">
        <h2 id="cn-visits">Schedule</h2>
        {site.canWork && <button type="button" className="btn primary" onClick={() => setBooking("jobWalk")}><Icon name="calendar" size={18} /> Schedule a visit</button>}
      </div>
      {site.visits.length === 0 ? <p className="muted">No job walks, installation days or reinspections booked yet.</p> : (
        <ul className="cn-visits">
          {site.visits.map((v) => (
            <li key={v.id}>
              <span className={`cn-kind ${v.kind}`}>{VISIT_LABEL[v.kind]}</span>
              <span>{v.anytime ? `${quoteDateTime(v.start).split(",").slice(0, 2).join(",")} · Anytime` : quoteDateTime(v.start)}<small>{v.people.filter(Boolean).join(", ") || "No one assigned"}{v.status === "completed" ? " · Completed" : ""}</small></span>
            </li>
          ))}
        </ul>
      )}
      {booking && <VisitModal site={site} projectId={id} businessId={businessId} kind={booking} onClose={() => setBooking(null)} />}
    </section>
  );
}

/* ---- Project manager and crews ---- */

function Team({ site, id, businessId }: { site: Site; id: Id<"opportunities">; businessId: Id<"businesses"> }) {
  const { toast } = useUI();
  const { canEdit, assignedOnly } = useStaff();
  const setTeam = useMutation(api.crm.construction.setTeam);
  const [crewsOpen, setCrewsOpen] = useState(false);
  const crewIds = site.crews.map((c) => c.id);
  const installerIds = site.installers.map((i) => i.id);
  // Choosing who works on a project is not for someone limited to their own records (an Installer).
  const canTeam = site.canWork && !assignedOnly;

  const save = (projectManagerId: Id<"users"> | null, ids: Id<"crews">[], installers: Id<"users">[] = installerIds as Id<"users">[]) =>
    setTeam({ id, projectManagerId, crewIds: ids, installerIds: installers, now: clock() }).then(() => toast("Team saved.")).catch((e) => toast(failure(e, "The team could not be saved.")));

  return (
    <section className="card op-card" aria-labelledby="cn-team">
      <div className="op-sechead">
        <h2 id="cn-team">Team</h2>
        {canEdit && <button type="button" className="btn" onClick={() => setCrewsOpen(true)}>Manage crews</button>}
      </div>
      <dl className="op-facts">
        <div>
          <dt>Project manager</dt>
          <dd>
            {canTeam ? (
              <select aria-label="Project manager" value={site.projectManager?.id ?? ""} onChange={(e) => void save((e.target.value || null) as Id<"users"> | null, crewIds as Id<"crews">[])}>
                <option value="">Not assigned</option>
                {site.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : (site.projectManager?.name ?? "Not assigned")}
          </dd>
        </div>
        <div>
          <dt>Crews</dt>
          <dd>
            {site.crewOptions.length === 0 && site.crews.length === 0 ? <span className="muted">No crews yet.{canEdit ? " Use Manage crews to add one." : ""}</span> : (
              <div className="cn-crews">
                {site.crewOptions.map((c) => (
                  <label key={c.id} className="sc-check">
                    <input
                      type="checkbox"
                      disabled={!canTeam}
                      checked={crewIds.includes(c.id)}
                      onChange={(e) => void save((site.projectManager?.id ?? null) as Id<"users"> | null, (e.target.checked ? [...crewIds, c.id] : crewIds.filter((x) => x !== c.id)) as Id<"crews">[])}
                    /> {c.name}
                  </label>
                ))}
                {site.crews.filter((c) => !site.crewOptions.some((o) => o.id === c.id)).map((c) => <span key={c.id} className="muted">{c.name} (not active)</span>)}
              </div>
            )}
          </dd>
        </div>
        <div>
          <dt>Installers</dt>
          <dd>
            {site.installerOptions.length === 0 && site.installers.length === 0 ? <span className="muted">No installers on the team yet. Add one with the Installer role in Manage Team.</span> : (
              <div className="cn-crews">
                {site.installerOptions.map((p) => (
                  <label key={p.id} className="sc-check">
                    <input
                      type="checkbox"
                      disabled={!canTeam}
                      checked={installerIds.includes(p.id)}
                      onChange={(e) => void save((site.projectManager?.id ?? null) as Id<"users"> | null, crewIds as Id<"crews">[], (e.target.checked ? [...installerIds, p.id] : installerIds.filter((x) => x !== p.id)) as Id<"users">[])}
                    /> {p.name}
                  </label>
                ))}
                {site.installers.filter((i) => !site.installerOptions.some((o) => o.id === i.id)).map((i) => <span key={i.id} className="muted">{i.name}</span>)}
              </div>
            )}
          </dd>
        </div>
      </dl>
      {crewsOpen && <CrewsModal businessId={businessId} onClose={() => setCrewsOpen(false)} />}
    </section>
  );
}

/* ---- Completion sign-off ---- */

function Signoff({ site, id, title }: { site: Site; id: Id<"opportunities">; title: string }) {
  const { toast } = useUI();
  const cancel = useMutation(api.crm.construction.cancelSignoff);
  const [making, setMaking] = useState(false);
  const [signing, setSigning] = useState(false);
  const s = site.signoff;
  const link = (token: string) => `${window.location.origin}/signoff/${token}`;
  const done = site.punch.filter((p) => p.status === "verified").length;
  const summary = `${title}: construction complete. ${site.progress.length} progress update${site.progress.length === 1 ? "" : "s"} recorded, ${done} of ${site.punch.length} punch item${site.punch.length === 1 ? "" : "s"} resolved.`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token));
      toast("Link copied.");
    } catch {
      toast("The link could not be copied. Select it and copy it by hand.");
    }
  }

  return (
    <section className="card op-card" aria-labelledby="cn-signoff">
      <h2 id="cn-signoff">Customer sign-off</h2>
      {s === null && (
        <>
          <p className="muted">{site.completion.openRequired > 0 ? site.completion.block : "Every required punch item is verified. The customer can now sign off the completed work."}</p>
          {site.canWork && <button type="button" className="btn primary" disabled={site.completion.openRequired > 0} onClick={() => setMaking(true)}>Start sign-off</button>}
        </>
      )}
      {s?.status === "pending" && (
        <>
          <p className="op-text">{s.summary || "No summary."}</p>
          <small className="muted">Made by {s.createdBy}, {quoteDateTime(s.createdAt)}. Waiting for the customer.</small>
          {s.token && <input className="cn-link-box" readOnly aria-label="The customer's sign-off link" value={link(s.token)} onFocus={(e) => e.currentTarget.select()} />}
          {site.canWork && (
            <div className="cn-actions">
              <button type="button" className="btn primary" onClick={() => setSigning(true)}>Sign on this device</button>
              {s.token && <button type="button" className="btn" onClick={() => void copy(s.token!)}>Copy link</button>}
              <button type="button" className="btn" onClick={() => setMaking(true)}>Make a new one</button>
              <button type="button" className="btn" onClick={() => void cancel({ signoffId: s.id }).then(() => toast("Sign-off cancelled.")).catch((e) => toast(failure(e, "It could not be cancelled.")))}>Cancel</button>
            </div>
          )}
        </>
      )}
      {s?.status === "signed" && (
        <div className="cn-signed">
          <p className="op-text">{s.summary || "No summary."}</p>
          {s.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a stored file served by Convex
            <img className="cn-sig" src={s.signatureUrl} alt={`Signature of ${s.signedBy}`} />
          )}
          <small className="muted">Signed by <b>{s.signedBy}</b>, {s.signedAt ? quoteDateTime(s.signedAt) : ""}{s.signedVia === "link" ? " (through the link)" : " (on a device)"}.</small>
          <div className="cn-actions"><button type="button" className="btn" onClick={() => window.print()}><Icon name="pdf" size={18} /> Print or save PDF</button></div>
        </div>
      )}
      {making && <RequestSignoffModal projectId={id} defaultSummary={s?.summary || summary} onClose={() => setMaking(false)} onMade={() => toast("Sign-off ready.")} />}
      {signing && s && <SignOnDeviceModal signoffId={s.id} projectId={id} onClose={() => setSigning(false)} />}
    </section>
  );
}
