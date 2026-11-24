"use client";

/* Settings → Products & Services (design 2026-11-19-jobs): Jobber's page. The business's own list of what it sells, with its cost, markup and
   unit price, which the quote builder's price list reads. Search, Add Item, an edit dialog (Update, Cancel, Delete), Import CSV and Export CSV.
   An import reads the file here, checks it with a dry run, then sends it in batches, and reports every row it could not use (CRM rule 6). */

import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CSV_COLUMNS, DESCRIPTION_MAX, NAME_MAX, centsFromText, markupFromPrice, parseCsv, priceFromMarkup, rowsFromCsv, toCsv, type ImportProblem, type ImportRow } from "@/convex/crm/lib/catalogue";
import { useKept, useWorkspace } from "@/lib/clients";
import { failure } from "@/lib/pipeline";
import { uploadFile } from "@/lib/quotes";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { CatalogueSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const BATCH = 100;

/** Saves a text file the person asked for (an export, a sample, the rows that failed). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CataloguePage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const canView = staff.can("templates");
  const canEdit = staff.can("templates", "edit");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState<{ key: "name" | "type"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [editing, setEditing] = useState<Id<"catalogueItems"> | "new" | null>(null);
  const list = useKept(useQuery(api.crm.catalogue.list, businessId && canView ? { businessId, search, page, size, sortKey: sort.key, dir: sort.dir } : "skip"));
  const settings = useQuery(api.crm.catalogue.settings, businessId && canView ? { businessId } : "skip");

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!canView) {
    return (
      <div className="empty-state">
        <h2>You do not have access to this</h2>
        <p>Products and services are managed by Admins and the Office team.</p>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !businessId || list === undefined) return <CatalogueSkeleton />;

  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const current = Math.min(page, pages);
  const from = list.total ? (current - 1) * list.pageSize + 1 : 0;
  const to = Math.min(current * list.pageSize, list.total);
  const toggleSort = (key: "name" | "type") => { setSort((c) => ({ key, dir: c.key === key && c.dir === "asc" ? "desc" : "asc" })); setPage(1); };
  const sortHead = (key: "name" | "type", label: string) => (
    <button type="button" className="cat-sort" onClick={() => toggleSort(key)} style={{ opacity: sort.key === key ? 1 : 0.85 }}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  return (
    <div className="fade-in cat">
      <div className="page-head">
        <h1>Products &amp; services</h1>
        {canEdit && <button type="button" className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} /> Add Item</button>}
      </div>
      <p className="au-lead">Add and update your products &amp; services to stay organized when creating quotes, quote templates, jobs, and invoices. The quote builder&apos;s price list reads this list.</p>

      <div className="toolbar">
        <div className="searchbox">
          <span><Icon name="search" size={20} /></span>
          <input type="search" placeholder="Search" aria-label="Search products and services" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
        </div>
      </div>

      <div className="table-wrap cat-scroll">
        <table className="table cat-table">
          <colgroup><col style={{ width: "42%" }} /><col /><col style={{ width: 120 }} /></colgroup>
          <thead>
            <tr>
              <th aria-sort={sort.key === "name" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>{sortHead("name", "Name")}</th>
              <th>Description</th>
              <th aria-sort={sort.key === "type" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>{sortHead("type", "Type")}</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length ? list.rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => setEditing(r.id)}>
                <td><b>{r.name}</b>{!r.available && <span className="pill draft cat-off"><span className="dot" />Hidden</span>}</td>
                <td className="muted"><span className="cat-desc">{r.description}</span></td>
                <td>{r.kind === "product" ? "Product" : "Service"}</td>
              </tr>
            )) : (
              <tr><td colSpan={3}><div className="empty" style={{ margin: "20px 0" }}>{list.total === 0 && !search ? "No products or services yet. Add an item, or import a file below." : "Nothing matches that search."}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="left"><span>Showing {from}–{to} of {list.total} items</span></div>
        <div className="right pages">
          <select aria-label="Items per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="gap">per page</span>
          <button type="button" className="pg" disabled={current === 1} aria-label="Previous page" onClick={() => setPage(current - 1)}><Icon name="chevleft" size={20} /></button>
          <button type="button" className="pg" disabled={current === pages} aria-label="Next page" onClick={() => setPage(current + 1)}><Icon name="chevright" size={20} /></button>
        </div>
      </div>

      <CostsCard businessId={businessId} on={settings?.costsOn} canEdit={canEdit} />
      {canEdit && <ImportCard businessId={businessId} />}
      <ExportCard businessId={businessId} />

      {editing && <ItemDialog businessId={businessId} id={editing === "new" ? null : editing} newCosts={!!settings?.costsOn && staff.can("prices")} canEdit={canEdit} canDelete={staff.can("templates", "full")} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---- Add or edit one item ---- */

function ItemDialog({ businessId, id, newCosts, canEdit, canDelete, onClose }: { businessId: Id<"businesses">; id: Id<"catalogueItems"> | null; newCosts: boolean; canEdit: boolean; canDelete: boolean; onClose: () => void }) {
  const doc = useQuery(api.crm.catalogue.get, id ? { id } : "skip");
  if (id && doc === undefined) return <PipelineModal title="Edit item" onClose={onClose}>{() => <div className="sk" style={{ height: 260 }} />}</PipelineModal>;
  return <ItemForm businessId={businessId} doc={doc ?? null} newCosts={newCosts} canEdit={canEdit} canDelete={canDelete} onClose={onClose} />;
}

type Doc = NonNullable<FunctionReturnType<typeof api.crm.catalogue.get>>;

function ItemForm({ businessId, doc, newCosts, canEdit, canDelete, onClose }: { businessId: Id<"businesses">; doc: Doc | null; newCosts: boolean; canEdit: boolean; canDelete: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.catalogue.save);
  const remove = useMutation(api.crm.catalogue.remove);
  const uploadUrl = useMutation(api.crm.catalogue.uploadUrl);
  const costsShown = doc ? doc.canSeeCosts : newCosts;
  const [kind, setKind] = useState<"service" | "product">(doc?.kind ?? "service");
  const [name, setName] = useState(doc?.name ?? "");
  const [description, setDescription] = useState(doc?.description ?? "");
  const [cost, setCost] = useState(dollars(doc?.costCents));
  const [markup, setMarkup] = useState(doc?.markupPercent == null ? "" : String(doc.markupPercent));
  const [price, setPrice] = useState(doc ? dollars(doc.unitPriceCents) : "");
  const [taxExempt, setTaxExempt] = useState(doc?.taxExempt ?? false);
  const [available, setAvailable] = useState(doc?.available ?? true);
  const [duration, setDuration] = useState(doc?.durationMinutes == null ? "" : String(doc.durationMinutes));
  const [selectQty, setSelectQty] = useState(doc?.customersSelectQuantity ?? false);
  const [image, setImage] = useState<{ id: Id<"_storage"> | null; url: string | null } | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const priceCents = centsFromText(price);
  const costCents = cost.trim() ? centsFromText(cost) : undefined;
  const badName = tried && (!name.trim() || name.length > NAME_MAX);
  const badPrice = tried && priceCents === null;
  const badCost = tried && costCents === null;
  const imageUrl = image ? image.url : doc?.imageUrl ?? null;

  // Cost, markup and price move together, as in Jobber: cost or markup sets the price; the price sets the markup.
  function onCost(v: string) {
    setCost(v);
    const c = v.trim() ? centsFromText(v) : null;
    const m = Number(markup);
    if (c !== null && markup.trim() && Number.isFinite(m)) setPrice(dollars(priceFromMarkup(c, m)));
    else if (c !== null && priceCents !== null) { const mk = markupFromPrice(c, priceCents); setMarkup(mk === undefined ? "" : String(mk)); }
  }
  function onMarkup(v: string) {
    setMarkup(v);
    const m = Number(v);
    if (costCents !== undefined && costCents !== null && v.trim() && Number.isFinite(m)) setPrice(dollars(priceFromMarkup(costCents, m)));
  }
  function onPrice(v: string) {
    setPrice(v);
    const p = centsFromText(v);
    if (p !== null && costCents !== undefined && costCents !== null) { const mk = markupFromPrice(costCents, p); setMarkup(mk === undefined ? "" : String(mk)); }
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("The picture has to be an image.");
    try {
      const sid = await uploadFile(await uploadUrl({ businessId }), file);
      setImage({ id: sid, url: URL.createObjectURL(file) });
    } catch (e) {
      toast(failure(e, "The picture could not be uploaded."));
    }
  }

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || name.length > NAME_MAX || priceCents === null || costCents === null) {
      document.getElementById(!name.trim() ? "ci-name" : priceCents === null ? "ci-price" : "ci-cost")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({
        businessId, ...(doc ? { id: doc.id } : {}), kind, name, description, unitPriceCents: priceCents, taxExempt, available, customersSelectQuantity: selectQty,
        ...(costCents !== undefined && costsShown ? { costCents } : {}), ...(markup.trim() && costsShown && Number.isFinite(Number(markup)) ? { markupPercent: Number(markup) } : {}),
        ...(duration ? { durationMinutes: Number(duration) } : {}), ...(image ? { imageId: image.id } : {}),
      });
      toast(doc ? "Item updated." : "Item added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={doc ? `Edit ${doc.name}` : "New item"} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <p className="muted">Changes apply to new quotes, jobs and invoices. Ones already made keep what they have.</p>
          <fieldset disabled={!canEdit} className="cat-fields">
            <div className="field">
              <label htmlFor="ci-kind">Item type</label>
              <select id="ci-kind" value={kind} onChange={(e) => setKind(e.target.value as "service" | "product")}><option value="service">Service</option><option value="product">Product</option></select>
            </div>
            <div className={`field${badName ? " bad" : ""}`}>
              <label htmlFor="ci-name">Name</label>
              <input id="ci-name" aria-invalid={badName} maxLength={NAME_MAX + 20} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <span className="err">Give the item a name of up to {NAME_MAX} characters.</span>
            </div>
            <div className="field">
              <label htmlFor="ci-desc">Description</label>
              <textarea id="ci-desc" rows={5} maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="cat-money">
              {costsShown && (
                <>
                  <div className={`field${badCost ? " bad" : ""}`}><label htmlFor="ci-cost">Cost ($)</label><input id="ci-cost" inputMode="decimal" aria-invalid={badCost} value={cost} onChange={(e) => onCost(e.target.value)} /><span className="err">Enter dollars and cents.</span></div>
                  <div className="field"><label htmlFor="ci-markup">Markup (%)</label><input id="ci-markup" inputMode="decimal" value={markup} onChange={(e) => onMarkup(e.target.value)} /></div>
                </>
              )}
              <div className={`field${badPrice ? " bad" : ""}`}><label htmlFor="ci-price">Unit Price ($)</label><input id="ci-price" inputMode="decimal" aria-invalid={badPrice} value={price} onChange={(e) => onPrice(e.target.value)} /><span className="err">Enter dollars and cents.</span></div>
            </div>
            <div className="cat-image">
              {imageUrl ? <img src={imageUrl} alt="" /> : <span className="muted">No picture</span>}
              <div className="cat-image-actions">
                <button type="button" className="btn" onClick={() => fileInput.current?.click()}>{imageUrl ? "Change Image" : "Upload Image"}</button>
                {imageUrl && <button type="button" className="btn plain" onClick={() => setImage({ id: null, url: null })}>Remove</button>}
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>
            <label className="cat-check"><input type="checkbox" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} /> Exempt from Tax</label>
            <label className="cat-check"><input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Available on quotes, quote templates, jobs, invoices &amp; online booking</label>
            <div className="field">
              <label htmlFor="ci-duration">Service Duration</label>
              <select id="ci-duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="">Not set</option>
                {DURATIONS.map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`}</option>)}
                {duration && !DURATIONS.includes(Number(duration)) && <option value={duration}>{duration} minutes</option>}
              </select>
            </div>
            <label className="cat-check"><input type="checkbox" checked={selectQty} onChange={(e) => setSelectQty(e.target.checked)} /> Allow customers to select quantity</label>
          </fieldset>
          {error && <p className="modal-error" role="alert">{error}</p>}
          {confirming ? (
            <div className="modal-foot">
              <span className="muted" style={{ marginRight: "auto" }}>Delete this item? Quotes and invoices keep their copy.</span>
              <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => { setBusy(true); remove({ id: doc!.id }).then(() => { toast("Item deleted."); close(); }).catch((err) => { toast(failure(err, "That could not be deleted.")); setBusy(false); }); }}>Yes, delete</button>
            </div>
          ) : (
            <div className="modal-foot">
              {doc && canDelete && <button type="button" className="btn danger" style={{ marginRight: "auto" }} disabled={busy} onClick={() => setConfirming(true)}>Delete</button>}
              <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
              {canEdit && <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : doc ? "Update" : "Add"}</button>}
            </div>
          )}
        </form>
      )}
    </PipelineModal>
  );
}

/* ---- The Costs switch ---- */

function CostsCard({ businessId, on, canEdit }: { businessId: Id<"businesses">; on: boolean | undefined; canEdit: boolean }) {
  const set = useMutation(api.crm.catalogue.setCostsOn);
  const { toast } = useUI();
  return (
    <section className="card cat-card">
      <h2>Costs</h2>
      <div className="cat-switch">
        <span id="cat-costs-label"><b>Product &amp; Services costs</b><br /><span className="muted">Add costs to your products and services on quotes and jobs</span></span>
        <label className="sc-switch">
          <input type="checkbox" role="switch" aria-labelledby="cat-costs-label" checked={on ?? true} disabled={!canEdit || on === undefined} onChange={(e) => void set({ businessId, on: e.target.checked }).catch((err) => toast(failure(err, "That could not be changed.")))} />
          <span className="track" aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}

/* ---- Import a file ---- */

type Report = { created: number; updated: number; skipped: { line: number; name: string; message: string }[]; errors: { line: number; name: string; message: string }[] };

function ImportCard({ businessId }: { businessId: Id<"businesses"> }) {
  const { toast } = useUI();
  const send = useMutation(api.crm.catalogue.importRows);
  const input = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<{ file: string; header: string[]; raw: string[][]; rows: ImportRow[]; problems: ImportProblem[]; headerProblem: string | null } | null>(null);
  const [update, setUpdate] = useState(false);
  const [phase, setPhase] = useState<"idle" | "checking" | "ready" | "importing" | "done">("idle");
  const [report, setReport] = useState<Report | null>(null);

  const clean = (r: ImportRow) => {
    const { line, name, description, kind, costCents, markupPercent, unitPriceCents, taxExempt, available, durationMinutes, customersSelectQuantity } = r;
    return { line, name, description, kind, unitPriceCents, taxExempt, available, customersSelectQuantity, ...(costCents !== undefined ? { costCents } : {}), ...(markupPercent !== undefined ? { markupPercent } : {}), ...(durationMinutes !== undefined ? { durationMinutes } : {}) };
  };

  async function run(rows: ImportRow[], dryRun: boolean): Promise<Report> {
    const total: Report = { created: 0, updated: 0, skipped: [], errors: [] };
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = await send({ businessId, rows: rows.slice(i, i + BATCH).map(clean), dryRun, update });
      total.created += r.created;
      total.updated += r.updated;
      total.skipped.push(...r.skipped);
      total.errors.push(...r.errors);
    }
    return total;
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setReport(null);
    const text = await file.text();
    const parsed = rowsFromCsv(text);
    const raw = parseCsv(text);
    setRead({ file: file.name, header: raw[0] ?? [], raw, ...parsed });
    setPhase("idle");
    if (parsed.headerProblem || parsed.rows.length === 0) return;
    setPhase("checking");
    try {
      setReport(await run(parsed.rows, true));
      setPhase("ready");
    } catch (e) {
      toast(failure(e, "The file could not be checked."));
      setPhase("idle");
    }
  }

  async function doImport() {
    if (!read) return;
    setPhase("importing");
    try {
      setReport(await run(read.rows, false));
      setPhase("done");
      toast("Import finished.");
    } catch (e) {
      toast(failure(e, "The import stopped. What was already added stays; run it again to finish."));
      setPhase("ready");
    }
  }

  // The rows that could not be used, as a file with the reason added, so they can be fixed and imported again.
  function downloadProblems() {
    if (!read) return;
    const lines = [...read.problems.map((p) => ({ line: p.line, why: p.message, cells: p.raw })), ...(report?.errors ?? []).map((e) => ({ line: e.line, why: e.message, cells: read.raw[e.line - 1] ?? [] }))];
    const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    download("products-not-imported.csv", [[...read.header, "Why it was not imported"].map(esc).join(","), ...lines.map((l) => [...l.cells, l.why].map(esc).join(","))].join("\r\n") + "\r\n");
  }

  const problems = (read?.problems.length ?? 0) + (report?.errors.length ?? 0);

  return (
    <section className="card cat-card">
      <h2>Import products &amp; services</h2>
      <p className="muted">Bulk import by uploading a .csv exported from Excel, Google Sheets or Numbers. The first row names the columns: {CSV_COLUMNS.slice(0, 6).join(", ")}, and more. Name and Unit Price are needed.</p>
      <div className="cat-actions">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={phase === "checking" || phase === "importing"}>Import CSV</button>
        <button type="button" className="btn plain" onClick={() => download("products-sample.csv", toCsv([{ name: "Turf install - Olive Natural [under 300 SF]", description: "Install approx. sq. ft.", kind: "service", costCents: 380, markupPercent: 110.52632, unitPriceCents: 800, taxExempt: false, available: true, durationMinutes: 60, customersSelectQuantity: false }]))}>Download sample file</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {read && (
        <div className="cat-report" role="status">
          <b>{read.file}</b>
          {read.headerProblem ? <p className="cat-bad">{read.headerProblem}</p> : (
            <>
              <p>{read.rows.length + read.problems.length} rows read. {read.rows.length} can be used{read.problems.length ? `, ${read.problems.length} cannot` : ""}.</p>
              {phase === "checking" && <p className="muted">Checking against your list…</p>}
              {report && (
                <p>{phase === "done" ? "Imported" : "Would import"}: {report.created} new, {report.updated} updated, {report.skipped.length} already in the list{report.errors.length ? `, ${report.errors.length} refused` : ""}.</p>
              )}
              {(phase === "ready" || phase === "done") && report && report.skipped.length > 0 && phase !== "done" && (
                <label className="cat-check"><input type="checkbox" checked={update} onChange={async (e) => { setUpdate(e.target.checked); setPhase("checking"); setReport(null); try { setReport(await run(read.rows, true)); } finally { setPhase("ready"); } }} /> Update the {report.skipped.length} items already in the list with this file&apos;s details</label>
              )}
              {problems > 0 && (
                <>
                  <ul className="cat-problems">
                    {read.problems.slice(0, 8).map((p) => <li key={`p${p.line}`}>Line {p.line}{p.name ? ` (${p.name})` : ""}: {p.message}</li>)}
                    {(report?.errors ?? []).slice(0, 8).map((p) => <li key={`e${p.line}`}>Line {p.line}{p.name ? ` (${p.name})` : ""}: {p.message}</li>)}
                    {problems > 8 && <li className="muted">…and more. Download them all below.</li>}
                  </ul>
                  <button type="button" className="btn plain" onClick={downloadProblems}>Download the rows that cannot be imported</button>
                </>
              )}
              {phase === "ready" && report && report.created + report.updated > 0 && (
                <div className="cat-actions"><button type="button" className="btn primary" onClick={() => void doImport()}>Import {report.created + report.updated} items</button></div>
              )}
              {phase === "importing" && <p className="muted">Importing…</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ExportCard({ businessId }: { businessId: Id<"businesses"> }) {
  const convex = useConvex();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card cat-card">
      <h2>Export products &amp; services</h2>
      <p className="muted">Download every product and service in this list as a .csv file. It can be imported again.</p>
      <div className="cat-actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            convex.query(api.crm.catalogue.all, { businessId }).then((items) => download("products-and-services.csv", toCsv(items))).catch((e) => toast(failure(e, "The export could not be made."))).finally(() => setBusy(false));
          }}
        >
          {busy ? "Preparing…" : "Export CSV"}
        </button>
      </div>
    </section>
  );
}
