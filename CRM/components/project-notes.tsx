"use client";

/* A project's notes: the card on the opportunity page's Overview and on the job page. One component, so a note written in one place shows in the
   other (they are the same `opportunityNotes` rows, written by convex/crm/opportunityTasks.ts, which needs the Tasks module). */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDateTime } from "@/lib/format";
import { failure } from "@/lib/pipeline";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NoteBody } from "./note-view";
import { useUI } from "./ui-provider";

export function ProjectNotes({ id, canEdit, className = "card op-card" }: { id: Id<"opportunities">; canEdit: boolean; className?: string }) {
  const { toast } = useUI();
  const extras = useQuery(api.crm.opportunityTasks.listForProject, { id });
  const addNote = useMutation(api.crm.opportunityTasks.addNote);
  const toggleLine = useMutation(api.crm.opportunityTasks.toggleNoteLine);
  const upload = useUploadPending();
  const [note, setNote] = useState("");
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  return (
    <section className={className}>
      <h2>Notes</h2>
      {canEdit && (
        <form
          className="pl-noteform"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim() && noteFiles.length === 0) return;
            setSaving(true);
            upload(noteFiles)
              .then((files) => addNote({ id, text: note, files }))
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
  );
}
