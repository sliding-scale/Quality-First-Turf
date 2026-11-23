"use client";

/* The list view of a pipeline board (D-115): every project on the board in one table, in the board's own sort, with the same filters and
   the same card window and actions. Pages of 10, 25, 50 or 100, never endless scrolling. Moving a project between stages stays on the
   board (drag and drop) and in each row's menu. */

import { useState } from "react";
import { moneyCents } from "@/lib/format";
import { timeLabel, type BoardFilters } from "@/lib/pipeline";
import { pageSlice, sortRows } from "@/lib/pipeline-list";
import { Icon } from "./icon";

export type ListRow = {
  id: string; title: string; code: string; clientName: string; stage: string; salespersonName: string;
  timeInStageMs: number; valueCents: number; requestedAt: number; movedTo?: string;
};

export function PipelineList<T extends ListRow>({ rows, filters, selectedId, emptyText, onOpen, onMenu }: {
  rows: readonly T[];
  filters: Pick<BoardFilters, "sortKey" | "dir">;
  selectedId: string | null;
  emptyText: string;
  onOpen: (row: T) => void;
  onMenu: (row: T, anchor: HTMLElement) => void;
}) {
  const [size, setSize] = useState(25);
  const [wanted, setWanted] = useState(1);
  const sorted = sortRows(rows, filters.sortKey, filters.dir);
  const { page, pages, from, to } = pageSlice(sorted.length, wanted, size);
  const shown = sorted.slice(Math.max(0, from - 1), to);
  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);

  return (
    <div className="pl-list">
      <div className="table-wrap">
        <table className="table single">
          <colgroup>
            <col style={{ width: 280 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr><th>Project</th><th>Client</th><th>Stage</th><th>Salesperson</th><th>In stage</th><th className="num">Value</th><th><span className="sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={7}><div className="empty" style={{ margin: "20px 0" }}>{emptyText}</div></td></tr>
            ) : shown.map((r) => (
              <tr
                key={r.id}
                className={`click${selectedId === r.id ? " selected" : ""}`}
                tabIndex={0}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}
              >
                <td data-label="Project" title={`${r.title} · ${r.code}`}><b>{r.title}</b> · {r.code}</td>
                <td data-label="Client" title={r.clientName}>{r.clientName}</td>
                <td data-label="Stage" title={r.stage}>{r.stage}{r.movedTo ? <span className="muted"> · in {r.movedTo}</span> : null}</td>
                <td data-label="Salesperson" title={r.salespersonName}>{r.salespersonName}</td>
                <td data-label="In stage">{timeLabel(r.timeInStageMs)}</td>
                <td className="num" data-label="Value">{moneyCents(r.valueCents)}</td>
                <td>
                  <button type="button" className="pl-more" aria-label={`Actions for ${r.title}`} data-tip="More actions" onClick={(e) => { e.stopPropagation(); onMenu(r, e.currentTarget); }}>
                    <Icon name="more" size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <div className="left">
          <label htmlFor="pl-size">Rows per page</label>
          <select id="pl-size" aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setWanted(1); }}>
            {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <span>{from}–{to} of {sorted.length}</span>
        </div>
        <div className="right pages">
          <button type="button" className="pg" disabled={page === 1} aria-label="Previous page" onClick={() => setWanted(page - 1)}><Icon name="chevleft" size={20} /></button>
          {numbers.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - numbers[i - 1] > 1 && <span className="gap">…</span>}
              <button type="button" className={`pg${n === page ? " current" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => setWanted(n)}>{n}</button>
            </span>
          ))}
          <button type="button" className="pg" disabled={page === pages} aria-label="Next page" onClick={() => setWanted(page + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>
    </div>
  );
}
