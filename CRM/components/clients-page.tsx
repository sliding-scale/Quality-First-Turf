"use client";

/* Clients list: search, Status and Type filters, sorting, pagination, CSV export. Everything is done by the backend
   (convex/crm/clients.ts) for the business selected in the top bar (D-031); this file only asks and shows. */

import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_STATUS_FILTERS, CLIENT_TYPE_LABEL, type ClientStatusFilter } from "@/convex/crm/lib/stages";
import { daysAgoFrom, useClientList, useClientStats, useWorkspace, type BusinessDoc } from "@/lib/clients";
import { dayLabel } from "@/lib/format";
import { useStaff } from "./staff-context";
import { EmptyBackend } from "./empty-backend";
import { FilterMenu } from "./filter-menus";
import { Icon } from "./icon";
import { ClientsSkeleton } from "./skeletons";
import { Checkbox } from "./checkbox";
import { DeleteClientsDialog } from "./delete-clients-dialog";
import { useUI } from "./ui-provider";

const NO_ROWS: Set<string> = new Set();
type SortKey = "name" | "lastActivity";
type TypeFilter = "All" | "homeowner" | "contractor";
const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "homeowner", label: "Homeowner" },
  { value: "contractor", label: "Contractor" },
];

export function ClientsPage({ initialQuery, saved }: { initialQuery: string; saved: boolean }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <ClientsSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Clients business={workspace.business} initialQuery={initialQuery} saved={saved} />;
}

/** "↑ 12%" against the previous 30 days, or nothing when there is no earlier period to compare with. */
function change(now: number, before: number) {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={`delta${pct >= 0 ? "" : " down"}`}>{pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}%</span>;
}

function Clients({ business, initialQuery, saved }: { business: BusinessDoc; initialQuery: string; saved: boolean }) {
  const router = useRouter();
  const convex = useConvex();
  const { canEdit } = useStaff();
  const { dropdown, popover, toast, soon } = useUI();
  const [q, setQ] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery); // what the server is asked, a moment after typing stops
  const [type, setType] = useState<TypeFilter>("All");
  const [status, setStatus] = useState<ClientStatusFilter>("Leads and Active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "lastActivity", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [deleting, setDeleting] = useState<Id<"clients">[] | null>(null);

  // A selection belongs to the rows on screen: it is remembered with the page, size, filter, search and sort it was made under,
  // and stops counting as soon as any of them changes.
  const scope = `${page}|${size}|${status}|${type}|${search}|${sort.key}|${sort.dir}`;
  const [picked, setPicked] = useState<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });
  const selected = picked.scope === scope ? picked.ids : NO_ROWS;
  const setSelected = (ids: Set<string>) => setPicked({ scope, ids });

  useEffect(() => {
    if (saved) toast("Client saved");
    // Only on arrival from the save redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { status, type, search, sortKey: sort.key, dir: sort.dir };
  const data = useClientList(business._id, filters, page, size);
  const stats = useClientStats(business._id);

  if (data === undefined || stats === undefined) return <ClientsSkeleton />;

  const { rows, total } = data;
  const current = data.page;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, total);
  const pageNumbers = [...new Set([1, pages, current, current - 1, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  const kpis: [string, string, number, React.ReactNode][] = [
    ["New leads", "Past 30 days", stats.newLeads, change(stats.newLeads, stats.newLeadsBefore)],
    ["New clients", "Past 30 days", stats.newClients, change(stats.newClients, stats.newClientsBefore)],
    ["Total clients", "All time", stats.total, null],
  ];

  const goTo = (n: number) => {
    setPage(n);
    document.getElementById("main")?.scrollTo({ top: 0 });
  };
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  async function exportCsv() {
    const all = await convex.query(api.crm.clients.exportRows, { businessId: business._id, ...filters });
    const esc = (s: string | number | null | undefined) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Name", "Company", "Type", "Phone", "Email", "Street", "City", "State", "ZIP", "Business"];
    const csv = [head.join(",")]
      .concat(all.map((c) => [c.name, c.company, CLIENT_TYPE_LABEL[c.type], c.phone, c.email, c.street1, c.city, c.state, c.zip, business.name].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${all.length} clients`);
  }

  const today = new Date();

  const pageIds = rows.map((c) => c._id as string);
  const pickedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allPicked = pageIds.length > 0 && pickedOnPage === pageIds.length;
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  };
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(pageIds));

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Clients</h1>
        <div className="actions">
          {canEdit && <Link className="btn primary" href="/clients/new">New Client</Link>}
          <button
            className="btn"
            type="button"
            aria-haspopup="menu"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                [
                  { label: "Import Clients", icon: "import", onSelect: () => soon("Importing clients") },
                  { label: "Export Clients", icon: "export", onSelect: () => void exportCsv() },
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
              {delta}
            </div>
          </div>
        ))}
      </div>

      <div className="list-head">
        <h2>All clients</h2>
        <span className="muted">({total} client{total === 1 ? "" : "s"})</span>
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
                    onSelect={(o) => { setStatus(o as ClientStatusFilter); setPage(1); }}
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
                TYPES.map((o) => ({ label: o.label, checked: type === o.value, onSelect: () => { setType(o.value); setPage(1); } })),
              )
            }
          >
            Type<span className="sep" /><b>{TYPES.find((o) => o.value === type)?.label}</b>
          </button>
        </div>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search clients..." aria-label="Search clients" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrap">
        <table className={`table single uniform${selected.size > 0 ? " selecting" : ""}`} id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            {selected.size > 0 ? (
              <tr className="selbar">
                <th colSpan={6}>
                  <div className="selbar-in">
                    <Checkbox state={allPicked ? true : "mixed"} label="Deselect all" onChange={() => setSelected(new Set())} />
                    <span className="selcount">{selected.size} selected</span>
                    <button type="button" className="linkbtn" onClick={() => setSelected(new Set())}>Deselect All</button>
                    {canEdit && (
                      <button type="button" className="icon-btn" aria-label={`Delete ${selected.size === 1 ? "client" : "clients"}`} title="Delete" onClick={() => setDeleting([...selected] as Id<"clients">[])}>
                        <Icon name="trash" size={22} />
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            ) : (
              <tr>
                <th aria-sort={ariaSort("name")}>
                  <div className="name-cell">
                    <Checkbox state={false} label="Select all clients on this page" onChange={toggleAll} disabled={rows.length === 0} />
                    {sortHead("name", "Name")}
                  </div>
                </th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Type</th>
                <th aria-sort={ariaSort("lastActivity")}>{sortHead("lastActivity", "Last Activity")}</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((c) => {
                const addr = c.street1 ? `${c.street1}, ${c.city}, ${c.state} ${c.zip}` : "";
                const sub = c.company && c.name !== c.company ? c.company : c.company ? `Contact: ${c.contactName}` : "";
                return (
                  <tr key={c._id} className={`click${selected.has(c._id) ? " picked" : ""}`} onClick={() => router.push(`/clients/${c._id}`)}>
                    <td>
                      <div className="name-cell">
                        <Checkbox rowBox state={selected.has(c._id)} label={`Select ${c.name}`} onChange={() => toggleRow(c._id)} />
                        <div className="name-text">
                          <div className="strong" title={c.name}>{c.name}</div>
                          {sub && <div className="sub" title={sub}>{sub}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{c.phone}</td>
                    <td title={c.email}>{c.email}</td>
                    <td title={addr}>{addr}</td>
                    <td><span className="pill tag">{CLIENT_TYPE_LABEL[c.type]}</span></td>
                    <td>{dayLabel(daysAgoFrom(c.lastActivityAt), today)}</td>
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

      {deleting && (
        <DeleteClientsDialog
          ids={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(n) => {
            setSelected(new Set());
            toast(`Deleted ${n} client${n === 1 ? "" : "s"}`);
          }}
        />
      )}

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
