"use client";

/* The project's Takeoff tab (PRD 4.2, plan 2026-11-19-takeoff): the measurements, the materials with the quantity each formula works out (the person
   can type their own), supplier, lead time and stock for each, and the material requirements summary, which can be printed or downloaded. The
   backend (convex/crm/takeoff.ts) does all the arithmetic with the same evaluator the Materials page tries formulas with. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { formulaInputs } from "@/convex/crm/lib/formula";
import { READINESS_LABEL } from "@/convex/crm/lib/purchaseOrders";
import { moneyCents, quoteMonthDay } from "@/lib/format";
import { failure } from "@/lib/pipeline";
import { clock } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { PurchaseOrders } from "./purchase-orders";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Takeoff = NonNullable<FunctionReturnType<typeof api.crm.takeoff.get>>;
type Line = Takeoff["lines"][number];
type PurchaseData = NonNullable<FunctionReturnType<typeof api.crm.purchaseOrders.list>>;

const csv = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function TakeoffTab({ id, businessId, title }: { id: Id<"opportunities">; businessId: Id<"businesses">; title: string }) {
  const staff = useStaff();
  const t = useQuery(api.crm.takeoff.get, { id });
  const options = useQuery(api.crm.materials.options, { businessId });
  const kits = useQuery(api.crm.materialKits.list, { businessId });
  const po = useQuery(api.crm.purchaseOrders.list, { id });
  const canEdit = staff.can("pipelinePreplanning", "edit");
  if (t === undefined) return <div className="card op-card"><div className="sk" style={{ height: 160 }} /></div>;
  if (t === null) return <div className="card op-card"><p className="muted">A takeoff starts once the project is Closed Won.</p></div>;
  return (
    <div className="op-body one tk">
      <Measurements key={`${t.updatedAt}`} id={id} t={t} canEdit={canEdit} />
      <Summary t={t} title={title} po={po} />
      <Materials id={id} t={t} options={options ?? []} kits={kits ?? []} canEdit={canEdit} po={po} />
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
    <section className="card op-card op-wide">
      <div className="op-sechead">
        <h2>Measurements</h2>
        {t.suggested && canEdit && (
          <button type="button" className="btn" onClick={() => setVals((v) => ({ ...v, area: String(t.suggested!.area), perimeter: String(t.suggested!.perimeter) }))} data-tip="The visit's work areas added up">
            <Icon name="import" size={16} /> Use the visit&apos;s measurements
          </button>
        )}
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {(() => {
          const field = (i: (typeof t.inputList)[number]) => (
            <div className={`field${bad(i.key) ? " bad" : ""}`} key={i.key}>
              <label htmlFor={`tk-${i.key}`}>{i.label} ({i.unit})</label>
              <input id={`tk-${i.key}`} inputMode="decimal" disabled={!canEdit} aria-invalid={bad(i.key)} value={vals[i.key]} onChange={(e) => setVals((v) => ({ ...v, [i.key]: e.target.value.replace(/[^\d.]/g, "") }))} />
              <span className="err">Enter a number.</span>
            </div>
          );
          const read = new Set(t.lines.flatMap((l) => formulaInputs(l.formula)));
          const groups = [...new Set(t.inputList.filter((i) => i.group !== "").map((i) => i.group))];
          return (
            <>
              <div className="tk-inputs">{t.inputList.filter((i) => i.group === "").map(field)}</div>
              {groups.map((g) => {
                const members = t.inputList.filter((i) => i.group === g);
                const open = members.some((i) => (t.inputs[i.key] ?? 0) > 0 || read.has(i.key));
                return (
                  <details className="tk-group" key={`${g}-${open}`} open={open}>
                    <summary>{g} measurements</summary>
                    <div className="tk-inputs">{members.map(field)}</div>
                  </details>
                );
              })}
            </>
          );
        })()}
        <p className="muted">{t.updatedAt ? `Saved ${quoteMonthDay(t.updatedAt)} by ${t.updatedByName}.` : "Not saved yet."} Every formula reads these.</p>
        {canEdit && <div className="cat-actions"><button type="submit" className="btn primary" disabled={busy || !dirty}>{busy ? "Saving…" : "Save measurements"}</button></div>}
      </form>
    </section>
  );
}

function Materials({ id, t, options, kits, canEdit, po }: { id: Id<"opportunities">; t: Takeoff; options: { id: Id<"materials">; name: string; unit: string; category: string }[]; kits: { id: Id<"materialKits">; name: string; group: string; uses: string[]; items: { id: Id<"materials"> }[] }[]; canEdit: boolean; po: PurchaseData | null | undefined }) {
  const { toast } = useUI();
  const add = useMutation(api.crm.takeoff.addLine);
  const refresh = useMutation(api.crm.takeoff.refreshLine);
  const remove = useMutation(api.crm.takeoff.removeLine);
  const addKit = useMutation(api.crm.takeoff.addKit);
  const [pick, setPick] = useState("");
  const [kitPick, setKitPick] = useState("");
  const [editing, setEditing] = useState<Line | null>(null);
  // Which sections are folded away. Kept per project in this browser; with no saved choice, a long takeoff starts with every section but the first folded.
  const storeKey = `tk-closed-${id}`;
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(storeKey);
      if (saved !== null) return new Set(JSON.parse(saved) as string[]);
    } catch { /* private window or blocked storage: start from the default */ }
    const groups = [...new Set(t.lines.map((l) => l.category))];
    return t.lines.length > 15 ? new Set(groups.slice(1)) : new Set();
  });
  useEffect(() => {
    try { window.localStorage.setItem(storeKey, JSON.stringify([...closed])); } catch { /* not saved, nothing breaks */ }
  }, [closed, storeKey]);
  const free = options.filter((o) => !t.lines.some((l) => l.materialId === o.id));
  // The table is split under headings, as the kits list is: each material's heading, in the order the headings first appear, with the lines inside one keeping their order.
  // One table for what to order, what is short, what it costs and whether it is on its way: the three lists this tab used to have, joined.
  const [groupBy, setGroupBy] = useState<"job" | "supplier">("job");
  const groupOf = (l: Line) => (groupBy === "job" ? l.category : l.supplier.trim() || "No supplier yet");
  const headings = [...new Set(t.lines.map(groupOf))];
  const costOf = new Map(t.summary.suppliers.flatMap((g) => g.lines.map((l) => [l.name, l.costCents] as const)));
  const statusOf = new Map((po?.readiness.lines ?? []).map((l) => [l.name, l.state] as const));
  const sumCost = (rows: Line[]) => rows.reduce((n, l) => n + (costOf.get(l.name) ?? 0), 0);
  const toOrder = new Map(t.summary.suppliers.flatMap((s) => s.lines.map((l) => [l.name, l.toOrder] as const)));
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));

  // What the picked kit needs measured, in words, and which of those are still empty (a kit worked out from an empty measurement gives zeros).
  const label = (key: string) => {
    const i = t.inputList.find((x) => x.key === key);
    return i ? `${i.label} (${i.unit})` : key;
  };
  const short = (key: string) => t.inputList.find((x) => x.key === key)?.label ?? key;
  const kit = kits.find((k) => k.id === kitPick);
  const kitMissing = kit ? kit.uses.filter((k) => !(t.inputs[k] > 0)) : [];
  // A kit can be added once at least one of its measurements is filled in; the others count as 0 (a drip system may have no soaker hose).
  const kitBlocked = !!kit && kitMissing.length === kit.uses.length && kit.uses.length > 0;
  // Lines already on the takeoff that read a measurement nobody has entered: their quantities are zero for that reason.
  const allZero = t.lines.length > 0 && t.lines.every((l) => l.qty === 0);
  const emptyInputs = allZero ? [...new Set(t.lines.flatMap((l) => formulaInputs(l.formula)))].filter((k) => t.inputList.some((i) => i.key === k) && !(t.inputs[k] > 0)) : [];

  return (
    <section className="card op-card op-wide">
      <div className="op-sechead">
        <h2>Materials</h2>
      </div>
      {canEdit && (
        <div className="tk-add">
          <div className="field">
            <label htmlFor="tk-kit">What kind of job is this?</label>
            <div className="cat-actions" style={{ marginTop: 0 }}>
              <select id="tk-kit" aria-label="Kit to add" value={kitPick} onChange={(e) => setKitPick(e.target.value)}>
                <option value="">{kits.length === 0 ? "No kits yet" : "Choose a kit…"}</option>
                {[...new Set(kits.map((k) => k.group))].map((g) => (
                  <optgroup key={g} label={g || "Other"}>
                    {kits.filter((k) => k.group === g).map((k) => <option key={k.id} value={k.id}>{k.name}{k.uses.length ? ` (${k.uses.map(short).join(", ")})` : ""}</option>)}
                  </optgroup>
                ))}
              </select>
              <button
                type="button" className="btn primary" disabled={!kitPick || kitBlocked}
                onClick={() => void addKit({ id, kitId: kitPick as Id<"materialKits"> }).then((r) => {
                  setKitPick("");
                  toast(r.added === 0 ? "Everything in that kit is already on this takeoff." : `Added ${r.added} material${r.added === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already here` : ""}${r.missing ? `, ${r.missing} no longer in the list` : ""}.`);
                }).catch((e) => fail(e, "The kit could not be added."))}
              >
                Add kit
              </button>
            </div>
            <small className="muted">
              {kit
                ? kitBlocked
                  ? `This kit works from ${kit.uses.map(label).join(", ")}. Enter at least one of them in Measurements above and save, then add it.`
                  : kitMissing.length > 0
                    ? `This kit works from ${kit.uses.map(label).join(", ")}. Not filled in, so counted as 0: ${kitMissing.map(label).join(", ")}. ${kit.items.length} materials.`
                    : `This kit works from ${kit.uses.map(label).join(", ")}, which are filled in. ${kit.items.length} materials.`
                : "A kit adds every material that kind of job needs, each worked out from the measurements above."}
            </small>
          </div>
          <details className="tk-single">
            <summary>Or add a single material</summary>
            <div className="cat-actions" style={{ marginTop: 8 }}>
              <select aria-label="Material to add" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{options.length === 0 ? "No materials yet" : free.length === 0 ? "All materials are on this takeoff" : "Choose a material…"}</option>
                {[...new Set(free.map((o) => o.category))].sort().map((g) => (
                  <optgroup key={g} label={g || "Other"}>
                    {free.filter((o) => o.category === g).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" className="btn" disabled={!pick} onClick={() => void add({ id, materialId: pick as Id<"materials"> }).then(() => setPick("")).catch((e) => fail(e, "The material could not be added."))}>Add</button>
            </div>
          </details>
        </div>
      )}
      {emptyInputs.length > 0 && (
        <p className="au-warn" role="status">Every quantity is 0 because {emptyInputs.map(label).join(" and ")} {emptyInputs.length === 1 ? "is" : "are"} empty. Enter {emptyInputs.length === 1 ? "it" : "them"} in Measurements above and save.</p>
      )}
      {t.lines.length === 0 ? (
        <p className="muted">{options.length === 0 ? "There are no materials yet. Add them, with their formulas, in Settings > Materials." : "Add the materials this project needs. Each works out its quantity from the measurements above."}</p>
      ) : (
        <div className="op-scroll">
          <div className="tk-groupbar">
            <span className="muted">{t.lines.length} material{t.lines.length === 1 ? "" : "s"} in {headings.length} section{headings.length === 1 ? "" : "s"}</span>
            <span className="tk-noprint">
              <span className="tk-seg" role="group" aria-label="Group the materials by">
                <button type="button" aria-pressed={groupBy === "job"} className={groupBy === "job" ? "on" : undefined} onClick={() => setGroupBy("job")}>Kind of job</button>
                <button type="button" aria-pressed={groupBy === "supplier"} className={groupBy === "supplier" ? "on" : undefined} onClick={() => setGroupBy("supplier")}>Supplier</button>
              </span>
              {headings.length > 1 && (
                <>
                  <button type="button" className="btn link" onClick={() => setClosed(new Set(headings))}>Collapse all</button>
                  <button type="button" className="btn link" onClick={() => setClosed(new Set())}>Expand all</button>
                </>
              )}
            </span>
          </div>
          <table className="table op-table">
            <colgroup><col /><col style={{ width: 100 }} /><col style={{ width: 90 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} />{t.canSeeCosts && <col style={{ width: 100 }} />}<col style={{ width: 120 }} /><col style={{ width: 130 }} /></colgroup>
            <thead><tr><th>Material</th><th>Unit</th><th className="num">Worked out</th><th className="num">Order</th><th className="num">In stock</th><th className="num">To order</th>{t.canSeeCosts && <th className="num">Cost</th>}<th>Status</th><th /></tr></thead>
          </table>
          {headings.map((h) => {
            const rows = t.lines.filter((l) => groupOf(l) === h);
            const open = !closed.has(h);
            return (
              <section className="tk-block" key={h}>
                <button type="button" className="tk-grouphead" aria-expanded={open} onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(h)) n.delete(h); else n.add(h); return n; })}>
                  <span className={`tk-chev${open ? " open" : ""}`}><Icon name="chevright" size={16} /></span>
                  <b>{h || "Other"}</b>
                  <span className="muted">{rows.length} material{rows.length === 1 ? "" : "s"}{groupBy === "supplier" && rows.some((l) => l.leadTimeDays !== null) ? ` · ${Math.max(...rows.map((l) => l.leadTimeDays ?? 0))} d lead time` : ""}{t.canSeeCosts && sumCost(rows) > 0 ? ` · ${moneyCents(sumCost(rows))}` : ""}</span>
                </button>
                <div className="tk-collapse" data-open={open}>
                  <div className="tk-collapse-inner">
                    <table className="table op-table">
                      <colgroup><col /><col style={{ width: 100 }} /><col style={{ width: 90 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} />{t.canSeeCosts && <col style={{ width: 100 }} />}<col style={{ width: 120 }} /><col style={{ width: 130 }} /></colgroup>
                      <tbody>
                        {rows.map((l) => (
                          <tr key={l.id}>
                  <td><b>{l.name}</b>{l.sku && <span className="muted"> {l.sku}</span>}<div className="muted op-text">{l.supplier || "No supplier yet"}{l.leadTimeDays !== null ? ` · ${l.leadTimeDays} d lead time` : ""}{l.inStock !== null ? ` · ${l.inStock} in stock` : ""}</div>{l.calcError && <div className="cat-bad">{l.calcError}</div>}{l.notes && <div className="muted op-text">{l.notes}</div>}</td>
                  <td>{l.unit}</td>
                  <td className="num">{l.calcQty === null ? "—" : l.calcQty}</td>
                  <td className="num">{l.qtyOverride !== null ? <b>{l.qtyOverride}</b> : l.qty}{l.qtyOverride !== null && <div className="muted">typed</div>}</td>
                          <td className="num">{l.inStock ?? "—"}</td>
                          <td className="num"><span className={(toOrder.get(l.name) ?? 0) > 0 ? "tk-short" : "muted"}>{toOrder.get(l.name) ?? 0}</span></td>
                          {t.canSeeCosts && <td className="num">{costOf.get(l.name) == null ? "—" : moneyCents(costOf.get(l.name)!)}</td>}
                          <td>{statusOf.get(l.name) ? <span className={`po-chip ${statusOf.get(l.name)}`}>{READINESS_LABEL[statusOf.get(l.name)!]}</span> : <span className="muted">—</span>}</td>
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
                </div>
              </section>
            );
          })}
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

function Summary({ t, title, po }: { t: Takeoff; title: string; po: PurchaseData | null | undefined }) {
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

  const states = Object.entries(READINESS_LABEL) as [keyof typeof READINESS_LABEL, string][];
  const counts = new Map<string, number>();
  for (const l of po?.readiness.lines ?? []) counts.set(l.state, (counts.get(l.state) ?? 0) + 1);
  const short = t.lines.filter((l) => (s.suppliers.flatMap((g) => g.lines).find((x) => x.name === l.name)?.toOrder ?? 0) > 0).length;

  return (
    <section className="card op-card op-wide">
      <div className="op-sechead">
        <h2>Summary</h2>
        <span className="job-rowbtns tk-noprint">
          <button type="button" className="btn" onClick={download}>Download CSV</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
        </span>
      </div>
      <dl className="tk-stats">
        <div><dt>Materials</dt><dd>{t.lines.length}</dd></div>
        <div><dt>Short of stock</dt><dd>{short}</dd></div>
        <div><dt>Suppliers</dt><dd>{s.suppliers.length}</dd></div>
        <div><dt>Longest wait</dt><dd>{s.longestLeadTimeDays !== null ? `${s.longestLeadTimeDays} d` : "—"}</dd></div>
        {t.canSeeCosts && <div><dt>To order</dt><dd>{moneyCents(s.totalCents)}</dd></div>}
      </dl>
      {t.canSeeCosts && s.anyUnpriced && <p className="muted">Some materials have no cost yet, so the total is not complete.</p>}
      {po && po.readiness.lines.length > 0 && (
        <p className={`po-ready${po.readiness.ready ? " ok" : ""}`}>
          {po.readiness.ready ? "Materials are ready: everything is in stock or delivered." : "Materials not ready."}
          {" "}
          {states.filter(([k]) => counts.get(k)).map(([k, label]) => <span key={k} className={`po-chip ${k}`}>{counts.get(k)} {label.toLowerCase()}</span>)}
        </p>
      )}
    </section>
  );
}
