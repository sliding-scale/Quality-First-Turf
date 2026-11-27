"use client";

/* A quote shown in full, read only, on the project's Quotes tab (user, 2026-11-26, D-130): the introduction, the products and services with
   their pictures, the totals and deposit, attachments, the client message, the contract and the signature, the same as on the quote page.
   It is changed on the quote page ("Open quote"). */

import Image from "next/image";
import Link from "next/link";
import { moneyCents, quoteDate } from "@/lib/format";
import { QUOTE_DOT, QUOTE_PILL, useQuote } from "@/lib/quotes";
import { Icon } from "./icon";

export function QuoteContent({ id }: { id: string }) {
  const q = useQuote(id);
  if (q === undefined) return <section className="card op-card"><div className="sk" style={{ height: 220 }} /></section>;
  if (q === null) return null;
  return (
    <section className="card op-card op-wide op-quote" aria-label={`Quote #${q.number}`}>
      <div className="op-sechead">
        <h2>
          Quote #{q.number} · {q.title || "Untitled"}{" "}
          <span className={`pill tag ${QUOTE_PILL[q.status]}`}><span className="dot" style={{ background: QUOTE_DOT[q.status] }} />{q.status}</span>
        </h2>
        <Link className="btn" href={`/quotes/${q.id}`}><Icon name="quote" size={18} /> Open quote</Link>
      </div>
      <p className="muted op-quote-meta">
        {[`Created ${quoteDate(q.createdAt)}`, q.sentAt ? `Sent ${quoteDate(q.sentAt)}` : "", q.salesperson ? `Salesperson ${q.salesperson}` : ""].filter(Boolean).join(" · ")}
      </p>

      {(q.introImageUrl || q.introHeading || q.introText) && (
        <div className="op-quote-part">
          <h3>Introduction</h3>
          {q.introImageUrl && <div className="qs-hero"><Image src={q.introImageUrl} alt="" width={640} height={360} unoptimized /></div>}
          {q.introHeading && <h4>{q.introHeading}</h4>}
          {q.introText && <p className="op-text">{q.introText}</p>}
        </div>
      )}

      <div className="op-quote-part">
        <h3>Product / Service</h3>
        <div className="op-scroll">
          <table className="table quote-lines">
            <colgroup><col /><col style={{ width: 128 }} /><col style={{ width: 110 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /></colgroup>
            <thead><tr><th>Line Item</th><th /><th className="num">Quantity</th><th className="num">Unit Price</th><th className="num">Total</th></tr></thead>
            <tbody>
              {q.lines.map((l) =>
                l.kind === "text" ? (
                  <tr key={l.id}><td className="ql-main" colSpan={5}><div className="ql-desc">{l.name}</div></td></tr>
                ) : (
                  <tr key={l.id}>
                    <td className="ql-main">
                      <div className="ql-name">
                        {l.optional && <span className={`qbox${l.selected ? " on" : ""}`} role="img" aria-label={l.selected ? "Included" : "Not included"}>{l.selected && <Icon name="check" size={14} />}</span>}
                        <b>{l.name}</b>
                      </div>
                      {l.description && <div className="ql-desc">{l.description}</div>}
                    </td>
                    <td className="ql-img">
                      {l.visitPhotos.map((p) => <span key={p.id} className="ql-thumb"><Image src={p.url} alt="" width={56} height={56} unoptimized /></span>)}
                      {l.imageUrl && <span className="ql-thumb"><Image src={l.imageUrl} alt="" width={56} height={56} unoptimized /></span>}
                    </td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{moneyCents(l.unitPriceCents)}</td>
                    <td className="num">{moneyCents(Math.round(l.quantity * l.unitPriceCents))}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <dl className="quote-totals">
          <div><dt>Subtotal</dt><dd>{moneyCents(q.totals.subtotalCents)}</dd></div>
          {q.totals.discountCents > 0 && <div><dt>Discount</dt><dd>-{moneyCents(q.totals.discountCents)}</dd></div>}
          {q.totals.taxCents > 0 && <div><dt>Tax ({q.taxPercent}%)</dt><dd>{moneyCents(q.totals.taxCents)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{moneyCents(q.totals.totalCents)}</dd></div>
          {q.totals.depositCents > 0 && (
            <>
              <div className="rule"><dt>Required deposit</dt><dd>{moneyCents(q.totals.depositCents)}</dd></div>
              {q.totals.depositCollectedCents > 0 && <div><dt>Deposit collected</dt><dd>-{moneyCents(q.totals.depositCollectedCents)}</dd></div>}
              <div><dt>Outstanding deposit</dt><dd>{moneyCents(q.totals.depositOutstandingCents)}</dd></div>
            </>
          )}
        </dl>
        {q.attachments.length > 0 && (
          <ul className="qp-files" aria-label="Attachments">
            {q.attachments.map((a) => <li key={a.id}><Icon name="file" size={20} /><a href={a.url ?? undefined} target="_blank" rel="noreferrer">{a.name}</a></li>)}
          </ul>
        )}
      </div>

      {q.clientMessage && <div className="op-quote-part"><h3>Client Message</h3><p className="op-text">{q.clientMessage}</p></div>}
      {(q.contract || q.disclaimers.length > 0) && (
        <div className="op-quote-part">
          <h3>Contract / Disclaimer</h3>
          {q.contract && <p className="op-text">{q.contract}</p>}
          {q.disclaimers.map((d) => <div key={d.title}><h4>{d.title}</h4><p className="op-text">{d.text}</p></div>)}
        </div>
      )}
      {(q.signatureUrl || q.signedBy) && q.signedAt && (
        <div className="quote-signature">
          <div className="sig-cell">
            {q.signatureUrl ? <div className="sig-image"><Image src={q.signatureUrl} alt={q.signedBy ? `Signature of ${q.signedBy}` : "Signature"} width={210} height={104} unoptimized /></div> : <div className="sig-name">{q.signedBy}</div>}
            <div className="sig-line">Signature</div>
          </div>
          <div className="sig-cell date"><div className="sig-date">{quoteDate(q.signedAt)}</div><div className="sig-line">Date</div></div>
        </div>
      )}
    </section>
  );
}
