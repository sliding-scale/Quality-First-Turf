"use client";

/* The Preplanning, Construction and Backend (stored as Finance) boards (D-080, PRD 5.1). Cards move inside the pipeline through crm/pipeline:moveStage.
   Crossing into the next pipeline is a menu action, so a drag never leaves this board. */

import { useConvex, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { BusinessDoc } from "@/lib/clients";
import { moneyCents } from "@/lib/format";
import { utcDate } from "@/lib/invoices";
import { clock, failure, timeLabel, useCoarsePointer, useMinute, usePeople, useWorkBoard, type WorkCard } from "@/lib/pipeline";
import { COMPLETION_STAGE, CONSTRUCTION_STAGES, FINANCE_ENTRY, FINANCE_STAGES, pipelineLabel, PREPLANNING_STAGES, type WorkPipeline } from "@/convex/crm/lib/stages";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { PipelinePanel } from "./pipeline-panel";
import { PipelineList } from "./pipeline-list";
import { BoardBar, useBoardFilters, useBoardView, useTouchDrag } from "./pipeline-shared";
import { PipelineListSkeleton, WorkPipelineBoardSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const LAST_PREPLANNING = PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1];
const FIRST_PREPLANNING = PREPLANNING_STAGES[0];
const FIRST_CONSTRUCTION = CONSTRUCTION_STAGES[0];

type Shortfall = NonNullable<FunctionReturnType<typeof api.crm.purchaseOrders.handoffWarning>>;
type Held = { card: WorkCard; short: Shortfall; go: () => Promise<void> };

/** "Materials are not ready" before a project goes to Construction: what is missing, then Cancel or move anyway. */
function MaterialsWarning({ held, onClose }: { held: Held; onClose: () => void }) {
  const { short, card } = held;
  const list = (title: string, names: string[]) =>
    names.length > 0 && (
      <>
        <h3 className="mw-h">{title} ({names.length})</h3>
        <ul className="mw-list">{names.slice(0, 8).map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}{names.length > 8 && <li>and {names.length - 8} more</li>}</ul>
      </>
    );
  return (
    <PipelineModal title="Materials are not ready" onClose={onClose}>
      {(close) => (
        <>
          <p className="modal-lead">{card.title} · {card.code} would move to Construction before everything is here.</p>
          {list("Not ordered", short.notOrdered)}
          {list("Ordered, not delivered", short.onTheWay)}
          {short.latestExpected !== null && <p className="muted">Last delivery expected {utcDate(short.latestExpected)}.</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => { close(); void held.go(); }}>Move to Construction anyway</button>
          </div>
        </>
      )}
    </PipelineModal>
  );
}

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

  const [held, setHeld] = useState<Held | null>(null);

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
  /** A move that takes the project into Construction asks first when materials are still missing (D-136). It never holds the move back. */
  async function intoConstruction(card: WorkCard, done: string, go: () => Promise<unknown>) {
    // If the check itself cannot be made, the move goes ahead: the server still decides whether it is allowed.
    const short = await convex.query(api.crm.purchaseOrders.handoffWarning, { id: card.id }).catch(() => null);
    if (short) setHeld({ card, short, go: () => act(card, done, go) });
    else await act(card, done, go);
  }
  async function move(card: WorkCard, to: string) {
    if (card.stage === to || card.movedTo) return;
    const go = () => moveStage({ id: card.id, to, now: clock() });
    if (pipeline === "Preplanning" && to === LAST_PREPLANNING) await intoConstruction(card, `was moved to ${to}.`, go);
    else await act(card, `was moved to ${to}.`, go);
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
      ...(handoff && !card.movedTo ? [{ label: handoff.label, icon: "stage", reason: !canEdit ? "Your role can look at this but not change it." : undefined, onSelect: () => void (pipeline === "Preplanning" && card.stage === LAST_PREPLANNING ? intoConstruction : act)(card, handoff.done, handoff.go) }] : []),
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
      {held && <MaterialsWarning held={held} onClose={() => setHeld(null)} />}
    </div>
  );
}
