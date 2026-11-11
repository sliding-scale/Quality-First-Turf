"use client";

/* The Product / Service section of the quote builder (D-063): priced lines and text lines, with Jobber's fields (name, quantity, unit
   price, total, description, picture, "Mark as optional"), reordering, "Add from price list" and "Fill from the site visit". Amounts
   are typed as dollars and kept as text while editing, so half-typed numbers never jump around. */

import { useConvex, useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failure } from "@/lib/pipeline";
import { centsToInput, dollarsToCents, lineTotalCents, uploadFile, usePriceSearch } from "@/lib/quotes";
import { money } from "@/lib/format";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

export type DraftLine = {
  key: string;
  id?: Id<"quoteLineItems">;
  kind: "item" | "text";
  name: string;
  description: string;
  imageId?: Id<"_storage">;
  imageUrl: string | null;
  quantity: string;
  price: string;
  optional: boolean;
  selected: boolean;
  catalogueName?: string;
};

let counter = 0;
export const newLine = (kind: "item" | "text", over: Partial<DraftLine> = {}): DraftLine => ({
  key: `new-${++counter}`, kind, name: "", description: "", imageUrl: null, quantity: "1", price: "0.00", optional: false, selected: true, ...over,
});

/** A line's total in cents; NaN while a box holds something that is not a number. */
export function lineCents(l: DraftLine): number {
  if (l.kind === "text") return 0;
  const q = Number(l.quantity);
  const p = dollarsToCents(l.price);
  return Number.isFinite(q) && Number.isFinite(p) ? lineTotalCents({ quantity: q, unitPriceCents: p }) : NaN;
}

export function QuoteLines({ businessId, clientId, projectId, lines, onChange, bad, readOnly }: {
  businessId: Id<"businesses">;
  clientId?: Id<"clients">;
  projectId?: Id<"opportunities">;
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  /** Keys of lines (and "key:field") flagged red after a failed Save. */
  bad: Set<string>;
  readOnly?: boolean;
}) {
  const convex = useConvex();
  const { popover, toast } = useUI();
  const uploadUrl = useMutation(api.crm.quoteDraft.uploadUrl);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pictureFor, setPictureFor] = useState<string | null>(null);

  const patch = (key: string, p: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const move = (key: string, dir: -1 | 1) => {
    const i = lines.findIndex((l) => l.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  async function pickPicture(file: File | undefined) {
    const key = pictureFor;
    setPictureFor(null);
    if (!file || !key) return;
    if (!file.type.startsWith("image/")) return toast("A picture has to be an image.");
    try {
      const id = await uploadFile(await uploadUrl({ businessId }), file);
      patch(key, { imageId: id, imageUrl: URL.createObjectURL(file) });
    } catch (e) {
      toast(failure(e, "The picture could not be uploaded."));
    }
  }

  async function fillFromVisit() {
    if (!projectId) return;
    const r = await convex.query(api.crm.quotePrices.fromVisit, { opportunityId: projectId });
    if (r.lines.length === 0) return toast(r.missing ?? "Nothing to fill from.");
    const added = r.lines.map((l) => newLine("item", { name: l.name, quantity: String(l.quantity), price: l.priceCents === null ? "0.00" : centsToInput(l.priceCents), catalogueName: l.name }));
    onChange([...lines.filter((l) => l.name.trim() || l.kind === "text"), ...added]);
    const unpriced = r.lines.filter((l) => l.priceCents === null).length;
    toast(unpriced ? `Added ${added.length} lines. ${unpriced} have no price in the list yet, so type their prices in.` : `Added ${added.length} lines from the site visit.`);
  }

  return (
    <section className="qb-card" aria-label="Product / Service">
      <h2 className="qb-h">Product / Service</h2>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void pickPicture(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="qb-lines">
        {lines.map((l, i) =>
          l.kind === "text" ? (
            <div key={l.key} className={`qb-line text${bad.has(`${l.key}:name`) ? " bad" : ""}`}>
              <div className="field">
                <label htmlFor={`t-${l.key}`}>Text</label>
                <textarea id={`t-${l.key}`} aria-invalid={bad.has(`${l.key}:name`)} value={l.name} disabled={readOnly} onChange={(e) => patch(l.key, { name: e.target.value })} />
                <span className="err">Write the text, or delete this row.</span>
              </div>
              <LineTools i={i} n={lines.length} onUp={() => move(l.key, -1)} onDown={() => move(l.key, 1)} onRemove={() => remove(l.key)} readOnly={readOnly} />
            </div>
          ) : (
            <div key={l.key} className="qb-line">
              <div className="qb-grid">
                <div className={`field name${bad.has(`${l.key}:name`) ? " bad" : ""}`}>
                  <label htmlFor={`n-${l.key}`}>Name</label>
                  <input id={`n-${l.key}`} aria-invalid={bad.has(`${l.key}:name`)} value={l.name} maxLength={1000} disabled={readOnly} onChange={(e) => patch(l.key, { name: e.target.value })} />
                  <span className="err">Give the line a name.</span>
                </div>
                <div className={`field qty${bad.has(`${l.key}:qty`) ? " bad" : ""}`}>
                  <label htmlFor={`q-${l.key}`}>Quantity</label>
                  <input id={`q-${l.key}`} inputMode="decimal" aria-invalid={bad.has(`${l.key}:qty`)} value={l.quantity} disabled={readOnly} onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <span className="err">Enter a number.</span>
                </div>
                <div className={`field price${bad.has(`${l.key}:price`) ? " bad" : ""}`}>
                  <label htmlFor={`p-${l.key}`}>Unit price</label>
                  <input id={`p-${l.key}`} inputMode="decimal" aria-invalid={bad.has(`${l.key}:price`)} value={l.price} disabled={readOnly} onChange={(e) => patch(l.key, { price: e.target.value.replace(/[^0-9.,$]/g, "") })} onBlur={() => { const c = dollarsToCents(l.price); if (Number.isFinite(c)) patch(l.key, { price: centsToInput(c) }); }} />
                  <span className="err">Enter a price.</span>
                </div>
                <div className="field total">
                  <label>Total</label>
                  <output className="qb-out">{Number.isFinite(lineCents(l)) ? money(lineCents(l) / 100) : "—"}</output>
                </div>
              </div>
              <div className="qb-row2">
                <div className="field desc">
                  <label htmlFor={`d-${l.key}`}>Description</label>
                  <textarea id={`d-${l.key}`} value={l.description} disabled={readOnly} onChange={(e) => patch(l.key, { description: e.target.value })} />
                </div>
                <div className="qb-pic">
                  {l.imageUrl ? (
                    <div className="qb-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.imageUrl} alt="" />
                      {!readOnly && <button type="button" className="icon-btn" aria-label="Remove the picture" onClick={() => patch(l.key, { imageId: undefined, imageUrl: null })}><Icon name="x" size={18} /></button>}
                    </div>
                  ) : (
                    <button type="button" className="qb-add-pic" disabled={readOnly} onClick={() => { setPictureFor(l.key); fileInput.current?.click(); }}><Icon name="image" size={24} /><span>Add image</span></button>
                  )}
                </div>
              </div>
              <div className="qb-opt">
                <label className="sc-check"><input type="checkbox" checked={l.optional} disabled={readOnly} onChange={(e) => patch(l.key, { optional: e.target.checked, selected: true })} /> Mark as optional</label>
                <LineTools i={i} n={lines.length} onUp={() => move(l.key, -1)} onDown={() => move(l.key, 1)} onRemove={() => remove(l.key)} readOnly={readOnly} />
              </div>
            </div>
          ),
        )}
      </div>
      {!readOnly && (
        <div className="qb-adds">
          <button type="button" className="btn primary" onClick={() => onChange([...lines, newLine("item")])}>Add Line Item</button>
          <button type="button" className="btn" onClick={() => onChange([...lines, newLine("text")])}>Add Text</button>
          <button
            type="button"
            className="btn"
            onClick={(e) =>
              popover(e.currentTarget, (close) => (
                <PriceMenu
                  businessId={businessId}
                  clientId={clientId}
                  close={close}
                  onPick={(it) => {
                    const added = newLine("item", { name: it.name, price: it.priceCents === null ? "0.00" : centsToInput(it.priceCents), catalogueName: it.name, description: it.priceCents === null ? "" : `Priced per ${it.unit}.` });
                    const onlyBlank = lines.length === 1 && lines[0].kind === "item" && !lines[0].name.trim() && lines[0].price === "0.00";
                    onChange(onlyBlank ? [added] : [...lines, added]);
                  }}
                />
              ), { className: "filter" })
            }
          >
            <Icon name="package" size={16} /> Add from price list
          </button>
          <button type="button" className="btn" disabled={!projectId} data-tip={projectId ? "Propose lines from the project's site visit" : "Pick a project first"} onClick={() => void fillFromVisit()}>
            <Icon name="visit" size={16} /> Fill from the site visit
          </button>
        </div>
      )}
    </section>
  );
}

function LineTools({ i, n, onUp, onDown, onRemove, readOnly }: { i: number; n: number; onUp: () => void; onDown: () => void; onRemove: () => void; readOnly?: boolean }) {
  if (readOnly) return null;
  return (
    <div className="qb-tools">
      <button type="button" className="icon-btn" aria-label="Move up" data-tip="Move up" disabled={i === 0} onClick={onUp}><span style={{ display: "inline-grid", transform: "rotate(90deg)" }}><Icon name="chevleft" size={20} /></span></button>
      <button type="button" className="icon-btn" aria-label="Move down" data-tip="Move down" disabled={i === n - 1} onClick={onDown}><span style={{ display: "inline-grid", transform: "rotate(-90deg)" }}><Icon name="chevleft" size={20} /></span></button>
      <button type="button" className="icon-btn" aria-label="Delete this line" data-tip="Delete this line" onClick={onRemove}><Icon name="trash" size={20} /></button>
    </div>
  );
}

function PriceMenu({ businessId, clientId, onPick, close }: { businessId: Id<"businesses">; clientId?: Id<"clients">; onPick: (it: { name: string; unit: string; priceCents: number | null }) => void; close: () => void }) {
  const [q, setQ] = useState("");
  const results = usePriceSearch(businessId, clientId, q, true);
  return (
    <>
      <input className="menu-search" type="search" placeholder="Search the price list" aria-label="Search the price list" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="menu-list qb-prices" role="listbox" aria-label="Price list">
        {results === undefined ? (
          <div className="menu-empty">Loading…</div>
        ) : results.length === 0 ? (
          <div className="menu-empty">No matches</div>
        ) : (
          results.map((r) => (
            <button key={r.name} type="button" role="option" aria-selected={false} className="opt" onClick={() => { onPick(r); close(); }}>
              <span>{r.name}</span>
              <small>{r.priceCents === null ? "No price in the list" : `${money(r.priceCents / 100)} per ${r.unit}`}</small>
            </button>
          ))
        )}
      </div>
    </>
  );
}
