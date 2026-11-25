"use client";

/* The Tasks tab (D-061): every open task on the business's projects, with Jobber's chips (All, Overdue, Today, Upcoming) and an
   Assignee filter. The counts and rows come from crm/opportunityTasks:listAll. */

import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKept, type BusinessDoc } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { failure, todayBounds, useMinute, usePeople } from "@/lib/pipeline";
import { ConfirmDelete } from "./confirm-delete";
import { FilterMenu } from "./filter-menus";
import { AddTaskDialog, type EditableTask } from "./pipeline-dialogs";
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
  const { canEdit, can, _id: me } = useStaff();
  const canMake = can("tasks", "edit");
  const people = usePeople(business._id);
  const now = useMinute();
  const [chip, setChip] = useState<Chip>("all");
  const [assignee, setAssignee] = useState<Id<"users"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableTask | null>(null);
  const [deleting, setDeleting] = useState<{ id: Id<"opportunityTasks">; title: string } | null>(null);
  const setDone = useMutation(api.crm.opportunityTasks.setDone);
  const removeTask = useMutation(api.crm.opportunityTasks.removeTask);
  // "/tasks?task=<id>" (a task's name on Home): scroll to that task and flash it once.
  const wanted = useRef(useSearchParams().get("task"));
  const [found, setFound] = useState<string | null>(null);
  const { todayStart, todayEnd } = todayBounds();
  const data = useKept(useQuery(api.crm.opportunityTasks.listAll, { businessId: business._id, now, todayStart, todayEnd, ...(assignee ? { assigneeId: assignee } : {}) }));
  const ready = data !== undefined && people !== undefined;
  useEffect(() => {
    const id = wanted.current;
    if (!id || !ready) return;
    wanted.current = null;
    const el = document.getElementById(`task-${id}`);
    if (!el) return toast("That task is no longer in the list.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFound(id);
  }, [ready, toast]);
  if (data === undefined || people === undefined) return <PipelineTasksSkeleton />;

  const nameOf = (id: Id<"users"> | undefined) => (id ? (people.find((p) => p.id === id)?.name ?? "") : "Unassigned");
  const rows = data.rows.filter((r) => {
    if (chip === "all") return true;
    if (r.dueAt === undefined) return false;
    return chip === "overdue" ? r.dueAt < todayStart : chip === "today" ? r.dueAt >= todayStart && r.dueAt <= todayEnd : r.dueAt > todayEnd;
  });

  const actions = (t: { id: Id<"opportunityTasks">; title: string; description?: string; dueAt?: number; assigneeId?: Id<"users"> }) =>
    canMake ? (
      <span className="pl-tact">
        <button type="button" className="icon-btn" aria-label={`Edit ${t.title}`} data-tip="Edit" onClick={() => setEditing({ id: t.id, title: t.title, description: t.description, dueAt: t.dueAt, assigneeId: t.assigneeId })}><Icon name="pencil" size={18} /></button>
        <button type="button" className="icon-btn" aria-label={`Delete ${t.title}`} data-tip="Delete" onClick={() => setDeleting({ id: t.id, title: t.title })}><Icon name="trash" size={18} /></button>
      </span>
    ) : <span />;

  return (
    <div className="pl-taskspage">
      <div className="pl-taskhead">
        <h2>All tasks</h2>
        {canMake && <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> New task</button>}
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
                options={[{ label: "Anyone" }, { label: "Me" }, ...people.map((p) => ({ label: p.name }))]}
                selected={assignee ? (assignee === me ? "Me" : nameOf(assignee)) : "Anyone"}
                onSelect={(label) => setAssignee(label === "Anyone" ? null : label === "Me" ? me : (people.find((p) => p.name === label)?.id ?? null))}
                close={close}
              />
            ), { className: "filter" })
          }
        >
          Assignee<span className="sep" /><b>{assignee ? (assignee === me ? "Me" : nameOf(assignee)) : "Anyone"}</b>
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="pl-none" style={{ textAlign: "left" }}>No tasks to show.</p>
      ) : (
        <TaskTable>
          {rows.map((t) => (
            <tr key={t.id} id={`task-${t.id}`} className={found === t.id ? "found" : ""}>
              <td><input type="checkbox" checked={false} disabled={!canEdit} onChange={() => void setDone({ taskId: t.id, done: true }).catch((e) => toast(failure(e, "The task could not be updated.")))} aria-label={`Complete ${t.title}`} /></td>
              <td><b className="strong">{t.title}</b></td>
              <td title={t.description}>{t.description || <span className="sub">—</span>}</td>
              <td title={t.projectTitle ? `${t.projectTitle} · ${t.code}` : undefined}>{t.projectTitle ? `${t.projectTitle} · ${t.code}` : <span className="sub">No project</span>}</td>
              <td>{t.dueAt === undefined ? <span className="sub">No due date</span> : quoteDate(t.dueAt)}</td>
              <td>{nameOf(t.assigneeId)}</td>
              <td>{actions(t)}</td>
            </tr>
          ))}
        </TaskTable>
      )}

      <section className="pl-completed" aria-label="Completed tasks">
        <h2>Completed <span className="pl-badge small">{data.counts.completed}</span></h2>
        {data.completed.length === 0 ? (
          <p className="pl-none" style={{ textAlign: "left" }}>Tasks you finish will be kept here.</p>
        ) : (
          <TaskTable done>
            {data.completed.map((t) => (
              <tr key={t.id} id={`task-${t.id}`} className={found === t.id ? "found" : ""}>
                <td><input type="checkbox" checked disabled={!canEdit} onChange={() => void setDone({ taskId: t.id, done: false }).catch((e) => toast(failure(e, "The task could not be updated.")))} aria-label={`Reopen ${t.title}`} /></td>
                <td><b className="strong t">{t.title}</b></td>
                <td title={t.description}>{t.description || <span className="sub">—</span>}</td>
                <td title={t.projectTitle ? `${t.projectTitle} · ${t.code}` : undefined}>{t.projectTitle ? `${t.projectTitle} · ${t.code}` : <span className="sub">No project</span>}</td>
                <td>{t.completedAt ? `Done ${quoteDate(t.completedAt)}` : "Done"}</td>
                <td>{nameOf(t.assigneeId)}</td>
                <td>{actions(t)}</td>
              </tr>
            ))}
          </TaskTable>
        )}
      </section>
      {creating && <AddTaskDialog businessId={business._id} people={people} defaultAssignee={me} onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDelete
          title="Delete this task?"
          note={`"${deleting.title}" will be deleted. This cannot be undone.`}
          doneMessage="The task was deleted."
          failMessage="The task could not be deleted."
          action={() => removeTask({ taskId: deleting.id })}
          onClose={() => setDeleting(null)}
        />
      )}
      {editing && <AddTaskDialog businessId={business._id} people={people} task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The columns of both task tables (fixed widths, D-035): tick, Task, Description, Project, Due (or Done), Assignee, and the Edit and Delete buttons. */
export const TASK_COLS = [44, "17%", "24%", "18%", 120, "14%", 88] as const;

function TaskTable({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table className={`table single pl-tasktable${done ? " done" : ""}`}>
        <colgroup>{TASK_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr><th><span className="sr">Done</span></th><th>Task</th><th>Description</th><th>Project</th><th>{done ? "Completed" : "Due"}</th><th>Assignee</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
