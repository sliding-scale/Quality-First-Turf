"use client";

/* Edit stages (D-061), laid out like Jobber's: the Requests and Quotes groups side by side, each stage a column. The nine PRD stages
   are locked (a padlock); a stage with no projects can be hidden, and a business can add its own stages, rename, reorder and delete
   them. Every change saves at once ("All changes saved"). */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { BusinessDoc } from "@/lib/clients";
import { failure, type PipelineGroup } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineEditSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const GROUPS: PipelineGroup[] = ["Requests", "Quotes"];
const RULE: Record<string, string> = {
  "New Request": "A new request is created",
  "Schedule Onsite Consultation": "The request needs an onsite consultation that is not scheduled yet",
  "Onsite Consultation": "The onsite consultation has been scheduled",
  "Quote Draft & Site Plan / Design": "A quote and site plan are being prepared and have not been sent to the client yet",
  "Proposal Delivered — Awaiting Response": "The proposal has been sent to the client and is awaiting a response",
  "Changes Requested": "The client has asked for changes to the proposal",
  "Quotes Approved — Contract Out for Signature": "The client approved the quote and the contract is out for signature",
};

export function PipelineEditStages({ business }: { business: BusinessDoc }) {
  const { toast } = useUI();
  const { canEdit } = useStaff();
  const stages = useQuery(api.crm.pipeline.stagesForEdit, { businessId: business._id });
  const addStage = useMutation(api.crm.pipeline.addStage);
  const renameStage = useMutation(api.crm.pipeline.renameStage);
  const hide = useMutation(api.crm.pipeline.setStageHidden);
  const reorder = useMutation(api.crm.pipeline.reorderStages);
  const del = useMutation(api.crm.pipeline.deleteStage);
  const [saved, setSaved] = useState(false);
  const [showHidden, setShowHidden] = useState<Record<PipelineGroup, boolean>>({ Requests: false, Quotes: false });
  const dragName = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (stages === undefined) return <PipelineEditSkeleton />;

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn();
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      toast(failure(e, fallback));
    }
  }

  return (
    <div className="pl-edit fade-in">
      <div className="pl-editbar">
        <Link href="/pipeline" className="pl-back"><Icon name="chevleft" size={18} /> Sales pipeline</Link>
        {saved && <span className="pl-saved" role="status"><span className="dot" /> All changes saved</span>}
      </div>
      <h1>Edit stages</h1>
      <div className="pl-editgroups">
        {GROUPS.map((group) => {
          const mine = stages.filter((s) => s.group === group);
          const hiddenCount = mine.filter((s) => s.hidden).length;
          const shown = mine.filter((s) => showHidden[group] || !s.hidden);
          return (
            <section key={group} className="pl-editgroup">
              <header>
                <h2>{group}</h2>
                <div className="pl-editactions">
                  {hiddenCount > 0 && (
                    <button type="button" className="btn dark" data-tip={showHidden[group] ? "Hide the hidden stages" : `Show ${hiddenCount} hidden stage${hiddenCount === 1 ? "" : "s"}`} onClick={() => setShowHidden((s) => ({ ...s, [group]: !s[group] }))}>
                      <Icon name="eye" size={18} /> {hiddenCount}
                    </button>
                  )}
                  <button type="button" className="btn" disabled={!canEdit} onClick={() => void run(() => addStage({ businessId: business._id, group, name: uniqueName(stages.map((s) => s.name)) }), "The stage could not be added.")}>
                    + Add a stage
                  </button>
                </div>
              </header>
              <div className="pl-editcols">
                {shown.map((s) => (
                  <div
                    key={s.name}
                    className={`pl-editcol${s.hidden ? " hiddenstage" : ""}`}
                    onDragOver={(e) => { if (dragName.current && dragName.current !== s.name) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragName.current;
                      dragName.current = null;
                      if (!from || from === s.name) return;
                      const order = mine.map((m) => m.name).filter((n) => n !== from);
                      order.splice(order.indexOf(s.name), 0, from);
                      void run(() => reorder({ businessId: business._id, group, names: order }), "The stages could not be reordered.");
                    }}
                  >
                    <div className="pl-editicons">
                      {s.locked ? (
                        <span className="pl-iconbox" data-tip="Locked stage" aria-label="Locked stage"><Icon name="lock" size={18} /></span>
                      ) : (
                        <span className="pl-iconbox grip" draggable={canEdit} onDragStart={() => { dragName.current = s.name; }} data-tip="Drag to reorder" aria-label="Drag to reorder"><Icon name="grip" size={18} /></span>
                      )}
                      <span className="grow" />
                      <button
                        type="button"
                        className="pl-iconbox"
                        disabled={!canEdit || (!s.hidden && s.projects > 0)}
                        data-tip={s.hidden ? "Show stage" : s.projects > 0 ? "Move its projects out to hide it" : "Hide stage"}
                        aria-label={s.hidden ? "Show stage" : "Hide stage"}
                        onClick={() => void run(() => hide({ businessId: business._id, name: s.name, hidden: !s.hidden }), "The stage could not be changed.")}
                      ><Icon name={s.hidden ? "eye" : "eyeoff"} size={18} /></button>
                      {!s.locked && (
                        <button
                          type="button"
                          className="pl-iconbox"
                          disabled={!canEdit || s.projects > 0}
                          data-tip={s.projects > 0 ? "Move its projects out to delete it" : "Delete stage"}
                          aria-label="Delete stage"
                          onClick={() => void run(() => del({ businessId: business._id, name: s.name }), "The stage could not be deleted.")}
                        ><Icon name="trash" size={18} /></button>
                      )}
                    </div>
                    {s.locked ? (
                      <h3>{s.name}</h3>
                    ) : (
                      <input
                        className="pl-stagename"
                        aria-label="Stage name"
                        defaultValue={s.name}
                        maxLength={60}
                        disabled={!canEdit}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim();
                          if (!v || v === s.name) { e.currentTarget.value = s.name; return; }
                          void run(() => renameStage({ businessId: business._id, name: s.name, newName: v }), "The stage could not be renamed.").then(() => undefined);
                        }}
                      />
                    )}
                    {s.locked && RULE[s.name] && (
                      <div className="pl-rule"><b>Rule</b><span>Opportunities enter when:</span><p>{RULE[s.name]}</p></div>
                    )}
                    {s.projects > 0 && <div className="pl-editcount">{s.projects} project{s.projects === 1 ? "" : "s"}</div>}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** "New stage 1", "New stage 2"... the first one nobody has used. */
function uniqueName(taken: string[]): string {
  let n = 1;
  while (taken.some((t) => t.toLowerCase() === `new stage ${n}`)) n += 1;
  return `New stage ${n}`;
}
