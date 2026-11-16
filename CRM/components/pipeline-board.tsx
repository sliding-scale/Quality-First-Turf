"use client";

/* The Pipeline tab (D-061): Jobber's board, with the PRD's stages. Two groups (Requests, Quotes) of columns, each with its cards.
   Cards move by drag and drop or from their menu; every move goes through crm/pipeline:moveStage, which checks the rules and
   writes the history. Closed Won and Closed Lost are not columns: while a card is dragged, two targets appear for them. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BusinessDoc } from "@/lib/clients";
import { moneyCents } from "@/lib/format";
import { clock, failure, timeLabel, useBoard, useCoarsePointer, viewActions, useMinute, usePeople, type BoardCard, type BoardGroup } from "@/lib/pipeline";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { LostReasonDialog } from "./pipeline-dialogs";
import { CloseWonDialog } from "./won-dialog";
import { PipelinePanel } from "./pipeline-panel";
import { BoardBar, useBoardFilters, useTouchDrag } from "./pipeline-shared";
import { PipelineBoardSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const GROUPS: BoardGroup[] = ["Requests", "Quotes", "Closed"];
/** In the Closed group the columns are headed Won and Lost. */
const heading = (group: BoardGroup, name: string) => (group === "Closed" ? name.replace(/^Closed /, "") : name);

export function PipelineBoard({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { popover, dropdown, toast } = useUI();
  const { canEdit } = useStaff();
  const moveStage = useMutation(api.crm.pipeline.moveStage);
  const startPreplanning = useMutation(api.crm.pipeline.startPreplanning);
  const markOutcome = useMutation(api.crm.pipeline.markOutcome);
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const now = useMinute();
  const people = usePeople(business._id);

  const { filters, set, q, setQ } = useBoardFilters();
  const [folded, setFolded] = useState<Record<BoardGroup, boolean>>({ Requests: false, Quotes: false, Closed: false });
  const coarse = useCoarsePointer();
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<BoardCard | null>(null);
  const [closingWon, setClosingWon] = useState<BoardCard | null>(null);
  const [openId, setOpenId] = useState<Id<"opportunities"> | null>(null);

  const touchStart = useTouchDrag<BoardCard>(canEdit);
  const board = useBoard(business._id, filters, now);
  if (board === undefined || people === undefined) return <PipelineBoardSkeleton />;

  async function move(card: BoardCard, to: string) {
    if (card.stage === to) return;
    if (to === "Closed Won") return won(card);
    if (to === "Closed Lost") return setLost(card);
    try {
      await moveStage({ id: card.id, to, now: clock() });
      const target = board?.columns.find((c) => c.name === to);
      toast(`${card.title} was moved to ${target ? heading(target.group, target.name) : to}.`);
    } catch (e) {
      toast(failure(e, "The project could not be moved. Try again."));
    }
  }
  /** Opens the "Close as won" checklist. The move itself is made from there, once the signed contract is in. */
  function won(card: BoardCard) {
    setClosingWon(card);
  }

  function cardMenu(card: BoardCard, anchor: HTMLElement) {
    dropdown(anchor, [
      ...viewActions(card).map((v) => ({
        label: v.label,
        icon: v.key === "quote" ? "quote" : v.key === "schedule" ? "calendar" : "inbox",
        disabled: !v.href,
        onSelect: () => { if (v.href) router.push(v.href); },
      })),
      {
        label: "Salesperson",
        icon: "user",
        disabled: !canEdit,
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
                  setSalesperson({ id: card.id, salespersonId: person ? person.id : null }).catch((e) => toast(failure(e, "The salesperson could not be changed.")));
                }}
                close={close}
              />
            ),
            { className: "filter" },
          ),
      },
      {
        label: "Move to…",
        icon: "stage",
        disabled: !canEdit,
        onSelect: () =>
          popover(
            anchor,
            (close) => (
              <FilterMenu
                placeholder="Search stages"
                options={board!.columns.filter((c) => c.name !== card.stage).map((c) => ({ label: heading(c.group, c.name) }))}
                selected=""
                onSelect={(label) => {
                  const target = board!.columns.find((c) => heading(c.group, c.name) === label);
                  if (target) void move(card, target.name);
                }}
                close={close}
              />
            ),
            { className: "filter" },
          ),
      },
      // Closed Won hands a project to Preplanning by itself. This is for a won project still on this board (won before that, or sent back).
      ...(card.stage === "Closed Won"
        ? [{
            label: "Start preplanning",
            icon: "stage",
            disabled: !canEdit,
            onSelect: () => {
              void startPreplanning({ id: card.id, now: clock() })
                .then(() => toast(`${card.title} is now in Preplanning.`))
                .catch((e) => toast(failure(e, "The project could not be sent to Preplanning.")));
            },
          }]
        : []),
      { divider: true },
      { label: "Mark as won", icon: "check", disabled: !canEdit || card.stage === "Closed Won", onSelect: () => void won(card) },
      { label: "Mark as Lost", icon: "x", disabled: !canEdit || card.stage === "Closed Lost", onSelect: () => setLost(card) },
    ]);
  }

  const open = openId ? board.columns.flatMap((c) => c.cards).find((c) => c.id === openId) : undefined;

  return (
    <div className="pl-tab">
      <BoardBar filters={filters} set={set} q={q} setQ={setQ} people={people} total={board.total} searchLabel="Search opportunities" />

      <div className="pl-boardwrap">
        <div className="pl-board" onDragEnd={() => { setDragging(null); setOver(null); }}>
          {GROUPS.map((group) => {
            const columns = board.columns.filter((c) => c.group === group);
            if (columns.length === 0) return null;
            const isFolded = folded[group];
            return (
              <section key={group} className={`pl-group${isFolded ? " folded" : ""}`} aria-label={group}>
                <div className="pl-rail">
                  <span className="pl-badge" data-tip={`${board.groups[group].count} in ${group}`}>{board.groups[group].count}</span>
                  <span className="pl-vlabel">{group}</span>
                  {group !== "Closed" && (canEdit
                    ? <Link className="pl-railbtn" href={group === "Requests" ? "/requests/new" : "/quotes/new"} aria-label={group === "Requests" ? "New request" : "New quote"}><Icon name="plus" size={18} /></Link>
                    : <button type="button" className="pl-railbtn" disabled aria-label={group === "Requests" ? "New request" : "New quote"}><Icon name="plus" size={18} /></button>)}
                  <button
                    type="button"
                    className="pl-railbtn pl-fold"
                    aria-label={isFolded ? `Show ${group}` : `Hide ${group}`}
                    aria-expanded={!isFolded}
                    data-tip={isFolded ? `Show ${group}` : `Hide ${group}`}
                    onClick={() => setFolded((f) => ({ ...f, [group]: !f[group] }))}
                  >
                    <span style={{ display: "inline-grid", transform: isFolded ? "rotate(180deg)" : undefined, transition: "transform 0.2s ease" }}><Icon name="arrowleft" size={18} /></span>
                  </button>
                </div>
                <div className="pl-cols" aria-hidden={isFolded}>
                  {columns.map((col) => {
                    const droppable = dragging !== null && dragging.stage !== col.name;
                    return (
                      <div key={col.name} data-stage={col.name} className={`pl-col${col.group === "Closed" ? " closed" : ""}${over === col.name && droppable ? " over" : ""}${droppable ? " ok" : ""}`}>
                        <div className="pl-colhead">
                          <h3>{heading(group, col.name)}</h3>
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
                              draggable={canEdit && !coarse}
                              onTouchStart={(e) => touchStart(e, card, (c, stage) => void move(c, stage))}
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
                              <div className="pl-service"><Icon name="inbox" size={16} /><span>{card.title}</span></div>
                              <div className="pl-cardfoot">
                                <span className="pl-time" data-tip="Time in this stage">{timeLabel(card.timeInStageMs)}</span>
                                <span className="pl-value">{moneyCents(card.valueCents)}</span>
                              </div>
                            </article>
                          ))}
                          {col.cards.length === 0 && <div className="pl-empty">{droppable ? "Drop here" : "No opportunities"}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {open && <PipelinePanel business={business} card={open} people={people} onClose={() => setOpenId(null)} />}
      </div>

      {closingWon && <CloseWonDialog projectId={closingWon.id} businessId={business._id} title={closingWon.title} onClose={() => setClosingWon(null)} />}
      {lost && (
        <LostReasonDialog
          project={`${lost.title} · ${lost.code}`}
          onClose={() => setLost(null)}
          onConfirm={async (reason) => {
            await markOutcome({ id: lost.id, outcome: "lost", reason, now: clock() });
            toast(`${lost.title} was marked as lost.`);
          }}
        />
      )}
    </div>
  );
}
