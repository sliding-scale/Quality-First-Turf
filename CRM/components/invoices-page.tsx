"use client";

/* Invoices list (PRD 5.2, design 2026-11-18-finance): Jobber's Invoices page. Overview of what is owed, three figures for the past 30 days,
   then the list with Status and Date filters, search, sorting and pagination. The backend (convex/crm/invoices.ts) does the filtering,
   sorting, counting and paging; this file only asks and shows. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DAY_MS } from "@/convex/crm/lib/stages";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { ALL_TIME, rangeBounds, rangeLabel, type DateRange } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { INVOICE_DOT, INVOICE_PILL, INVOICE_STATUS_FILTERS, useInvoiceList, useInvoiceStats, usePaymentStats, utcDate, type InvoiceStatus } from "@/lib/invoices";
import { EmptyBackend } from "./empty-backend";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { InvoicesSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type SortKey = "client" | "number" | "dueAt" | "status" | "total" | "balance";

export function InvoicesPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <InvoicesSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Invoices business={workspace.business} />;
}

function bounds(range: DateRange): { from?: number; to?: number } {
  const { from, to } = rangeBounds(range);
  return { ...(from ? { from: from.getTime() } : {}), ...(to ? { to: to.getTime() + DAY_MS - 1 } : {}) };
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

function Invoices({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { popover } = useUI();
  const { can } = useStaff();
  const canBill = can("invoices", "edit");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const data = useInvoiceList(business._id, { status, ...bounds(range), search, sortKey: sort.key, dir: sort.dir }, page, size);
  const stats = useInvoiceStats(business._id);
  const paymentStats = usePaymentStats(business._id);
  if (data === undefined || stats === undefined) return <InvoicesSkeleton />;

  const { rows, total } = data;
  const current = data.page + 1;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, total);
  const pageNumbers = [...new Set([1, pages, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const goTo = (n: number) => { setPage(n); document.getElementById("main")?.scrollTo({ top: 0 }); };
  const showStatus = (s: string) => {
    setStatus(s);
    setPage(1);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("invoices-list")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  const overview: { label: string; filter: string; dot: string; count: number; cents: number }[] = [
    { label: "Past due", filter: "Awaiting payment: past due", dot: INVOICE_DOT["Past due"], count: stats.pastDue.count, cents: stats.pastDue.cents },
    { label: "Sent but not due", filter: "Awaiting payment: not yet due", dot: INVOICE_DOT["Awaiting payment"], count: stats.notDue.count, cents: stats.notDue.cents },
    { label: "Draft", filter: "Draft", dot: INVOICE_DOT.Draft, count: stats.draft.count, cents: stats.draft.cents },
  ];

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Invoices</h1>
        <div className="actions">
          {canBill ? <Link className="btn primary" href="/invoices/new">New Invoice</Link> : <button className="btn primary" type="button" disabled data-tip="Your role can look at invoices but not make them">New Invoice</button>}
        </div>
      </div>

      <div className="kpis compact four">
        <div className="card kpi">
          <div className="h"><span>Overview</span></div>
          <ul className="ov">
            {overview.map((o) => (
              <li key={o.label}>
                <button type="button" className="ov-item inv-ov" aria-pressed={status === o.filter} onClick={() => showStatus(o.filter)}>
                  <span className="dot" style={{ background: o.dot }} />
                  <span>{o.label} ({o.count})</span>
                  <b>{moneyCents(o.cents).replace(/\.00$/, "")}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card kpi">
          <div className="h"><span>Issued</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.issued.count}<Delta value={change(stats.issued.count, stats.issued.previousCount)} /></div>
          <div className="s kpi-money">{moneyCents(stats.issued.cents)}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Average invoice</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{moneyCents(stats.averageCents).replace(/\.00$/, "")}<Delta value={change(stats.averageCents, stats.previousAverageCents)} /></div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Invoice payment time</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Last 30 days</div>
          <div className="n">{paymentStats?.averageDays == null ? "—" : `${paymentStats.averageDays} days`}</div>
        </div>
      </div>

      <div className="list-head" id="invoices-list">
        <h2>All invoices</h2>
        <span className="muted">({total} result{total === 1 ? "" : "s"})</span>
      </div>

      <div className="toolbar">
        <div className="chips">
          <button
            className="chip"
            type="button"
            onClick={(e) =>
              popover(e.currentTarget, (close) => (
                <FilterMenu
                  placeholder="Search statuses"
                  options={INVOICE_STATUS_FILTERS.map((s) => ({ label: s, ...(s === "All" ? {} : { count: stats.filterCounts[s] ?? 0 }) }))}
                  selected={status}
                  onSelect={(o) => { setStatus(o); setPage(1); }}
                  close={close}
                />
              ), { className: "filter" })
            }
          >
            Status<span className="sep" /><b>{status}</b>
          </button>
          <button
            className="chip icon"
            type="button"
            onClick={(e) => popover(e.currentTarget, (close) => <DateRangeMenu value={range} onChange={(r) => { setRange(r); setPage(1); }} close={close} />, { className: "daterange" })}
          >
            <Icon name="calendar" size={20} />
            Date<span className="sep" /><b>{rangeLabel(range)}</b>
          </button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search invoices..." aria-label="Search invoices" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("client")}>{sortHead("client", "Client")}</th>
              <th aria-sort={ariaSort("number")}>{sortHead("number", "Invoice number")}</th>
              <th aria-sort={ariaSort("dueAt")}>{sortHead("dueAt", "Due date")}</th>
              <th>Subject</th>
              <th aria-sort={ariaSort("status")}>{sortHead("status", "Status")}</th>
              <th className="num" aria-sort={ariaSort("total")}>{sortHead("total", "Total")}</th>
              <th className="num" aria-sort={ariaSort("balance")}>{sortHead("balance", "Balance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/invoices/${r.id}`)}>
                  <td><div className="strong" title={r.clientName}>{r.clientName}</div></td>
                  <td data-label="Invoice">#{r.number}</td>
                  <td data-label="Due date">{r.dueAt !== undefined ? utcDate(r.dueAt) : "—"}</td>
                  <td data-label="Subject" title={r.subject}>{r.subject}</td>
                  <td data-label="Status"><span className={`pill ${INVOICE_PILL[r.status as InvoiceStatus]}`}><span className="dot" />{r.status}</span></td>
                  <td className="num" data-label="Total">{moneyCents(r.totalCents)}</td>
                  <td className="num" data-label="Balance">{moneyCents(r.balanceCents)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty" style={{ margin: "20px 0" }}>{total === 0 && status === "All" && !search ? "No invoices yet. New Invoice makes the first one." : "No invoices match these filters."}</div>
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
            {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <span>{from}–{to} of {total}</span>
        </div>
        <div className="right pages">
          <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => goTo(current - 1)}><Icon name="chevleft" size={20} /></button>
          {pageNumbers.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="gap">…</span>}
              <button type="button" className={`pg${n === current ? " current" : ""}`} aria-current={n === current ? "page" : undefined} onClick={() => goTo(n)}>{n}</button>
            </span>
          ))}
          <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => goTo(current + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>
    </div>
  );
}
