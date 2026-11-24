"use client";

/* The client's invoice page (design 2026-11-18-finance), at /i/<secret link>. No sign-in: the link is the key. Mobile first, read only, no
   online payment. It shows what the invoice's Client view allows. The first time it is opened it records "viewed"; with ?preview=1 (staff:
   Preview as Client) it records nothing. */

import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { moneyCents } from "@/lib/format";
import { utcDate } from "@/lib/invoices";
import { ClientInvoiceSkeleton } from "./skeletons";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

/** No Clerk and no shell here: a visitor who is not signed in anywhere can use it. */
export function ClientInvoiceApp({ token, preview }: { token: string; preview: boolean }) {
  if (!convex) return <main className="cq"><p>This page is not set up.</p></main>;
  return (
    <ConvexProvider client={convex}>
      <ClientInvoice token={token} preview={preview} />
    </ConvexProvider>
  );
}

function ClientInvoice({ token, preview }: { token: string; preview: boolean }) {
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const inv = useQuery(api.crm.clientInvoice.get, { token, now });
  const markViewed = useMutation(api.crm.clientInvoice.markViewed);

  useEffect(() => {
    if (!preview) void markViewed({ token }).catch(() => undefined);
  }, [token, preview, markViewed]);

  if (inv === undefined) return <ClientInvoiceSkeleton />;
  if (inv === null) {
    return (
      <main className="cq">
        <div className="cq-card cq-center">
          <h1>This link is not valid</h1>
          <p>The invoice may have been replaced or withdrawn. Please ask the person who sent it for a new link.</p>
        </div>
      </main>
    );
  }
  const showQty = inv.lines.some((l) => l.quantity !== null);
  const showPrice = inv.lines.some((l) => l.unitPriceCents !== null);
  const showTotal = inv.lines.some((l) => l.totalCents !== null);
  return (
    <main className="cq">
      {preview && <p className="cq-preview" role="status">Preview: this is how the client sees the invoice.</p>}
      <header className="cq-head">
        <div className="cq-biz">{inv.businessName}</div>
        <h1>Invoice #{inv.number}{inv.late && <span className="pill overdue ci-late"><span className="dot" />Past due</span>}</h1>
        <p>{inv.subject}</p>
        <dl className="ci-facts">
          <div><dt>For</dt><dd>{inv.clientName}</dd></div>
          {inv.issuedAt !== null && <div><dt>Issued</dt><dd>{utcDate(inv.issuedAt)}</dd></div>}
          {inv.dueAt !== null && <div><dt>Due</dt><dd>{utcDate(inv.dueAt)}</dd></div>}
          {inv.terms && <div><dt>Terms</dt><dd>{inv.terms}</dd></div>}
        </dl>
      </header>

      <section className="cq-card" aria-label="Products and services">
        <h2>Product / Service</h2>
        <table className="table ci-table">
          <colgroup><col />{showQty && <col style={{ width: "12%" }} />}{showPrice && <col style={{ width: "20%" }} />}{showTotal && <col style={{ width: "20%" }} />}</colgroup>
          <thead><tr><th>Item</th>{showQty && <th className="num">Qty</th>}{showPrice && <th className="num">Unit price</th>}{showTotal && <th className="num">Total</th>}</tr></thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td><b>{l.name}</b>{l.description && <div className="sub">{l.description}</div>}{l.serviceDate !== null && <div className="sub">Service date: {utcDate(l.serviceDate)}</div>}</td>
                {showQty && <td className="num" data-label="Qty">{l.quantity ?? ""}</td>}
                {showPrice && <td className="num" data-label="Unit price">{l.unitPriceCents === null ? "" : moneyCents(l.unitPriceCents)}</td>}
                {showTotal && <td className="num" data-label="Total">{l.totalCents === null ? "" : moneyCents(l.totalCents)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="quote-totals ci-totals">
          <div><dt>Subtotal</dt><dd>{moneyCents(inv.totals.subtotalCents)}</dd></div>
          {inv.totals.discountCents > 0 && <div><dt>Discount</dt><dd>-{moneyCents(inv.totals.discountCents)}</dd></div>}
          {inv.totals.taxCents > 0 && <div><dt>Tax</dt><dd>{moneyCents(inv.totals.taxCents)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{moneyCents(inv.totals.totalCents)}</dd></div>
          {inv.payments.map((p, i) => (<div key={i} className="rule"><dt>Payment • {utcDate(p.paidAt)} • {p.method}</dt><dd>-{moneyCents(p.amountCents)}</dd></div>))}
          <div className={inv.payments.length ? "" : "rule"}><dt><b>Balance due</b></dt><dd><b>{moneyCents(inv.balanceCents)}</b></dd></div>
          {inv.accountBalanceCents !== null && <div><dt>Account balance</dt><dd>{moneyCents(inv.accountBalanceCents)}</dd></div>}
        </dl>
      </section>

      {inv.clientMessage && <section className="cq-card"><h2>Message</h2><p className="qs-text">{inv.clientMessage}</p></section>}
      {inv.contract && <section className="cq-card"><h2>Contract / Disclaimer</h2><p className="qs-text">{inv.contract}</p></section>}
    </main>
  );
}
