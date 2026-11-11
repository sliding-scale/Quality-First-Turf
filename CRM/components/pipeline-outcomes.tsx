"use client";

/* The Sales Outcomes tab (D-061): projects closed as won or lost, in a date range (the last 30 days to begin with, as in Jobber),
   as a table with fixed column widths, sortable columns and paging. Closed Won and Closed Lost are not columns on the board. */

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useKept, type BusinessDoc } from "@/lib/clients";
import { rangeLabel, type DateRange } from "@/lib/dates";
import { moneyCents, quoteDate } from "@/lib/format";
import { rangeMs } from "@/lib/pipeline";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PipelineOutcomesSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type SortKey = "title" | "name" | "createdOn" | "closedOn" | "total";
const FAR_FUTURE = Date.UTC(2200, 0, 1);

export function PipelineOutcomes({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { popover } = useUI();
  const [outcome, setOutcome] = useState<"won" | "lost">("won");
  const [range, setRange] = useState<DateRange>({ key: "last-30" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdOn", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(100);

  const { from, to } = rangeMs(range);
  const data = useKept(useQuery(api.crm.pipeline.outcomes, { businessId: business._id, outcome, from: from ?? 0, to: to ?? FAR_FUTURE, sortKey: sort.key, dir: sort.dir, page, size }));
  if (data === undefined) return <PipelineOutcomesSkeleton />;

  const pages = Math.max(1, Math.ceil(data.total / size));
  const first = data.total ? (data.page - 1) * size + 1 : 0;
  const last = Math.min(data.page * size, data.total);
  const toggle = (key: SortKey) => { setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" })); setPage(1); };
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const head = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggle(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );
  const closedLabel = outcome === "won" ? "Won On" : "Lost On";

  return (
    <div className="pl-outcomes">
      <div className="chips" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="chip"
          onClick={(e) =>
            popover(e.currentTarget, (close) => (
              <FilterMenu
                placeholder="Search"
                options={[{ label: "Won" }, { label: "Lost" }]}
                selected={outcome === "won" ? "Won" : "Lost"}
                onSelect={(l) => { setOutcome(l === "Won" ? "won" : "lost"); setPage(1); }}
                close={close}
              />
            ), { className: "filter" })
          }
        >
          Outcome<span className="sep" /><b>{outcome === "won" ? "Won" : "Lost"}</b>
        </button>
        <button
          type="button"
          className="chip icon"
          onClick={(e) => popover(e.currentTarget, (close) => <DateRangeMenu value={range} onChange={(r) => { setRange(r); setPage(1); }} close={close} />, { className: "daterange" })}
        >
          <Icon name="calendar" size={20} />
          Date<span className="sep" /><b>{rangeLabel(range)}</b>
        </button>
      </div>

      <div className="table-wrap">
        <table className="table single">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("title")}>{head("title", "Title")}</th>
              <th aria-sort={ariaSort("name")}>{head("name", "Name")}</th>
              <th aria-sort={ariaSort("createdOn")}>{head("createdOn", "Created On")}</th>
              <th aria-sort={ariaSort("closedOn")}>{head("closedOn", closedLabel)}</th>
              <th className="num" aria-sort={ariaSort("total")}>{head("total", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length ? (
              data.rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/clients/${r.clientId}`)} title={r.lostReason ? `Reason: ${r.lostReason}` : undefined}>
                  <td><strong>{r.title}</strong></td>
                  <td data-label="Name">{r.clientName}</td>
                  <td data-label="Created">{quoteDate(r.createdOn)}</td>
                  <td data-label={closedLabel}>{quoteDate(r.closedOn)}</td>
                  <td className="num" data-label="Total">{moneyCents(r.totalCents)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="empty-row">No {outcome === "won" ? "won" : "lost"} projects in this date range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="left">
          <label htmlFor="pl-size">Per page</label>
          <select id="pl-size" aria-label="Per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Showing {first}-{last} of {data.total} item{data.total === 1 ? "" : "s"}</span>
        </div>
        <div className="right pages">
          <button type="button" className="pg" disabled={data.page === 1} aria-label="Previous page" onClick={() => setPage(data.page - 1)}><Icon name="chevleft" size={20} /></button>
          <button type="button" className="pg" disabled={data.page === pages} aria-label="Next page" onClick={() => setPage(data.page + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>
    </div>
  );
}
