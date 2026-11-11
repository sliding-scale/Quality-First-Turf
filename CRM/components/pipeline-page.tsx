"use client";

/* The Pipeline screen (D-061): the Sales pipeline board and its Sales Outcomes, as Jobber lays them out. Tasks is its own item in the sidebar (/tasks).
   The tab is kept in the address (?tab=outcomes) so a reload or a shared link lands on the same tab. */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { PipelineBoard } from "./pipeline-board";
import { FeedbackDialog } from "./pipeline-dialogs";
import { PipelineOutcomes } from "./pipeline-outcomes";
import { PipelineSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Tab = "pipeline" | "outcomes";

export function PipelinePage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <PipelineSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Pipeline business={workspace.business} />;
}

function Pipeline({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { dropdown } = useUI();
  const { canEdit } = useStaff();
  const raw = params.get("tab");
  const tab: Tab = raw === "outcomes" ? raw : "pipeline";
  const [feedback, setFeedback] = useState(false);
  // Tasks has its own place in the sidebar now; an old link to the Tasks tab lands there.
  useEffect(() => {
    if (raw === "tasks") router.replace("/tasks");
  }, [raw, router]);

  const pick = (t: Tab) => router.replace(t === "pipeline" ? "/pipeline" : `/pipeline?tab=${t}`, { scroll: false });

  return (
    <div className="pl fade-in">
      <div className="pl-top">
        <div className="pl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "pipeline"} className={`pl-tab-btn${tab === "pipeline" ? " active" : ""}`} onClick={() => pick("pipeline")}>Pipeline</button>
          <button type="button" role="tab" aria-selected={tab === "outcomes"} className={`pl-tab-btn${tab === "outcomes" ? " active" : ""}`} onClick={() => pick("outcomes")}>Sales Outcomes</button>
        </div>
      </div>
      {tab === "pipeline" && (
        <div className="pl-actionrow">
          <div className="pl-actions">
            <button
              type="button"
              className="btn primary"
              onClick={(e) => dropdown(e.currentTarget, [{ label: "Request", icon: "inbox", disabled: true }, { label: "Quote", icon: "quote", disabled: true }], { alignRight: true })}
            >
              <Icon name="plus" size={18} /> Add New
            </button>
            <button
              type="button"
              className="btn"
              onClick={(e) =>
                dropdown(
                  e.currentTarget,
                  [
                    { label: "Edit Stages", icon: "pencil", disabled: !canEdit, onSelect: () => router.push("/pipeline/edit") },
                    { label: "Give Feedback", icon: "message", onSelect: () => setFeedback(true) },
                  ],
                  { alignRight: true },
                )
              }
            >
              <Icon name="more" size={18} /> More Actions
            </button>
          </div>
        </div>
      )}
      <div key={tab} className="pl-content fade-in">
        {tab === "pipeline" && <PipelineBoard business={business} />}
        {tab === "outcomes" && <PipelineOutcomes business={business} />}
      </div>
      {feedback && <FeedbackDialog onClose={() => setFeedback(false)} />}
    </div>
  );
}
