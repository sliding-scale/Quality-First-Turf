"use client";

/* One request (D-039), laid out like Jobber's request page: status, "Title · CODE", the client's card beside a table of facts (source,
   requested, salesperson, assessment). The pencil opens the facts for editing: Jobber's Salesperson dropdown with Cancel and Save. It
   writes through crm/pipeline:setSalesperson, the same mutation as the Pipeline card, so the board and this page always agree.
   Below: Overview, the On-site assessment (a consultation on the Schedule, so it is booked and changed through crm/schedule), and
   Product / Service lines (crm/requests:setLines). Notes sit in a column on the right, as in Jobber. */

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock } from "@/lib/pipeline";
import { failure, usePeople, useRequest } from "@/lib/requests";
import { quoteDate, quoteDateTime } from "@/lib/format";
import { Icon } from "./icon";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NoteBody } from "./note-view";
import { AssessmentModal, whenLabel, type AssessmentDraft } from "./request-assessment";
import { RequestLinesEditor, RequestLinesView, checkRequestLines, newRequestLine, toRequestLines, type RequestLine } from "./request-lines";
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
  return <RequestView key={request.id} r={request} />;
}

type Request = NonNullable<ReturnType<typeof useRequest>>;

function RequestView({ r }: { r: Request }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const people = usePeople(r.businessId);
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const restore = useMutation(api.crm.automations.restoreRequest);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string>(UNASSIGNED);
  const [saving, setSaving] = useState(false);

  const book = useMutation(api.crm.schedule.book);
  const updateEvent = useMutation(api.crm.schedule.update);
  const setStatus = useMutation(api.crm.schedule.setStatus);
  const setLines = useMutation(api.crm.requests.setLines);
  const addNote = useMutation(api.crm.opportunityTasks.addNote);
  const toggleLine = useMutation(api.crm.opportunityTasks.toggleNoteLine);
  const extras = useQuery(api.crm.opportunityTasks.listForProject, { id: r.id });
  const upload = useUploadPending();
  const [assessing, setAssessing] = useState(false);
  const [editingLines, setEditingLines] = useState(false);
  const [draftLines, setDraftLines] = useState<RequestLine[]>([]);
  const [badLines, setBadLines] = useState<Set<string>>(new Set());
  const [savingLines, setSavingLines] = useState(false);
  const [note, setNote] = useState("");
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const teamNames = (r.assessment?.assigneeIds ?? []).map((id) => people?.find((p) => p.id === id)?.name).filter(Boolean).join(", ");

  function startLines() {
    setDraftLines(r.lines.length ? toRequestLines(r.lines) : [newRequestLine()]);
    setBadLines(new Set());
    setEditingLines(true);
  }
  async function saveLines() {
    const checked = checkRequestLines(draftLines);
    setBadLines(checked.bad);
    if (checked.bad.size) return;
    setSavingLines(true);
    try {
      await setLines({ id: r.id, lines: checked.ok });
      setEditingLines(false);
      toast("Products and services saved.");
    } catch (e) {
      toast(failure(e, "The lines could not be saved."));
    } finally {
      setSavingLines(false);
    }
  }
  /** Books the assessment as a consultation on the Schedule, or changes the one that is booked. A clash throws and the pop-up shows it. */
  async function saveAssessment(a: AssessmentDraft) {
    const assigneeIds = a.assigneeIds as Id<"users">[];
    if (r.assessment) {
      await updateEvent({ id: r.assessment.id, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, now: clock() });
    } else {
      await book({ businessId: r.businessId, type: "consultation", title: r.title, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, opportunityId: r.id, clientId: r.clientId, now: clock() });
    }
    toast("The assessment is saved.");
  }
  async function completeAssessment(done: boolean) {
    if (!r.assessment) return;
    try {
      await setStatus({ id: r.assessment.id, status: done ? "completed" : "upcoming" });
    } catch (e) {
      toast(failure(e, "The assessment could not be updated."));
    }
  }

  const c = r.client;
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  function edit() {
    setPick(r.salespersonId ?? UNASSIGNED);
    setEditing(true);
  }
  async function putBack() {
    try {
      await restore({ id: r.id, now: Date.now() });
      toast("The request is back on the board.");
    } catch (e) {
      toast(failure(e, "The request could not be restored."));
    }
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
      {r.archivedAt !== null && (
        <div className="au-warn" role="status">
          Archived. {r.archivedReason}.{" "}
          {canEdit && <button type="button" className="btn link" onClick={() => void putBack()}>Restore</button>}
        </div>
      )}
      <div className="rq-title">
        <h1>{r.title} · {r.code}</h1>
        {canEdit && !editing && (
          <button type="button" className="icon-btn" aria-label="Edit request details" onClick={edit}><Icon name="pencil" size={20} /></button>
        )}
      </div>

      <div className="rq-split">
      <div className="rq-main">
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

      <section className="card rq-overview">
        <h2>Overview</h2>
        <h3>Service details</h3>
        <p>{r.details || "—"}</p>
      </section>

      <section className="card rq-overview" aria-label="On-site assessment">
        <div className="rq-sechead">
          <h2>On-site assessment</h2>
          {canEdit && <button type="button" className="icon-btn" aria-label="Edit the on-site assessment" onClick={() => setAssessing(true)}><Icon name="pencil" size={20} /></button>}
        </div>
        {r.assessment ? (
          <>
            {r.assessment.instructions && <><h3>Instructions</h3><p>{r.assessment.instructions}</p></>}
            <dl className="as-facts">
              <div>
                <dt>Schedule</dt>
                <dd>
                  {whenLabel(r.assessment)}
                  <label className="sc-check as-done">
                    <input type="checkbox" checked={r.assessment.status === "completed"} disabled={!canEdit} onChange={(e) => void completeAssessment(e.target.checked)} /> Complete assessment
                  </label>
                </dd>
              </div>
              <div><dt>Team</dt><dd>{teamNames || <i className="as-unassigned">Unassigned</i>}</dd></div>
            </dl>
          </>
        ) : (
          <p className="muted">{canEdit ? "No assessment is booked yet. Use the pencil to schedule one." : "No assessment is booked."}</p>
        )}
      </section>

      <section className="card rq-overview" aria-label="Product / Service">
        <div className="rq-sechead">
          <h2>Product / Service</h2>
          {canEdit && !editingLines && <button type="button" className="icon-btn" aria-label="Edit products and services" onClick={startLines}><Icon name="pencil" size={20} /></button>}
        </div>
        {editingLines ? (
          <>
            <RequestLinesEditor lines={draftLines} onChange={(l) => { setDraftLines(l); setBadLines(new Set()); }} bad={badLines} />
            <div className="rq-editbar rl-bar">
              <button type="button" className="btn" disabled={savingLines} onClick={() => setEditingLines(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={savingLines} onClick={() => void saveLines()}>{savingLines ? "Saving…" : "Save"}</button>
            </div>
          </>
        ) : r.lines.length > 0 ? (
          <RequestLinesView lines={r.lines} />
        ) : (
          <>
            <p className="muted">Keep everything on track by adding products and services.</p>
            {canEdit && <button type="button" className="btn primary" onClick={startLines}>Add Line Item</button>}
          </>
        )}
      </section>
      </div>

      <aside className="rq-side" aria-label="Notes">
        <section className="card rq-notes">
          <h3>Notes</h3>
          {canEdit && (
            <form
              className="pl-noteform"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim() && noteFiles.length === 0) return;
                setSavingNote(true);
                upload(noteFiles)
                  .then((files) => addNote({ id: r.id, text: note, files }))
                  .then(() => { noteFiles.forEach((f) => URL.revokeObjectURL(f.url)); setNote(""); setNoteFiles([]); })
                  .catch((err) => toast(failure(err, "The note could not be saved.")))
                  .finally(() => setSavingNote(false));
              }}
            >
              <NoteEditor value={note} onChange={setNote} files={noteFiles} onFiles={setNoteFiles} disabled={savingNote} rows={5} placeholder="Leave an internal note for yourself or a team member" />
              <button type="submit" className="btn primary" disabled={savingNote || (!note.trim() && noteFiles.length === 0)}>{savingNote ? "Saving…" : "Save note"}</button>
            </form>
          )}
          {extras === undefined ? (
            <div className="sk" style={{ height: 40 }} />
          ) : extras.notes.length === 0 && !canEdit ? (
            <p className="muted">No notes yet.</p>
          ) : (
            extras.notes.map((n) => (
              <div key={n._id} className="pl-note fade-in">
                <NoteBody text={n.text} files={n.files} canEdit={canEdit} onToggle={(line) => void toggleLine({ noteId: n._id, line }).catch((err) => toast(failure(err, "The checkbox could not be changed.")))} />
                <small>{n.author} · {quoteDateTime(n.createdAt)}</small>
              </div>
            ))
          )}
        </section>
      </aside>
      </div>

      {assessing && <AssessmentModal people={people} initial={r.assessment} onSave={saveAssessment} onClose={() => setAssessing(false)} />}
    </div>
  );
}
