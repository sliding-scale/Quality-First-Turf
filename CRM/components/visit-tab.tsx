"use client";

/* The project's Visit tab (user, 2026-11-26, D-133), full width like the Overview. Left: one container for each visit (visit-card.tsx) and a
   big + under them that books another, filled in from the visit before it. Right: the property with Google Maps and Apple Maps, and the visit
   notes. The project's first booking is its consultation, each one after it a follow-up visit with a name that can be changed. */

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock, failure, usePeople } from "@/lib/pipeline";
import { BUSINESS_TZ, fromInputs, inputParts, todayKey } from "@/lib/schedule";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";
import { VisitCard, visitName, type Project, type Visit, type VisitData } from "./visit-card";
import { WhenField } from "./when-field";

export function VisitTab({ project }: { project: Project }) {
  const data = useQuery(api.crm.opportunityVisit.tab, { id: project.id });
  const people = usePeople(project.businessId);
  const { toast } = useUI();
  const [adding, setAdding] = useState(false);
  // Which visits are open. Until someone opens or closes one: the next visit still to be done, or else the latest.
  const [chosen, setChosen] = useState<Set<string> | null>(null);

  if (data === undefined) return <VisitTabSkeleton />;
  if (data === null) return null;

  const next = data.visits.find((v) => v.status !== "completed" && v.status !== "lost") ?? data.visits.at(-1);
  const open = chosen ?? new Set<string>(next ? [next.id] : []);
  const toggle = (id: string) => { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); setChosen(n); };
  const hasConsult = data.visits.some((v) => v.type === "consultation" && v.status !== "lost");
  const addLabel = hasConsult ? "Add another visit" : "Schedule the consultation";

  return (
    <div className="op-body vt">
      <div className="vt-main">
        {data.visits.length === 0 && (
          <section className="card op-card">
            <h2>Schedule the consultation first</h2>
            <p className="muted vt-none">The visit worksheet opens once the on-site consultation is booked. Book it with the + below; a new project then moves to Onsite Consultation.</p>
          </section>
        )}
        {data.visits.map((v) => (
          <VisitCard
            key={v.id}
            project={project}
            visit={v}
            data={data}
            team={v.assigneeIds.map((id) => people?.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}
            open={open.has(v.id)}
            onToggle={() => toggle(v.id)}
          />
        ))}
        <div className="vt-addrow">
          <button
            type="button"
            className="vt-plus"
            aria-label={addLabel}
            data-tip={addLabel}
            aria-disabled={!data.canBook || undefined}
            onClick={() => (data.canBook ? setAdding(true) : toast("Your role can look at visits but not book them."))}
          >
            <Icon name="plus" size={30} />
          </button>
        </div>
      </div>

      <aside className="vt-side">
        <PropertyCard address={data.address} />
        <NotesCard id={project.id} notes={data.notes} canEdit={data.canEdit} />
      </aside>

      {adding && (
        <VisitDialog
          project={project}
          people={people ?? []}
          data={data}
          type={hasConsult ? "visit" : "consultation"}
          onBooked={(id) => setChosen(new Set([id]))}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function VisitTabSkeleton() {
  return (
    <div className="op-body vt" role="status" aria-busy="true">
      <span className="sr">Loading…</span>
      <div className="vt-main">
        {[0, 1].map((n) => <section key={n} className="card op-card"><span className="sk" style={{ display: "block", height: 20, width: "30%" }} /><span className="sk" style={{ display: "block", height: 14, width: "55%", marginTop: 10 }} /></section>)}
      </div>
      <aside className="vt-side">
        {[0, 1].map((n) => <section key={n} className="card op-card"><span className="sk" style={{ display: "block", height: 20, width: "45%" }} /><span className="sk" style={{ display: "block", height: 80, marginTop: 12 }} /></section>)}
      </aside>
    </div>
  );
}

function PropertyCard({ address }: { address: string }) {
  const query = encodeURIComponent(address);
  return (
    <section className="card op-card">
      <h2>Property</h2>
      {address ? (
        <>
          <div className="vt-address"><Icon name="pin" size={18} /><span>{address}</span></div>
          <div className="vt-maps">
            <a className="btn small" href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
            <a className="btn small" href={`https://maps.apple.com/?q=${query}`} target="_blank" rel="noopener noreferrer">Apple Maps</a>
          </div>
        </>
      ) : (
        <p className="muted vt-none">No property address. Add one on the client to get map links.</p>
      )}
    </section>
  );
}

function NotesCard({ id, notes, canEdit }: { id: Id<"opportunities">; notes: string; canEdit: boolean }) {
  const save = useMutation(api.crm.opportunityVisit.saveNotes);
  const { toast } = useUI();
  const [text, setText] = useState(notes);
  const [seen, setSeen] = useState(notes);
  if (seen !== notes) {
    setSeen(notes);
    if (text === seen) setText(notes);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({ id, notes: text, now: clock() });
      toast("Visit notes saved.");
    } catch (e) {
      setError(failure(e, "The notes could not be saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card op-card">
      <h2>Visit notes</h2>
      {canEdit ? (
        <>
          <label className="vz-field">
            <span className="sr">Visit notes</span>
            <textarea rows={5} value={text} maxLength={3000} placeholder="Gate codes, access, pets, anything the crew should know" onChange={(e) => setText(e.target.value)} />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          {text !== notes && (
            <div className="vt-notesave">
              <button type="button" className="btn primary small" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save notes"}</button>
            </div>
          )}
        </>
      ) : (
        <p className={notes ? "op-text" : "muted vt-none"}>{notes || "No visit notes."}</p>
      )}
    </section>
  );
}

type Bad = { name?: boolean; who?: boolean; date?: string; end?: boolean };

/** Books a visit. It starts filled in from the visit before it (who is going, the times, the notes); only the day is left to pick. */
function VisitDialog({ project, people, data, type, onBooked, onClose }: {
  project: Project;
  people: { id: Id<"users">; name: string }[];
  data: VisitData;
  type: "consultation" | "visit";
  onBooked: (id: string) => void;
  onClose: () => void;
}) {
  const book = useMutation(api.crm.schedule.book);
  const { toast } = useUI();
  const consultation = type === "consultation";
  const [previous] = useState<Visit | undefined>(() => data.visits.at(-1));
  const timed = previous && !previous.anytime && !previous.offline ? previous : undefined;
  const [name, setName] = useState(() => `Follow-up visit ${data.visits.filter((v) => v.type === "visit").length + 1}`);
  const [team, setTeam] = useState<Id<"users">[]>(() => (previous?.assigneeIds.length ? previous.assigneeIds : project.salespersonId ? [project.salespersonId] : []));
  const [when, setWhen] = useState(() => ({ date: "", start: timed ? inputParts(timed.start).time : "09:00", end: timed ? inputParts(timed.end).time : "10:00", anytime: false }));
  const [notes, setNotes] = useState(() => (previous && !previous.offline ? previous.bookingNotes : ""));
  const [bad, setBad] = useState<Bad>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [today] = useState(() => todayKey(Date.now()));

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    const next: Bad = {};
    const start = when.date ? fromInputs(when.date, when.start) : NaN;
    const end = when.date ? fromInputs(when.date, when.end) : NaN;
    if (!consultation && !name.trim()) next.name = true;
    if (team.length === 0) next.who = true;
    if (!when.date) next.date = "Choose a date.";
    else if (start <= clock()) next.date = "That time has already passed. Choose a later one.";
    else if (!(end > start)) next.end = true;
    setBad(next);
    if (Object.keys(next).length) {
      document.getElementById(next.name ? "vt-name" : next.who ? "vt-who" : "vt-when")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await book({
        businessId: project.businessId, type, title: [consultation ? "Consultation" : name.trim(), project.title].filter(Boolean).join(": "), start, end, anytime: false,
        assigneeIds: team, opportunityId: project.id, clientId: project.clientId, notes: notes.trim(), now: clock(),
      });
      onBooked(id);
      toast(consultation ? "The consultation is booked." : "The visit is booked.");
      close();
    } catch (err) {
      setError(failure(err, "The visit could not be booked. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={consultation ? "Schedule consultation" : "Schedule a visit"} onClose={onClose} busy={busy}>
      {(close) => (
        <form noValidate onSubmit={(e) => void submit(e, close)}>
          <p className="muted" style={{ marginTop: 0 }}>
            For {project.title || "this project"}. {consultation ? "Booking it moves a new project to Onsite Consultation and sends the customer a confirmation." : "The customer is not emailed about follow-up visits."}
            {previous ? ` Filled in from ${visitName(previous, project.title)}; its work areas carry over.` : ""}
          </p>
          {!consultation && (
            <div className={`field${bad.name ? " bad" : ""}`}>
              <label htmlFor="vt-name">Visit name</label>
              <input id="vt-name" maxLength={80} aria-invalid={!!bad.name} value={name} onChange={(e) => { setName(e.target.value); setBad((b) => ({ ...b, name: false })); }} />
              <span className="err">Name the visit.</span>
            </div>
          )}
          <div className={`field${bad.who ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <span className="vt-label">Who is going</span>
            <div className="vt-who" id="vt-who" tabIndex={-1} role="group" aria-label="Who is going">
              {people.map((p) => (
                <label key={p.id}>
                  <input type="checkbox" checked={team.includes(p.id)} onChange={(e) => { setTeam(e.target.checked ? [...team, p.id] : team.filter((t) => t !== p.id)); setBad((b) => ({ ...b, who: false })); }} /> {p.name}
                </label>
              ))}
            </div>
            <span className="err">Choose who is going.</span>
          </div>
          <div className={`field${bad.date || bad.end ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <label htmlFor="vt-when">Date and time</label>
            <WhenField id="vt-when" value={when} minDate={today} bad={!!bad.date || bad.end} onChange={(w) => { setWhen(w); setBad((b) => ({ ...b, date: undefined, end: false })); }} />
            <span className="err">{bad.date ?? "The end has to be after the start."}</span>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="vt-notes">Notes for the visit</label>
            <textarea id="vt-notes" rows={3} maxLength={1000} placeholder="Optional: gate code, parking, who to ask for" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Times are in the business time zone ({BUSINESS_TZ}).</p>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Booking…" : "Schedule"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
