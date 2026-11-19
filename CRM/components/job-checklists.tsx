"use client";

/* The Checklists card on a job (plan 2026-11-19-jobs-extras): the checklists the job was given, with a tick box for each item (who ticked it and
   when is kept). Add Checklist copies a template onto the job; the templates are made in Settings > Checklists. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDate } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

export function JobChecklists({ jobId, businessId, canEdit }: { jobId: Id<"opportunities">; businessId: Id<"businesses">; canEdit: boolean }) {
  const { toast, dropdown } = useUI();
  const lists = useQuery(api.crm.checklists.forJob, { id: jobId });
  const templates = useQuery(api.crm.checklists.templates, { businessId });
  const attach = useMutation(api.crm.checklists.attach);
  const detach = useMutation(api.crm.checklists.detach);
  const setDone = useMutation(api.crm.checklists.setDone);
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));

  const free = (templates ?? []).filter((t) => !(lists ?? []).some((l) => l.listName === t.name));
  const addMenu = (anchor: HTMLElement) =>
    dropdown(
      anchor,
      free.length
        ? free.map((t) => ({ label: t.name, icon: "checkbox", onSelect: () => void attach({ id: jobId, templateId: t.id as Id<"checklistTemplates"> }).catch((e) => fail(e, "The checklist could not be added.")) }))
        : [{ label: templates?.length ? "Every checklist is already on this job" : "No checklists yet. Make one in Settings.", disabled: true }],
      { alignRight: true },
    );

  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Checklists</h2>
        {canEdit && <button type="button" className="cj-link" onClick={(e) => addMenu(e.currentTarget)}>Add Checklist <Icon name="chevdown" size={14} /></button>}
      </div>
      {lists === undefined ? (
        <div className="sk" style={{ height: 60 }} />
      ) : lists.length === 0 ? (
        <div className="job-empty"><Icon name="checkbox" size={20} /><span>Checklists for this job show here. <Link href="/settings/checklists">Manage checklists</Link></span></div>
      ) : (
        lists.map((l) => (
          <div key={l.listName} className="jc-list">
            <div className="jc-head">
              <h3>{l.listName}</h3>
              <span className="muted">{l.items.filter((i) => i.done).length} of {l.items.length} done</span>
              {canEdit && <button type="button" className="btn plain" onClick={() => void detach({ id: jobId, listName: l.listName }).catch((e) => fail(e, "The checklist could not be removed."))}>Remove</button>}
            </div>
            <ul>
              {l.items.map((i) => (
                <li key={i.id}>
                  <label className={`jc-item${i.done ? " done" : ""}`}>
                    <input type="checkbox" checked={i.done} disabled={!canEdit} onChange={(e) => void setDone({ itemId: i.id, done: e.target.checked, now: clock() }).catch((err) => fail(err, "That could not be changed."))} />
                    <span>{i.text}</span>
                  </label>
                  {i.done && i.doneByName && i.doneAt && <small className="muted">{i.doneByName}, {quoteDate(i.doneAt)}</small>}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
