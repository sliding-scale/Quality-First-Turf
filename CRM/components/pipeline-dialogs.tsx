"use client";

/* The small pop-ups on the pipeline: why a project was lost, adding a task, giving feedback. Same style and motion as the other
   dialogs (D-037): a closing pop-up stays mounted for the length of its exit animation. Invalid fields turn red on submit (D-035). */

import { useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failure } from "@/lib/pipeline";
import { Icon } from "./icon";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

/** `className` lets a pop-up change its look: "sc-pop" (the Schedule form) leaves the page behind it visible and usable. */
export function PipelineModal({ title, onClose, busy, className, children }: { title: string; onClose: () => void; busy?: boolean; className?: string; children: (close: () => void) => ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);
  const close = () => setLeaving(true);
  return (
    <div className={`modal-back${leaving ? " leaving" : ""}${className ? ` ${className}` : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal={className ? undefined : "true"} aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>
        {children(close)}
      </div>
    </div>
  );
}

/** Closed Lost needs a reason (PRD 3.3). `onConfirm` does the move and throws the server's message when refused. */
export function LostReasonDialog({ project, onConfirm, onClose }: { project: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Mark as lost" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason.trim()) {
              setBad(true);
              document.getElementById("lost-reason")?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onConfirm(reason.trim());
              close();
            } catch (err) {
              setError(failure(err, "Could not mark the project as lost. Try again."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">{project}</p>
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="lost-reason">Why was it lost?</label>
            <textarea id="lost-reason" aria-invalid={bad} value={reason} onChange={(e) => { setReason(e.target.value); setBad(false); }} />
            <span className="err">Say why the project was lost.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Mark as lost"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

export type EditableTask = { id: Id<"opportunityTasks">; title: string; dueAt?: number; assigneeId?: Id<"users"> };

/** yyyy-mm-dd of a moment, in the browser's own day, for a date box. */
const dateBox = (ms: number | undefined) => {
  if (ms === undefined) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A task on a project (`projectId`), or, with none, a task of the business's own from the Tasks page or Home (PRD 3.5). With `task` it
 *  edits that task, and offers Delete (after a second click to be sure). `defaultAssignee` is who a new task starts with. */
export function AddTaskDialog({ projectId, businessId, people, task, defaultAssignee, onClose }: {
  projectId?: Id<"opportunities">; businessId: Id<"businesses">; people: { id: Id<"users">; name: string }[]; task?: EditableTask; defaultAssignee?: Id<"users">; onClose: () => void;
}) {
  const addTask = useMutation(api.crm.opportunityTasks.addTask);
  const createTask = useMutation(api.crm.opportunityTasks.createTask);
  const updateTask = useMutation(api.crm.opportunityTasks.updateTask);
  const removeTask = useMutation(api.crm.opportunityTasks.removeTask);
  const [title, setTitle] = useState(task?.title ?? "");
  const [assignee, setAssignee] = useState<string>(task ? (task.assigneeId ?? "") : (defaultAssignee ?? ""));
  const [due, setDue] = useState(dateBox(task?.dueAt));
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title={task ? "Edit task" : "New task"} onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) {
              setBad(true);
              document.getElementById("task-title")?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              const dueAt = due ? new Date(`${due}T12:00:00`).getTime() : undefined;
              if (task) await updateTask({ taskId: task.id, title, dueAt: dueAt ?? null, assigneeId: assignee ? (assignee as Id<"users">) : null });
              else {
                const extra = { ...(assignee ? { assigneeId: assignee as Id<"users"> } : {}), ...(dueAt ? { dueAt } : {}) };
                if (projectId) await addTask({ id: projectId, title, ...extra });
                else await createTask({ businessId, title, ...extra });
              }
              close();
            } catch (err) {
              setError(failure(err, "The task could not be saved. Try again."));
              setBusy(false);
            }
          }}
        >
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="task-title">Title</label>
            <input id="task-title" aria-invalid={bad} maxLength={200} autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setBad(false); }} />
            <span className="err">Give the task a title.</span>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="task-assignee">Assignee</label>
            <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="task-due">Due date</label>
            <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            {task && (
              sure ? (
                <>
                  <span className="muted" style={{ marginRight: "auto" }}>Delete this task for good?</span>
                  <button type="button" className="btn plain" onClick={() => setSure(false)} disabled={busy}>Keep it</button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await removeTask({ taskId: task.id });
                        close();
                      } catch (err) {
                        setError(failure(err, "The task could not be deleted. Try again."));
                        setBusy(false);
                        setSure(false);
                      }
                    }}
                  >Delete</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn plain" style={{ marginRight: "auto" }} onClick={() => setSure(true)} disabled={busy}>Delete</button>
                  <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
                  <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                </>
              )
            )}
            {!task && (
              <>
                <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              </>
            )}
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/** Give Feedback. Where feedback goes is not decided yet, so Send stays greyed until it is. */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <PipelineModal title="Give feedback" onClose={onClose}>
      {(close) => (
        <div>
          <div className="field">
            <label htmlFor="fb-text">What would make the pipeline better?</label>
            <textarea id="fb-text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close}>Cancel</button>
            <button type="button" className="btn primary" disabled>Send</button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
