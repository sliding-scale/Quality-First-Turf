"use client";

/* Payments list (PRD 5.2, design 2026-11-18-finance): Jobber's Payments page. Two figures (how long invoices take to be paid, how many are paid
   on time), then every payment with Method and Date filters, search, sorting and pagination. The backend (convex/crm/payments.ts) does the
   filtering, sorting and paging; this file only asks and shows. A payment's amount is what was received; a deposit not yet applied to an
   invoice says so. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DAY_MS } from "@/convex/crm/lib/stages";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { ALL_TIME, rangeBounds, rangeLabel, type DateRange } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { PAYMENT_METHODS, usePaymentList, usePaymentStats, utcDate } from "@/lib/invoices";
import { EmptyBackend } from "./empty-backend";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { PaymentsSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type SortKey = "client" | "paidAt" | "method" | "amount";

export function PaymentsPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <PaymentsSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Payments business={workspace.business} />;
}

function bounds(range: DateRange): { from?: number; to?: number } {
  const { from, to } = rangeBounds(range);
  return { ...(from ? { from: from.getTime() } : {}), ...(to ? { to: to.getTime() + DAY_MS - 1 } : {}) };
}

function Payments({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { popover } = useUI();
  const { can } = useStaff();
  const canBill = can("payments", "edit");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [method, setMethod] = useState("All");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "paidAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const data = usePaymentList(business._id, { method, ...bounds(range), search, sortKey: sort.key, dir: sort.dir }, page, size);
  const stats = usePaymentStats(business._id);
  if (data === undefined || stats === undefined) return <PaymentsSkeleton />;

  const { rows, total } = data;
  const current = data.page + 1;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, total);
  const pageNumbers = [...new Set([1, pages, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const goTo = (n: number) => { setPage(n); document.getElementById("main")?.scrollTo({ top: 0 }); };
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>{label} <span className="s"><Icon name="sort" size={16} /></span></button>
  );

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Payments</h1>
        <div className="actions">
          {canBill ? <Link className="btn primary" href="/payments/new">Collect Payment</Link> : <button className="btn primary" type="button" disabled data-tip="Your role can look at payments but not record them">Collect Payment</button>}
        </div>
      </div>

      <div className="kpis compact four">
        <div className="card kpi">
          <div className="h"><span>Invoice payment time</span><Icon name="arrowupright" size={18} /></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.averageDays === null ? "—" : `${stats.averageDays} days`}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Invoices paid on time</span></div>
          <div className="s">Last 60 days</div>
          <div className="n">{stats.paidOnTimePercent === null ? "—" : `${stats.paidOnTimePercent}%`}</div>
        </div>
      </div>

      <div className="list-head"><h2>All payments</h2><span className="muted">({total} result{total === 1 ? "" : "s"})</span></div>

      <div className="toolbar">
        <div className="chips">
          <button
            className="chip"
            type="button"
            onClick={(e) => popover(e.currentTarget, (close) => <FilterMenu placeholder="Search statuses" options={[{ label: "All" }, { label: "Succeeded" }]} selected={status} onSelect={(o) => { setStatus(o); setPage(1); }} close={close} />, { className: "filter" })}
          >
            Status<span className="sep" /><b>{status}</b>
          </button>
          <button
            className="chip"
            type="button"
            onClick={(e) => popover(e.currentTarget, (close) => <FilterMenu placeholder="Search methods" options={[{ label: "All" }, ...PAYMENT_METHODS.map((m) => ({ label: m }))]} selected={method} onSelect={(o) => { setMethod(o); setPage(1); }} close={close} />, { className: "filter" })}
          >
            Method<span className="sep" /><b>{method}</b>
          </button>
          <button className="chip icon" type="button" onClick={(e) => popover(e.currentTarget, (close) => <DateRangeMenu value={range} onChange={(r) => { setRange(r); setPage(1); }} close={close} />, { className: "daterange" })}>
            <Icon name="calendar" size={20} />
            Date<span className="sep" /><b>{rangeLabel(range)}</b>
          </button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search payments..." aria-label="Search payments" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 300 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("client")}>{sortHead("client", "Client")}</th>
              <th aria-sort={ariaSort("paidAt")}>{sortHead("paidAt", "Payment date")}</th>
              <th>Payment status</th>
              <th aria-sort={ariaSort("method")}>{sortHead("method", "Method")}</th>
              <th className="num" aria-sort={ariaSort("amount")}>{sortHead("amount", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(r.invoice ? `/invoices/${r.invoice.id}` : r.quote ? `/quotes/${r.quote.id}` : `/clients/${r.clientId}`)}>
                  <td>
                    <div className="strong" title={r.clientName}>{r.clientName}</div>
                    {r.invoice && <div className="sub"><Link href={`/invoices/${r.invoice.id}`} onClick={(e) => e.stopPropagation()}>Invoice #{r.invoice.number}</Link></div>}
                    {!r.invoice && r.quote && <div className="sub"><Link href={`/quotes/${r.quote.id}`} onClick={(e) => e.stopPropagation()}>Quote #{r.quote.number}</Link></div>}
                    {r.unappliedCents > 0 && <div className="sub">{moneyCents(r.unappliedCents)} not applied to an invoice yet</div>}
                  </td>
                  <td data-label="Payment date">{utcDate(r.paidAt)}</td>
                  <td data-label="Status"><span className="pill active"><span className="dot" />Succeeded</span></td>
                  <td data-label="Method">{r.method}</td>
                  <td className="num" data-label="Amount">{moneyCents(r.amountCents)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}><div className="empty" style={{ margin: "20px 0" }}>{total === 0 && method === "All" && !search ? "No payments yet. Collect Payment records the first one." : "No payments match these filters."}</div></td></tr>
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
