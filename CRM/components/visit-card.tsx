"use client";

/* One visit on the project's Visit tab (D-133): a container that opens to its date, time and team (read only), its own work areas (each one
   opening on its own, with photos), and its buttons: Save, Complete visit, and Approve and draft quote. Anyone who may only view the project
   sees the same as plain text. */

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { checkVisit, MAX_AREAS, MAX_PHOTOS, type VisitAreaInput } from "@/convex/crm/lib/visitData";
import { installTypes, services } from "@/convex/shared/discovery";
import { quoteDate } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { timeText, todayKey } from "@/lib/schedule";
import { Icon } from "./icon";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export type VisitData = NonNullable<FunctionReturnType<typeof api.crm.opportunityVisit.tab>>;
export type Visit = VisitData["visits"][number];
export type Project = { id: Id<"opportunities">; businessId: Id<"businesses">; clientId: Id<"clients">; title: string; salespersonId: Id<"users"> | null };

type Photo = { id: Id<"_storage">; url: string };
type Draft = { id: string; label: string; service: string; installType: string; length: string; width: string; quantity: string; notes: string; photos: Photo[] };

/** Digits and one decimal point, so a wrong character never lands (D-038). */
const cleanNumber = (s: string) => s.replace(/[^\d.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
const toNumber = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const text = (n: number | null) => (n === null ? "" : String(n));

const toDrafts = (v: Visit): Draft[] => v.areas.map((a) => ({ ...a, length: text(a.length), width: text(a.width), quantity: text(a.quantity) }));
const asInput = (d: Draft): VisitAreaInput => ({ id: d.id, label: d.label, service: d.service, installType: d.installType, length: toNumber(d.length), width: toNumber(d.width), quantity: toNumber(d.quantity), notes: d.notes, photoIds: d.photos.map((p) => p.id) });
const signature = (areas: Draft[]) => JSON.stringify(areas.map(asInput));

const sizeText = (d: Draft) => [d.length && d.width ? `${d.length} × ${d.width} ft` : "", d.quantity ? `${d.quantity} total` : ""].filter(Boolean).join(" · ") || "No size";

/** "Follow-up visit 1" from "Follow-up visit 1: Artificial Grass"; a title written some other way is shown as it is. */
export const visitName = (v: Visit, project: string) => (v.type === "consultation" ? "Consultation" : v.title.endsWith(`: ${project}`) ? v.title.slice(0, -(project.length + 2)) : v.title);

function stateOf(v: Visit, now: number): { label: string; cls: string } {
  if (v.status === "completed") return { label: "Completed", cls: "done" };
  if (v.status === "lost") return { label: "Lost", cls: "off" };
  if (v.end < now) return { label: "Overdue", cls: "late" };
  return v.status === "confirmed" ? { label: "Confirmed", cls: "done" } : { label: "Upcoming", cls: "next" };
}

const timeLine = (v: Visit) => (v.offline ? "Done offline" : v.anytime ? "Anytime" : `${timeText(v.start)} – ${timeText(v.end)}`);

export function VisitCard({ project, visit, data, team, open, onToggle }: {
  project: Project;
  visit: Visit;
  data: VisitData;
  /** The names of the people going, ready to show. */
  team: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { toast } = useUI();
  const { can } = useStaff();
  const router = useRouter();
  const save = useMutation(api.crm.opportunityVisit.saveSheet);
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  const [areas, setAreas] = useState<Draft[]>(() => toDrafts(visit));
  // What the server last sent. When it changes (a save, or an earlier visit this one follows) and nothing here was edited, take it.
  const server = signature(toDrafts(visit));
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    if (signature(areas) === seen) setAreas(toDrafts(visit));
  }
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "complete" | "approve" | "photo">("");
  const [now] = useState(() => Date.now());
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  // Each work area opens and closes on its own (client, 2026-11-25). They start closed; a new one starts open.
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set());
  const toggleArea = (areaId: string) => setOpenAreas((o) => { const n = new Set(o); if (n.has(areaId)) n.delete(areaId); else n.add(areaId); return n; });
  const set = (areaId: string, patch: Partial<Draft>) => setAreas((all) => all.map((a) => (a.id === areaId ? { ...a, ...patch } : a)));

  const name = visitName(visit, project.title);
  const state = stateOf(visit, now);
  const lost = visit.status === "lost";
  const done = visit.status === "completed";
  // A quote is drafted from the latest visit only (D-134). One that was lost does not count as the latest.
  const latest = data.visits.filter((v) => v.status !== "lost").at(-1)?.id === visit.id;
  const problem = checkVisit({ notes: "", areas: areas.map(asInput) });
  const bodyId = `vt-body-${visit.id}`;

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

  async function submit(action: "save" | "complete" | "approve") {
    setAttempted(true);
    if (problem) {
      setError(problem);
      // Open every area with something to fix, so the red field can be seen.
      const bad = areas.filter((a) => a.label.trim() === "" || (a.length.trim() === "") !== (a.width.trim() === "") || checkVisit({ notes: "", areas: [asInput(a)] }) !== null).map((a) => a.id);
      if (bad.length) setOpenAreas((o) => new Set([...o, ...bad]));
      return;
    }
    setBusy(action);
    setError("");
    try {
      await save({ id: project.id, eventId: visit.id, areas: areas.map(asInput), complete: action === "complete", approve: action === "approve", now: clock() });
      if (action === "approve") {
        // The new quote starts from the areas just approved; nothing is created until the quote is saved.
        router.push(`/quotes/new?clientId=${project.clientId}&projectId=${project.id}`);
        return;
      }
      toast(action === "complete" ? `${name} completed.` : `${name} saved.`);
      setBusy("");
    } catch (err) {
      setError(failure(err, "The visit could not be saved. Try again."));
      setBusy("");
    }
  }

  const addArea = () => {
    const nid = newId();
    setAreas((all) => [...all, { id: nid, label: "", service: "", installType: "", length: "", width: "", quantity: "", notes: "", photos: [] }]);
    setOpenAreas((o) => new Set([...o, nid]));
  };

  return (
    <section className={`card vt-visit${open ? " open" : ""}`} aria-label={name}>
      <h2 className="vt-h">
        <button type="button" className="vt-visithead" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="vt-visittitle">
            <b>{name}</b>
            <small>{[quoteDate(visit.start), timeLine(visit), `${areas.length} work area${areas.length === 1 ? "" : "s"}`].join(" · ")}</small>
          </span>
          <span className={`vt-state ${state.cls}`}>{state.label}</span>
          <Icon name="chevdown" size={20} className="vz-chev vt-chev" />
        </button>
      </h2>
      <div className="vt-visitbody" id={bodyId}>
        <div className="vt-visitinner">
          <div className="vt-meet">
            <dl className="vt-facts">
              <div><dt>Date</dt><dd>{quoteDate(visit.start)}</dd></div>
              <div><dt>Time</dt><dd>{timeLine(visit)}</dd></div>
              <div><dt>Team</dt><dd>{team || "Unassigned"}</dd></div>
              {visit.bookingNotes && <div className="wide"><dt>Notes</dt><dd className="op-text">{visit.bookingNotes}</dd></div>}
            </dl>
            {can("schedule") && <Link className="vt-open" href={`/schedule?view=day&date=${todayKey(visit.start)}&open=${encodeURIComponent(`${visit.id}:0`)}`}>Open on the Schedule</Link>}
          </div>

          {areas.length === 0 && <p className="muted vt-none">No work areas yet. Add one for each part of the property being worked on.</p>}
          {areas.map((a, i) => {
            const label = a.label.trim() || `Work area ${i + 1}`;
            if (!data.canEdit) {
              return (
                <div key={a.id} className="op-area">
                  <h3>{label}{a.service ? <small className="op-sub"> · {a.service}{a.installType ? `, ${a.installType}` : ""}</small> : null}</h3>
                  <div className="muted">{sizeText(a)}</div>
                  {a.notes && <p className="op-text">{a.notes}</p>}
                  {a.photos.length > 0 && <div className="op-photos">{a.photos.map((p, j) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><Image src={p.url} alt={`${label} photo ${j + 1}`} width={280} height={210} unoptimized /></a>)}</div>}
                </div>
              );
            }
            const types = installTypes[a.service] ?? [];
            const badLabel = attempted && a.label.trim() === "";
            const badPair = attempted && (a.length.trim() === "") !== (a.width.trim() === "");
            const areaId = `${visit.id}-${a.id}`;
            return (
              <div key={a.id} className={`vz-area${openAreas.has(a.id) ? " open" : ""}`}>
                <button type="button" className="vz-areahead" aria-expanded={openAreas.has(a.id)} aria-controls={`vz-body-${areaId}`} onClick={() => toggleArea(a.id)}>
                  <span className="vz-areatitle">
                    <b>{label}</b>
                    <small>{[a.service ? `${a.service}${a.installType ? `, ${a.installType}` : ""}` : "", sizeText(a), a.photos.length ? `${a.photos.length} photo${a.photos.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <Icon name="chevdown" size={20} className="vz-chev" />
                </button>
                <div className="vz-areabody" id={`vz-body-${areaId}`}>
                  <div className="vz-areainner">
                    <div className={`vz-row${badLabel ? " bad" : ""}`}>
                      <label className="vz-field grow">
                        <span>Name</span>
                        <input value={a.label} maxLength={80} placeholder={`Work area ${i + 1}, such as Front lawn`} aria-invalid={badLabel} onChange={(e) => set(a.id, { label: e.target.value })} />
                      </label>
                      <button type="button" className="btn plain small" aria-label={`Remove ${label}`} onClick={() => setAreas((all) => all.filter((x) => x.id !== a.id))}>Remove</button>
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
                          <Image src={p.url} alt={`${label} photo ${j + 1}`} width={120} height={90} unoptimized />
                          <button type="button" aria-label="Remove this photo" onClick={() => set(a.id, { photos: a.photos.filter((x) => x.id !== p.id) })}><Icon name="x" size={14} /></button>
                        </span>
                      ))}
                      <button type="button" className="vz-add" disabled={busy !== "" || a.photos.length >= MAX_PHOTOS} onClick={() => pickers.current[a.id]?.click()}>
                        <Icon name="image" size={22} /><span>{busy === "photo" ? "Uploading…" : "Add photos"}</span>
                      </button>
                      <input ref={(el) => { pickers.current[a.id] = el; }} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(a.id, e.target.files)} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {data.canEdit && (
            <button type="button" className="linkbtn vt-addarea" disabled={areas.length >= MAX_AREAS || busy !== ""} onClick={addArea}>
              <Icon name="plus" size={16} /> Add work area
            </button>
          )}

          {data.addOns.length > 0 && (
            <div className={`vz-area${openAreas.has("__addons") ? " open" : ""}`}>
              <button type="button" className="vz-areahead" aria-expanded={openAreas.has("__addons")} aria-controls={`vz-addons-${visit.id}`} onClick={() => toggleArea("__addons")}>
                <span className="vz-areatitle"><b>Add-ons</b><small>{data.addOns.length} from the customer form</small></span>
                <Icon name="chevdown" size={20} className="vz-chev" />
              </button>
              <div className="vz-areabody" id={`vz-addons-${visit.id}`}>
                <div className="vz-areainner"><ul className="vz-addonlist">{data.addOns.map((x) => <li key={x}>{x}</li>)}</ul></div>
              </div>
            </div>
          )}
          {data.products.length > 0 && <p className="vz-meta"><span>Products</span> {data.products.join(", ")}</p>}

          {error && <div className="form-error" role="alert">{error}</div>}
          {data.canEdit && (
            <div className="vt-actions">
              {visit.completedAt && <span className="vt-donenote"><Icon name="check" size={16} /> Completed {quoteDate(visit.completedAt)}</span>}
              <button type="button" className="btn plain" disabled={busy !== ""} onClick={() => void submit("save")}>{busy === "save" ? "Saving…" : "Save"}</button>
              {!done && !lost && <button type="button" className="btn" disabled={busy !== ""} onClick={() => void submit("complete")}>{busy === "complete" ? "Completing…" : "Complete visit"}</button>}
              {latest && (
                <button type="button" className="btn primary" disabled={busy !== ""} aria-disabled={!data.canQuote || undefined} onClick={() => (data.canQuote ? void submit("approve") : toast("Your role cannot make quotes."))}>
                  <Icon name="quote" size={18} /> {busy === "approve" ? "Approving…" : "Approve and draft quote"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
