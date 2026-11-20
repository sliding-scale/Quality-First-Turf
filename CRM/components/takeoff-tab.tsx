"use client";

/* The project's Takeoff tab (PRD 4.2, plan 2026-11-19-takeoff): the measurements, the materials with the quantity each formula works out (the person
   can type their own), supplier, lead time and stock for each, and the material requirements summary, which can be printed or downloaded. The
   backend (convex/crm/takeoff.ts) does all the arithmetic with the same evaluator the Materials page tries formulas with. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { moneyCents } from "@/lib/format";
import { failure } from "@/lib/pipeline";
import { clock } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { PurchaseOrders } from "./purchase-orders";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Takeoff = NonNullable<FunctionReturnType<typeof api.crm.takeoff.get>>;
type Line = Takeoff["lines"][number];

const csv = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function TakeoffTab({ id, businessId, title }: { id: Id<"opportunities">; businessId: Id<"businesses">; title: string }) {
  const staff = useStaff();
  const t = useQuery(api.crm.takeoff.get, { id });
  const options = useQuery(api.crm.materials.options, { businessId });
  const kits = useQuery(api.crm.materialKits.list, { businessId });
  const canEdit = staff.can("pipelinePreplanning", "edit");
  if (t === undefined) return <div className="card op-card"><div className="sk" style={{ height: 160 }} /></div>;
  if (t === null) return <div className="card op-card"><p className="muted">A takeoff starts once the project is Closed Won.</p></div>;
  return (
    <div className="op-body one tk">
      <Measurements key={`${t.updatedAt}`} id={id} t={t} canEdit={canEdit} />
      <Materials id={id} t={t} options={options ?? []} kits={kits ?? []} canEdit={canEdit} />
      <Summary t={t} title={title} />
      <PurchaseOrders id={id} canEdit={canEdit} />
    </div>
  );
}

function Measurements({ id, t, canEdit }: { id: Id<"opportunities">; t: Takeoff; canEdit: boolean }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.takeoff.saveInputs);
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(t.inputList.map((i) => [i.key, t.inputs[i.key] ? String(t.inputs[i.key]) : ""])));
  const [busy, setBusy] = useState(false);
  const dirty = t.inputList.some((i) => (Number(vals[i.key]) || 0) !== (t.inputs[i.key] ?? 0));
  const bad = (k: string) => vals[k] !== "" && !Number.isFinite(Number(vals[k]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (t.inputList.some((i) => bad(i.key))) return;
    setBusy(true);
    try {
      await save({ id, inputs: Object.fromEntries(t.inputList.map((i) => [i.key, Number(vals[i.key]) || 0])), now: clock() });
      toast("Measurements saved. The quantities are worked out again.");
    } catch (err) {
      toast(failure(err, "The measurements could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Measurements</h2>
        {t.suggested && canEdit && (
          <button type="button" className="btn" onClick={() => setVals((v) => ({ ...v, area: String(t.suggested!.area), perimeter: String(t.suggested!.perimeter) }))} data-tip="The visit's work areas added up">
            <Icon name="import" size={16} /> Use the visit&apos;s measurements
          </button>
        )}
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="tk-inputs">
          {t.inputList.map((i) => (
            <div className={`field${bad(i.key) ? " bad" : ""}`} key={i.key}>
              <label htmlFor={`tk-${i.key}`}>{i.label} ({i.unit})</label>
              <input id={`tk-${i.key}`} inputMode="decimal" disabled={!canEdit} aria-invalid={bad(i.key)} value={vals[i.key]} onChange={(e) => setVals((v) => ({ ...v, [i.key]: e.target.value.replace(/[^\d.]/g, "") }))} />
              <span className="err">Enter a number.</span>
            </div>
          ))}
        </div>
        <p className="muted">{t.updatedAt ? `Saved ${new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} by ${t.updatedByName}.` : "Not saved yet."} Every formula reads these.</p>
        {canEdit && <div className="cat-actions"><button type="submit" className="btn primary" disabled={busy || !dirty}>{busy ? "Saving…" : "Save measurements"}</button></div>}
      </form>
    </section>
  );
}

function Materials({ id, t, options, kits, canEdit }: { id: Id<"opportunities">; t: Takeoff; options: { id: Id<"materials">; name: string; unit: string }[]; kits: { id: Id<"materialKits">; name: string; group: string; uses: string[] }[]; canEdit: boolean }) {
  const { toast } = useUI();
  const add = useMutation(api.crm.takeoff.addLine);
  const refresh = useMutation(api.crm.takeoff.refreshLine);
  const remove = useMutation(api.crm.takeoff.removeLine);
  const addKit = useMutation(api.crm.takeoff.addKit);
  const [pick, setPick] = useState("");
  const [kitPick, setKitPick] = useState("");
  const [editing, setEditing] = useState<Line | null>(null);
  const free = options.filter((o) => !t.lines.some((l) => l.materialId === o.id));
  const toOrder = new Map(t.summary.suppliers.flatMap((s) => s.lines.map((l) => [l.name, l.toOrder] as const)));
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));

  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Materials</h2>
        {canEdit && (
          <div className="cat-actions" style={{ marginTop: 0 }}>
            <select aria-label="Material to add" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{options.length === 0 ? "No materials yet" : free.length === 0 ? "All materials are on this takeoff" : "Add a material…"}</option>
              {free.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>)}
            </select>
            <button type="button" className="btn primary" disabled={!pick} onClick={() => void add({ id, materialId: pick as Id<"materials"> }).then(() => setPick("")).catch((e) => fail(e, "The material could not be added."))}>Add</button>
            <select aria-label="Kit to add" value={kitPick} onChange={(e) => setKitPick(e.target.value)}>
              <option value="">{kits.length === 0 ? "No kits yet" : "Add a kit…"}</option>
              {[...new Set(kits.map((k) => k.group))].map((g) => (
                <optgroup key={g} label={g || "Other"}>
                  {kits.filter((k) => k.group === g).map((k) => <option key={k.id} value={k.id}>{k.name}{k.uses.length ? ` (${k.uses.join(", ")})` : ""}</option>)}
                </optgroup>
              ))}
            </select>
            <button
              type="button" className="btn primary" disabled={!kitPick}
              onClick={() => void addKit({ id, kitId: kitPick as Id<"materialKits"> }).then((r) => {
                setKitPick("");
                toast(r.added === 0 ? "Everything in that kit is already on this takeoff." : `Added ${r.added} material${r.added === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already here` : ""}${r.missing ? `, ${r.missing} no longer in the list` : ""}.`);
              }).catch((e) => fail(e, "The kit could not be added."))}
            >
              Add kit
            </button>
          </div>
        )}
      </div>
      {t.lines.length === 0 ? (
        <p className="muted">{options.length === 0 ? "There are no materials yet. Add them, with their formulas, in Settings > Materials." : "Add the materials this project needs. Each works out its quantity from the measurements above."}</p>
      ) : (
        <div className="op-scroll">
          <table className="table op-table">
            <colgroup><col /><col style={{ width: 80 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>
            <thead><tr><th>Material</th><th>Unit</th><th className="num">Worked out</th><th className="num">Order</th><th className="num">To order</th><th /></tr></thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.name}</b>{l.sku && <span className="muted"> {l.sku}</span>}<div className="muted op-text">{l.supplier || "No supplier yet"}{l.leadTimeDays !== null ? ` · ${l.leadTimeDays} d lead time` : ""}{l.inStock !== null ? ` · ${l.inStock} in stock` : ""}</div>{l.calcError && <div className="cat-bad">{l.calcError}</div>}{l.notes && <div className="muted op-text">{l.notes}</div>}</td>
                  <td>{l.unit}</td>
                  <td className="num">{l.calcQty === null ? "—" : l.calcQty}</td>
                  <td className="num">{l.qtyOverride !== null ? <b>{l.qtyOverride}</b> : l.qty}{l.qtyOverride !== null && <div className="muted">typed</div>}</td>
                  <td className="num"><span className={(toOrder.get(l.name) ?? 0) > 0 ? "tk-short" : "muted"}>{toOrder.get(l.name) ?? 0}</span></td>
                  <td>
                    {canEdit && (
                      <span className="job-rowbtns tk-noprint">
                        <button type="button" className="btn icon" aria-label="Edit line" data-tip="Quantity, supplier, lead time and stock" onClick={() => setEditing(l)}><Icon name="pencil" size={18} /></button>
                        <button type="button" className="btn icon" aria-label="Refresh from the material" data-tip="Read the material and its formula again" disabled={!l.materialId} onClick={() => void refresh({ lineId: l.id as Id<"takeoffLines"> }).catch((e) => fail(e, "That could not be refreshed."))}><Icon name="timeline" size={18} /></button>
                        <button type="button" className="btn icon" aria-label="Remove line" data-tip="Remove" onClick={() => void remove({ lineId: l.id as Id<"takeoffLines"> }).catch((e) => fail(e, "That could not be removed."))}><Icon name="trash" size={18} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <LineDialog line={editing} canCost={t.canSeeCosts} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LineDialog({ line, canCost, onClose }: { line: Line; canCost: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.takeoff.updateLine);
  const [qty, setQty] = useState(line.qtyOverride === null ? "" : String(line.qtyOverride));
  const [supplier, setSupplier] = useState(line.supplier);
  const [lead, setLead] = useState(line.leadTimeDays === null ? "" : String(line.leadTimeDays));
  const [stock, setStock] = useState(line.inStock === null ? "" : String(line.inStock));
  const [cost, setCost] = useState(line.unitCostCents === null ? "" : (line.unitCostCents / 100).toFixed(2));
  const [notes, setNotes] = useState(line.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const costCents = cost.trim() ? centsFromText(cost) : null;

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    if (costCents === null && cost.trim()) { setError("Enter the cost as dollars and cents."); return; }
    setBusy(true);
    setError("");
    try {
      await save({ lineId: line.id as Id<"takeoffLines">, qtyOverride: qty.trim() ? Number(qty) : null, supplier, leadTimeDays: lead.trim() ? Number(lead) : null, inStock: stock.trim() ? Number(stock) : null, unitCostCents: costCents, notes });
      toast("Line saved.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={line.name} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate className="cat-fields">
          <p className="muted">Worked out: {line.calcQty === null ? "not yet" : `${line.calcQty} ${line.unit}`}. Type your own quantity to use that instead; clear it to use the worked-out one.</p>
          <div className="field"><label htmlFor="tl-qty">Quantity to order ({line.unit})</label><input id="tl-qty" inputMode="decimal" placeholder={line.calcQty === null ? "" : String(line.calcQty)} value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div className="field"><label htmlFor="tl-supplier">Supplier</label><input id="tl-supplier" maxLength={100} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
          <div className="cat-money two">
            <div className="field"><label htmlFor="tl-lead">Lead time (days)</label><input id="tl-lead" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="field"><label htmlFor="tl-stock">In stock ({line.unit})</label><input id="tl-stock" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          </div>
          {canCost && <div className="field"><label htmlFor="tl-cost">Cost per {line.unit} ($)</label><input id="tl-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>}
          <div className="field"><label htmlFor="tl-notes">Notes</label><textarea id="tl-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

function Summary({ t, title }: { t: Takeoff; title: string }) {
  const s = t.summary;
  if (t.lines.length === 0) return null;

  function download() {
    const rows: (string | number)[][] = [["Material requirements", title], [], ["Supplier", "Material", "Unit", "Needed", "In stock", "To order", ...(t.canSeeCosts ? ["Unit cost", "Cost"] : []), "Lead time (days)"]];
    for (const g of s.suppliers) for (const l of g.lines) rows.push([g.supplier, l.name, l.unit, l.qty, l.inStock ?? "", l.toOrder, ...(t.canSeeCosts ? [l.unitCostCents === null ? "" : (l.unitCostCents / 100).toFixed(2), l.costCents === null ? "" : (l.costCents / 100).toFixed(2)] : []), l.leadTimeDays ?? ""]);
    if (t.canSeeCosts) rows.push([], ["Total", "", "", "", "", "", "", (s.totalCents / 100).toFixed(2)]);
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "material-requirements.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Material requirements</h2>
        <span className="job-rowbtns tk-noprint">
          <button type="button" className="btn" onClick={download}>Download CSV</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
        </span>
      </div>
      <p className="muted">
        {s.longestLeadTimeDays !== null ? `The longest wait for what has to be ordered is ${s.longestLeadTimeDays} days. ` : "Nothing has to be ordered, or no lead times are recorded. "}
        {t.canSeeCosts && (s.anyUnpriced ? "Some materials have no cost, so the total is not complete." : "")}
      </p>
      <div className="tk-sum">
        {s.suppliers.map((g) => (
          <div key={g.supplier}>
            <h3>{g.supplier}{g.leadTimeDays !== null && <span className="muted"> · {g.leadTimeDays} d lead time</span>}</h3>
            <div className="op-scroll">
            <table className="table op-table">
              <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} />{t.canSeeCosts && <col style={{ width: 110 }} />}</colgroup>
              <thead><tr><th>Material</th><th className="num">Needed</th><th className="num">In stock</th><th className="num">To order</th>{t.canSeeCosts && <th className="num">Cost</th>}</tr></thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.name}>
                    <td>{l.name} <span className="muted">({l.unit})</span></td>
                    <td className="num">{l.qty}</td>
                    <td className="num">{l.inStock ?? "—"}</td>
                    <td className="num"><b className={l.toOrder > 0 ? "tk-short" : undefined}>{l.toOrder}</b></td>
                    {t.canSeeCosts && <td className="num">{l.costCents === null ? "—" : moneyCents(l.costCents)}</td>}
                  </tr>
                ))}
                {t.canSeeCosts && <tr className="op-sum"><td colSpan={4}>{g.supplier}</td><td className="num">{moneyCents(g.costCents)}</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        ))}
        {t.canSeeCosts && <p><b>Total to order: {moneyCents(s.totalCents)}</b></p>}
      </div>
    </section>
  );
}
