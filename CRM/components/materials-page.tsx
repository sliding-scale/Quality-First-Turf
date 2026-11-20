"use client";

/* Settings → Materials (PRD 4.2, plan 2026-11-19-takeoff): the business's materials with the formula that works out how much a project needs. It is
   the catalogue and the formulas the client supplies, kept as editable data (CRM rule 8). The edit dialog tries the formula on sample measurements
   as you type, with the same evaluator the takeoff uses. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { formulaInputs, formulaProblem } from "@/convex/crm/lib/formula";
import { emptyInputs, lineQuantity, ROUNDINGS, TAKEOFF_INPUTS, type Rounding } from "@/convex/crm/lib/takeoff";
import { useKept, useWorkspace } from "@/lib/clients";
import { moneyCents } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { MaterialKits } from "./material-kits";
import { PipelineModal } from "./pipeline-dialogs";
import { CatalogueSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Row = { id: Id<"materials">; name: string; sku: string; category: string; unit: string; costCents: number | null; supplier: string; leadTimeDays: number | null; inStock: number | null; sizeDetails: string; formula: string; wastagePercent: number; rounding: Rounding };

const ROUNDING_LABEL: Record<Rounding, string> = { up: "Up to a whole unit", nearest: "To the nearest unit", none: "Keep decimals" };
const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export function MaterialsPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const canView = staff.can("pipelinePreplanning");
  const canEdit = staff.can("pipelinePreplanning", "edit");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const list = useKept(useQuery(api.crm.materials.list, businessId && canView ? { businessId, search, page } : "skip"));

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!canView) {
    return (
      <div className="empty-state">
        <h2>You do not have access to this</h2>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !businessId || list === undefined) return <CatalogueSkeleton />;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const current = Math.min(page, pages);
  const costsShown = list.rows.some((r) => r.costCents !== null);

  return (
    <div className="fade-in cat">
      <div className="page-head">
        <h1>Materials</h1>
        {canEdit && <button type="button" className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} /> Add Material</button>}
      </div>
      <p className="au-lead">What a project&apos;s takeoff orders: each material with its unit, supplier, lead time, stock and the formula that works out how much a project needs from its measurements. Nothing here is fixed; change a formula and the next takeoff uses it.</p>
      <div className="toolbar">
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search" aria-label="Search materials" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table cat-table">
          <colgroup><col style={{ width: "28%" }} /><col style={{ width: 90 }} /><col style={{ width: "18%" }} /><col /><col style={{ width: 100 }} />{costsShown && <col style={{ width: 110 }} />}</colgroup>
          <thead><tr><th>Name</th><th>Unit</th><th>Supplier</th><th>Formula</th><th className="num">Lead time</th>{costsShown && <th className="num">Cost</th>}</tr></thead>
          <tbody>
            {list.rows.length ? list.rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => setEditing(r)}>
                <td><b>{r.name}</b>{r.sku && <div className="muted">{r.sku}</div>}</td>
                <td>{r.unit}</td>
                <td>{r.supplier || <span className="muted">—</span>}</td>
                <td><code>{r.formula}</code>{r.wastagePercent > 0 && <span className="muted"> + {r.wastagePercent}%</span>}</td>
                <td className="num">{r.leadTimeDays === null ? "—" : `${r.leadTimeDays} d`}</td>
                {costsShown && <td className="num">{r.costCents === null ? "—" : moneyCents(r.costCents)}</td>}
              </tr>
            )) : (
              <tr><td colSpan={costsShown ? 6 : 5}><div className="empty" style={{ margin: "20px 0" }}>{list.total === 0 && !search ? "No materials yet. Add the first one, with the formula that works out how much a project needs." : "Nothing matches that search."}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <div className="left"><span>{list.total} material{list.total === 1 ? "" : "s"}</span></div>
        <div className="right pages">
          <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => setPage(current - 1)}><Icon name="chevleft" size={20} /></button>
          <span className="gap">Page {current} of {pages}</span>
          <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => setPage(current + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>
      <MaterialKits businessId={businessId} />
      {editing && <MaterialDialog businessId={businessId} row={editing === "new" ? null : editing} canEdit={canEdit} canDelete={staff.can("pipelinePreplanning", "full")} canCost={staff.can("prices")} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MaterialDialog({ businessId, row, canEdit, canDelete, canCost, onClose }: { businessId: Id<"businesses">; row: Row | null; canEdit: boolean; canDelete: boolean; canCost: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.materials.save);
  const remove = useMutation(api.crm.materials.remove);
  const [name, setName] = useState(row?.name ?? "");
  const [sku, setSku] = useState(row?.sku ?? "");
  const [category, setCategory] = useState(row?.category ?? "");
  const [unit, setUnit] = useState(row?.unit ?? "");
  const [cost, setCost] = useState(dollars(row?.costCents ?? null));
  const [supplier, setSupplier] = useState(row?.supplier ?? "");
  const [lead, setLead] = useState(row?.leadTimeDays == null ? "" : String(row.leadTimeDays));
  const [stock, setStock] = useState(row?.inStock == null ? "" : String(row.inStock));
  const [size, setSize] = useState(row?.sizeDetails ?? "");
  const [formula, setFormula] = useState(row?.formula ?? "");
  const [waste, setWaste] = useState(String(row?.wastagePercent ?? 0));
  const [rounding, setRounding] = useState<Rounding>(row?.rounding ?? "up");
  const [sample, setSample] = useState<Record<string, string>>({ ...Object.fromEntries(Object.keys(emptyInputs()).map((k) => [k, "0"])), area: "1000", perimeter: "130", depth: "3" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const syntax = formula.trim() ? formulaProblem(formula) : "Give the formula.";
  const wasteNum = Number(waste);
  const costCents = cost.trim() ? centsFromText(cost) : undefined;
  const result = syntax ? null : lineQuantity({ formula, wastagePercent: Number.isFinite(wasteNum) ? wasteNum : 0, rounding, inputs: Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, Number(v) || 0])) });
  const used = formulaInputs(formula);
  const badName = tried && !name.trim();
  const badUnit = tried && !unit.trim();
  const badFormula = tried && !!syntax;
  const badWaste = tried && (!Number.isFinite(wasteNum) || wasteNum < 0 || wasteNum > 100);
  const badCost = tried && costCents === null;

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || !unit.trim() || syntax || !Number.isFinite(wasteNum) || wasteNum < 0 || wasteNum > 100 || costCents === null) {
      document.getElementById(!name.trim() ? "mt-name" : !unit.trim() ? "mt-unit" : syntax ? "mt-formula" : "mt-waste")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({
        ...(row ? { id: row.id } : {}), businessId, name, sku, category, unit, supplier, sizeDetails: size, formula, wastagePercent: wasteNum, rounding, now: clock(),
        ...(costCents !== undefined && canCost ? { costCents } : {}), ...(lead.trim() ? { leadTimeDays: Number(lead) } : {}), ...(stock.trim() ? { inStock: Number(stock) } : {}),
      });
      toast(row ? "Material saved." : "Material added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={row ? `Edit ${row.name}` : "New material"} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <fieldset disabled={!canEdit} className="cat-fields">
            <div className={`field${badName ? " bad" : ""}`}><label htmlFor="mt-name">Name</label><input id="mt-name" aria-invalid={badName} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoFocus /><span className="err">Give the material a name.</span></div>
            <div className="cat-money two">
              <div className="field"><label htmlFor="mt-sku">SKU / code</label><input id="mt-sku" maxLength={60} value={sku} onChange={(e) => setSku(e.target.value)} /></div>
              <div className="field"><label htmlFor="mt-cat">Category</label><input id="mt-cat" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} /></div>
            </div>
            <div className="cat-money two">
              <div className={`field${badUnit ? " bad" : ""}`}><label htmlFor="mt-unit">Ordered in (unit)</label><input id="mt-unit" aria-invalid={badUnit} maxLength={30} placeholder="roll, bag, ton, cubic yard…" value={unit} onChange={(e) => setUnit(e.target.value)} /><span className="err">Say what it is ordered in.</span></div>
              {canCost && <div className={`field${badCost ? " bad" : ""}`}><label htmlFor="mt-cost">Cost per unit ($)</label><input id="mt-cost" inputMode="decimal" aria-invalid={badCost} value={cost} onChange={(e) => setCost(e.target.value)} /><span className="err">Enter dollars and cents.</span></div>}
            </div>
            <div className="field"><label htmlFor="mt-size">Size details</label><input id="mt-size" maxLength={300} placeholder="15 ft wide, 100 ft long" value={size} onChange={(e) => setSize(e.target.value)} /></div>
            <div className="field"><label htmlFor="mt-supplier">Supplier</label><input id="mt-supplier" maxLength={100} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
            <div className="cat-money two">
              <div className="field"><label htmlFor="mt-lead">Lead time (days)</label><input id="mt-lead" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ""))} /></div>
              <div className="field"><label htmlFor="mt-stock">In stock (units)</label><input id="mt-stock" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d.]/g, ""))} /></div>
            </div>
            <div className={`field${badFormula ? " bad" : ""}`}>
              <label htmlFor="mt-formula">Formula: how many units a project needs</label>
              <input id="mt-formula" aria-invalid={badFormula} placeholder="ceil(area / 1500)" value={formula} onChange={(e) => setFormula(e.target.value)} />
              <span className="err">{syntax}</span>
              <small className="muted">Measurements: {TAKEOFF_INPUTS.map((i) => i.key).join(", ")}. Functions: ceil, floor, round, abs, sqrt, min, max.</small>
            </div>
            <div className="cat-money two">
              <div className={`field${badWaste ? " bad" : ""}`}><label htmlFor="mt-waste">Wastage (%)</label><input id="mt-waste" inputMode="decimal" aria-invalid={badWaste} value={waste} onChange={(e) => setWaste(e.target.value.replace(/[^\d.]/g, ""))} /><span className="err">Between 0 and 100.</span></div>
              <div className="field"><label htmlFor="mt-round">Rounding</label><select id="mt-round" value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)}>{ROUNDINGS.map((r) => <option key={r} value={r}>{ROUNDING_LABEL[r]}</option>)}</select></div>
            </div>
            <div className="mt-try" aria-live="polite">
              <b>Try it</b>
              <div className="cat-money two">
                {(used.length ? used : ["area"]).filter((k) => k in sample).map((k) => (
                  <div className="field" key={k}><label htmlFor={`mt-s-${k}`}>{TAKEOFF_INPUTS.find((i) => i.key === k)?.label ?? k}</label><input id={`mt-s-${k}`} inputMode="decimal" value={sample[k]} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value.replace(/[^\d.]/g, "") }))} /></div>
                ))}
              </div>
              <p className="mt-result">{syntax ? "" : result === null ? "" : result.ok ? <>Order <b>{result.qty}</b> {unit || "units"} <span className="muted">(worked out {Math.round(result.base * 100) / 100}, with wastage and rounding)</span></> : <span className="cat-bad">{result.error}</span>}</p>
            </div>
          </fieldset>
          {error && <p className="modal-error" role="alert">{error}</p>}
          {confirming ? (
            <div className="modal-foot">
              <span className="muted" style={{ marginRight: "auto" }}>Delete this material? Takeoffs keep their copy.</span>
              <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>No</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => { setBusy(true); remove({ id: row!.id }).then(() => { toast("Material deleted."); close(); }).catch((err) => { toast(failure(err, "That could not be deleted.")); setBusy(false); }); }}>Yes, delete</button>
            </div>
          ) : (
            <div className="modal-foot">
              {row && canDelete && <button type="button" className="btn danger" style={{ marginRight: "auto" }} disabled={busy} onClick={() => setConfirming(true)}>Delete</button>}
              <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
              {canEdit && <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : row ? "Update" : "Add"}</button>}
            </div>
          )}
        </form>
      )}
    </PipelineModal>
  );
}
