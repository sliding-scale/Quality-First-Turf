"use client";

/* The panel that slides in from the right when a card is clicked (D-061): the project's value and stage, its client, quick actions,
   tasks, notes and its stage history. (Jobber also shows an AI summary here; the user left it out.) */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useClient, type BusinessDoc } from "@/lib/clients";
import { moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { LEAD_SOURCES, NO_SOURCE, failure, timeLabel, viewActions, type BoardCard } from "@/lib/pipeline";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NoteBody } from "./note-view";
import { AddTaskDialog } from "./pipeline-dialogs";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const EXIT_MS = 200; // keep in step with pl-panel-out in pipeline.css

export function PipelinePanel({ business, card, people, onClose, onLost, onWon }: {
  business: BusinessDoc;
  card: BoardCard;
  people: { id: Id<"users">; name: string }[];
  onClose: () => void;
  onLost: () => void;
  onWon: () => void;
}) {
  const { popover, toast } = useUI();
  const { canEdit } = useStaff();
  const client = useClient(card.clientId);
  const extras = useQuery(api.crm.opportunityTasks.listForProject, { id: card.id });
  const history = useQuery(api.crm.pipeline.history, { id: card.id });
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const addNote = useMutation(api.crm.opportunityTasks.addNote);
  const toggleLine = useMutation(api.crm.opportunityTasks.toggleNoteLine);
  const upload = useUploadPending();
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const setLeadSource = useMutation(api.crm.pipeline.setLeadSource);
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  // The panel stays mounted when another card is opened, so an unsaved note must not follow along.
  const [noteFor, setNoteFor] = useState(card.id);
  if (noteFor !== card.id) {
    noteFiles.forEach((f) => URL.revokeObjectURL(f.url));
    setNoteFor(card.id);
    setNote("");
    setNoteFiles([]);
    setAdding(false);
    setSavingNote(false);
  }

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !adding) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [adding]);

  const address = client ? [client.street1, [client.city, [client.state, client.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean) : [];

  return (
    <aside className={`pl-panel${leaving ? " leaving" : ""}`} aria-label={`${card.title} · ${card.code}`}>
      <div className="pl-panelhead">
        <div>
          <h2>{card.title} · {card.code}</h2>
          <div className="pl-panelvalue">{moneyCents(card.valueCents)}</div>
          <div className="pl-panelchips"><span className="pl-chip">{card.stage}</span><span className="pl-chip" data-tip="Time in this stage">{timeLabel(card.timeInStageMs)}</span></div>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setLeaving(true)}><Icon name="x" size={22} /></button>
      </div>

      <div className="pl-panelbody">
        <section className="pl-box">
          <div className="pl-boxhead">
            <Link href={`/clients/${card.clientId}`} className="pl-clientname">{card.clientName}</Link>
          </div>
          {client === undefined ? (
            <div className="sk" style={{ height: 60 }} />
          ) : client === null ? null : (
            <div className="pl-contact">
              {address.map((l) => <div key={l}>{l}</div>)}
              {client.phone && <div><a href={`tel:${client.phone}`}>{client.phone}</a></div>}
              {client.email && <div><a href={`mailto:${client.email}`}>{client.email}</a></div>}
            </div>
          )}
        </section>

        <div className="pl-quick">
          <h3>Quick actions</h3>
          <div className="pl-quickrow">
            {client?.email ? <a className="btn" href={`mailto:${client.email}`}><Icon name="mail" size={18} /> Email</a> : <button type="button" className="btn" disabled><Icon name="mail" size={18} /> Email</button>}
            {viewActions(card).map((v) => {
              const icon = <Icon name={v.key === "quote" ? "quote" : v.key === "schedule" ? "calendar" : "inbox"} size={18} />;
              return v.href ? (
                <Link key={v.key} className="btn" href={v.href}>{icon} {v.label}</Link>
              ) : (
                <button key={v.key} type="button" className="btn" disabled>{icon} {v.label}</button>
              );
            })}
          </div>
        </div>

        <dl className="pl-facts">
          <div>
            <dt>Salesperson</dt>
            <dd>
              {card.salespersonName}
              {canEdit && (
                <button
                  type="button"
                  className="cj-iconbtn"
                  aria-label="Change salesperson"
                  data-tip="Change salesperson"
                  onClick={(e) =>
                    popover(e.currentTarget, (close) => (
                      <FilterMenu
                        placeholder="Search salespeople"
                        options={[{ label: "Unassigned" }, ...people.map((p) => ({ label: p.name }))]}
                        selected={card.salespersonName}
                        onSelect={(label) => {
                          const person = people.find((p) => p.name === label);
                          setSalesperson({ id: card.id, salespersonId: person ? person.id : null }).catch((e2) => toast(failure(e2, "The salesperson could not be changed.")));
                        }}
                        close={close}
                      />
                    ), { className: "filter" })
                  }
                ><Icon name="pencil" size={18} /></button>
              )}
            </dd>
          </div>
          <div>
            <dt>Lead source</dt>
            <dd>
              {card.leadSource}
              {canEdit && (
                <button
                  type="button"
                  className="cj-iconbtn"
                  aria-label="Change lead source"
                  data-tip="Change lead source"
                  onClick={(e) =>
                    popover(e.currentTarget, (close) => (
                      <FilterMenu
                        placeholder="Search lead source"
                        options={[...LEAD_SOURCES, NO_SOURCE].map((label) => ({ label }))}
                        selected={card.leadSource}
                        onSelect={(label) => {
                          setLeadSource({ id: card.id, leadSource: label === NO_SOURCE ? null : label }).catch((e2) => toast(failure(e2, "The lead source could not be changed.")));
                        }}
                        close={close}
                      />
                    ), { className: "filter" })
                  }
                ><Icon name="pencil" size={18} /></button>
              )}
            </dd>
          </div>
          <div><dt>Requested</dt><dd>{quoteDate(card.requestedAt)}</dd></div>
        </dl>

        {canEdit && (
          <div className="pl-quickrow">
            <button type="button" className="btn" disabled={card.stage === "Closed Won"} onClick={onWon}><Icon name="check" size={18} /> Mark as won</button>
            <button type="button" className="btn" disabled={card.stage === "Closed Lost"} onClick={onLost}><Icon name="x" size={18} /> Mark as lost</button>
          </div>
        )}

        <section className="pl-section">
          <div className="pl-sectionhead">
            <h3>Tasks</h3>
            {canEdit && <button type="button" className="cj-link" onClick={() => setAdding(true)}>+ Add task</button>}
          </div>
          {extras === undefined ? (
            <div className="sk" style={{ height: 52 }} />
          ) : extras.tasks.length === 0 ? (
            <div className="pl-none">No tasks yet</div>
          ) : (
            <ul className="pl-tasks">
              {extras.tasks.map((t) => (
                <li key={t._id} className={t.done ? "done" : undefined}>
                  <label>
                    <input type="checkbox" checked={t.done} disabled={!canEdit} onChange={(e) => void setDone({ taskId: t._id, done: e.target.checked }).catch((err) => toast(failure(err, "The task could not be updated.")))} />
                    <span>{t.title}</span>
                  </label>
                  {t.dueAt !== undefined && <small>{quoteDate(t.dueAt)}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pl-section">
          <div className="pl-sectionhead"><h3>Notes</h3></div>
          {canEdit && (
            <form
              className="pl-noteform"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim() && noteFiles.length === 0) return;
                setSavingNote(true);
                upload(noteFiles)
                  .then((files) => addNote({ id: card.id, text: note, files }))
                  .then(() => { noteFiles.forEach((f) => URL.revokeObjectURL(f.url)); setNote(""); setNoteFiles([]); })
                  .catch((err) => toast(failure(err, "The note could not be saved.")))
                  .finally(() => setSavingNote(false));
              }}
            >
              <NoteEditor value={note} onChange={setNote} files={noteFiles} onFiles={setNoteFiles} disabled={savingNote} rows={8} />
              <button type="submit" className="btn primary" disabled={savingNote || (!note.trim() && noteFiles.length === 0)}>{savingNote ? "Saving…" : "Save note"}</button>
            </form>
          )}
          {extras?.notes.map((n) => (
            <div key={n._id} className="pl-note fade-in"><NoteBody text={n.text} files={n.files} canEdit={canEdit} onToggle={(line) => void toggleLine({ noteId: n._id, line }).catch((err) => toast(failure(err, "The checkbox could not be changed.")))} /><small>{n.author} · {quoteDateTime(n.createdAt)}</small></div>
          ))}
        </section>

        <section className="pl-section">
          <div className="pl-sectionhead"><h3>Stage history</h3></div>
          {history === undefined ? (
            <div className="sk" style={{ height: 40 }} />
          ) : history.length === 0 ? (
            <div className="pl-none">No moves yet</div>
          ) : (
            <ul className="pl-history">
              {history.map((h) => (
                <li key={h._id}>
                  <div><b>{h.from}</b> → <b>{h.to}</b></div>
                  <small>{h.byName} · {quoteDateTime(h.at)}{h.note ? ` · ${h.note}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {adding && <AddTaskDialog projectId={card.id} businessId={business._id} people={people} onClose={() => setAdding(false)} />}
    </aside>
  );
}
