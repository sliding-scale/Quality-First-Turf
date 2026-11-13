"use client";

/* The Product / Service section of a request (Jobber's request page): what the client asked for, as named lines with a quantity and a
   unit price, and a subtotal and total under them. Simpler than a quote's lines: no pictures, optional lines, discount or tax, because
   the price that counts is set when the quote is made. Amounts are typed as dollars and kept as text while editing, so half-typed
   numbers never jump around. The same editor is used by the New Request form and by the request page's pencil. */

import { centsToInput, dollarsToCents, lineTotalCents } from "@/lib/quotes";
import { moneyCents } from "@/lib/format";
import { Icon } from "./icon";

export type RequestLine = { key: string; name: string; description: string; quantity: string; price: string };

let counter = 0;
export const newRequestLine = (over: Partial<RequestLine> = {}): RequestLine => ({ key: `rl-${++counter}`, name: "", description: "", quantity: "1", price: "0.00", ...over });

/** The saved lines as rows to edit. */
export function toRequestLines(saved: { name: string; description: string; quantity: number; unitPriceCents: number }[]): RequestLine[] {
  return saved.map((l) => newRequestLine({ name: l.name, description: l.description, quantity: String(l.quantity), price: centsToInput(l.unitPriceCents) }));
}

/** A line's total in cents; NaN while a box holds something that is not a number. */
function totalOf(l: RequestLine): number {
  const q = Number(l.quantity);
  const p = dollarsToCents(l.price);
  return Number.isFinite(q) && Number.isFinite(p) ? lineTotalCents({ quantity: q, unitPriceCents: p }) : NaN;
}

/** Checks the rows. Blank rows (no name, no description, no price) are dropped; the rest need a name, a quantity above zero and a price. */
export function checkRequestLines(lines: RequestLine[]): { ok: { name: string; description: string; quantity: number; unitPriceCents: number }[]; bad: Set<string> } {
  const bad = new Set<string>();
  const ok = [];
  for (const l of lines) {
    const price = dollarsToCents(l.price);
    const qty = Number(l.quantity);
    if (!l.name.trim() && !l.description.trim() && (!Number.isFinite(price) || price === 0)) continue;
    if (!l.name.trim()) bad.add(`${l.key}:name`);
    if (!(qty > 0)) bad.add(`${l.key}:qty`);
    if (!Number.isFinite(price) || price < 0) bad.add(`${l.key}:price`);
    ok.push({ name: l.name.trim(), description: l.description.trim(), quantity: qty, unitPriceCents: price });
  }
  return { ok, bad };
}

const sumOf = (lines: RequestLine[]) => lines.reduce((n, l) => n + (Number.isFinite(totalOf(l)) ? totalOf(l) : 0), 0);

export function RequestLinesEditor({ lines, onChange, bad }: { lines: RequestLine[]; onChange: (lines: RequestLine[]) => void; /** Keys of "key:field" flagged red after a failed Save. */ bad: Set<string> }) {
  const patch = (key: string, p: Partial<RequestLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  return (
    <>
      {lines.length === 0 && <p className="rl-empty">Keep everything on track by adding products and services.</p>}
      <div className="qb-lines">
        {lines.map((l) => (
          <div key={l.key} className="qb-line">
            <div className="qb-grid">
              <div className={`field name${bad.has(`${l.key}:name`) ? " bad" : ""}`}>
                <label htmlFor={`rn-${l.key}`}>Name</label>
                <input id={`rn-${l.key}`} aria-invalid={bad.has(`${l.key}:name`)} value={l.name} maxLength={200} onChange={(e) => patch(l.key, { name: e.target.value })} />
                <span className="err">Give the line a name.</span>
              </div>
              <div className={`field qty${bad.has(`${l.key}:qty`) ? " bad" : ""}`}>
                <label htmlFor={`rq-${l.key}`}>Quantity</label>
                <input id={`rq-${l.key}`} inputMode="decimal" aria-invalid={bad.has(`${l.key}:qty`)} value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} />
                <span className="err">Enter a number.</span>
              </div>
              <div className={`field price${bad.has(`${l.key}:price`) ? " bad" : ""}`}>
                <label htmlFor={`rp-${l.key}`}>Unit price</label>
                <input
                  id={`rp-${l.key}`}
                  inputMode="decimal"
                  aria-invalid={bad.has(`${l.key}:price`)}
                  value={l.price}
                  onChange={(e) => patch(l.key, { price: e.target.value.replace(/[^0-9.,$]/g, "") })}
                  onBlur={() => { const c = dollarsToCents(l.price); if (Number.isFinite(c)) patch(l.key, { price: centsToInput(c) }); }}
                />
                <span className="err">Enter a price.</span>
              </div>
              <div className="field total">
                <label>Total</label>
                <output className="qb-out">{Number.isFinite(totalOf(l)) ? moneyCents(totalOf(l)) : "—"}</output>
              </div>
            </div>
            <div className="qb-row2">
              <div className="field desc">
                <label htmlFor={`rd-${l.key}`}>Description</label>
                <textarea id={`rd-${l.key}`} maxLength={2000} value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} />
              </div>
            </div>
            <div className="qb-opt">
              <span />
              <div className="qb-tools">
                <button type="button" className="icon-btn" aria-label="Delete this line" data-tip="Delete this line" onClick={() => remove(l.key)}><Icon name="trash" size={20} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="qb-adds">
        <button type="button" className="btn primary" onClick={() => onChange([...lines, newRequestLine()])}>Add Line Item</button>
      </div>
      <RequestTotals cents={sumOf(lines)} />
    </>
  );
}

/** Subtotal and Total, as under a quote's lines. */
export function RequestTotals({ cents }: { cents: number }) {
  return (
    <dl className="quote-totals rl-totals">
      <div><dt>Subtotal</dt><dd>{moneyCents(cents)}</dd></div>
      <div className="grand"><dt>Total</dt><dd>{moneyCents(cents)}</dd></div>
    </dl>
  );
}

/** The saved lines, read-only, for the request page. */
export function RequestLinesView({ lines }: { lines: { name: string; description: string; quantity: number; unitPriceCents: number }[] }) {
  const total = lines.reduce((n, l) => n + lineTotalCents(l), 0);
  return (
    <>
      <table className="table quote-lines">
        <colgroup>
          <col />
          <col style={{ width: 128 }} />
          <col style={{ width: 171 }} />
          <col style={{ width: 171 }} />
        </colgroup>
        <thead>
          <tr><th>Line Item</th><th className="num">Quantity</th><th className="num">Unit Price</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="ql-main">
                <div className="ql-name"><b>{l.name}</b></div>
                {l.description && <div className="ql-desc">{l.description}</div>}
              </td>
              <td className="num" data-label="Quantity">{l.quantity}</td>
              <td className="num" data-label="Price">{moneyCents(l.unitPriceCents)}</td>
              <td className="num" data-label="Total">{moneyCents(lineTotalCents(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RequestTotals cents={total} />
    </>
  );
}
