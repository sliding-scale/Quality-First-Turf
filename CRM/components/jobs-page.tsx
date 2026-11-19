"use client";

/* Jobs list (design 2026-11-19-jobs): Jobber's Jobs page. Overview, past and coming visits, then the list with a Status filter and search.
   A job is a Closed Won project; the backend (convex/crm/jobs.ts) works out each status and total, filters, counts and pages. */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { moneyCents, quoteDate } from "@/lib/format";
import { ENDING_SOON, JOB_DOT, JOB_FILTERS, JOB_PILL, useJobCounts, useJobs } from "@/lib/jobs";
import { EmptyBackend } from "./empty-backend";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { JobsSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function JobsPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <JobsSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Jobs business={workspace.business} />;
}

function Jobs({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { popover } = useUI();
  const { can } = useStaff();
  const canMake = can("jobs", "edit");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(() => {
    const s = params.get("status");
    return s && JOB_FILTERS.some((f) => f.label === s && !f.disabled) ? s : "All";
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const data = useJobs(business._id, status, search, page);
  const counts = useJobCounts(business._id);
  if (data === undefined || counts === undefined) return <JobsSkeleton />;

  const { rows, total, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const from = total ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, total);
  const goTo = (n: number) => { setPage(n); document.getElementById("main")?.scrollTo({ top: 0 }); };
  const showStatus = (s: string) => {
    setStatus(s);
    setPage(1);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("jobs-list")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };

  const overview: { label: string; filter: string; dot: string; count: number }[] = [
    { label: "Ending within 30 days", filter: ENDING_SOON, dot: "var(--red)", count: counts.endingSoon },
    { label: "Late", filter: "Late", dot: JOB_DOT.Late, count: counts.byStatus.Late },
    { label: "Requires Invoicing", filter: "Requires Invoicing", dot: JOB_DOT["Requires Invoicing"], count: counts.byStatus["Requires Invoicing"] },
    { label: "Action Required", filter: "Action Required", dot: "var(--orange)", count: 0 },
    { label: "Unscheduled", filter: "Unscheduled", dot: JOB_DOT.Unscheduled, count: counts.byStatus.Unscheduled },
  ];
  const dollars = (cents: number) => moneyCents(cents).replace(/\.00$/, "");

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Jobs</h1>
        <div className="actions">
          {canMake ? <Link className="btn primary" href="/jobs/new">New Job</Link> : <button className="btn primary" type="button" disabled data-tip="Your role can look at jobs but not make them">New Job</button>}
          <button className="btn" type="button" disabled data-tip="Not available yet"><Icon name="more" size={18} /> More Actions</button>
        </div>
      </div>

      <div className="kpis compact four">
        <div className="card kpi">
          <div className="h"><span>Overview</span></div>
          <ul className="ov">
            {overview.map((o) => (
              <li key={o.label}>
                <button type="button" className="ov-item" aria-pressed={status === o.filter} disabled={o.filter === "Action Required"} onClick={() => showStatus(o.filter)}>
                  <span className="dot" style={{ background: o.dot }} />
                  <span>{o.label} ({o.count})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card kpi">
          <div className="h"><span>Recent visits</span></div>
          <div className="s">Past 30 days</div>
          <div className="n">{counts.visitsPast30.count}</div>
          <div className="s kpi-money">{dollars(counts.visitsPast30.cents)}</div>
        </div>
        <div className="card kpi">
          <div className="h"><span>Visits scheduled</span></div>
          <div className="s">Next 30 days</div>
          <div className="n">{counts.visitsNext30.count}</div>
          <div className="s kpi-money">{dollars(counts.visitsNext30.cents)}</div>
        </div>
      </div>

      <div className="list-head" id="jobs-list">
        <h2>All jobs</h2>
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
                  options={JOB_FILTERS.map((f) => ({
                    label: f.label,
                    disabled: f.disabled,
                    ...(f.label === "All" ? {} : { count: f.label === ENDING_SOON ? counts.endingSoon : f.disabled ? 0 : (counts.byStatus as Record<string, number>)[f.label] ?? 0 }),
                  }))}
                  selected={status}
                  onSelect={(o) => { setStatus(o); setPage(1); }}
                  close={close}
                />
              ), { className: "filter" })
            }
          >
            Status<span className="sep" /><b>{status}</b>
          </button>
          <button className="chip" type="button" disabled data-tip="Recurring jobs come in a later step">Job Type<span className="sep" /><b>All</b></button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search jobs..." aria-label="Search jobs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table" id="tbl">
          <colgroup>
            <col style={{ width: 200 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Client</th>
              <th>Job number</th>
              <th>Property</th>
              <th>Schedule</th>
              <th>Status</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/jobs/${r.id}`)}>
                  <td><div className="strong" title={r.clientName}>{r.clientName}</div></td>
                  <td data-label="Job number"><div>#{r.jobNumber}</div><div className="muted" title={r.title}>{r.title}</div></td>
                  <td data-label="Property" title={r.property}>{r.property || "—"}</td>
                  <td data-label="Schedule">{r.nextVisitAt ?? r.firstVisitAt ? quoteDate((r.nextVisitAt ?? r.firstVisitAt) as number) : "—"}</td>
                  <td data-label="Status"><span className={`pill ${JOB_PILL[r.status]}`}><span className="dot" />{r.status}</span></td>
                  <td className="num" data-label="Total">{moneyCents(r.totalCents)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty" style={{ margin: "20px 0" }}>{total === 0 && status === "All" && !search ? "No jobs yet. A project becomes a job when it is marked Closed Won, or New Job makes one." : "No jobs match these filters."}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="left"><span>{from}–{to} of {total}</span></div>
        <div className="right pages">
          <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => goTo(current - 1)}><Icon name="chevleft" size={20} /></button>
          <span className="gap">Page {current} of {pages}</span>
          <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => goTo(current + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>
    </div>
  );
}
