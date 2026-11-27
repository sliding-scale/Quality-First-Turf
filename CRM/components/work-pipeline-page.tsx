"use client";

/* Preplanning and Construction (D-080): the same board as Sales, with the PRD's stages for that pipeline. Projects arrive from the
   previous pipeline (Start preplanning, Start construction), not from Add New. */

import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { pipelineLabel, type WorkPipeline } from "@/convex/crm/lib/stages";
import { EmptyBackend } from "./empty-backend";
import { WorkPipelineBoard } from "./work-pipeline-board";
import { WorkPipelineSkeleton } from "./skeletons";

export function WorkPipelinePage({ pipeline }: { pipeline: WorkPipeline }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <WorkPipelineSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <WorkPipeline pipeline={pipeline} business={workspace.business} />;
}

function WorkPipeline({ pipeline, business }: { pipeline: WorkPipeline; business: BusinessDoc }) {
  return (
    <div className="pl fade-in">
      <h1 className="sr">{pipelineLabel(pipeline)} pipeline</h1>
      <div className="pl-top">
        <div className="pl-tabs">
          <span className="pl-tab-btn active static" role="tab" aria-selected="true">{pipelineLabel(pipeline)}</span>
        </div>
      </div>
      <div className="pl-content fade-in">
        <WorkPipelineBoard pipeline={pipeline} business={business} />
      </div>
    </div>
  );
}
