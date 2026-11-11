"use client";

/* Quotes list (D-056, PRD 3.6): the quotes of the selected business, laid out like Requests and Jobber's Quotes page: an Overview of
   open quotes, three figures for the past 30 days (conversion rate, sent, converted), then the list with Status, Date and
   Salesperson filters, search, sorting and pagination. The backend (convex/crm/quotes.ts) does the filtering, sorting, counting and
   paging; this file only asks and shows. */

import { useConvex } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { DAY_MS } from "@/convex/crm/lib/stages";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { ALL_TIME, rangeBounds, rangeLabel, type DateRange } from "@/lib/dates";
import { moneyCents, quoteDate } from "@/lib/format";
import { QUOTE_DOT, QUOTE_OPEN_STATUSES, QUOTE_PILL, QUOTE_STATUSES, useQuoteList, useQuoteStats, useSalespeople, type QuoteStatus } from "@/lib/quotes";
import { EmptyBackend } from "./empty-backend";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { QuotesSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type SortKey = "client" | "number" | "createdAt" | "status" | "total";

export function QuotesPage({ initialQuery }: { initialQuery: string }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <QuotesSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Quotes business={workspace.business} initialQuery={initialQuery} />;
}

/** The date range as the backend takes it: first and last moment, in ms, either may be open. */
function bounds(range: DateRange): { from: number | null; to: number | null } {
  const { from, to } = rangeBounds(range);
  return { from: from ? from.getTime() : null, to: to ? to.getTime() + DAY_MS - 1 : null };
}

/** Change against the 30 days before, as Jobber shows it: nothing when both are zero, +100% when there was nothing before. */
function change(now: number, before: number): number | null {
  if (before === 0) return now > 0 ? 100 : null;
  return Math.round(((now - before) / before) * 100);
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return <span className={`delta${up ? "" : " down"}`}>{up ? "↑" : "↓"} {Math.abs(value)}%</span>;
}

function Quotes({ business, initialQuery }: { business: BusinessDoc; initialQuery: string }) {
  const router = useRouter();
  const convex = useConvex();
  const { dropdown, popover, toast } = useUI();
  const [q, setQ] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery); // what the server is asked, a moment after typing stops
  const [status, setStatus] = useState<"All" | QuoteStatus>("All");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [salesperson, setSalesperson] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { status, ...bounds(range), salesperson, search, sortKey: sort.key, dir: sort.dir };
  const data = useQuoteList(business._id, filters, page, size);
  const stats = useQuoteStats(business._id);
  const people = useSalespeople(business._id);

  if (data === undefined || stats === undefined) return <QuotesSkeleton />;

  const { rows, total } = data;
  const current = data.page;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, total);
  const pageNumbers = [...new Set([1, pages, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  const goTo = (n: number) => {
    setPage(n);
    document.getElementById("main")?.scrollTo({ top: 0 });
  };
  // Clicking a status in the Overview card filters the table to it and brings the table into view.
  function showStatus(s: QuoteStatus) {
    setStatus(s);
    setPage(1);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("quotes-list")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  async function exportCsv() {
    const all = await convex.query(api.crm.quotes.exportRows, { businessId: business._id, ...filters });
    const esc = (s: string | number | null | undefined) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Quote number", "Title", "Client", "Property", "Salesperson", "Created", "Status", "Total", "Business"];
    const csv = [head.join(",")]
      .concat(all.map((r) => [r.number, r.title, r.clientName, r.property, r.salesperson, quoteDate(r.createdAt), r.status, (r.totalCents / 100).toFixed(2), business.name].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "quotes.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${all.length} quote${all.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Quotes</h1>
        <div className="actions">
          <Link className="btn primary" href="/quotes/new">New Quote</Link>
          <button
            className="btn"
            type="button"
            aria-haspopup="menu"
            onClick={(e) => dropdown(e.currentTarget, [{ label: "Export Quotes", icon: "export", onSelect: () => void exportCsv() }], { alignRight: true, variant: "actions" })}
          >
            <Icon name="more" size={20} /> More Actions
          </button>
        </div>
      </div>

      <div className="kpis compact four">
        <div className="card kpi">
          <div className="h"><span>Overview</span></div>
          <div className="s">{stats.pending} pending</div>
          <ul className="ov">
            {[...QUOTE_OPEN_STATUSES, "Rejected" as const].map((s) => (
              <li key={s}>
                <button type="button" className="ov-item" aria-pressed={status === s} onClick={() => showStatus(s)}>
                  <span className="dot" style={{ background: QUOTE_DOT[s] }} />
                  {s} ({stats.counts[s]})
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card kpi">
          <div className="h"><span>Conversion rate</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.conversionRate}%<Delta value={change(stats.conversionRate, stats.conversionRateBefore)} /></div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Sent</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.sent.count}<Delta value={change(stats.sent.count, stats.sent.countBefore)} /></div>
          <div className="s kpi-money">{moneyCents(stats.sent.cents)}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Approved / Converted</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.converted.count}<Delta value={change(stats.converted.count, stats.converted.countBefore)} /></div>
          <div className="s kpi-money">{moneyCents(stats.converted.cents)}</div>
        </div>
      </div>

      <div className="list-head" id="quotes-list">
        <h2>All quotes</h2>
        <span className="muted">({total} result{total === 1 ? "" : "s"})</span>
      </div>

      <div className="toolbar">
        <div className="chips">
          <button
            className="chip"
            type="button"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => (
                  <FilterMenu
                    placeholder="Search statuses"
                    options={[{ label: "All" }, ...QUOTE_STATUSES.map((st) => ({ label: st, dot: QUOTE_DOT[st], count: stats.counts[st] }))]}
                    selected={status}
                    onSelect={(o) => { setStatus(o as "All" | QuoteStatus); setPage(1); }}
                    close={close}
                  />
                ),
                { className: "filter" },
              )
            }
          >
            Status<span className="sep" /><b>{status}</b>
          </button>
          <button
            className="chip icon"
            type="button"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => <DateRangeMenu value={range} onChange={(r) => { setRange(r); setPage(1); }} close={close} />,
                { className: "daterange" },
              )
            }
          >
            <Icon name="calendar" size={20} />
            Date<span className="sep" /><b>{rangeLabel(range)}</b>
          </button>
          <button
            className="chip"
            type="button"
            onClick={(e) =>
              popover(
                e.currentTarget,
                (close) => (
                  <FilterMenu
                    placeholder="Search salespeople"
                    options={[{ label: "All" }, ...(people ?? []).map((name) => ({ label: name }))]}
                    selected={salesperson ?? "All"}
                    onSelect={(o) => { setSalesperson(o === "All" ? null : o); setPage(1); }}
                    close={close}
                  />
                ),
                { className: "filter" },
              )
            }
          >
            Salesperson<span className="sep" /><b>{salesperson ?? "All"}</b>
          </button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search quotes..." aria-label="Search quotes" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 250 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("client")}>{sortHead("client", "Client")}</th>
              <th aria-sort={ariaSort("number")}>{sortHead("number", "Quote number")}</th>
              <th>Property</th>
              <th aria-sort={ariaSort("createdAt")}>{sortHead("createdAt", "Created")}</th>
              <th aria-sort={ariaSort("status")}>{sortHead("status", "Status")}</th>
              <th className="num" aria-sort={ariaSort("total")}>{sortHead("total", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/quotes/${r.id}`)}>
                  <td><div className="strong" title={r.clientName}>{r.clientName}</div></td>
                  <td data-label="Quote">
                    <div title={`#${r.number}`}>#{r.number}</div>
                    <div className="sub" title={r.title}>{r.title}</div>
                  </td>
                  <td data-label="Property" title={r.property}>{r.property}</td>
                  <td data-label="Created">{quoteDate(r.createdAt)}</td>
                  <td data-label="Status"><span className={`pill ${QUOTE_PILL[r.status]}`}><span className="dot" />{r.status}</span></td>
                  <td className="num" data-label="Total">{moneyCents(r.totalCents)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty" style={{ margin: "20px 0" }}>No quotes match these filters.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="left">
          <label htmlFor="size">Rows per page</label>
          <select id="size" aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>{from}–{to} of {total}</span>
        </div>
        <div className="right pages">
          <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => goTo(current - 1)}>
            <Icon name="chevleft" size={20} />
          </button>
          {pageNumbers.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="gap">…</span>}
              <button type="button" className={`pg${n === current ? " current" : ""}`} aria-current={n === current ? "page" : undefined} onClick={() => goTo(n)}>
                {n}
              </button>
            </span>
          ))}
          <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => goTo(current + 1)}>
            <Icon name="chevright" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
