"use client";

/* Requests list (D-039): the early-stage projects of the selected business, with an overview, search, filters, sorting
   and pagination. Not a separate record: each row is a Sales-pipeline project. */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ALL_TIME, daysAgoInRange, rangeLabel, type DateRange } from "@/lib/dates";
import { dayLabel } from "@/lib/format";
import { REQUEST_STATUSES, useRequests, type RequestRow, type RequestStatus } from "@/lib/requests";
import { useIsClient } from "@/lib/store";
import { DateRangeMenu, FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { RequestsSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type SortKey = "client" | "title" | "daysAgo" | "status";

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
  return useIsClient() ? <Requests initialQuery={initialQuery} /> : <RequestsSkeleton />;
}

function Requests({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const { dropdown, popover, toast, soon } = useUI();
  const all = useRequests();
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<"All" | RequestStatus>("All");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "daysAgo", dir: "asc" });
  const [requestedPage, setPage] = useState(1);
  const [size, setSize] = useState(10);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = all.filter((r) => {
      if (status !== "All" && r.status !== status) return false;
      if (!daysAgoInRange(r.daysAgo, range)) return false;
      if (!needle) return true;
      const c = r.client;
      return [c.name, c.contactName, c.company, r.title, r.code, r.property, c.phone, c.email, r.stage].join(" ").toLowerCase().includes(needle);
    });
    const { key, dir } = sort;
    const value = (r: RequestRow) => (key === "client" ? r.client.name.toLowerCase() : key === "title" ? r.title.toLowerCase() : key === "status" ? r.status : r.daysAgo);
    return out.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
    });
  }, [all, q, status, range, sort]);

  // Overview and stat cards (all of the business's requests, not the filtered list).
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
  const within = (from: number, to: number) => all.filter((r) => r.daysAgo >= from && r.daysAgo <= to);
  const now30 = within(0, 30);
  const prev30 = within(31, 60);
  const rate = (rows: RequestRow[]) => (rows.length ? Math.round((rows.filter((r) => r.status === "Converted").length / rows.length) * 100) : 0);
  const newDelta = prev30.length ? Math.round(((now30.length - prev30.length) / prev30.length) * 100) : null;
  const rateDelta = prev30.length ? rate(now30) - rate(prev30) : null;
  const delta = (v: number | null, unit: string) => {
    if (v === null) return null;
    const up = v >= 0;
    return <span className={`delta${up ? "" : " down"}`}>{up ? "↑" : "↓"} {Math.abs(v)}{unit}</span>;
  };

  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(requestedPage, pages);
  const start = (page - 1) * size;
  const slice = list.slice(start, start + size);
  const from = list.length ? start + 1 : 0;
  const to = Math.min(start + size, list.length);
  const pageNumbers = [...new Set([1, pages, page, page - 1, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

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

  function exportCsv() {
    const esc = (s: string | number | null | undefined) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Client", "Title", "Project", "Property", "Phone", "Email", "Requested", "Status", "Stage", "Business"];
    const csv = [head.join(",")]
      .concat(list.map((r) => [r.client.name, r.title, r.code, r.property, r.client.phone, r.client.email, dayLabel(r.daysAgo), r.status, r.stage, r.client.business].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "requests.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${list.length} requests`);
  }

  const today = new Date();

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Requests</h1>
        <div className="actions">
          <button className="btn primary" type="button" onClick={() => soon("Creating requests")}>New Request</button>
          <button
            className="btn"
            type="button"
            aria-haspopup="menu"
            onClick={(e) => dropdown(e.currentTarget, [{ label: "Export Requests", icon: "export", onSelect: exportCsv }], { alignRight: true, variant: "actions" })}
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
                  {s} ({count(s)})
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
          <div className="n">{now30.length}{delta(newDelta, "%")}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Conversion rate</span></div>
          <div className="s">Past 30 days</div>
          <div className="n">{rate(now30)}%{delta(rateDelta, " pts")}</div>
        </div>
      </div>

      <div className="list-head" id="requests-list">
        <h2>All requests</h2>
        <span className="muted">({list.length} request{list.length === 1 ? "" : "s"})</span>
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
                    options={[{ label: "All" }, ...[...REQUEST_STATUSES].sort().map((st) => ({ label: st, dot: DOT[st], count: count(st) }))]}
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
              <th aria-sort={ariaSort("daysAgo")}>{sortHead("daysAgo", "Requested")}</th>
              <th className="num" aria-sort={ariaSort("status")}>{sortHead("status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {slice.length ? (
              slice.map((r) => {
                const c = r.client;
                const sub = c.company && c.name !== c.company ? c.company : c.company ? `Contact: ${c.contactName}` : "";
                return (
                  <tr key={r.id} className="click" onClick={() => router.push(`/clients/${c.id}`)}>
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
                    <td>{dayLabel(r.daysAgo, today)}</td>
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
          <span>{from}–{to} of {list.length}</span>
        </div>
        <div className="right pages">
          <button type="button" className="pg" disabled={page === 1} aria-label="Previous page" onClick={() => goTo(page - 1)}>
            <Icon name="chevleft" size={20} />
          </button>
          {pageNumbers.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="gap">…</span>}
              <button type="button" className={`pg${n === page ? " current" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => goTo(n)}>
                {n}
              </button>
            </span>
          ))}
          <button type="button" className="pg" disabled={page === pages} aria-label="Next page" onClick={() => goTo(page + 1)}>
            <Icon name="chevright" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
