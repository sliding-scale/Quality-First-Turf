"use client";

/* Clients list: search, Homeowner/Contractor filter, sorting, pagination, CSV export.
   Shows only the clients of the business selected in the top bar (D-031). */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clientStatus, CLIENT_STATUS_FILTERS, matchesStatusFilter, useBusinessClients } from "@/lib/clients";
import { dayLabel } from "@/lib/format";
import { useIsClient } from "@/lib/store";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { ClientsSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type SortKey = "name" | "daysAgo";
const TYPES = ["All", "Homeowner", "Contractor"];

export function ClientsPage({ initialQuery, saved }: { initialQuery: string; saved: boolean }) {
  return useIsClient() ? <Clients initialQuery={initialQuery} saved={saved} /> : <ClientsSkeleton />;
}

function Clients({ initialQuery, saved }: { initialQuery: string; saved: boolean }) {
  const router = useRouter();
  const { dropdown, popover, toast, soon } = useUI();
  const all = useBusinessClients();
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState("All");
  const [status, setStatus] = useState<string>("Leads and Active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "daysAgo", dir: "asc" });
  const [requestedPage, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    if (saved) toast("Client saved (sample data, stored in this browser only)");
    // Only on arrival from the save redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = all.filter((c) => {
      if (!matchesStatusFilter(c, status)) return false;
      if (type !== "All" && c.type !== type) return false;
      if (!needle) return true;
      return [c.name, c.contactName, c.company, c.email, c.phone, c.street1, c.city, c.zip].join(" ").toLowerCase().includes(needle);
    });
    const { key, dir } = sort;
    return out.sort((a, b) => {
      const x = key === "name" ? a.name.toLowerCase() : a[key];
      const y = key === "name" ? b.name.toLowerCase() : b[key];
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
    });
  }, [all, q, type, status, sort]);

  // The cards leave out archived clients.
  const live = all.filter((c) => clientStatus(c) !== "Archived");
  const recent = live.filter((c) => c.daysAgo <= 30);
  const kpis: [string, string, number, string][] = [
    ["New leads", "Past 30 days", recent.filter((c) => clientStatus(c) === "Lead").length, "↑ 12%"],
    ["New clients", "Past 30 days", recent.length, "↑ 8%"],
    ["Total clients", "All time", live.length, ""],
  ];

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

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  function exportCsv() {
    const esc = (s: string | number | null | undefined) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Name", "Company", "Type", "Phone", "Email", "Street", "City", "State", "ZIP", "Business"];
    const csv = [head.join(",")]
      .concat(list.map((c) => [c.name, c.company, c.type, c.phone, c.email, c.street1, c.city, c.state, c.zip, c.business].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${list.length} clients`);
  }

  const today = new Date();
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <button type="button" style={{ opacity: on ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
        {label} <span className="s"><Icon name="sort" size={16} /></span>
      </button>
    );
  };

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Clients</h1>
        <div className="actions">
          <Link className="btn primary" href="/clients/new">New Client</Link>
          <button
            className="btn"
            type="button"
            aria-haspopup="menu"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                [
                  { label: "Import Clients", icon: "import", onSelect: () => soon("Importing clients") },
                  { label: "Export Clients", icon: "export", onSelect: exportCsv },
                  { label: "Merge Clients", icon: "merge", onSelect: () => soon("Merging clients") },
                ],
                { alignRight: true, variant: "actions" },
              )
            }
          >
            <Icon name="more" size={20} /> More Actions
          </button>
        </div>
      </div>

      <div className="kpis">
        {kpis.map(([title, sub, n, delta]) => (
          <div className="card kpi" key={title}>
            <div className="h">
              <span>{title}</span>
              <Icon name="arrowupright" size={18} />
            </div>
            <div className="s">{sub}</div>
            <div className="n">
              {n}
              {delta && <span className="delta">{delta}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="list-head">
        <h2>All clients</h2>
        <span className="muted">({list.length} client{list.length === 1 ? "" : "s"})</span>
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
                    placeholder="Search status"
                    options={CLIENT_STATUS_FILTERS.map((label) => ({ label }))}
                    selected={status}
                    onSelect={(o) => { setStatus(o); setPage(1); }}
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
            className="chip"
            type="button"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                TYPES.map((o) => ({ label: o, checked: type === o, onSelect: () => { setType(o); setPage(1); } })),
              )
            }
          >
            Type<span className="sep" /><b>{type}</b>
          </button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search clients..." aria-label="Search clients" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")}>{sortHead("name", "Name")}</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Type</th>
              <th aria-sort={ariaSort("daysAgo")}>{sortHead("daysAgo", "Last Activity")}</th>
            </tr>
          </thead>
          <tbody>
            {slice.length ? (
              slice.map((c) => {
                const addr = c.street1 ? `${c.street1}, ${c.city}, ${c.state} ${c.zip}` : "";
                const sub = c.company && c.name !== c.company ? c.company : c.company ? `Contact: ${c.contactName}` : "";
                return (
                  <tr key={c.id} className="click" onClick={() => router.push(`/clients/${c.id}`)}>
                    <td>
                      <div className="strong" title={c.name}>{c.name}</div>
                      {sub && <div className="sub" title={sub}>{sub}</div>}
                    </td>
                    <td>{c.phone}</td>
                    <td title={c.email}>{c.email}</td>
                    <td title={addr}>{addr}</td>
                    <td><span className="pill tag">{c.type}</span></td>
                    <td>{dayLabel(c.daysAgo, today)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty" style={{ margin: "20px 0" }}>No clients match these filters.</div>
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
