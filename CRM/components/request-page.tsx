"use client";

/* One request (D-039), laid out like Jobber's request page: status, "Title · CODE", the client's card beside a table of facts (source,
   requested, salesperson, assessment). The pencil opens the facts for editing: Jobber's Salesperson dropdown with Cancel and Save. It
   writes through crm/pipeline:setSalesperson, the same mutation as the Pipeline card, so the board and this page always agree.
   Below: Overview, the On-site assessment (a consultation on the Schedule, so it is booked and changed through crm/schedule), and
   Product / Service lines (crm/requests:setLines). Notes sit in a column on the right, as in Jobber. */

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock } from "@/lib/pipeline";
import { failure, usePeople, useRequest } from "@/lib/requests";
import { quoteDate, quoteDateTime } from "@/lib/format";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NoteBody } from "./note-view";
import { AssessmentInline, whenLabel, type AssessmentInput } from "./request-assessment";
import { RequestLinesEditor, RequestLinesView, checkRequestLines, newRequestLine, toRequestLines, type RequestLine } from "./request-lines";
import { RequestSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useConvertToJob } from "./use-convert-to-job";
import { useUI, type MenuItem } from "./ui-provider";

const PILL = { New: "lead", Overdue: "overdue", Consultation: "consult", Converted: "active", Lost: "draft" } as const;
const UNASSIGNED = "";

/** Jobber's red "nobody" mark next to Unassigned: a person with a slash through it. */
function NoOne() {
  return (
    <svg className="as-noone" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

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
  const router = useRouter();
  const { toast, dropdown } = useUI();
  const convertToJob = useConvertToJob();
  const { canEdit } = useStaff();
  const people = usePeople(r.businessId);
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const restore = useMutation(api.crm.automations.restoreRequest);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string>(UNASSIGNED);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleBad, setTitleBad] = useState(false);
  const [editingOverview, setEditingOverview] = useState(false);
  const [fieldsDraft, setFieldsDraft] = useState<{ label: string; value: string }[]>([]);
  const [savingOverview, setSavingOverview] = useState(false);
  const updateRequest = useMutation(api.crm.requests.update);
  const removeEvent = useMutation(api.crm.schedule.remove);
  const [saving, setSaving] = useState(false);

  const book = useMutation(api.crm.schedule.book);
  const updateEvent = useMutation(api.crm.schedule.update);
  const setStatus = useMutation(api.crm.schedule.setStatus);
  const resendToJobber = useMutation(api.crm.jobberConsultation.resend);
  const [resending, setResending] = useState(false);
  const setLines = useMutation(api.crm.requests.setLines);
  // An empty Product / Service section is filled once from what the customer chose on the form (client request, 2026-11-24).
  const fillLines = useMutation(api.crm.requests.fillLinesFromForm);
  const triedFill = useRef<string | null>(null);
  useEffect(() => {
    if (r.lines.length > 0 || triedFill.current === r.id) return;
    triedFill.current = r.id;
    void fillLines({ id: r.id }).catch(() => undefined);
  }, [r.id, r.lines.length, fillLines]);
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
  /** Saves the assessment form: the instructions always, then the booking. A date books (or changes) the consultation on the Schedule, so a clash
   *  with someone's time throws and the form shows it; "Schedule later" takes any booked time off the Schedule and keeps the instructions. */
  async function saveAssessment(a: AssessmentInput) {
    const assigneeIds = a.assigneeIds as Id<"users">[];
    await updateRequest({ id: r.id, assessmentInstructions: a.instructions });
    if (a.scheduleLater) {
      if (r.assessment) await removeEvent({ id: r.assessment.id });
    } else if (r.assessment) {
      await updateEvent({ id: r.assessment.id, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, now: clock() });
    } else {
      await book({ businessId: r.businessId, type: "consultation", title: r.title, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, opportunityId: r.id, clientId: r.clientId, now: clock() });
    }
    setAssessing(false);
    toast("The assessment is saved.");
  }
  async function deleteAssessment() {
    if (r.assessment) await removeEvent({ id: r.assessment.id });
    await updateRequest({ id: r.id, assessmentInstructions: "" });
    setAssessing(false);
    toast("The assessment is deleted.");
  }
  async function sendToJobber() {
    if (!r.assessment) return;
    setResending(true);
    try {
      await resendToJobber({ id: r.assessment.id });
      toast("Sending the consultation to Jobber.");
    } catch (e) {
      toast(failure(e, "The consultation could not be sent to Jobber."));
    } finally {
      setResending(false);
    }
  }
  async function completeAssessment(done: boolean) {
    if (!r.assessment) return;
    try {
      await setStatus({ id: r.assessment.id, status: done ? "completed" : "upcoming" });
    } catch (e) {
      toast(failure(e, "The assessment could not be updated."));
    }
  }

  // Only one section can be edited at a time: while one is open, every other pencil is off until it is saved or cancelled.
  const anyEditing = editing || editingOverview || assessing || editingLines;
  const lockedTip = "Save or cancel the section you are editing first";

  const c = r.client;
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  function edit() {
    setPick(r.salespersonId ?? UNASSIGNED);
    setTitleDraft(r.title);
    setTitleBad(false);
    setEditing(true);
  }
  function editOverview() {
    setFieldsDraft(r.overview.fields.map((f) => ({ ...f })));
    setEditingOverview(true);
  }
  async function saveOverview() {
    setSavingOverview(true);
    try {
      await updateRequest({ id: r.id, overviewFields: fieldsDraft });
      setEditingOverview(false);
      toast("Overview saved.");
    } catch (e) {
      toast(failure(e, "The overview could not be saved."));
    } finally {
      setSavingOverview(false);
    }
  }
  async function putBack() {
    try {
      await restore({ id: r.id, now: Date.now() });
      toast("The request is back on the board.");
    } catch (e) {
      toast(failure(e, "The request could not be restored."));
    }
  }
  /** Saves what the title pencil edits, as in Jobber: the title and the salesperson. Each is only sent if it changed. */
  async function save() {
    if (!titleDraft.trim()) {
      setTitleBad(true);
      document.getElementById("rq-title-input")?.focus();
      return;
    }
    setSaving(true);
    try {
      if (titleDraft.trim() !== r.title) await updateRequest({ id: r.id, title: titleDraft });
      if (pick !== (r.salespersonId ?? UNASSIGNED)) await setSalesperson({ id: r.id, salespersonId: pick === UNASSIGNED ? null : (people?.find((p) => p.id === pick)?.id ?? null) });
      setEditing(false);
      toast("Request saved.");
    } catch (e) {
      toast(failure(e, "The request could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  // Jobber's More menu on a request. The booking email, archiving by hand and deleting are not built, so they are greyed.
  const rule: MenuItem = { divider: true };
  const moreItems: MenuItem[] = [
    { label: "Email Booking Confirmation", icon: "mail", disabled: true },
    rule,
    { label: "Convert to Quote", icon: "quote", iconColor: "var(--green)", disabled: !canEdit, onSelect: () => router.push(`/quotes/new?clientId=${r.clientId}&projectId=${r.id}`) },
    { label: "Convert to Job", icon: "hammer", iconColor: "var(--green)", disabled: !canEdit, onSelect: () => void convertToJob(r.id as Id<"opportunities">) },
    rule,
    { label: "Archive", icon: "stage", disabled: true },
    { label: "Print", icon: "pdf", onSelect: () => window.print() },
    { label: "Delete", icon: "trash", danger: true, disabled: true },
  ];

  return (
    <div className="fade-in rq">
      <div className="rq-top">
        <div className="rq-topl">
          <Link className="rq-back" href="/requests"><Icon name="chevleft" size={18} /> Requests</Link>
          <span className={`pill ${PILL[r.status]}`}><span className="dot" />{r.status}</span>
        </div>
        <div className="rq-topr">
          <Link className="icon-btn" aria-label="View activity" title="View activity" href={`/opportunities/${r.id}?tab=activity`}><Icon name="history" size={24} /></Link>
          <button className="btn more-btn" type="button" aria-label="More" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, moreItems, { alignRight: true, variant: "actions" })}>
            <Icon name="more" size={24} /><span className="lbl">More</span>
          </button>
        </div>
      </div>
      {r.archivedAt !== null && (
        <div className="au-warn" role="status">
          Archived. {r.archivedReason}.{" "}
          {canEdit && <button type="button" className="btn link" onClick={() => void putBack()}>Restore</button>}
        </div>
      )}
      <div className="rq-title">
        {editing ? (
          <div className={`field rq-titlefield${titleBad ? " bad" : ""}`}>
            <label htmlFor="rq-title-input">Request title</label>
            <input id="rq-title-input" aria-invalid={titleBad} maxLength={200} value={titleDraft} disabled={saving} onChange={(e) => { setTitleDraft(e.target.value); setTitleBad(false); }} />
            <span className="err">Give the request a title.</span>
          </div>
        ) : (
          <h1>{r.title} · {r.code}</h1>
        )}
        {canEdit && !editing && (
          <button type="button" className="icon-btn" aria-label="Edit request details" disabled={anyEditing} title={anyEditing ? lockedTip : undefined} onClick={edit}><Icon name="pencil" size={20} /></button>
        )}
      </div>

      <div className="rq-split">
      <div className="rq-main">
      <div className="rq-grid">
        <section className="card rq-client">
          <div className="rq-clienthead">
            <Link href={`/clients/${r.clientId}`} className="rq-clientname">{c.name}</Link>
            <Link className="btn" href={`/clients/${r.clientId}`}>View client profile</Link>
          </div>
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

      <section className={`card rq-overview${editingOverview ? " rq-editing" : ""}`} aria-label="Services and project details">
        <div className="rq-sechead">
          <h2>Services &amp; Project Details</h2>
          {canEdit && !editingOverview && <button type="button" className="icon-btn" aria-label="Edit the overview" disabled={anyEditing} title={anyEditing ? lockedTip : undefined} onClick={editOverview}><Icon name="pencil" size={20} /></button>}
        </div>
        <div className="rq-qa-source">{r.overview.source}</div>
        {r.overview.heading && <h3 className="rq-qa-head">{r.overview.heading}</h3>}
        {editingOverview ? (
          <>
            <div className="rq-qa">
              {fieldsDraft.map((f, i) => (
                <div key={i} className="rq-qa-row">
                  <label htmlFor={`ov-${i}`}>{f.label}</label>
                  <textarea id={`ov-${i}`} rows={3} maxLength={5000} value={f.value} disabled={savingOverview} onChange={(e) => setFieldsDraft(fieldsDraft.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} autoFocus={i === 0} />
                </div>
              ))}
            </div>
            <div className="rq-stickybar">
              <span className="grow" />
              <button type="button" className="btn" disabled={savingOverview} onClick={() => setEditingOverview(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={savingOverview} onClick={() => void saveOverview()}>{savingOverview ? "Saving…" : "Save"}</button>
            </div>
          </>
        ) : (
          <div className="rq-qa">
            {r.overview.fields.map((f, i) => (
              <div key={i} className="rq-qa-row">
                <div className="rq-label">{f.label}</div>
                <p className="rq-text">{f.value || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`card rq-overview${assessing ? " rq-editing" : ""}`} aria-label="On-site assessment">
        <div className="rq-sechead">
          <h2>On-site assessment</h2>
          {canEdit && !assessing && <button type="button" className="icon-btn" aria-label="Edit the on-site assessment" disabled={anyEditing} title={anyEditing ? lockedTip : undefined} onClick={() => setAssessing(true)}><Icon name="pencil" size={20} /></button>}
        </div>
        {assessing ? (
          <AssessmentInline
            people={people}
            initial={r.assessment}
            instructions={r.assessmentInstructions}
            onSave={saveAssessment}
            onDelete={deleteAssessment}
            onCancel={() => setAssessing(false)}
          />
        ) : (
          <>
            <div className="rq-label">Instructions</div>
            {r.assessmentInstructions && <p className="rq-text">{r.assessmentInstructions}</p>}
            <dl className="as-facts as-three as-view">
              <div>
                <dt>Schedule</dt>
                <dd>
                  {r.assessment ? whenLabel(r.assessment) : "Unscheduled"}
                  <label className={`ai-check as-done${r.assessment ? "" : " off"}`} title={r.assessment ? undefined : "Schedule the assessment first"}>
                    <Checkbox state={r.assessment?.status === "completed"} label="Complete assessment" disabled={!canEdit || !r.assessment} onChange={() => void completeAssessment(r.assessment?.status !== "completed")} />
                    <span>Complete assessment</span>
                  </label>
                </dd>
              </div>
              <div><dt>Team</dt><dd>{teamNames || <span className="as-unassigned"><NoOne /><i>Unassigned</i></span>}</dd></div>
              <div><dt>Checklists</dt><dd>—</dd></div>
            </dl>
            {r.assessment?.offline ? (
              <p className="as-jobber">Done offline. Marked complete when the request moved to Onsite Consultation.</p>
            ) : r.assessment?.jobberError ? (
              <p className="as-jobber bad" role="status">
                <span>Not in Jobber: {r.assessment.jobberError}</span>
                {canEdit && <button type="button" className="btn small" disabled={resending} onClick={() => void sendToJobber()}>{resending ? "Sending…" : "Send to Jobber"}</button>}
              </p>
            ) : r.assessment?.inJobber ? (
              <p className="as-jobber">Also booked in Jobber.</p>
            ) : null}
            <div className="as-reminder">
              <div className="rq-label">Assessment Reminder</div>
              <div>Remind client 1 hour before by text</div>
              <div>Remind client 1 day before at 1:30 PM by email</div>
              <small>Reminders are not sent yet.</small>
            </div>
          </>
        )}
      </section>

      <section className="card rq-overview" aria-label="Consultation worksheet">
        <div className="rq-sechead">
          <h2>Consultation Worksheet</h2>
          {canEdit ? (
            <Link className="btn" href={`/opportunities/${r.id}?tab=visit`}><Icon name="pencil" size={16} /> Edit worksheet</Link>
          ) : (
            <button type="button" className="btn" disabled title="You can look at this but not change it"><Icon name="pencil" size={16} /> Edit worksheet</button>
          )}
        </div>
        <p className="rq-text">The salesperson&apos;s on-site form: the services and areas measured, products, photos and notes. Only staff see it. The quote can start from it.</p>
      </section>

      <section className="card rq-overview" aria-label="Product / Service">
        <div className="rq-sechead">
          <h2>Product / Service</h2>
          {canEdit && !editingLines && <button type="button" className="icon-btn" aria-label="Edit products and services" disabled={anyEditing} title={anyEditing ? lockedTip : undefined} onClick={startLines}><Icon name="pencil" size={20} /></button>}
        </div>
        {editingLines ? (
          <>
            <RequestLinesEditor lines={draftLines} onChange={(l) => { setDraftLines(l); setBadLines(new Set()); }} bad={badLines} />
            <div className="rq-stickybar">
              <span className="grow" />
              <button type="button" className="btn" disabled={savingLines} onClick={() => setEditingLines(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={savingLines} onClick={() => void saveLines()}>{savingLines ? "Saving…" : "Save"}</button>
            </div>
          </>
        ) : r.lines.length > 0 ? (
          <RequestLinesView lines={r.lines} />
        ) : (
          <>
            <p className="muted">Keep everything on track by adding products and services.</p>
            {canEdit && <button type="button" className="btn primary" disabled={anyEditing} title={anyEditing ? lockedTip : undefined} onClick={startLines}>Add Line Item</button>}
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

    </div>
  );
}
