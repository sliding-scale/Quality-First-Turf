"use client";

/* Settings → Checklists (plan 2026-11-19-jobs-extras): Jobber's checklist templates. A template is a name and its items, one per line. A job takes a
   copy when a checklist is added to it, so changing or deleting a template here never changes a job that already has it. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/lib/clients";
import { clock, failure } from "@/lib/pipeline";
import { ConfirmDelete } from "./confirm-delete";
import { PipelineModal } from "./pipeline-dialogs";
import { DisclaimersSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Template = { id: Id<"checklistTemplates">; name: string; items: string[] };

export function ChecklistsPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const canManage = staff.can("templates", "edit");
  const list = useQuery(api.crm.checklists.templates, businessId && staff.can("jobs") ? { businessId } : "skip");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  if (!staff.can("jobs")) {
    return (
      <div className="empty-state">
        <h2>You do not have access to this</h2>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !businessId || list === undefined) return <DisclaimersSkeleton />;

  return (
    <div className="fade-in dc">
      <div className="page-head">
        <h1>Checklists</h1>
        {canManage && <button type="button" className="btn primary" onClick={() => setEditing("new")}>New Checklist</button>}
      </div>
      <p className="au-lead">Lists of things to do on a job, such as an install day or a final walk. Add one to a job from its page; the crew ticks the items off as they go. A job keeps its own copy, so changing a checklist here does not change jobs that already have it.</p>
      {list.length === 0 ? (
        <div className="card dc-empty">There are no checklists yet. Add the first one.</div>
      ) : (
        <ul className="dc-list">
          {list.map((t) => (
            <li key={t.id} className="card dc-item">
              <div className="dc-body">
                <h3>{t.name}</h3>
                <p>{t.items.slice(0, 4).join(" · ")}{t.items.length > 4 ? ` · and ${t.items.length - 4} more` : ""}</p>
                <small>{t.items.length} item{t.items.length === 1 ? "" : "s"}</small>
              </div>
              {canManage && (
                <div className="dc-actions">
                  <button type="button" className="btn" onClick={() => setEditing(t)}>Edit</button>
                  <button type="button" className="btn danger" onClick={() => setDeleting(t)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateForm businessId={businessId} template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteTemplate template={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function TemplateForm({ businessId, template, onClose }: { businessId: Id<"businesses">; template: Template | null; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.checklists.saveTemplate);
  const [name, setName] = useState(template?.name ?? "");
  const [text, setText] = useState(template?.items.join("\n") ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = text.split("\n").map((i) => i.trim()).filter(Boolean);

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || items.length === 0) {
      document.getElementById(!name.trim() ? "ck-name" : "ck-items")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({ ...(template ? { id: template.id } : {}), businessId, name, items, now: clock() });
      toast(template ? "Checklist saved." : "Checklist added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={template ? "Edit checklist" : "New checklist"} onClose={onClose} busy={busy} className="au-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <div className={`field${tried && !name.trim() ? " bad" : ""}`}>
            <label htmlFor="ck-name">Name</label>
            <input id="ck-name" aria-invalid={tried && !name.trim()} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <span className="err">Give the checklist a name.</span>
          </div>
          <div className={`field${tried && items.length === 0 ? " bad" : ""}`}>
            <label htmlFor="ck-items">Items, one on each line</label>
            <textarea id="ck-items" aria-invalid={tried && items.length === 0} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
            <span className="err">Add at least one item.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

function DeleteTemplate({ template, onClose }: { template: Template; onClose: () => void }) {
  const remove = useMutation(api.crm.checklists.removeTemplate);
  return (
    <ConfirmDelete
      title="Delete this checklist?"
      note={`“${template.name}” is removed from the list. Jobs that already have it keep their copy. This cannot be undone.`}
      doneMessage="Checklist deleted."
      action={() => remove({ id: template.id })}
      onClose={onClose}
    />
  );
}
