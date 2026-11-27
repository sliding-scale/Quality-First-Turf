"use client";

/* The Billing tab of a project (PRD 5.2, design 2026-11-18-finance): Jobber's job Billing section. Either a reminder to invoice at the end, or a
   payment schedule: rows that are a percent (or an amount) of the project total, each with a Create button that makes its invoice, and a bar of
   what is Paid, Awaiting Payment, Draft and Remaining. The total is the approved quote's. Below it, the project's invoices and payments. The
   backend (convex/crm/billing.ts) checks every rule; the amounts shown while typing use the same pure code. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { splitSchedule } from "@/convex/crm/lib/invoiceMath";
import { moneyCents } from "@/lib/format";
import { centsToInput, dollarsToCents, INVOICE_PILL, useBilling, utcDate, type InvoiceStatus } from "@/lib/invoices";
import { failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { BillingSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

type Row = { key: string; id?: Id<"paymentScheduleItems">; description: string; kind: "percent" | "amount"; value: string; locked: boolean };
let counter = 0;

export function BillingTab({ id }: { id: Id<"opportunities"> }) {
  const { toast } = useUI();
  const b = useBilling(id);
  const save = useMutation(api.crm.billing.save);
  const [draft, setDraft] = useState<{ mode: "remind" | "schedule"; rows: Row[]; total: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (b === undefined) return <BillingSkeleton />;
  if (b === null) return <div className="empty-state"><h2>Project not found</h2></div>;

  const serverRows: Row[] = b.rows.map((r) => ({
    key: r.id, id: r.id, description: r.description, kind: r.kind, value: r.kind === "percent" ? String(r.value) : centsToInput(r.value), locked: r.invoice !== null,
  }));
  const mode = draft?.mode ?? b.plan?.mode ?? "remind";
  const rows = draft?.rows ?? serverRows;
  const hasQuote = b.quoteTotalCents !== null;
  const totalText = draft?.total ?? (b.plan && !hasQuote ? centsToInput(b.plan.totalCents) : "");
  const totalCents = hasQuote ? (b.plan?.totalCents ?? b.quoteTotalCents ?? 0) : Number.isFinite(dollarsToCents(totalText)) ? dollarsToCents(totalText) : 0;
  const anyInvoiced = b.rows.some((r) => r.invoice !== null);
  const edit = (p: Partial<{ mode: "remind" | "schedule"; rows: Row[]; total: string }>) => setDraft({ mode, rows, total: totalText, ...draft, ...p });

  const amounts = splitSchedule(totalCents, rows.map((r) => ({ kind: r.kind, value: r.kind === "percent" ? Number(r.value) || 0 : dollarsToCents(r.value) || 0 })));
  const requested = rows.reduce((n, r) => n + (r.kind === "percent" ? Math.round((totalCents * (Number(r.value) || 0)) / 100) : dollarsToCents(r.value) || 0), 0);
  const over = requested > totalCents + 1;
  const s = b.summary;
  const barTotal = Math.max(1, b.billingTotalCents);
  const pct = (n: number) => `${Math.min(100, (n / barTotal) * 100)}%`;

  async function saveNow() {
    setBusy(true);
    setError("");
    try {
      await save({
        opportunityId: id, mode, ...(!hasQuote && Number.isFinite(dollarsToCents(totalText)) ? { totalCents: dollarsToCents(totalText) } : {}),
        rows: mode === "schedule" ? rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), description: r.description, kind: r.kind, value: r.kind === "percent" ? Number(r.value) : dollarsToCents(r.value) })) : [],
      });
      setDraft(null);
      toast("Billing saved.");
    } catch (e) {
      setError(failure(e, "The billing plan could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  const newInvoice = `/invoices/new?clientId=${b.project.clientId}&projectId=${b.project.id}`;
  return (
    <div className="bt">
      <section className="card panel">
        <div className="ph">
          <h3>Billing</h3>
          {draft && (
            <div className="bt-save">
              <button type="button" className="btn" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
              <button type="button" className="btn primary" disabled={busy || over} onClick={() => void saveNow()}>{busy ? "Saving…" : "Save billing"}</button>
            </div>
          )}
        </div>
        <div className="bt-body">
          {error && <p className="qb-error" role="alert">{error}</p>}
          {b.canBill ? (
            <label className="sc-check"><input type="checkbox" checked={mode === "schedule"} disabled={anyInvoiced} onChange={(e) => edit({ mode: e.target.checked ? "schedule" : "remind", rows: e.target.checked && rows.length === 0 ? [{ key: `n-${++counter}`, description: "Deposit", kind: "percent", value: "30", locked: false }, { key: `n-${++counter}`, description: "Final payment", kind: "percent", value: "70", locked: false }] : rows })} /> Split into multiple invoices with a payment schedule</label>
          ) : (
            <p className="sc-muted">{mode === "schedule" ? "This project bills in a payment schedule." : "Remind me to invoice when the job is closed."}</p>
          )}
          {mode === "remind" && <p className="sc-muted">No payment schedule. Make invoices for this project as it goes, or all at the end.</p>}

          {mode === "schedule" && (
            <>
              <div className="bt-total">
                <div><small>Total</small><b>{moneyCents(totalCents)}</b></div>
                <span className="sc-muted">
                  {hasQuote ? `From quote #${b.quoteNumber}, as approved.` : "There is no approved quote, so enter the total to bill."}
                </span>
                {!hasQuote && b.canBill && !anyInvoiced && (
                  <div className="field bt-total-input"><label htmlFor="bt-total">Project total</label><input id="bt-total" inputMode="decimal" placeholder="0.00" value={totalText} onChange={(e) => edit({ total: e.target.value.replace(/[^0-9.,$]/g, "") })} /></div>
                )}
              </div>
              <div className="bt-bar" role="img" aria-label={`Paid ${moneyCents(s.paidCents)}, awaiting payment ${moneyCents(s.awaitingCents)}, draft ${moneyCents(s.draftCents)}, remaining ${moneyCents(s.remainingCents)}`}>
                <span className="paid" style={{ width: pct(s.paidCents) }} />
                <span className="await" style={{ width: pct(s.awaitingCents) }} />
                <span className="draft" style={{ width: pct(s.draftCents) }} />
              </div>
              <ul className="bt-legend">
                <li><i className="paid" />Paid: {moneyCents(s.paidCents)}</li>
                <li><i className="await" />Awaiting Payment: {moneyCents(s.awaitingCents)}</li>
                <li><i className="draft" />Draft: {moneyCents(s.draftCents)}</li>
                <li><i className="rest" />Remaining: {moneyCents(s.remainingCents)}</li>
              </ul>

              <div className="table-wrap">
                <table className="table bt-table">
                  <colgroup><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 48 }} /></colgroup>
                  <thead><tr><th>Invoice</th><th>Due date</th><th>Status</th><th>Amount</th><th>Description</th><th className="num">Total</th><th className="num">Balance</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const server = b.rows.find((x) => x.id === r.id);
                      const inv = server?.invoice ?? null;
                      const bad = draft !== null && (!r.description.trim() || (r.kind === "percent" ? !(Number(r.value) > 0 && Number(r.value) <= 100) : !(dollarsToCents(r.value) > 0)));
                      return (
                        <tr key={r.key}>
                          <td>
                            {inv ? <Link href={`/invoices/${inv.id}`}>#{inv.number}</Link> : b.canBill && r.id && !draft && b.billingTotalCents > 0 ? <Link className="btn small" href={`${newInvoice}&scheduleItem=${r.id}`}>Create</Link> : <button type="button" className="btn small" aria-disabled="true" onClick={() => toast(draft ? "Save the payment schedule first, then make its invoice." : "There is nothing to invoice for this row yet.")}>Create</button>}
                          </td>
                          <td>{inv ? "" : "—"}</td>
                          <td>{inv ? <span className={`pill ${INVOICE_PILL[inv.status as InvoiceStatus]}`}><span className="dot" />{inv.status}</span> : <span className="pill draft"><span className="dot" />Upcoming</span>}</td>
                          <td>
                            <div className={`bt-amount field${bad ? " bad" : ""}`}>
                              <input aria-label={`Payment ${i + 1} amount`} inputMode="decimal" disabled={r.locked || !b.canBill} aria-invalid={bad} value={r.value} onChange={(e) => edit({ rows: rows.map((x) => (x.key === r.key ? { ...x, value: e.target.value.replace(/[^0-9.,]/g, "") } : x)) })} />
                              <select aria-label={`Payment ${i + 1} type`} disabled={r.locked || !b.canBill} value={r.kind} onChange={(e) => edit({ rows: rows.map((x) => (x.key === r.key ? { ...x, kind: e.target.value as "percent" | "amount", value: "" } : x)) })}><option value="percent">%</option><option value="amount">$</option></select>
                            </div>
                          </td>
                          <td><div className={`field${bad && !r.description.trim() ? " bad" : ""}`}><input aria-label={`Payment ${i + 1} description`} maxLength={200} disabled={!b.canBill} value={r.description} onChange={(e) => edit({ rows: rows.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)) })} /></div></td>
                          <td className="num">{moneyCents(amounts.amounts[i] ?? 0)}</td>
                          <td className="num">{inv ? moneyCents(inv.balanceCents) : moneyCents(amounts.amounts[i] ?? 0)}</td>
                          <td>{!r.locked && b.canBill && <button type="button" className="icon-btn" aria-label={`Remove payment ${i + 1}`} onClick={() => edit({ rows: rows.filter((x) => x.key !== r.key) })}><Icon name="trash" size={18} /></button>}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={8}><div className="empty" style={{ margin: "14px 0" }}>No payments in the schedule yet.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              {b.canBill && <button type="button" className="cj-link" onClick={() => edit({ rows: [...rows, { key: `n-${++counter}`, description: `Payment ${rows.length + 1}`, kind: "percent", value: "", locked: false }] })}>Add Invoice to Payment Schedule</button>}
              <div className={`bt-rest${over ? " over" : ""}`}>
                <span>{over ? "The payments add up to more than the project total." : "Remainder of job total"}</span>
                <b>{moneyCents(Math.max(0, totalCents - amounts.amounts.reduce((n, a) => n + a, 0)))}</b>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card panel">
        <div className="ph">
          <h3>Invoices</h3>
          {b.canBill && <Link className="btn small" href={newInvoice}>New invoice</Link>}
        </div>
        <div className="bt-body flush">
          {b.invoices.length === 0 ? <p className="sc-muted bt-pad">No invoices for this project yet.</p> : (
            <table className="table op-table">
              <colgroup><col style={{ width: "12%" }} /><col style={{ width: "28%" }} /><col style={{ width: "16%" }} /><col style={{ width: "14%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /></colgroup>
              <thead><tr><th>Invoice</th><th>Subject</th><th>Status</th><th>Due</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {b.invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/invoices/${i.id}`}>#{i.number}</Link></td>
                    <td>{i.subject}</td>
                    <td><span className={`pill ${INVOICE_PILL[i.status as InvoiceStatus]}`}><span className="dot" />{i.status}</span></td>
                    <td>{i.dueAt !== undefined ? utcDate(i.dueAt) : "—"}</td>
                    <td className="num">{moneyCents(i.totalCents)}</td>
                    <td className="num">{moneyCents(i.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card panel">
        <div className="ph">
          <h3>Payments</h3>
          {b.canBill && <Link className="btn small" href={`/payments/new?clientId=${b.project.clientId}`}>Collect payment</Link>}
        </div>
        <div className="bt-body flush">
          {b.payments.length === 0 ? <p className="sc-muted bt-pad">No payments for this project yet.</p> : (
            <table className="table op-table">
              <colgroup><col style={{ width: "30%" }} /><col style={{ width: "40%" }} /><col style={{ width: "30%" }} /></colgroup>
              <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
              <tbody>{b.payments.map((p) => (<tr key={p.id}><td>{utcDate(p.paidAt)}</td><td>{p.method}</td><td className="num">{moneyCents(p.amountCents)}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
