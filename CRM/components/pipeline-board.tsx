"use client";

/* The Pipeline tab (D-061): Jobber's board, with the PRD's stages. Two groups (Requests, Quotes) of columns, each with its cards.
   Cards move by drag and drop or from their menu; every move goes through crm/pipeline:moveStage, which checks the rules and
   writes the history. Closed Won and Closed Lost are not columns: while a card is dragged, two targets appear for them. */

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BusinessDoc } from "@/lib/clients";
import { ALL_TIME, rangeLabel } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { LEAD_SOURCES, NO_SOURCE, SORT_LABEL, clock, failure, timeLabel, useBoard, useCoarsePointer, viewActions, useMinute, usePeople, type BoardCard, type BoardFilters, type BoardGroup, type SortKey } from "@/lib/pipeline";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { LostReasonDialog } from "./pipeline-dialogs";
import { CloseWonDialog } from "./won-dialog";
import { PipelinePanel } from "./pipeline-panel";
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
  const markOutcome = useMutation(api.crm.pipeline.markOutcome);
  const setSalesperson = useMutation(api.crm.pipeline.setSalesperson);
  const now = useMinute();
  const people = usePeople(business._id);

  const [filters, setFilters] = useState<BoardFilters>({ sortKey: "timeInStage", dir: "asc", salespersonId: null, leadSources: [], range: ALL_TIME, search: "" });
  const [q, setQ] = useState("");
  const [folded, setFolded] = useState<Record<BoardGroup, boolean>>({ Requests: false, Quotes: false, Closed: false });
  const coarse = useCoarsePointer();
  const touchCleanup = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<BoardCard | null>(null);
  const [closingWon, setClosingWon] = useState<BoardCard | null>(null);
  const [openId, setOpenId] = useState<Id<"opportunities"> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === q ? f : { ...f, search: q })), 250);
    return () => clearTimeout(t);
  }, [q]);

  const board = useBoard(business._id, filters, now);
  if (board === undefined || people === undefined) return <PipelineBoardSkeleton />;

  const set = (patch: Partial<BoardFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const personName = filters.salespersonId === null ? "All" : filters.salespersonId === "unassigned" ? "Unassigned" : (people.find((p) => p.id === filters.salespersonId)?.name ?? "All");
  const sourceLabel = filters.leadSources.length === 0 ? "All" : filters.leadSources.length === 1 ? filters.leadSources[0] : `${filters.leadSources.length} selected`;

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

  /** Touch: press and hold a card for a moment, then drag it over a column and let go. A swipe before that still scrolls the board.
   *  Built for a high frame rate: while the finger moves, React is not involved at all. The columns' places are measured once when the
   *  drag starts, the held card is a light copy moved with a GPU transform once per frame, and the column under the finger is lit by
   *  switching a class on that one element. The board is only told once, at the end, to move the card. */
  function touchStart(e: ReactTouchEvent<HTMLElement>, card: BoardCard) {
    if (!canEdit || e.touches.length !== 1 || (e.target as HTMLElement).closest(".pl-more")) return;
    touchCleanup.current?.();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const t0 = e.touches[0];
    let x = t0.clientX;
    let y = t0.clientY;
    let active = false;
    let ghost: HTMLElement | null = null;
    let edge: ReturnType<typeof setInterval> | null = null;
    let edgeDir = 0;
    let frame = 0;
    let lit: HTMLElement | null = null;
    const board = el.closest(".pl-board") as HTMLElement | null;
    let spots: { col: HTMLElement; stage: string; left: number; right: number; top: number; bottom: number }[] = [];
    let scroll0 = 0;

    /** The column under the finger, from the places measured at the start (the board may have scrolled sideways since). */
    const stageAt = () => {
      const px = x + ((board?.scrollLeft ?? 0) - scroll0);
      const s = spots.find((c) => px >= c.left && px <= c.right && y >= c.top && y <= c.bottom);
      return s ?? null;
    };
    const light = () => {
      const s = stageAt();
      const col = s && s.stage !== card.stage ? s.col : null;
      if (col === lit) return;
      lit?.classList.remove("over");
      col?.classList.add("over");
      lit = col;
    };
    const paint = () => {
      frame = 0;
      if (ghost) ghost.style.transform = `translate3d(${x - t0.clientX}px, ${y - t0.clientY}px, 0) scale(1.03)`;
      light();
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (edge) clearInterval(edge);
      if (frame) cancelAnimationFrame(frame);
      ghost?.remove();
      lit?.classList.remove("over");
      if (active) {
        board?.classList.remove("touch-drag");
        board?.querySelectorAll(".pl-col.src").forEach((c) => c.classList.remove("src"));
        delete el.dataset.touchDrag;
      }
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
      touchCleanup.current = null;
    };
    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      x = t.clientX;
      y = t.clientY;
      if (!active) {
        if (Math.hypot(x - t0.clientX, y - t0.clientY) > 10) cleanup(); // it is a scroll
        return;
      }
      ev.preventDefault(); // dragging now: do not scroll the page
      if (!frame) frame = requestAnimationFrame(paint);
      if (board) {
        const b = board.getBoundingClientRect();
        const dir = x < b.left + 48 ? -1 : x > b.right - 48 ? 1 : 0;
        if (dir !== edgeDir) {
          edgeDir = dir;
          if (edge) { clearInterval(edge); edge = null; }
          if (dir) edge = setInterval(() => { board.scrollLeft += dir * 12; light(); }, 16);
        }
      }
    };
    const end = (ev: TouchEvent) => {
      const was = active;
      const stage = was ? (stageAt()?.stage ?? null) : null;
      if (was) ev.preventDefault(); // no click on the card after a drag
      cleanup();
      if (was && stage && stage !== card.stage) void move(card, stage);
    };
    const cancel = () => cleanup();
    const timer = setTimeout(() => {
      active = true;
      navigator.vibrate?.(15);
      scroll0 = board?.scrollLeft ?? 0;
      spots = Array.from(document.querySelectorAll<HTMLElement>(".pl-col[data-stage]")).map((col) => {
        const r = col.getBoundingClientRect();
        return { col, stage: col.dataset.stage!, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      board?.classList.add("touch-drag");
      el.closest(".pl-col")?.classList.add("src");
      el.dataset.touchDrag = "1";
      ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-touch-drag");
      Object.assign(ghost.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, margin: "0", zIndex: "200", pointerEvents: "none", opacity: "0.95", boxShadow: "0 6px 16px rgba(3,43,58,0.3)", transition: "none", willChange: "transform", contain: "layout paint" });
      ghost.classList.add("pl-ghost");
      document.body.appendChild(ghost);
    }, 350);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", end, { passive: false });
    document.addEventListener("touchcancel", cancel);
    touchCleanup.current = cleanup;
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
      { divider: true },
      { label: "Mark as won", icon: "check", disabled: !canEdit || card.stage === "Closed Won", onSelect: () => void won(card) },
      { label: "Mark as Lost", icon: "x", disabled: !canEdit || card.stage === "Closed Lost", onSelect: () => setLost(card) },
    ]);
  }

  const open = openId ? board.columns.flatMap((c) => c.cards).find((c) => c.id === openId) : undefined;

  return (
    <div className="pl-tab">
      <div className="pl-bar">
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => (
                  <FilterMenu
                    placeholder="Search"
                    options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ label: SORT_LABEL[k] }))}
                    selected={SORT_LABEL[filters.sortKey]}
                    onSelect={(label) => set({ sortKey: (Object.keys(SORT_LABEL) as SortKey[]).find((k) => SORT_LABEL[k] === label) ?? "timeInStage" })}
                    close={close}
                  />
                ),
                { className: "filter" },
              )
            }
          >
            Sort by<span className="sep" /><b>{SORT_LABEL[filters.sortKey]}</b>
          </button>
          <button
            type="button"
            className="chip pl-dir"
            aria-label={filters.dir === "asc" ? "Ascending. Switch to descending" : "Descending. Switch to ascending"}
            data-tip={filters.dir === "asc" ? "Ascending" : "Descending"}
            onClick={() => set({ dir: filters.dir === "asc" ? "desc" : "asc" })}
          >
            <span style={{ display: "inline-grid", transform: filters.dir === "asc" ? undefined : "rotate(180deg)", transition: "transform 0.15s ease" }}><Icon name="arrowup" size={18} /></span>
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => (
                  <FilterMenu
                    placeholder="Search salesperson"
                    options={[{ label: "All" }, { label: "Unassigned" }, ...people.map((p) => ({ label: p.name }))]}
                    selected={personName}
                    onSelect={(label) => set({ salespersonId: label === "All" ? null : label === "Unassigned" ? "unassigned" : (people.find((p) => p.name === label)?.id ?? null) })}
                    close={close}
                  />
                ),
                { className: "filter" },
              )
            }
          >
            Salesperson<span className="sep" /><b>{personName}</b>
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => (
                  <LeadSourceMenu selected={filters.leadSources} onChange={(leadSources) => set({ leadSources })} close={close} />
                ),
                { className: "filter" },
              )
            }
          >
            Lead source<span className="sep" /><b>{sourceLabel}</b>
          </button>
          <button
            type="button"
            className="chip icon"
            onClick={(e) => popover(e.currentTarget, (close) => <DateRangeMenu value={filters.range} onChange={(range) => set({ range })} close={close} />, { className: "daterange" })}
          >
            <Icon name="calendar" size={20} />
            Date<span className="sep" /><b>{rangeLabel(filters.range)}</b>
          </button>
          <span className="muted pl-count">({board.total} result{board.total === 1 ? "" : "s"})</span>
        </div>
        <div className="searchbox pl-search">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search opportunities" aria-label="Search opportunities" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

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
                  {group !== "Closed" && <button type="button" className="pl-railbtn" disabled aria-label={group === "Requests" ? "New request" : "New quote"}><Icon name="plus" size={18} /></button>}
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
                              onTouchStart={(e) => touchStart(e, card)}
                              tabIndex={0}
                              onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; setDragging(card); }}
                              onClick={() => setOpenId(card.id)}
                              onKeyDown={(e) => { if (e.key === "Enter") setOpenId(card.id); }}
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
        {open && <PipelinePanel business={business} card={open} people={people} onClose={() => setOpenId(null)} onLost={() => setLost(open)} onWon={() => void won(open)} />}
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

/** A searchable, tick-able list of lead sources (several can be chosen, as in Jobber), with "1 selected" and Clear. */
function LeadSourceMenu({ selected, onChange, close }: { selected: string[]; onChange: (s: string[]) => void; close: () => void }) {
  const [query, setQuery] = useState("");
  const options = [...LEAD_SOURCES, NO_SOURCE];
  const shown = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  return (
    <>
      <input className="menu-search" type="search" placeholder="Search lead source" aria-label="Search lead source" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className="pl-leadhead">
        <span>{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
        <button type="button" className="pl-clear" onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
      </div>
      <div className="menu-list" role="listbox" aria-label="Lead source" aria-multiselectable="true">
        {shown.map((o) => (
          <button key={o} type="button" role="option" aria-selected={selected.includes(o)} className="opt" onClick={() => toggle(o)}>
            <span>{o}</span>
            {selected.includes(o) && <Icon name="check" size={22} className="tick" />}
          </button>
        ))}
        {shown.length === 0 && <div className="menu-empty">No matches</div>}
      </div>
      <button type="button" className="pl-done" onClick={close}>Done</button>
    </>
  );
}

