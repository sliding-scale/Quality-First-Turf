"use client";

/* The Stock page (D-138): what is in the yard and every supplier order, as two tabs. Stock shows every material with what open jobs need
   from it and when it was last counted, so a stale number is visible; Count stock corrects many at once. Orders lists job and yard orders
   and adds new ones, including things already bought. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PO_LABEL, PO_STATUSES, type PoStatus } from "@/convex/crm/lib/purchaseOrders";
import { useWorkspace } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { OrderCard } from "./purchase-orders";
import { StockSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { amount, CountDialog, HistoryDialog, OrderDialog, UseDialog } from "./stock-dialogs";
import { useUI, type MenuItem } from "./ui-provider";

const PAGE = 25;
const ORDERS_PAGE = 10;
/** A count older than this is flagged: offline work may have changed the amount since. */
const STALE_MS = 14 * 86_400_000;

export function StockPage({ tab }: { tab: "stock" | "orders" }) {
  const ws = useWorkspace();
  if (ws.state !== "ready") return <StockSkeleton />;
  return (
    <div className="fade-in st">
      <div className="page-head"><h1>Stock</h1></div>
      <nav className="tabs st-tabs" aria-label="Stock sections">
        <Link className={`tab${tab === "stock" ? " active" : ""}`} aria-current={tab === "stock" ? "page" : undefined} href="/stock">In stock</Link>
        <Link className={`tab${tab === "orders" ? " active" : ""}`} aria-current={tab === "orders" ? "page" : undefined} href="/stock?tab=orders">Orders</Link>
      </nav>
      {tab === "stock" ? <InStock businessId={ws.business._id} /> : <Orders businessId={ws.business._id} />}
    </div>
  );
}

type Data = NonNullable<FunctionReturnType<typeof api.crm.stock.list>>;
type Item = Data["items"][number];

/** The Show filter of the stock list. */
const SHOWN = {
  all: { label: "All materials", has: () => true },
  needed: { label: "Needed by jobs", has: (i: Item) => i.needed > 0 },
  short: { label: "Short", has: (i: Item) => i.needed > i.inStock },
  yard: { label: "In the yard", has: (i: Item) => i.inStock > 0 },
} satisfies Record<string, { label: string; has: (i: Item) => boolean }>;
type Show = keyof typeof SHOWN;

function InStock({ businessId }: { businessId: Id<"businesses"> }) {
  const { toast, dropdown } = useUI();
  const canEdit = useStaff().can("pipelinePreplanning", "edit");
  const data = useQuery(api.crm.stock.list, { businessId });
  const count = useMutation(api.crm.stock.count);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // Counting mode: a box on every row, saved together.
  const [counting, setCounting] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [one, setOne] = useState<Item | null>(null);
  const [history, setHistory] = useState<Item | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [using, setUsing] = useState<Data["toRecord"][number] | null>(null);
  const [now] = useState(() => clock());
  if (data === undefined) return <StockSkeleton bare />;

  const term = q.trim().toLowerCase();
  const found = data.items.filter((i) => SHOWN[show].has(i) && (!term || `${i.name} ${i.category} ${i.supplier}`.toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(found.length / PAGE));
  const current = Math.min(page, pages);
  const rows = found.slice((current - 1) * PAGE, current * PAGE);
  const changed = counting ? Object.entries(counting).filter(([id, v]) => v !== "" && Number(v) !== data.items.find((i) => i.id === id)?.inStock) : [];
  const untouched = counting ? Object.entries(counting).filter(([, v]) => v !== "") : [];

  async function saveCounts() {
    if (!counting) return;
    // Every filled box is a count, changed or not: it was looked at.
    if (untouched.length === 0) { setCounting(null); return; }
    setBusy(true);
    try {
      await count({ businessId, counts: untouched.map(([id, v]) => ({ materialId: id as Id<"materials">, qty: Number(v) })), now: clock() });
      toast(`${untouched.length} count${untouched.length === 1 ? "" : "s"} saved${changed.length ? `, ${changed.length} changed` : ""}.`);
      setCounting(null);
    } catch (e) {
      toast(failure(e, "The counts could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  const menu = (i: Item): MenuItem[] => [
    { label: "Count", icon: "package", reason: canEdit ? undefined : "Your role can look at this but not change it.", onSelect: () => setOne(i) },
    { label: "View changes", icon: "timeline", onSelect: () => setHistory(i) },
  ];

  return (
    <>
      {data.toRecord.length > 0 && (
        <div className="au-warn st-record" role="status">
          <span>Finished jobs that have not recorded the materials they used:</span>
          {data.toRecord.map((j) => <button key={j.id} type="button" className="btn small" onClick={() => setUsing(j)}>{j.title} · {j.code}</button>)}
        </div>
      )}
      <p className="au-lead">What is in the yard. Goods bought for one job stay with that job. Work done outside Launchpad shows up when you count.</p>
      <div className="toolbar">
        {canEdit && (
          <div className="st-actions">
            {counting === null ? (
              <button type="button" className="btn primary" disabled={data.items.length === 0} onClick={() => setCounting(Object.fromEntries(data.items.map((i) => [i.id, ""])))}><Icon name="package" size={18} /> Count stock</button>
            ) : (
              <>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void saveCounts()}>{busy ? "Saving…" : "Save counts"}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => setCounting(null)}>Cancel</button>
              </>
            )}
          </div>
        )}
        <label className="st-filter">
          <span>Show</span>
          <select value={show} onChange={(e) => { setShow(e.target.value as Show); setPage(1); }}>
            {(Object.keys(SHOWN) as Show[]).map((k) => <option key={k} value={k}>{SHOWN[k].label} ({data.items.filter(SHOWN[k].has).length})</option>)}
          </select>
        </label>
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search stock" aria-label="Search stock" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>
      {counting !== null && <p className="muted st-hint">Type what you find. Leave a box empty for anything you did not check.</p>}
      <div className="table-wrap">
        <table className="table st-table">
          <colgroup><col style={{ width: "27%" }} /><col style={{ width: "13%" }} /><col style={{ width: 170 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 64 }} /></colgroup>
          <thead><tr><th>Material</th><th>Supplier</th><th className="num">In stock</th><th className="num">Needed by jobs</th><th className="num">Left over</th><th>Last counted</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((i) => {
              const left = Math.round((i.inStock - i.needed) * 100) / 100;
              // Flagged when the number may be wrong: an old count, or an amount nobody has counted. Nothing recorded yet is not.
              const stale = i.countedAt === null ? i.inStock > 0 : now - i.countedAt > STALE_MS;
              return (
                <tr key={i.id}>
                  <td><b>{i.name}</b><div className="muted">{i.category || "Other"}</div></td>
                  <td data-label="Supplier">{i.supplier || <span className="muted">—</span>}</td>
                  <td className="num" data-label="In stock">
                    {counting ? <input className="st-count" aria-label={`Count of ${i.name}`} inputMode="decimal" placeholder={String(i.inStock)} value={counting[i.id] ?? ""} onChange={(e) => setCounting({ ...counting, [i.id]: amount(e.target.value) })} /> : <><b>{i.inStock}</b> <span className="muted">{i.unit}</span></>}
                  </td>
                  <td className="num" data-label="Needed by jobs">{i.needed > 0 ? <>{i.needed}<div className="muted">{i.jobs} job{i.jobs === 1 ? "" : "s"}</div></> : <span className="muted">0</span>}</td>
                  <td className="num" data-label="Left over"><span className={left < 0 ? "tk-short" : undefined}>{left < 0 ? `Short ${-left}` : left}</span></td>
                  <td data-label="Last counted">
                    {i.countedAt === null ? <span className={stale ? "st-stale" : "muted"}>Never counted</span> : <><span className={stale ? "st-stale" : undefined}>{quoteDate(i.countedAt)}</span><div className="muted">{i.countedBy}</div></>}
                  </td>
                  <td><button type="button" className="btn icon" aria-label={`Actions for ${i.name}`} aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, menu(i), { alignRight: true })}><Icon name="more" size={18} /></button></td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7}><div className="empty" style={{ margin: "20px 0" }}>{data.items.length === 0 ? "There are no materials yet. Add them in Settings > Materials." : "Nothing to show here."}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager total={found.length} noun="material" current={current} pages={pages} go={setPage} />
      {one && <CountDialog businessId={businessId} material={one} onClose={() => setOne(null)} />}
      {history && <HistoryDialog material={history} onClose={() => setHistory(null)} />}
      {using && <UseDialog id={using.id} title={`${using.title} · ${using.code}`} onClose={() => setUsing(null)} />}
    </>
  );
}

function Pager({ total, noun, current, pages, go }: { total: number; noun: string; current: number; pages: number; go: (n: number) => void }) {
  return (
    <div className="pager">
      <div className="left"><span>{total} {noun}{total === 1 ? "" : "s"}</span></div>
      <div className="right pages">
        <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => go(current - 1)}><Icon name="chevleft" size={20} /></button>
        <span className="gap">Page {current} of {pages}</span>
        <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => go(current + 1)}><Icon name="chevright" size={20} /></button>
      </div>
    </div>
  );
}

function Orders({ businessId }: { businessId: Id<"businesses"> }) {
  const { toast } = useUI();
  const canEdit = useStaff().can("pipelinePreplanning", "edit");
  const data = useQuery(api.crm.purchaseOrders.all, { businessId });
  const [status, setStatus] = useState<PoStatus | "open" | "all">("open");
  const [page, setPage] = useState(1);
  const [making, setMaking] = useState(false);
  if (data === undefined) return <StockSkeleton bare />;

  const found = data.orders.filter((o) => (status === "all" ? true : status === "open" ? o.status === "draft" || o.status === "ordered" : o.status === status));
  const pages = Math.max(1, Math.ceil(found.length / ORDERS_PAGE));
  const current = Math.min(page, pages);
  const blocked = () => toast("Your role can look at orders but not make them.");

  return (
    <>
      <div className="toolbar">
        <div className="st-actions">
          <button type="button" className="btn primary" aria-disabled={!canEdit || undefined} onClick={() => (canEdit ? setMaking(true) : blocked())}><Icon name="plus" size={18} /> Add order</button>
        </div>
        <label className="st-filter">
          <span>Show</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="open">Open orders</option>
            <option value="all">All orders</option>
            {PO_STATUSES.map((s) => <option key={s} value={s}>{PO_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {found.length === 0 ? <div className="empty">{data.orders.length === 0 ? "No orders yet. Make one here or from a job's Takeoff tab." : "No orders to show here."}</div> : (
        <div className="po-list">
          {found.slice((current - 1) * ORDERS_PAGE, current * ORDERS_PAGE).map((o) => (
            <OrderCard
              key={`${o.id}-${o.status}-${o.expectedDate}`} o={o} canSeeCosts={data.canSeeCosts} canEdit={canEdit}
              label={o.job ? <Link className="st-job" href={`/opportunities/${o.job.id}?tab=takeoff`}>{o.job.title} · {o.job.code}</Link> : <span className="muted">For the yard</span>}
            />
          ))}
        </div>
      )}
      <Pager total={found.length} noun="order" current={current} pages={pages} go={setPage} />
      {making && <OrderDialog businessId={businessId} data={data} onClose={() => setMaking(false)} />}
    </>
  );
}
