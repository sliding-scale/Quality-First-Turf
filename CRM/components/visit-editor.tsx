"use client";

/* The Visit tab's work areas and photos (D-114): a salesperson records each area's service, size, notes and photos on the project, from a
   phone or a desk, and saves it or completes the visit. A project made from the customer form starts from that form's work areas.
   Anyone who may only view the project sees the same areas as plain text. */

import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { checkVisit, MAX_AREAS, MAX_PHOTOS, type VisitAreaInput } from "@/convex/crm/lib/visitData";
import { installTypes, services } from "@/convex/shared/discovery";
import { quoteDate } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { Sk } from "./skeletons";
import { useUI } from "./ui-provider";

type Photo = { id: Id<"_storage">; url: string };
type Draft = { id: string; label: string; service: string; installType: string; length: string; width: string; quantity: string; notes: string; photos: Photo[] };
type Visit = NonNullable<ReturnType<typeof useVisit>>;

const useVisit = (id: Id<"opportunities">) => useQuery(api.crm.opportunityVisit.get, { id });

/** Digits and one decimal point, so a wrong character never lands (D-038). */
const cleanNumber = (s: string) => s.replace(/[^\d.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
const toNumber = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const fromVisit = (v: Visit): Draft[] =>
  v.areas.map((a) => ({ id: a.id, label: a.label, service: a.service, installType: a.installType, length: a.length === null ? "" : String(a.length), width: a.width === null ? "" : String(a.width), quantity: a.quantity === null ? "" : String(a.quantity), notes: a.notes, photos: a.photos }));

const asInput = (d: Draft): VisitAreaInput => ({ id: d.id, label: d.label, service: d.service, installType: d.installType, length: toNumber(d.length), width: toNumber(d.width), quantity: toNumber(d.quantity), notes: d.notes, photoIds: d.photos.map((p) => p.id) });

const sizeText = (d: Draft) => [d.length && d.width ? `${d.length} × ${d.width} ft` : "", d.quantity ? `${d.quantity} total` : ""].filter(Boolean).join(" · ") || "No size";

export function VisitEditor({ id }: { id: Id<"opportunities"> }) {
  const visit = useVisit(id);
  if (visit === undefined) return <VisitEditorSkeleton />;
  // Starts again from the saved visit after a save, so what is shown is what was stored.
  return <Editor key={`${visit.source}-${visit.visitedAt ?? 0}-${visit.areas.length}`} id={id} visit={visit} />;
}

function VisitEditorSkeleton() {
  return (
    <section className="card op-card" role="status" aria-busy="true">
      <span className="sr">Loading…</span>
      <h2>Work areas</h2>
      {[0, 1].map((n) => <div key={n} className="vz-area"><Sk w="40%" h={20} /><Sk w="100%" h={44} style={{ marginTop: 10 }} /><Sk w="100%" h={44} style={{ marginTop: 10 }} /></div>)}
    </section>
  );
}

function Editor({ id, visit }: { id: Id<"opportunities">; visit: Visit }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.opportunityVisit.save);
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  const [areas, setAreas] = useState<Draft[]>(() => fromVisit(visit));
  const [notes, setNotes] = useState(visit.notes);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "complete" | "photo">("");
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  const set = (areaId: string, patch: Partial<Draft>) => setAreas((all) => all.map((a) => (a.id === areaId ? { ...a, ...patch } : a)));

  const problem = checkVisit({ notes, areas: areas.map(asInput) });

  async function addPhotos(areaId: string, list: FileList | null) {
    if (!list || list.length === 0) return;
    const current = areas.find((a) => a.id === areaId);
    if (!current) return;
    if (current.photos.length + list.length > MAX_PHOTOS) { setError(`A work area can have up to ${MAX_PHOTOS} photos.`); return; }
    setBusy("photo");
    setError("");
    try {
      const added: Photo[] = [];
      for (const f of Array.from(list)) {
        if (!f.type.startsWith("image/")) throw new Error("A photo has to be an image.");
        const url = await makeUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
        if (!res.ok) throw new Error("A photo could not be uploaded.");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        added.push({ id: storageId, url: URL.createObjectURL(f) });
      }
      setAreas((all) => all.map((a) => (a.id === areaId ? { ...a, photos: [...a.photos, ...added] } : a)));
    } catch (e) {
      setError(failure(e, e instanceof Error ? e.message : "A photo could not be added."));
    } finally {
      setBusy("");
      const input = pickers.current[areaId];
      if (input) input.value = "";
    }
  }

  async function submit(e: FormEvent | null, complete: boolean) {
    e?.preventDefault();
    setAttempted(true);
    if (problem) { setError(problem); return; }
    setBusy(complete ? "complete" : "save");
    setError("");
    try {
      await save({ id, notes, areas: areas.map(asInput), complete, now: clock() });
      toast(complete ? "Visit completed." : "Visit saved.");
    } catch (err) {
      setError(failure(err, "The visit could not be saved. Try again."));
      setBusy("");
    }
  }

  if (!visit.canEdit) {
    return (
      <section className="card op-card">
        <h2>Work areas</h2>
        {areas.length === 0 ? <p className="muted">No work areas were recorded.</p> : areas.map((a) => (
          <div key={a.id} className="op-area">
            <h3>{a.label}{a.service ? <small className="op-sub"> · {a.service}{a.installType ? `, ${a.installType}` : ""}</small> : null}</h3>
            <div className="muted">{sizeText(a)}</div>
            {a.notes && <p className="op-text">{a.notes}</p>}
            {a.photos.length > 0 && <div className="op-photos">{a.photos.map((p, j) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><Image src={p.url} alt={`${a.label} photo ${j + 1}`} width={280} height={210} unoptimized /></a>)}</div>}
          </div>
        ))}
      </section>
    );
  }

  return (
    <form className="vz" onSubmit={(e) => void submit(e, false)} noValidate>
      <section className="card op-card">
        <div className="op-sechead">
          <h2>Work areas{visit.visitedAt ? <small className="op-sub"> · visit completed {quoteDate(visit.visitedAt)}</small> : null}</h2>
          <button type="button" className="btn small" disabled={areas.length >= MAX_AREAS || busy !== ""} onClick={() => setAreas((all) => [...all, { id: newId(), label: "", service: "", installType: "", length: "", width: "", quantity: "", notes: "", photos: [] }])}>
            <Icon name="plus" size={16} /> Add work area
          </button>
        </div>
        {visit.source === "form" && visit.areas.length > 0 && <p className="muted">These come from the customer form. Saving keeps them here, on the project.</p>}
        {areas.length === 0 && <p className="muted">No work areas yet. Add one for each part of the property being worked on.</p>}
        {areas.map((a, i) => {
          const types = installTypes[a.service] ?? [];
          const badLabel = attempted && a.label.trim() === "";
          const badPair = attempted && (a.length.trim() === "") !== (a.width.trim() === "");
          return (
            <div key={a.id} className="vz-area">
              <div className={`vz-row${badLabel ? " bad" : ""}`}>
                <label className="vz-field grow">
                  <span>Name</span>
                  <input value={a.label} maxLength={80} placeholder={`Work area ${i + 1}, such as Front lawn`} aria-invalid={badLabel} onChange={(e) => set(a.id, { label: e.target.value })} />
                </label>
                <button type="button" className="btn plain small" aria-label={`Remove ${a.label || `work area ${i + 1}`}`} onClick={() => setAreas((all) => all.filter((x) => x.id !== a.id))}>Remove</button>
              </div>
              {badLabel && <div className="vz-err" role="alert">Give this work area a name.</div>}
              <div className="vz-row">
                <label className="vz-field grow">
                  <span>Service</span>
                  <select value={a.service} onChange={(e) => set(a.id, { service: e.target.value, installType: "" })}>
                    <option value="">Not chosen</option>
                    {services.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                {types.length > 0 && (
                  <label className="vz-field grow">
                    <span>Installation type</span>
                    <select value={a.installType} onChange={(e) => set(a.id, { installType: e.target.value })}>
                      <option value="">Not chosen</option>
                      {types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className={`vz-row${badPair ? " bad" : ""}`}>
                <label className="vz-field"><span>Length (ft)</span><input inputMode="decimal" value={a.length} aria-invalid={badPair} onChange={(e) => set(a.id, { length: cleanNumber(e.target.value) })} /></label>
                <label className="vz-field"><span>Width (ft)</span><input inputMode="decimal" value={a.width} aria-invalid={badPair} onChange={(e) => set(a.id, { width: cleanNumber(e.target.value) })} /></label>
                <label className="vz-field"><span>Or total</span><input inputMode="decimal" value={a.quantity} placeholder="sq ft or count" onChange={(e) => set(a.id, { quantity: cleanNumber(e.target.value) })} /></label>
              </div>
              {badPair && <div className="vz-err" role="alert">Enter both length and width, or neither.</div>}
              <label className="vz-field">
                <span>Notes</span>
                <textarea rows={2} value={a.notes} maxLength={2000} onChange={(e) => set(a.id, { notes: e.target.value })} />
              </label>
              <div className="vz-photos">
                {a.photos.map((p, j) => (
                  <span key={p.id} className="vz-photo">
                    <Image src={p.url} alt={`${a.label || "Work area"} photo ${j + 1}`} width={120} height={90} unoptimized />
                    <button type="button" aria-label="Remove this photo" onClick={() => set(a.id, { photos: a.photos.filter((x) => x.id !== p.id) })}><Icon name="x" size={14} /></button>
                  </span>
                ))}
                <button type="button" className="vz-add" disabled={busy !== "" || a.photos.length >= MAX_PHOTOS} onClick={() => pickers.current[a.id]?.click()}>
                  <Icon name="image" size={22} /><span>{busy === "photo" ? "Uploading…" : "Add photos"}</span>
                </button>
                <input ref={(el) => { pickers.current[a.id] = el; }} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(a.id, e.target.files)} />
              </div>
            </div>
          );
        })}
      </section>
      <section className="card op-card">
        <h2>Visit notes</h2>
        <label className="vz-field">
          <span className="sr">Visit notes</span>
          <textarea rows={4} value={notes} maxLength={3000} placeholder="Gate codes, access, pets, anything the crew should know" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="vz-actions">
        <button type="submit" className="btn" disabled={busy !== ""}>{busy === "save" ? "Saving…" : "Save"}</button>
        <button type="button" className="btn primary" disabled={busy !== ""} onClick={() => void submit(null, true)}>{busy === "complete" ? "Completing…" : "Complete visit"}</button>
      </div>
    </form>
  );
}
