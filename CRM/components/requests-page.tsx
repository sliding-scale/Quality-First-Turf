"use client";

/* Requests list (D-039): the Sales-pipeline projects of the selected business, with an overview, search, filters, sorting
   and pagination. Not a separate record: each row is a project, and its status comes from its stage. The backend
   (convex/crm/requests.ts) does the filtering, sorting, counting and paging; this file only asks and shows. */

import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { DAY_MS } from "@/convex/crm/lib/stages";
import { daysAgoFrom, useWorkspace, type BusinessDoc } from "@/lib/clients";
import { ALL_TIME, rangeBounds, rangeLabel, type DateRange } from "@/lib/dates";
import { dayLabel } from "@/lib/format";
import { REQUEST_STATUSES, useRequestList, useRequestStats, type RequestStatus } from "@/lib/requests";
import { EmptyBackend } from "./empty-backend";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { RequestsSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type SortKey = "client" | "title" | "requestedAt" | "status";

const STATUS_CLASS: Record<RequestStatus, string> = {
  New: "lead",
  Overdue: "overdue",
  Consultation: "consult",
  Converted: "active",
  Lost: "draft",
};

const DOT: Record<RequestStatus, string> = {
  New: "var(--blue)",
  Overdue: "var(--red)",
  Consultation: "var(--orange)",
  Converted: "var(--green)",
  Lost: "var(--muted)",
};

export function RequestsPage({ initialQuery }: { initialQuery: string }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <RequestsSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Requests business={workspace.business} initialQuery={initialQuery} />;
}

/** The date range as the backend takes it: first and last moment, in ms, either may be open. */
function bounds(range: DateRange): { from: number | null; to: number | null } {
  const { from, to } = rangeBounds(range);
  return { from: from ? from.getTime() : null, to: to ? to.getTime() + DAY_MS - 1 : null };
}

function Requests({ business, initialQuery }: { business: BusinessDoc; initialQuery: string }) {
  const router = useRouter();
  const convex = useConvex();
  const { dropdown, popover, toast } = useUI();
  const [q, setQ] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery); // what the server is asked, a moment after typing stops
  const [status, setStatus] = useState<"All" | RequestStatus>("All");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "requestedAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { status, ...bounds(range), search, sortKey: sort.key, dir: sort.dir };
  const data = useRequestList(business._id, filters, page, size);
  const stats = useRequestStats(business._id);

  if (data === undefined || stats === undefined) return <RequestsSkeleton />;

  const { rows, total } = data;
  const current = data.page;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, total);
  const pageNumbers = [...new Set([1, pages, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  // Change against the previous 30 days, or nothing when there is no earlier period to compare with.
  const hasEarlier = stats.newRequestsBefore > 0;
  const newDelta = hasEarlier ? Math.round(((stats.newRequests - stats.newRequestsBefore) / stats.newRequestsBefore) * 100) : null;
  const rateDelta = hasEarlier ? stats.conversionRate - stats.conversionRateBefore : null;
  const delta = (v: number | null, unit: string) => {
    if (v === null) return null;
    const up = v >= 0;
    return <span className={`delta${up ? "" : " down"}`}>{up ? "↑" : "↓"} {Math.abs(v)}{unit}</span>;
  };

  const goTo = (n: number) => {
    setPage(n);
    document.getElementById("main")?.scrollTo({ top: 0 });
  };
  // Clicking a status in the Overview card filters the table to it and brings the table into view.
  function showStatus(s: RequestStatus) {
    setStatus(s);
    setPage(1);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("requests-list")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  async function exportCsv() {
    const all = await convex.query(api.crm.requests.exportRows, { businessId: business._id, ...filters, today: new Date().setHours(0, 0, 0, 0) });
    const esc = (s: string | number | null | undefined) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Client", "Title", "Project", "Property", "Phone", "Email", "Requested", "Status", "Stage", "Business"];
    const csv = [head.join(",")]
      .concat(all.map((r) => [r.client.name, r.title, r.code, r.property, r.client.phone, r.client.email, dayLabel(daysAgoFrom(r.requestedAt)), r.status, r.stage, business.name].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "requests.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${all.length} requests`);
  }

  const today = new Date();

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Requests</h1>
        <div className="actions">
          <button className="btn primary" type="button" disabled>New Request</button>
          <button
            className="btn"
            type="button"
            aria-haspopup="menu"
            onClick={(e) => dropdown(e.currentTarget, [{ label: "Export Requests", icon: "export", onSelect: () => void exportCsv() }], { alignRight: true, variant: "actions" })}
          >
            <Icon name="more" size={20} /> More Actions
          </button>
        </div>
      </div>

      <div className="kpis compact">
        <div className="card kpi">
          <div className="h"><span>Overview</span></div>
          <ul className="ov">
            {REQUEST_STATUSES.map((s) => (
              <li key={s}>
                <button type="button" className="ov-item" aria-pressed={status === s} onClick={() => showStatus(s)}>
                  <span className="dot" style={{ background: DOT[s] }} />
                  {s} ({stats.counts[s]})
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card kpi">
          <div className="h">
            <span>New requests</span>
            <Icon name="arrowupright" size={18} />
          </div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.newRequests}{delta(newDelta, "%")}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Conversion rate</span></div>
          <div className="s">Past 30 days</div>
          <div className="n">{stats.conversionRate}%{delta(rateDelta, " pts")}</div>
        </div>
      </div>

      <div className="list-head" id="requests-list">
        <h2>All requests</h2>
        <span className="muted">({total} request{total === 1 ? "" : "s"})</span>
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
                    options={[{ label: "All" }, ...[...REQUEST_STATUSES].sort().map((st) => ({ label: st, dot: DOT[st], count: stats.counts[st] }))]}
                    selected={status}
                    onSelect={(o) => { setStatus(o as "All" | RequestStatus); setPage(1); }}
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
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search requests..." aria-label="Search requests" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("client")}>{sortHead("client", "Client")}</th>
              <th aria-sort={ariaSort("title")}>{sortHead("title", "Title")}</th>
              <th>Property</th>
              <th>Contact</th>
              <th aria-sort={ariaSort("requestedAt")}>{sortHead("requestedAt", "Requested")}</th>
              <th className="num" aria-sort={ariaSort("status")}>{sortHead("status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => {
                const c = r.client;
                const sub = c.company && c.name !== c.company ? c.company : c.company ? `Contact: ${c.contactName}` : "";
                return (
                  <tr key={r.id} className="click" onClick={() => router.push(`/clients/${r.clientId}`)}>
                    <td>
                      <div className="strong" title={c.name}>{c.name}</div>
                      {sub && <div className="sub" title={sub}>{sub}</div>}
                    </td>
                    <td>
                      <div title={r.title}>{r.title}</div>
                      <div className="sub" title={`Project ${r.code} · ${r.stage}`}>{r.code}</div>
                    </td>
                    <td title={r.property}>{r.property}</td>
                    <td>
                      <div title={c.phone}>{c.phone}</div>
                      <div title={c.email}>{c.email}</div>
                    </td>
                    <td>{dayLabel(daysAgoFrom(r.requestedAt), today)}</td>
                    <td className="num" title={r.stage}>
                      <span className={`pill ${STATUS_CLASS[r.status]}`}><span className="dot" />{r.status}</span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty" style={{ margin: "20px 0" }}>No requests match these filters.</div>
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
