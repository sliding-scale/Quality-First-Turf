"use client";

/* The dialogs of stock and supplier orders (D-138): count what is in the yard, a material's changes, record what a job used, receive a
   delivery, and add an order. Used on the Stock page and the Takeoff tab. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDateTime } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";
import { dayFromKey, dayKey } from "./work-package-tab";

export const amount = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const valid = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

/** A form in a dialog: runs `send` on submit, shows what went wrong, and closes when it worked. */
function useSend() {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(work: () => Promise<unknown>, done: string, close: () => void) {
    setBusy(true);
    setError("");
    try {
      await work();
      toast(done);
      close();
    } catch (e) {
      setError(failure(e, "That could not be saved. Try again."));
      setBusy(false);
    }
  }
  return { busy, error, send };
}

function Foot({ busy, close, label }: { busy: boolean; close: () => void; label: string }) {
  return (
    <div className="modal-foot">
      <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
      <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : label}</button>
    </div>
  );
}

export function CountDialog({ businessId, material, onClose }: { businessId: Id<"businesses">; material: { id: Id<"materials">; name: string; unit: string; inStock: number }; onClose: () => void }) {
  const count = useMutation(api.crm.stock.count);
  const { busy, error, send } = useSend();
  const [qty, setQty] = useState(String(material.inStock));
  const [tried, setTried] = useState(false);
  return (
    <PipelineModal title={`Count ${material.name}`} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form
          noValidate
          className="cat-fields"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setTried(true);
            if (!valid(qty)) return;
            void send(() => count({ businessId, counts: [{ materialId: material.id, qty: Number(qty) }], now: clock() }), "Stock updated.", close);
          }}
        >
          <p className="muted">How much is in the yard right now? Do not count what was bought for a job and is with that job.</p>
          <div className={`field${tried && !valid(qty) ? " bad" : ""}`}>
            <label htmlFor="st-count">In stock ({material.unit})</label>
            <input id="st-count" inputMode="decimal" autoFocus aria-invalid={tried && !valid(qty)} value={qty} onChange={(e) => setQty(amount(e.target.value))} />
            <span className="err">Enter an amount of zero or more.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <Foot busy={busy} close={close} label="Save count" />
        </form>
      )}
    </PipelineModal>
  );
}

const REASON = { count: "Counted", delivery: "Delivery", bought: "Bought", used: "Used on a job" } as const;

export function HistoryDialog({ material, onClose }: { material: { id: Id<"materials">; name: string; unit: string }; onClose: () => void }) {
  const rows = useQuery(api.crm.stock.history, { materialId: material.id });
  return (
    <PipelineModal title={`${material.name}: changes`} onClose={onClose} className="au-modal cat-modal">
      {(close) => (
        <>
          {rows === undefined ? <div className="sk" style={{ height: 90 }} /> : rows.length === 0 ? <p className="muted">No changes recorded yet.</p> : (
            <ul className="qd-events">
              {rows.map((r) => (
                <li key={r.id}>
                  <span><b>{REASON[r.reason]}</b> · {r.change > 0 ? "+" : ""}{r.change} to {r.after} {material.unit}{[r.job, r.note].filter(Boolean).map((t) => ` · ${t}`).join("")}</span>
                  <small>{r.byName} · {quoteDateTime(r.at)}</small>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-foot"><button type="button" className="btn primary" onClick={close}>Close</button></div>
        </>
      )}
    </PipelineModal>
  );
}

type Usage = NonNullable<FunctionReturnType<typeof api.crm.stock.usage>>;

export function UseDialog({ id, title, onClose }: { id: Id<"opportunities">; title: string; onClose: () => void }) {
  const usage = useQuery(api.crm.stock.usage, { id });
  return (
    <PipelineModal title={`Materials used: ${title}`} onClose={onClose} className="au-modal cat-modal">
      {(close) => (usage === undefined ? <div className="sk" style={{ height: 140 }} /> : <UseForm id={id} usage={usage} close={close} />)}
    </PipelineModal>
  );
}

function UseForm({ id, usage, close }: { id: Id<"opportunities">; usage: Usage | null; close: () => void }) {
  const record = useMutation(api.crm.stock.recordUse);
  const { busy, error, send } = useSend();
  const [rows, setRows] = useState(() => (usage?.rows ?? []).map((r) => ({ ...r, used: String(r.suggested), returned: "" })));
  const set = (i: number, patch: { used?: string; returned?: string }) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form
      noValidate
      className="cat-fields"
      onSubmit={(e) => {
        e.preventDefault();
        void send(() => record({ id, rows: rows.map((r) => ({ materialId: r.materialId, used: Number(r.used) || 0, returned: Number(r.returned) || 0 })), now: clock() }), "Stock updated.", close);
      }}
    >
      {rows.length === 0 ? <p className="muted">This job&apos;s materials are no longer in the list, so there is nothing to take off. Saving marks the job as recorded.</p> : (
        <>
          <p className="muted">What came out of the yard, and what went back in? The amounts start from the takeoff, less what was ordered for this job and no more than the yard holds. Change anything that differs.</p>
          <table className="table st-use">
            <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /></colgroup>
            <thead><tr><th>Material</th><th className="num">From stock</th><th className="num">Put back</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.materialId}>
                  <td><b>{r.name}</b><div className="muted">{r.inStock} {r.unit} in stock</div></td>
                  <td><input aria-label={`${r.name} taken from stock`} inputMode="decimal" value={r.used} onChange={(e) => set(i, { used: amount(e.target.value) })} /></td>
                  <td><input aria-label={`${r.name} put back into stock`} inputMode="decimal" placeholder="0" value={r.returned} onChange={(e) => set(i, { returned: amount(e.target.value) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">This is recorded once for a job. Later corrections are made by counting.</p>
        </>
      )}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <Foot busy={busy} close={close} label="Record" />
    </form>
  );
}

export type DeliveryOrder = { id: Id<"purchaseOrders">; number: string; forStock: boolean; lines: { name: string; unit: string; qty: number; materialId: Id<"materials"> | null }[] };

export function DeliverDialog({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const setStatus = useMutation(api.crm.purchaseOrders.setStatus);
  const { busy, error, send } = useSend();
  // Goods for the yard all go into stock; goods bought for a job stay with it unless some are put in the yard.
  const [rows, setRows] = useState(() => order.lines.flatMap((l) => (l.materialId ? [{ ...l, materialId: l.materialId, add: order.forStock ? String(l.qty) : "" }] : [])));
  return (
    <PipelineModal title={`${order.number} delivered`} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form
          noValidate
          className="cat-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void send(() => setStatus({ id: order.id, status: "delivered", now: clock(), toStock: rows.filter((r) => Number(r.add) > 0).map((r) => ({ materialId: r.materialId, qty: Number(r.add) })) }), "Marked delivered.", close);
          }}
        >
          <p className="muted">{order.forStock ? "Check what arrived. These amounts are added to stock." : "These goods are for the job. Enter an amount only for what goes into the yard instead."}</p>
          {rows.length > 0 && (
            <table className="table st-use">
              <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 130 }} /></colgroup>
              <thead><tr><th>Material</th><th className="num">Ordered</th><th className="num">Into stock</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.materialId}>
                    <td><b>{r.name}</b> <span className="muted">({r.unit})</span></td>
                    <td className="num">{r.qty}</td>
                    <td><input aria-label={`${r.name} into stock`} inputMode="decimal" placeholder="0" value={r.add} onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, add: amount(e.target.value) } : x)))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <Foot busy={busy} close={close} label="Mark delivered" />
        </form>
      )}
    </PipelineModal>
  );
}

type OrderData = NonNullable<FunctionReturnType<typeof api.crm.purchaseOrders.all>>;

const ORDER_STATES = [
  { key: "draft", label: "Still to order", hint: "Kept as a draft until you place it.", date: "Expected delivery", button: "Save draft", done: "Draft order saved." },
  { key: "ordered", label: "Ordered", hint: "On its way. Mark it delivered when it arrives.", date: "Expected delivery", button: "Save order", done: "Order saved." },
  { key: "received", label: "Already received", hint: "Something you bought and have, such as from a store.", date: "Bought on", button: "Save purchase", done: "" },
] as const;
type OrderState = (typeof ORDER_STATES)[number]["key"];

/** Adds an order for the yard or a job, wherever it is up to. */
export function OrderDialog({ businessId, data, onClose }: { businessId: Id<"businesses">; data: OrderData; onClose: () => void }) {
  const create = useMutation(api.crm.purchaseOrders.create);
  const { busy, error, send } = useSend();
  const [job, setJob] = useState("");
  const [supplier, setSupplier] = useState("");
  const [state, setState] = useState<OrderState>("draft");
  const [date, setDate] = useState("");
  const chosen = ORDER_STATES.find((s) => s.key === state)!;
  const received = state === "received";
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ key: 1, materialId: "", qty: "" }]);
  const [tried, setTried] = useState(false);
  const set = (key: number, patch: { materialId?: string; qty?: string }) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const badLine = (l: { materialId: string; qty: string }) => !l.materialId || !(Number(l.qty) > 0);
  const badDate = received && !date;
  const groups = [...new Set(data.materials.map((m) => m.category))].sort();

  return (
    <PipelineModal title="Add order" onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form
          noValidate
          className="cat-fields"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (badDate || lines.some(badLine)) return;
            void send(
              () => create({
                businessId, supplier, notes, state, now: clock(), lines: lines.map((l) => ({ materialId: l.materialId as Id<"materials">, qty: Number(l.qty) })),
                ...(job ? { opportunityId: job as Id<"opportunities"> } : {}),
                ...(date ? { date: dayFromKey(date) } : {}),
              }),
              chosen.done || (job ? "Purchase saved for the job." : "Purchase saved and added to stock."),
              close,
            );
          }}
        >
          <fieldset className="st-states">
            <legend>Where is it up to?</legend>
            {ORDER_STATES.map((s) => (
              <label key={s.key} className={state === s.key ? "on" : undefined}>
                <input
                  type="radio" name="po-state" checked={state === s.key}
                  onChange={() => { setState(s.key); setDate((d) => (s.key === "received" ? d || dayKey(clock()) : received ? "" : d)); setTried(false); }}
                />
                <span>{s.label}</span>
              </label>
            ))}
            <p className="muted">{chosen.hint}</p>
          </fieldset>
          <div className="field">
            <label htmlFor="po-for">For</label>
            <select id="po-for" value={job} onChange={(e) => setJob(e.target.value)}>
              <option value="">The yard (goes into stock)</option>
              {data.jobOptions.map((j) => <option key={j.id} value={j.id}>{j.title} · {j.code}</option>)}
            </select>
          </div>
          <div className="cat-money two">
            <div className="field">
              <label htmlFor="po-supplier">Supplier</label>
              <input id="po-supplier" list="po-suppliers" maxLength={100} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              <datalist id="po-suppliers">{data.suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className={`field${tried && badDate ? " bad" : ""}`}>
              <label htmlFor="po-date">{chosen.date}</label>
              <input id="po-date" type="date" aria-invalid={tried && badDate} value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="err">Pick the day it was bought.</span>
            </div>
          </div>
          <div className="st-lines">
            {lines.map((l, i) => {
              const m = data.materials.find((x) => x.id === l.materialId);
              const bad = tried && badLine(l);
              return (
                <div className={`st-line${bad ? " bad" : ""}`} key={l.key}>
                  <div className="field">
                    <label htmlFor={`po-m-${l.key}`}>Material {i + 1}</label>
                    <select id={`po-m-${l.key}`} aria-invalid={bad && !l.materialId} value={l.materialId} onChange={(e) => set(l.key, { materialId: e.target.value })}>
                      <option value="">Choose a material…</option>
                      {groups.map((g) => (
                        <optgroup key={g} label={g || "Other"}>
                          {data.materials.filter((x) => x.category === g && (x.id === l.materialId || !lines.some((o) => o.materialId === x.id))).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`po-q-${l.key}`}>Quantity{m ? ` (${m.unit})` : ""}</label>
                    <input id={`po-q-${l.key}`} inputMode="decimal" aria-invalid={bad && !(Number(l.qty) > 0)} value={l.qty} onChange={(e) => set(l.key, { qty: amount(e.target.value) })} />
                  </div>
                  <button type="button" className="btn icon" aria-label={`Remove material ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}><Icon name="x" size={18} /></button>
                  {bad && <p className="st-err" role="alert">Choose a material and a quantity above zero.</p>}
                </div>
              );
            })}
            <button type="button" className="linkbtn" onClick={() => setLines((all) => [...all, { key: Math.max(...all.map((l) => l.key)) + 1, materialId: "", qty: "" }])}><Icon name="plus" size={16} /> Add another material</button>
          </div>
          <div className="field"><label htmlFor="po-notes">Notes</label><textarea id="po-notes" rows={2} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {data.materials.length === 0 && <p className="muted">There are no materials yet. Add them in Settings &gt; Materials first.</p>}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <Foot busy={busy} close={close} label={chosen.button} />
        </form>
      )}
    </PipelineModal>
  );
}
