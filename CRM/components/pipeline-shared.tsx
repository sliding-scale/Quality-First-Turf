"use client";

/* What the Sales, Preplanning and Construction boards share (D-080), so a fix is made once: the filter state, the bar of filters and search
   above the columns, the press-and-hold drag for touch screens, and the lead source picker. Each board keeps its own columns and card menu. */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ALL_TIME, rangeLabel } from "@/lib/dates";
import { LEAD_SOURCES, NO_SOURCE, SORT_LABEL, type BoardFilters, type SortKey } from "@/lib/pipeline";
import { viewFromParam, type BoardView } from "@/lib/pipeline-list";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

/** The board's filters, and the search box's text, which reaches the filters a moment after typing stops. */
export function useBoardFilters() {
  const [filters, setFilters] = useState<BoardFilters>({ sortKey: "timeInStage", dir: "asc", salespersonId: null, leadSources: [], range: ALL_TIME, search: "" });
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === q ? f : { ...f, search: q })), 250);
    return () => clearTimeout(t);
  }, [q]);
  const set = (patch: Partial<BoardFilters>) => setFilters((f) => ({ ...f, ...patch }));
  return { filters, set, q, setQ };
}

/** Board or list (D-115). Kept in the address (?view=list), so a reload or a shared link lands on the same view; other parts of the address stay. */
export function useBoardView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = viewFromParam(params.get("view"));
  const setView = (next: BoardView) => {
    const q = new URLSearchParams(params.toString());
    if (next === "list") q.set("view", "list");
    else q.delete("view");
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  return { view, setView };
}

/** Sort, direction, salesperson, lead source and date, with the result count and the search box. */
export function BoardBar({ filters, set, q, setQ, people, total, searchLabel, view, setView }: {
  filters: BoardFilters;
  set: (patch: Partial<BoardFilters>) => void;
  q: string;
  setQ: (q: string) => void;
  people: { id: Id<"users">; name: string }[];
  total: number;
  searchLabel: string;
  view: BoardView;
  setView: (view: BoardView) => void;
}) {
  const { popover } = useUI();
  const personName = filters.salespersonId === null ? "All" : filters.salespersonId === "unassigned" ? "Unassigned" : (people.find((p) => p.id === filters.salespersonId)?.name ?? "All");
  const sourceLabel = filters.leadSources.length === 0 ? "All" : filters.leadSources.length === 1 ? filters.leadSources[0] : `${filters.leadSources.length} selected`;
  return (
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
        <span className="muted pl-count">({total} result{total === 1 ? "" : "s"})</span>
      </div>
      <div className="pl-bar-right">
        <div className="pl-view" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "board"} className={view === "board" ? "on" : undefined} onClick={() => setView("board")}>Board</button>
          <button type="button" aria-pressed={view === "list"} className={view === "list" ? "on" : undefined} onClick={() => setView("list")}>List</button>
        </div>
        <div className="searchbox pl-search">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder={searchLabel} aria-label={searchLabel} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

/** Press and hold a card on a touch screen, then drag it over a column. Returns the handler for the card's onTouchStart, which is told
 *  (through `onMove`) where the card was dropped. */
export function useTouchDrag<C extends { stage: string }>(enabled: boolean) {
  const touchCleanup = useRef<(() => void) | null>(null);

  /** Touch: press and hold a card for a moment, then drag it over a column and let go. A swipe before that still scrolls the board.
   *  Built for a high frame rate: while the finger moves, React is not involved at all. The columns' places are measured once when the
   *  drag starts, the held card is a light copy moved with a GPU transform once per frame, and the column under the finger is lit by
   *  switching a class on that one element. The board is only told once, at the end, to move the card. */
  function touchStart(e: ReactTouchEvent<HTMLElement>, card: C, onMove: (card: C, stage: string) => void) {
    if (!enabled || e.touches.length !== 1 || (e.target as HTMLElement).closest(".pl-more")) return;
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
    const scroller = el.closest(".pl-board") as HTMLElement | null;
    let spots: { col: HTMLElement; stage: string; left: number; right: number; top: number; bottom: number }[] = [];
    let scroll0 = 0;
    const stageAt = () => {
      const px = x + ((scroller?.scrollLeft ?? 0) - scroll0);
      return spots.find((c) => px >= c.left && px <= c.right && y >= c.top && y <= c.bottom) ?? null;
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
        scroller?.classList.remove("touch-drag");
        scroller?.querySelectorAll(".pl-col.src").forEach((c) => c.classList.remove("src"));
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
        if (Math.hypot(x - t0.clientX, y - t0.clientY) > 10) cleanup();
        return;
      }
      ev.preventDefault();
      if (!frame) frame = requestAnimationFrame(paint);
      if (scroller) {
        const b = scroller.getBoundingClientRect();
        const dir = x < b.left + 48 ? -1 : x > b.right - 48 ? 1 : 0;
        if (dir !== edgeDir) {
          edgeDir = dir;
          if (edge) { clearInterval(edge); edge = null; }
          if (dir) edge = setInterval(() => { scroller.scrollLeft += dir * 12; light(); }, 16);
        }
      }
    };
    const end = (ev: TouchEvent) => {
      const was = active;
      const stage = was ? (stageAt()?.stage ?? null) : null;
      if (was) ev.preventDefault();
      cleanup();
      if (was && stage && stage !== card.stage) onMove(card, stage);
    };
    const cancel = () => cleanup();
    const timer = setTimeout(() => {
      active = true;
      navigator.vibrate?.(15);
      scroll0 = scroller?.scrollLeft ?? 0;
      spots = Array.from(document.querySelectorAll<HTMLElement>(".pl-col[data-stage]")).map((col) => {
        const r = col.getBoundingClientRect();
        return { col, stage: col.dataset.stage!, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      scroller?.classList.add("touch-drag");
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

  return touchStart;
}

/** A searchable, tick-able list of lead sources (several can be chosen, as in Jobber), with "1 selected" and Clear. */
export function LeadSourceMenu({ selected, onChange, close }: { selected: string[]; onChange: (s: string[]) => void; close: () => void }) {
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
