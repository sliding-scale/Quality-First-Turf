"use client";

/* The Preplanning, Construction and Backend (stored as Finance) boards (D-080, PRD 5.1). Cards move inside the pipeline through crm/pipeline:moveStage.
   Crossing into the next pipeline is a menu action, so a drag never leaves this board. */

import { useConvex, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { BusinessDoc } from "@/lib/clients";
import { moneyCents } from "@/lib/format";
import { clock, failure, timeLabel, useCoarsePointer, useMinute, usePeople, useWorkBoard, type WorkCard } from "@/lib/pipeline";
import { COMPLETION_STAGE, CONSTRUCTION_STAGES, FINANCE_ENTRY, FINANCE_STAGES, pipelineLabel, PREPLANNING_STAGES, type WorkPipeline } from "@/convex/crm/lib/stages";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PipelinePanel } from "./pipeline-panel";
import { PipelineList } from "./pipeline-list";
import { BoardBar, useBoardFilters, useBoardView, useTouchDrag } from "./pipeline-shared";
import { PipelineListSkeleton, WorkPipelineBoardSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const LAST_PREPLANNING = PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1];
const FIRST_PREPLANNING = PREPLANNING_STAGES[0];
const FIRST_CONSTRUCTION = CONSTRUCTION_STAGES[0];

export function WorkPipelineBoard({ pipeline, business }: { pipeline: WorkPipeline; business: BusinessDoc }) {
  const router = useRouter();
  const { popover, dropdown, toast } = useUI();
  const { canEdit, can } = useStaff();
  // Each pipeline is its own permission module (PRD 5.5): Edit in it moves its cards. The backend checks the same.
  const canMove = can(pipeline === "Preplanning" ? "pipelinePreplanning" : pipeline === "Construction" ? "pipelineConstruction" : "pipelineFinance", "edit");
  const moveStage = useMutation(api.crm.pipeline.moveStage);
  const startConstruction = useMutation(api.crm.pipeline.startConstruction);
  const returnToSales = useMutation(api.crm.pipeline.returnToSales);
  const returnToPreplanning = useMutation(api.crm.pipeline.returnToPreplanning);
  const startFinance = useMutation(api.crm.pipeline.startFinance);
  const returnToConstruction = useMutation(api.crm.pipeline.returnToConstruction);
  const convex = useConvex();
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const now = useMinute();
  const people = usePeople(business._id);

  const { filters, set, q, setQ } = useBoardFilters();
  const { view, setView } = useBoardView();
  const coarse = useCoarsePointer();
  const [dragging, setDragging] = useState<WorkCard | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [openId, setOpenId] = useState<WorkCard["id"] | null>(null);

  const touchStart = useTouchDrag<WorkCard>(canMove);
  const board = useWorkBoard(business._id, pipeline, filters, now);
  if (board === undefined || people === undefined) return view === "list" ? <PipelineListSkeleton /> : <WorkPipelineBoardSkeleton />;

  async function act(card: WorkCard, done: string, go: () => Promise<unknown>) {
    try {
      await go();
      toast(`${card.title} ${done}`);
    } catch (e) {
      toast(failure(e, "The project could not be moved. Try again."));
    }
  }
  async function move(card: WorkCard, to: string) {
    if (card.stage === to || card.movedTo) return;
    await act(card, `was moved to ${to}.`, () => moveStage({ id: card.id, to, now: clock() }));
  }

  function cardMenu(card: WorkCard, anchor: HTMLElement) {
    const handoff = pipeline === "Preplanning" && card.stage === LAST_PREPLANNING
      ? { label: "Start construction", done: "is now in Construction.", go: () => startConstruction({ id: card.id, now: clock() }) }
      : pipeline === "Preplanning" && card.stage === FIRST_PREPLANNING && card.outcome === "won"
        ? { label: "Return to Sales", done: "was returned to Sales.", go: () => returnToSales({ id: card.id, now: clock() }) }
        : pipeline === "Construction" && card.stage === FIRST_CONSTRUCTION
          ? { label: "Return to Preplanning", done: "was returned to Preplanning.", go: () => returnToPreplanning({ id: card.id, now: clock() }) }
          : pipeline === "Construction" && card.stage === COMPLETION_STAGE
            ? { label: "Move to Backend", done: "is now in Backend.", go: () => startFinance({ id: card.id, now: clock() }) }
            : pipeline === "Finance" && card.stage === FINANCE_ENTRY
              ? { label: "Return to Construction", done: "was returned to Construction.", go: () => returnToConstruction({ id: card.id, now: clock() }) }
              : null;
    const money = pipeline === "Finance" ? [
      { label: "Billing and invoices", icon: "receipt", onSelect: () => router.push(`/opportunities/${card.id}?tab=billing`) },
      ...(card.stage === FINANCE_STAGES[3] ? [{ label: "Copy review link", icon: "newtab", onSelect: () => void copyReviewLink() }] : []),
    ] : [];
    dropdown(anchor, [
      { label: "View opportunity", icon: "inbox", onSelect: () => router.push(`/opportunities/${card.id}`) },
      ...(card.quoteId ? [{ label: "View Quote", icon: "quote", onSelect: () => router.push(`/quotes/${card.quoteId}`) }] : []),
      ...money,
      {
        label: "Salesperson",
        icon: "user",
        reason: !canEdit ? "Your role can look at this but not change it." : undefined,
        onSelect: () =>
          popover(
            anchor,
            (close) => (
              <FilterMenu
                placeholder="Search salespeople"
                options={[{ label: "Unassigned" }, ...people!.map((p) => ({ label: p.name }))]}
                selected={card.salespersonName}
                onSelect={(label) => {
                  const person = people!.find((p) => p.name === label);
                  setSalesperson({ id: card.id, salespersonId: person ? person.id : null }).catch((err) => toast(failure(err, "The salesperson could not be changed.")));
                }}
                close={close}
              />
            ),
            { className: "filter" },
          ),
      },
      // A project that has moved on to Construction is moved from the Construction board, so only what does not move it is offered here.
      ...(card.movedTo ? [] : [{
        label: "Move to…",
        icon: "stage",
        reason: !canMove ? "Your role can look at this but not change it." : undefined,
        onSelect: () =>
          popover(
            anchor,
            (close) => (
              <FilterMenu
                placeholder="Search stages"
                options={board!.columns.filter((c) => c.name !== card.stage).map((c) => ({ label: c.name }))}
                selected=""
                onSelect={(label) => { const target = board!.columns.find((c) => c.name === label); if (target) void move(card, target.name); }}
                close={close}
              />
            ),
            { className: "filter" },
          ),
      }]),
      ...(handoff && !card.movedTo ? [{ label: handoff.label, icon: "stage", reason: !canEdit ? "Your role can look at this but not change it." : undefined, onSelect: () => void act(card, handoff.done, handoff.go) }] : []),
    ]);
  }

  async function copyReviewLink() {
    const settings = await convex.query(api.crm.invoiceSettings.get, { businessId: business._id });
    if (!settings.reviewLink) return toast("No review link is set yet. An Admin adds it in Settings > Invoices.");
    try {
      await navigator.clipboard.writeText(settings.reviewLink);
      toast("Review link copied. Send it to the client.");
    } catch {
      toast(settings.reviewLink);
    }
  }

  const open = openId ? board.columns.flatMap((c) => c.cards).find((c) => c.id === openId) : undefined;

  return (
    <div className="pl-tab">
      <BoardBar filters={filters} set={set} q={q} setQ={setQ} people={people} total={board.total} searchLabel="Search projects" view={view} setView={setView} />

      {view === "list" ? (
        <div className="pl-boardwrap">
          <PipelineList
            rows={board.columns.flatMap((c) => c.cards)}
            filters={filters}
            selectedId={openId}
            emptyText="No projects match these filters."
            onOpen={(card) => setOpenId((id) => (id === card.id ? null : card.id))}
            onMenu={cardMenu}
          />
          {open && <PipelinePanel business={business} card={open} people={people} onClose={() => setOpenId(null)} />}
        </div>
      ) : (
      <div className="pl-boardwrap">
        <div className="pl-board work" onDragEnd={() => { setDragging(null); setOver(null); }}>
          <section className="pl-group" aria-label={pipelineLabel(pipeline)}>
            <div className="pl-rail">
              <span className="pl-badge" data-tip={`${board.total} in ${pipelineLabel(pipeline)}`}>{board.total}</span>
              <span className="pl-vlabel">{pipelineLabel(pipeline)}</span>
            </div>
            <div className="pl-cols">
              {board.columns.map((col) => {
                const droppable = dragging !== null && dragging.stage !== col.name;
                return (
                  <div key={col.name} data-stage={col.name} className={`pl-col${over === col.name && droppable ? " over" : ""}${droppable ? " ok" : ""}`}>
                    <div className="pl-colhead">
                      <h3>{col.name}</h3>
                      <div className="pl-colstat"><span className="pl-badge small">{col.count}</span><span>{moneyCents(col.totalCents).replace(/\.00$/, "")}</span></div>
                    </div>
                    <div
                      className="pl-colbody"
                      onDragOver={(e) => { if (droppable) { e.preventDefault(); setOver(col.name); } }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === col.name ? null : o)); }}
                      onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging && droppable) void move(dragging, col.name); setDragging(null); }}
                    >
                      {col.cards.map((card) => (
                        <article
                          key={card.id}
                          className={`pl-card${dragging?.id === card.id ? " dragging" : ""}${openId === card.id ? " open" : ""}`}
                          draggable={canMove && !coarse && !card.movedTo}
                          onTouchStart={(e) => { if (!card.movedTo) touchStart(e, card, (c, stage) => void move(c, stage)); }}
                          tabIndex={0}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; setDragging(card); }}
                          onClick={() => setOpenId((id) => (id === card.id ? null : card.id))}
                          onKeyDown={(e) => { if (e.key === "Enter") setOpenId((id) => (id === card.id ? null : card.id)); }}
                        >
                          <div className="pl-cardtop">
                            <div className="pl-title">{card.title} · {card.code}</div>
                            <button
                              type="button"
                              className="pl-more"
                              aria-label={`Actions for ${card.title}`}
                              data-tip="More actions"
                              onClick={(e) => { e.stopPropagation(); cardMenu(card, e.currentTarget); }}
                              draggable={false}
                            ><Icon name="more" size={18} /></button>
                          </div>
                          <div className="pl-client">{card.clientName}</div>
                          {card.movedTo && <div className="pl-movedto" data-tip={`Moved on to ${card.movedTo.split(":")[0]}`}>In {card.movedTo}</div>}
                          {card.balanceCents !== undefined && <div className={`pl-balance${card.balanceCents > 0 ? " owed" : ""}`}>{card.balanceCents > 0 ? `${moneyCents(card.balanceCents)} owed` : "Nothing owed"}</div>}
                          <div className="pl-service"><Icon name="inbox" size={16} /><span>{card.title}</span></div>
                          <div className="pl-cardfoot">
                            <span className="pl-time" data-tip="Time in this stage">{timeLabel(card.timeInStageMs)}</span>
                            <span className="pl-value">{moneyCents(card.valueCents)}</span>
                          </div>
                        </article>
                      ))}
                      {col.cards.length === 0 && <div className="pl-empty">{droppable ? "Drop here" : "No projects"}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        {open && <PipelinePanel business={business} card={open} people={people} onClose={() => setOpenId(null)} />}
      </div>
      )}
    </div>
  );
}
