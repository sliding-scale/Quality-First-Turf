"use client";

/* The project's purchase orders and material readiness (PRD 4.4, plan 2026-11-20-purchase-orders), on the Takeoff tab. Orders are made from the
   takeoff, one draft per supplier; each can be given an expected date, placed, marked delivered or cancelled. Readiness (In stock, Not ordered,
   Ordered, Delivered) is worked out by the backend from the takeoff and the live orders. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PO_LABEL, READINESS_LABEL } from "@/convex/crm/lib/purchaseOrders";
import { moneyCents } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { useUI } from "./ui-provider";
import { dayFromKey, dayKey, dayLabel } from "./work-package-tab";

type Data = NonNullable<FunctionReturnType<typeof api.crm.purchaseOrders.list>>;
type Order = Data["orders"][number];

export function PurchaseOrders({ id, canEdit }: { id: Id<"opportunities">; canEdit: boolean }) {
  const { toast } = useUI();
  const data = useQuery(api.crm.purchaseOrders.list, { id });
  const create = useMutation(api.crm.purchaseOrders.createFromTakeoff);
  const [busy, setBusy] = useState(false);
  if (data === undefined) return <section className="card op-card"><div className="sk" style={{ height: 120 }} /></section>;
  if (data === null) return null;
  const r = data.readiness;

  async function make() {
    setBusy(true);
    try {
      const n = await create({ id, now: clock() });
      toast(n === 1 ? "1 draft order made." : `${n} draft orders made.`);
    } catch (e) {
      toast(failure(e, "The orders could not be made."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card op-card po">
      <div className="op-sechead">
        <h2>Purchase orders</h2>
        {canEdit && <button type="button" className="btn primary" disabled={busy || data.toOrderCount === 0} onClick={() => void make()} data-tip={data.toOrderCount === 0 ? "Everything is in stock or already on an order" : "One draft per supplier"}>Create from takeoff</button>}
      </div>

      <p className={`po-ready${r.ready ? " ok" : ""}`}>
        {r.lines.length === 0
          ? "Add materials to the takeoff to track their readiness."
          : r.ready
            ? "Materials are ready: everything is in stock or delivered."
            : `Materials not ready: ${r.open} not ordered, ${r.onTheWay} on the way${r.latestExpected ? `, the last expected ${dayLabel(r.latestExpected)}` : ""}.`}
      </p>

      {r.lines.length > 0 && (
        <div className="op-scroll">
          <table className="table op-table">
            <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>
            <thead><tr><th>Material</th><th>Readiness</th><th className="num">To buy</th><th className="num">Ordered</th><th>Expected</th></tr></thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={`${l.name}-${i}`}>
                  <td>{l.name} <span className="muted">({l.unit})</span></td>
                  <td><span className={`po-chip ${l.state}`}>{READINESS_LABEL[l.state]}</span></td>
                  <td className="num">{l.need}</td>
                  <td className="num">{l.ordered}</td>
                  <td>{l.expected ? dayLabel(l.expected) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.orders.length === 0 ? <p className="muted">No purchase orders yet.</p> : (
        <div className="po-list">
          {data.orders.map((o) => <OrderCard key={`${o.id}-${o.status}-${o.expectedDate}`} o={o} canSeeCosts={data.canSeeCosts} canEdit={canEdit} />)}
        </div>
      )}
    </section>
  );
}

function OrderCard({ o, canSeeCosts, canEdit }: { o: Order; canSeeCosts: boolean; canEdit: boolean }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.purchaseOrders.save);
  const setStatus = useMutation(api.crm.purchaseOrders.setStatus);
  const remove = useMutation(api.crm.purchaseOrders.remove);
  const [supplier, setSupplier] = useState(o.supplier);
  const [expected, setExpected] = useState(dayKey(o.expectedDate));
  const [notes, setNotes] = useState(o.notes);
  const [qtys, setQtys] = useState(o.lines.map((l) => String(l.qty)));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const editable = canEdit && (o.status === "draft" || o.status === "ordered");
  const draft = o.status === "draft";
  const qtyBad = (q: string) => !(Number(q) > 0);

  async function run(fn: () => Promise<unknown>, done: string, fallback: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(failure(e, fallback));
    } finally {
      setBusy(false);
    }
  }
  const saveAll = async () => {
    setTried(true);
    if (draft && qtys.some(qtyBad)) return;
    await run(() => save({ id: o.id, supplier, expectedDate: dayFromKey(expected), notes, ...(draft ? { qtys: qtys.map(Number) } : {}) }), "Order saved.", "The order could not be saved.");
  };

  return (
    <article className="po-card">
      <header>
        <b>{o.number}</b>
        <span className={`po-chip ${o.status}`}>{PO_LABEL[o.status]}</span>
        {o.orderedAt && <span className="muted">ordered {dayLabel(o.orderedAt)}</span>}
        {o.deliveredAt && <span className="muted">delivered {dayLabel(o.deliveredAt)}</span>}
        {canSeeCosts && o.totalCents !== null && <span className="po-total">{moneyCents(o.totalCents)}</span>}
      </header>
      <ul className="po-lines">
        {o.lines.map((l, i) => (
          <li key={i}>
            <span>{l.name} <span className="muted">({l.unit})</span></span>
            {draft && canEdit ? (
              <span className={`field${tried && qtyBad(qtys[i]) ? " bad" : ""}`}><input aria-label={`Quantity of ${l.name}`} inputMode="decimal" value={qtys[i]} onChange={(e) => setQtys((all) => all.map((q, j) => (j === i ? e.target.value.replace(/[^\d.]/g, "") : q)))} /></span>
            ) : <b>{l.qty}</b>}
          </li>
        ))}
      </ul>
      <div className="po-fields">
        <div className="field"><label htmlFor={`po-s-${o.id}`}>Supplier</label><input id={`po-s-${o.id}`} maxLength={100} disabled={!editable} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div className="field"><label htmlFor={`po-e-${o.id}`}>Expected delivery</label><input id={`po-e-${o.id}`} type="date" disabled={!editable} value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
        <div className="field"><label htmlFor={`po-n-${o.id}`}>Notes</label><input id={`po-n-${o.id}`} maxLength={3000} disabled={!editable} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      {canEdit && o.status !== "delivered" && o.status !== "cancelled" && (
        <div className="cat-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void saveAll()}>Save</button>
          {draft && <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => setStatus({ id: o.id, status: "ordered", now: clock() }), "Order placed.", "The order could not be placed.")}>Place order</button>}
          {o.status === "ordered" && <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => setStatus({ id: o.id, status: "delivered", now: clock() }), "Marked delivered.", "The order could not be marked delivered.")}>Mark delivered</button>}
          <button type="button" className="btn" disabled={busy} onClick={() => void run(() => setStatus({ id: o.id, status: "cancelled", now: clock() }), "Order cancelled.", "The order could not be cancelled.")}>Cancel order</button>
          {draft && <button type="button" className="btn" disabled={busy} onClick={() => void run(() => remove({ id: o.id }), "Order deleted.", "The order could not be deleted.")}>Delete</button>}
        </div>
      )}
      {canEdit && o.status === "cancelled" && <div className="cat-actions"><button type="button" className="btn" disabled={busy} onClick={() => void run(() => remove({ id: o.id }), "Order deleted.", "The order could not be deleted.")}>Delete</button></div>}
    </article>
  );
}
