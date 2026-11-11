"use client";

/* The Tasks tab (D-061): every open task on the business's projects, with Jobber's chips (All, Overdue, Today, Upcoming) and an
   Assignee filter. The counts and rows come from crm/opportunityTasks:listAll. */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKept, type BusinessDoc } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { failure, todayBounds, useMinute, usePeople } from "@/lib/pipeline";
import { FilterMenu } from "./filter-menus";
import { AddTaskDialog } from "./pipeline-dialogs";
import { Icon } from "./icon";
import { PipelineTasksSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Chip = "all" | "overdue" | "today" | "upcoming";
const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
];

export function PipelineTasks({ business }: { business: BusinessDoc }) {
  const { popover, toast } = useUI();
  const { canEdit, isAdmin } = useStaff();
  const people = usePeople(business._id);
  const now = useMinute();
  const [chip, setChip] = useState<Chip>("all");
  const [assignee, setAssignee] = useState<Id<"users"> | null>(null);
  const [creating, setCreating] = useState(false);
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const { todayStart, todayEnd } = todayBounds();
  const data = useKept(useQuery(api.crm.opportunityTasks.listAll, { businessId: business._id, now, todayStart, todayEnd, ...(assignee ? { assigneeId: assignee } : {}) }));
  if (data === undefined || people === undefined) return <PipelineTasksSkeleton />;

  const nameOf = (id: Id<"users"> | undefined) => (id ? (people.find((p) => p.id === id)?.name ?? "") : "Unassigned");
  const rows = data.rows.filter((r) => {
    if (chip === "all") return true;
    if (r.dueAt === undefined) return false;
    return chip === "overdue" ? r.dueAt < todayStart : chip === "today" ? r.dueAt >= todayStart && r.dueAt <= todayEnd : r.dueAt > todayEnd;
  });

  return (
    <div className="pl-taskspage">
      <div className="pl-taskhead">
        <h2>All tasks</h2>
        {isAdmin && <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> New task</button>}
      </div>
      <div className="pl-taskbar">
        <div className="chips" role="group" aria-label="Show tasks">
          {CHIPS.map((c) => (
            <button key={c.key} type="button" className={`chip outline${chip === c.key ? " on" : ""}`} aria-pressed={chip === c.key} onClick={() => setChip(c.key)}>
              {c.label} {data.counts[c.key]}
              {chip === c.key && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip"
          onClick={(e) =>
            popover(e.currentTarget, (close) => (
              <FilterMenu
                placeholder="Search assignee"
                options={[{ label: "Anyone" }, ...people.map((p) => ({ label: p.name }))]}
                selected={assignee ? nameOf(assignee) : "Anyone"}
                onSelect={(label) => setAssignee(label === "Anyone" ? null : (people.find((p) => p.name === label)?.id ?? null))}
                close={close}
              />
            ), { className: "filter" })
          }
        >
          Assignee<span className="sep" /><b>{assignee ? nameOf(assignee) : "Anyone"}</b>
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="pl-none" style={{ textAlign: "left" }}>No tasks to show.</p>
      ) : (
        <ul className="pl-tasklist">
          {rows.map((t) => (
            <li key={t.id} className="fade-in">
              <label>
                <input type="checkbox" checked={false} disabled={!canEdit} onChange={() => void setDone({ taskId: t.id, done: true }).catch((e) => toast(failure(e, "The task could not be updated.")))} aria-label={`Complete ${t.title}`} />
                <span className="t">{t.title}</span>
              </label>
              <span className="pl-tproject">{t.projectTitle ? `${t.projectTitle} · ${t.code}` : "No project"}</span>
              <span className="pl-tdue">{t.dueAt === undefined ? "No due date" : quoteDate(t.dueAt)}</span>
              <span className="pl-tname">{nameOf(t.assigneeId)}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="pl-completed" aria-label="Completed tasks">
        <h2>Completed <span className="pl-badge small">{data.counts.completed}</span></h2>
        {data.completed.length === 0 ? (
          <p className="pl-none" style={{ textAlign: "left" }}>Tasks you finish will be kept here.</p>
        ) : (
          <ul className="pl-tasklist done">
            {data.completed.map((t) => (
              <li key={t.id} className="fade-in">
                <label>
                  <input type="checkbox" checked disabled={!canEdit} onChange={() => void setDone({ taskId: t.id, done: false }).catch((e) => toast(failure(e, "The task could not be updated.")))} aria-label={`Reopen ${t.title}`} />
                  <span className="t">{t.title}</span>
                </label>
                <span className="pl-tproject">{t.projectTitle ? `${t.projectTitle} · ${t.code}` : "No project"}</span>
                <span className="pl-tdue">{t.completedAt ? `Done ${quoteDate(t.completedAt)}` : "Done"}</span>
                <span className="pl-tname">{nameOf(t.assigneeId)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {creating && <AddTaskDialog businessId={business._id} people={people} onClose={() => setCreating(false)} />}
    </div>
  );
}
