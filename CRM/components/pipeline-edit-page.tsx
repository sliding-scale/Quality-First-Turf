"use client";

import { useWorkspace } from "@/lib/clients";
import { EmptyBackend } from "./empty-backend";
import { PipelineEditStages } from "./pipeline-edit-stages";
import { PipelineEditSkeleton } from "./skeletons";

export function PipelineEditPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <PipelineEditSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <PipelineEditStages business={workspace.business} />;
}
