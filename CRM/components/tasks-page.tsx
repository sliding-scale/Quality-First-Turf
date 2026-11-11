"use client";

/* Tasks (D-061): every task on the business's projects, in its own place in the sidebar. The list itself, with its Completed
   section, is PipelineTasks. */

import { useWorkspace } from "@/lib/clients";
import { EmptyBackend } from "./empty-backend";
import { PipelineTasks } from "./pipeline-tasks";
import { TasksSkeleton } from "./skeletons";

export function TasksPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <TasksSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return (
    <div className="tasks-route fade-in">
      <div className="page-head"><h1>Tasks</h1></div>
      <PipelineTasks business={workspace.business} />
    </div>
  );
}
