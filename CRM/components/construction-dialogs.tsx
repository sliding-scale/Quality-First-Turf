"use client";

/* The pop-ups of a project's Construction tab (D-081): crews, a visit, a punch item, marking one fixed, and the customer's sign-off.
   Photos go through `construction.uploadUrl`, which Project Managers may use (the note uploader is for editing roles only). */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { cleanName, formatPhone } from "@/lib/fields";
import { clock, failure } from "@/lib/pipeline";
import { VISIT_LABEL, fromInputs, todayKey, type VisitKind } from "@/lib/schedule";
import { Icon } from "./icon";
import type { PendingFile } from "./note-editor";
import { PipelineModal } from "./pipeline-dialogs";
import { SignaturePad } from "./signature-pad";
import { useUI } from "./ui-provider";

export type Site = NonNullable<FunctionReturnType<typeof api.crm.construction.get>>;
export { VISIT_LABEL, type VisitKind };
const MAX_PHOTOS = 10;

/* ---- Photos ---- */

/** Sends the chosen photos to storage and returns what the construction functions take. */
export function useSiteUpload(id: Id<"opportunities">) {
  const makeUrl = useMutation(api.crm.construction.uploadUrl);
  return async (files: PendingFile[]) => {
    const out: { storageId: Id<"_storage">; name: string }[] = [];
    for (const f of files) {
      const res = await fetch(await makeUrl({ id }), { method: "POST", headers: { "Content-Type": f.blob.type || "application/octet-stream" }, body: f.blob });
      if (!res.ok) throw new Error("A photo could not be uploaded.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      out.push({ storageId, name: f.name });
    }
    return out;
  };
}

/** Add photos (the camera on a phone, or files), shown as small previews that can be taken off again. */
export function PhotoPicker({ files, onChange, disabled }: { files: PendingFile[]; onChange: (next: PendingFile[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  function add(list: FileList | null) {
    if (!list) return;
    const added = Array.from(list).filter((b) => b.type.startsWith("image/")).map((blob, i): PendingFile => ({ id: `${Date.now()}-${i}`, kind: "image", blob, name: blob.name, url: URL.createObjectURL(blob) }));
    onChange([...files, ...added].slice(0, MAX_PHOTOS));
    if (input.current) input.current.value = "";
  }
  return (
    <div className="cn-photos">
      {files.map((f) => (
        <figure key={f.id}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a photo that has not been uploaded yet */}
          <img src={f.url} alt={f.name} />
          <button type="button" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => { URL.revokeObjectURL(f.url); onChange(files.filter((x) => x.id !== f.id)); }}><Icon name="x" size={16} /></button>
        </figure>
      ))}
      {files.length < MAX_PHOTOS && (
        <>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="button" className="cn-add-photo" disabled={disabled} onClick={() => input.current?.click()}><Icon name="upload" size={20} /> Add photos</button>
        </>
      )}
    </div>
  );
}

/** A row of photos from the server, each opening full size. */
export function PhotoRow({ files, label }: { files: { kind: string; name: string; url: string }[]; label: string }) {
  const photos = files.filter((f) => f.kind === "image");
  if (photos.length === 0) return null;
  return (
    <div className="op-photos cn-row">
      {photos.map((p, i) => (
        <a key={i} href={p.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored file served by Convex */}
          <img src={p.url} alt={`${label} ${i + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/* ---- Crews ---- */

export function CrewsModal({ businessId, onClose }: { businessId: Id<"businesses">; onClose: () => void }) {
  const crews = useQuery(api.crm.construction.crews, { businessId });
  const save = useMutation(api.crm.construction.saveCrew);
  const { toast } = useUI();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState("");
  const [rate, setRate] = useState("");
  const [bad, setBad] = useState(false);
  const [badRate, setBadRate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRates = crews?.[0]?.canSeeRates ?? false;

  function open(c: NonNullable<typeof crews>[number] | null) {
    setEditing(c ? c.id : "new");
    setName(c?.name ?? "");
    setLead(c?.leadName ?? "");
    setPhone(c?.phone ?? "");
    setNotes(c?.notes ?? "");
    setAvailability(c?.availability ?? "");
    setRate(c?.rateCents != null ? (c.rateCents / 100).toFixed(2) : "");
    setBad(false);
    setBadRate(false);
    setError("");
  }
  async function submit(active: boolean, id?: Id<"crews">) {
    if (!name.trim()) { setBad(true); document.getElementById("cr-name")?.focus(); return; }
    const rateCents = rate.trim() === "" ? undefined : centsFromText(rate);
    if (rateCents === null) { setBadRate(true); document.getElementById("cr-rate")?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      await save({ businessId, ...(id ? { id } : {}), name, leadName: lead, phone, notes, active, availability, rateCents, now: clock() });
      toast("Crew saved.");
      setEditing(null);
    } catch (e) {
      setError(failure(e, "The crew could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="Crews" onClose={onClose} busy={busy}>
      {(close) => (
        <div className="cn-modal">
          {editing === null ? (
            <>
              {crews === undefined ? <div className="sk" style={{ height: 60 }} /> : crews.length === 0 ? <p className="muted">No crews yet.</p> : (
                <ul className="cn-crewlist">
                  {crews.map((c) => (
                    <li key={c.id} className={c.active ? undefined : "off"}>
                      <span><b>{c.name}</b>{!c.active && <small> · Not active</small>}<small>{[c.leadName && `Lead: ${c.leadName}`, c.phone].filter(Boolean).join(" · ")}</small></span>
                      <button type="button" className="btn" onClick={() => open(c)}>Edit</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="as-bar">
                <button type="button" className="btn" onClick={close}>Done</button>
                <button type="button" className="btn primary" onClick={() => open(null)}>Add crew</button>
              </div>
            </>
          ) : (
            <form noValidate className="as-form" onSubmit={(e) => { e.preventDefault(); const c = crews?.find((x) => x.id === editing); void submit(c ? c.active : true, c?.id as Id<"crews"> | undefined); }}>
              <div className={`field${bad ? " bad" : ""}`}>
                <label htmlFor="cr-name">Crew name</label>
                <input id="cr-name" aria-invalid={bad} maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setBad(false); }} />
                <span className="err">Give the crew a name.</span>
              </div>
              <div className="as-row two">
                <div className="field"><label htmlFor="cr-lead">Crew lead</label><input id="cr-lead" maxLength={100} value={lead} onChange={(e) => setLead(cleanName(e.target.value))} /></div>
                <div className="field"><label htmlFor="cr-phone">Phone</label><input id="cr-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} /></div>
              </div>
              <div className="as-row two">
                <div className="field"><label htmlFor="cr-avail">Availability</label><input id="cr-avail" maxLength={500} placeholder="Mon to Fri, not in August" value={availability} onChange={(e) => setAvailability(e.target.value)} /></div>
                {canRates && (
                  <div className={`field${badRate ? " bad" : ""}`}><label htmlFor="cr-rate">Agreed rate ($ per hour)</label><input id="cr-rate" inputMode="decimal" aria-invalid={badRate} value={rate} onChange={(e) => { setRate(e.target.value.replace(/[^\d.]/g, "")); setBadRate(false); }} /><span className="err">Enter an amount such as 65.00.</span></div>
                )}
              </div>
              <div className="field"><label htmlFor="cr-notes">Notes</label><textarea id="cr-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              {error && <p className="modal-error" role="alert">{error}</p>}
              <div className="as-bar">
                {crews?.find((x) => x.id === editing) && (
                  <button type="button" className="btn" disabled={busy} onClick={() => { const c = crews!.find((x) => x.id === editing)!; void submit(!c.active, c.id as Id<"crews">); }}>
                    {crews.find((x) => x.id === editing)!.active ? "Make not active" : "Make active"}
                  </button>
                )}
                <button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Back</button>
                <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </PipelineModal>
  );
}

/* ---- A visit: job walk, installation day or reinspection ---- */

const LENGTHS = ["0.5", "1", "1.5", "2", "3", "4", "6", "8", "10"];
const lengthLabel = (h: string) => (Number(h) < 1 ? "30 minutes" : Number(h) === 1 ? "1 hour" : `${h} hours`);

export function VisitModal({ site, projectId, businessId, kind, onClose }: { site: Site; projectId: Id<"opportunities">; businessId: Id<"businesses">; kind: VisitKind; onClose: () => void }) {
  const book = useMutation(api.crm.schedule.book);
  const { toast } = useUI();
  const [what, setWhat] = useState<VisitKind>(kind);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(kind === "install" ? "08:00" : "10:00");
  const [length, setLength] = useState(kind === "install" ? "8" : "1");
  const [anytime, setAnytime] = useState(false);
  const [team, setTeam] = useState<string[]>(site.projectManager ? [site.projectManager.id] : []);
  const [notes, setNotes] = useState("");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(close: () => void) {
    const next: Record<string, boolean> = {};
    if (!date) next.date = true;
    if (!anytime && !time) next.time = true;
    setBad(next);
    if (Object.keys(next).length) { document.getElementById(next.date ? "vs-date" : "vs-time")?.focus(); return; }
    const start = anytime ? fromInputs(date, "00:00") : fromInputs(date, time);
    const end = anytime ? start + 86_400_000 : start + Number(length) * 3_600_000;
    setBusy(true);
    setError("");
    try {
      await book({ businessId, type: "visit", visitKind: what, title: VISIT_LABEL[what], start, end, anytime, assigneeIds: team as Id<"users">[], opportunityId: projectId, notes: notes.trim(), now: clock() });
      toast(`${VISIT_LABEL[what]} scheduled.`);
      close();
    } catch (e) {
      setError(failure(e, "The visit could not be scheduled."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="Schedule a visit" onClose={onClose} busy={busy}>
      {(close) => (
        <form className="as-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(close); }}>
          <div className="field">
            <label htmlFor="vs-kind">What</label>
            <select id="vs-kind" value={what} onChange={(e) => setWhat(e.target.value as VisitKind)}>
              {(Object.keys(VISIT_LABEL) as VisitKind[]).map((k) => <option key={k} value={k}>{VISIT_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="as-row">
            <div className={`field${bad.date ? " bad" : ""}`}>
              <label htmlFor="vs-date">Date</label>
              <input id="vs-date" type="date" min={todayKey(clock())} aria-invalid={!!bad.date} value={date} onChange={(e) => { setDate(e.target.value); setBad((b) => ({ ...b, date: false })); }} />
              <span className="err">Pick a date.</span>
            </div>
            {!anytime && (
              <>
                <div className={`field${bad.time ? " bad" : ""}`}>
                  <label htmlFor="vs-time">Start time</label>
                  <input id="vs-time" type="time" aria-invalid={!!bad.time} value={time} onChange={(e) => { setTime(e.target.value); setBad((b) => ({ ...b, time: false })); }} />
                  <span className="err">Pick a time.</span>
                </div>
                <div className="field">
                  <label htmlFor="vs-length">Length</label>
                  <select id="vs-length" value={length} onChange={(e) => setLength(e.target.value)}>{LENGTHS.map((h) => <option key={h} value={h}>{lengthLabel(h)}</option>)}</select>
                </div>
              </>
            )}
          </div>
          <label className="sc-check"><input type="checkbox" checked={anytime} onChange={(e) => setAnytime(e.target.checked)} /> Anytime that day</label>
          <fieldset className="as-team">
            <legend>Team</legend>
            {site.people.map((p) => (
              <label key={p.id} className="sc-check"><input type="checkbox" checked={team.includes(p.id)} onChange={(e) => setTeam(e.target.checked ? [...team, p.id] : team.filter((t) => t !== p.id))} /> {p.name}</label>
            ))}
          </fieldset>
          <div className="field"><label htmlFor="vs-notes">Instructions</label><textarea id="vs-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="as-bar">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Schedule"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/* ---- A punch item ---- */

type Punch = Site["punch"][number];

export function PunchModal({ site, projectId, initial, onClose }: { site: Site; projectId: Id<"opportunities">; initial: Punch | null; onClose: () => void }) {
  const add = useMutation(api.crm.construction.addPunch);
  const update = useMutation(api.crm.construction.updatePunch);
  const upload = useSiteUpload(projectId);
  const { toast } = useUI();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [required, setRequired] = useState(initial?.required ?? true);
  const [who, setWho] = useState(initial?.assigneeUserId ? `u:${initial.assigneeUserId}` : initial?.assigneeCrewId ? `c:${initial.assigneeCrewId}` : "");
  const [photos, setPhotos] = useState<PendingFile[]>([]);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(close: () => void) {
    if (!title.trim()) { setBad(true); document.getElementById("pn-title")?.focus(); return; }
    setBusy(true);
    setError("");
    const assigneeUserId = who.startsWith("u:") ? (who.slice(2) as Id<"users">) : null;
    const assigneeCrewId = who.startsWith("c:") ? (who.slice(2) as Id<"crews">) : null;
    try {
      if (initial) await update({ punchId: initial.id, title, details, required, assigneeUserId, assigneeCrewId, now: clock() });
      else await add({ id: projectId, title, details, required, assigneeUserId, assigneeCrewId, files: await upload(photos), now: clock() });
      toast(initial ? "Punch item saved." : "Punch item added.");
      close();
    } catch (e) {
      setError(failure(e, "The punch item could not be saved."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={initial ? "Edit punch item" : "Add punch item"} onClose={onClose} busy={busy}>
      {(close) => (
        <form className="as-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(close); }}>
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="pn-title">What needs fixing</label>
            <input id="pn-title" aria-invalid={bad} maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); setBad(false); }} />
            <span className="err">Say what needs fixing.</span>
          </div>
          <div className="field"><label htmlFor="pn-details">Details</label><textarea id="pn-details" rows={3} maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="pn-who">Assigned to</label>
            <select id="pn-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">No one yet</option>
              <optgroup label="People">{site.people.map((p) => <option key={p.id} value={`u:${p.id}`}>{p.name}</option>)}</optgroup>
              {site.crewOptions.length > 0 && <optgroup label="Crews">{site.crewOptions.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
            </select>
          </div>
          <label className="sc-check"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required before the customer signs off</label>
          {!initial && <div className="field"><label>Photos</label><PhotoPicker files={photos} onChange={setPhotos} disabled={busy} /></div>}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="as-bar">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/** Marking an item fixed, with optional photos of the fix. */
export function FixedModal({ punch, projectId, onClose }: { punch: Punch; projectId: Id<"opportunities">; onClose: () => void }) {
  const setStatus = useMutation(api.crm.construction.setPunchStatus);
  const upload = useSiteUpload(projectId);
  const { toast } = useUI();
  const [photos, setPhotos] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Mark as fixed" onClose={onClose} busy={busy}>
      {(close) => (
        <div className="cn-modal">
          <p className="modal-lead"><b>{punch.title}</b><br />Add photos of the fix if you have them.</p>
          <PhotoPicker files={photos} onChange={setPhotos} disabled={busy} />
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="as-bar">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await setStatus({ punchId: punch.id, status: "fixed", files: await upload(photos), now: clock() });
                  toast("Marked as fixed.");
                  close();
                } catch (e) {
                  setError(failure(e, "The item could not be updated."));
                  setBusy(false);
                }
              }}
            >{busy ? "Saving…" : "Mark as fixed"}</button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}

/* ---- Completion sign-off ---- */

/** Starts the customer's sign-off: a summary of the work, kept with the punch list as it is now. */
export function RequestSignoffModal({ projectId, defaultSummary, onClose, onMade }: { projectId: Id<"opportunities">; defaultSummary: string; onClose: () => void; onMade: (token: string) => void }) {
  const request = useMutation(api.crm.construction.requestSignoff);
  const [summary, setSummary] = useState(defaultSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Customer sign-off" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          className="as-form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const made = await request({ id: projectId, summary, now: clock() });
              onMade(made.token);
              close();
            } catch (err) {
              setError(failure(err, "The sign-off could not be made."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">The customer reads this summary and the punch list, then signs. They can sign on this device or from a link you send them.</p>
          <div className="field"><label htmlFor="so-summary">Summary of the work</label><textarea id="so-summary" rows={6} maxLength={5000} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="as-bar">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Create sign-off"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/** The customer signs on this device. */
export function SignOnDeviceModal({ signoffId, projectId, onClose }: { signoffId: Id<"signoffs">; projectId: Id<"opportunities">; onClose: () => void }) {
  const makeUrl = useMutation(api.crm.construction.uploadUrl);
  const sign = useMutation(api.crm.construction.signOnDevice);
  const { toast } = useUI();
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [bad, setBad] = useState<{ name?: boolean; sig?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Customer sign-off" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const next = { name: !name.trim(), sig: !png };
            setBad(next);
            if (next.name || next.sig) return;
            setBusy(true);
            setError("");
            try {
              const res = await fetch(await makeUrl({ id: projectId }), { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
              if (!res.ok) throw new Error("The signature could not be uploaded.");
              const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
              await sign({ signoffId, signedBy: name, signatureStorageId: storageId, now: clock() });
              toast("Signed off. The project is complete.");
              close();
            } catch (err) {
              setError(failure(err, "The signature could not be saved. Try again."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">Hand the device to the customer. By signing they confirm the work is complete and the punch list is done.</p>
          <div className={`field${bad.name ? " bad" : ""}`}>
            <label htmlFor="sd-name">Name of the person signing</label>
            <input id="sd-name" aria-invalid={!!bad.name} value={name} maxLength={100} onChange={(e) => { setName(cleanName(e.target.value)); setBad((b) => ({ ...b, name: false })); }} />
            <span className="err">Type the name of the person signing.</span>
          </div>
          <div className={`field${bad.sig ? " bad" : ""}`} style={{ marginTop: 12 }}>
            <label>Signature</label>
            <SignaturePad onChange={(b) => { setPng(b); setBad((x) => ({ ...x, sig: false })); }} />
            <span className="err">Sign in the box.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save signature"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

