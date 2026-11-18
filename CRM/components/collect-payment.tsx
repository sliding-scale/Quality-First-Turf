"use client";

/* Collect Payment (PRD 5.2, design 2026-11-18-finance): Jobber's full-page form. The amount, method, date, reference and details, and the
   client's outstanding invoices: tick the ones being paid and type how much of each (a part payment is fine); one payment can span several.
   Money not put on an invoice stays on the client as a deposit. Nothing here works out a balance: the backend refuses an overpayment. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { money, moneyCents } from "@/lib/format";
import { centsToInput, dollarsToCents, inputToUtc, INVOICE_PILL, PAYMENT_METHODS, todayInput, useInvoice, useOutstanding, utcDate, type InvoiceStatus } from "@/lib/invoices";
import { clock, failure } from "@/lib/pipeline";
import { useClientSearch } from "@/lib/quotes";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { CollectPaymentSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function CollectPaymentPage({ invoiceId, clientId }: { invoiceId?: string; clientId?: string }) {
  const workspace = useWorkspace();
  const inv = useInvoice(invoiceId);
  if (workspace.state === "loading" || (invoiceId && inv === undefined)) return <CollectPaymentSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  const forClient = (inv?.client?.id ?? clientId) as Id<"clients"> | undefined;
  return <Collect business={workspace.business} clientId={forClient} invoiceId={inv ? (invoiceId as Id<"invoices">) : undefined} />;
}

function Collect({ business, clientId: initialClient, invoiceId }: { business: BusinessDoc; clientId?: Id<"clients">; invoiceId?: Id<"invoices"> }) {
  const router = useRouter();
  const { toast } = useUI();
  const { can } = useStaff();
  const canBill = can("payments", "edit");
  const create = useMutation(api.crm.payments.create);
  const [clientId, setClientId] = useState<Id<"clients"> | undefined>(initialClient);
  const [clientQuery, setClientQuery] = useState("");
  const found = useClientSearch(business._id, clientQuery);
  const out = useOutstanding(clientId);

  const [method, setMethod] = useState<string>("Other");
  const [date, setDate] = useState(todayInput());
  const [reference, setReference] = useState("");
  const [details, setDetails] = useState("");
  const [touched, setTouched] = useState<Record<string, string> | null>(null);
  const [deposit, setDeposit] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The invoice that sent the person here starts ticked, for what it still owes. Once they tick or type, their choices are used instead.
  const fromInvoice = out && invoiceId ? out.invoices.find((i) => i.id === invoiceId) : undefined;
  const initialPicked: Record<string, string> = fromInvoice ? { [fromInvoice.id]: centsToInput(fromInvoice.balanceCents) } : {};
  const picked = touched ?? initialPicked;
  const setPicked = (next: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) =>
    setTouched((cur) => (typeof next === "function" ? next(cur ?? initialPicked) : next));

  const rows = out?.invoices ?? [];
  const entered = (id: string) => dollarsToCents(picked[id] ?? "");
  const allocations = rows.filter((r) => picked[r.id] !== undefined).map((r) => ({ row: r, cents: entered(r.id) }));
  const depositCents = deposit.trim() === "" ? 0 : dollarsToCents(deposit);
  const appliedTotal = allocations.reduce((n, a) => n + (Number.isFinite(a.cents) ? a.cents : 0), 0);
  const total = appliedTotal + (Number.isFinite(depositCents) ? depositCents : 0);

  const badRow = (a: { row: (typeof rows)[number]; cents: number }) => !Number.isFinite(a.cents) || a.cents <= 0 || a.cents > a.row.balanceCents;
  const problems = {
    nothing: allocations.length === 0 && !(Number.isFinite(depositCents) && depositCents > 0),
    deposit: !Number.isFinite(depositCents) || depositCents < 0,
    date: !date,
    client: !clientId,
  };

  async function save() {
    setTried(true);
    setError("");
    if (problems.client || problems.nothing || problems.deposit || problems.date || allocations.some(badRow)) {
      setError(problems.client ? "Pick the client who paid." : problems.nothing ? "Tick an invoice and enter how much was paid, or enter a deposit." : "Some amounts need attention. They are marked in red.");
      return;
    }
    setBusy(true);
    try {
      await create({
        clientId: clientId!, method, paidAt: inputToUtc(date), reference, details, amountCents: total,
        allocations: allocations.map((a) => ({ invoiceId: a.row.id as Id<"invoices">, amountCents: a.cents })), now: clock(),
      });
      toast(`A payment of ${moneyCents(total)} from ${out?.client.name ?? "the client"} has been recorded.`);
      router.push(invoiceId ? `/invoices/${invoiceId}` : "/payments");
    } catch (e) {
      setError(failure(e, "The payment could not be saved. Try again."));
      setBusy(false);
    }
  }

  if (!canBill) {
    return <div className="empty-state"><h2>Your role can look at payments but not record them</h2><Link className="btn primary" href="/payments">Back to payments</Link></div>;
  }

  return (
    <div className="qb fade-in">
      <div className="qb-top"><h1><Icon name="card" size={26} /> New Payment{out ? ` from ${out.client.name}` : ""}</h1></div>
      {error && <p className="qb-error" role="alert">{error}</p>}

      {!clientId ? (
        <section className="qb-card">
          <div className={`field${tried && problems.client ? " bad" : ""}`}>
            <label htmlFor="cp-client">Client</label>
            <input id="cp-client" aria-invalid={tried && problems.client} placeholder="Select a client" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} autoComplete="off" />
            {clientQuery.trim() && found && (
              <div className="sc-results" role="listbox">
                {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
                {found.rows.map((c) => (
                  <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { setClientId(c._id); setClientQuery(""); }}>
                    <b>{c.name}</b> <span>{[c.street1, c.city].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
              </div>
            )}
            <span className="err">Pick the client who paid.</span>
          </div>
        </section>
      ) : out === undefined ? (
        <section className="qb-card"><div className="sk" style={{ height: 140 }} /></section>
      ) : out === null ? (
        <section className="qb-card"><p className="sc-muted">That client no longer exists.</p></section>
      ) : (
        <>
          <section className="qb-card">
            <div className="cp-amount" aria-live="polite"><span>Amount</span><b>{money(total / 100)}</b></div>
            <div className="qb-headgrid">
              <div className="qb-left">
                <div className="field"><label htmlFor="cp-method">Payment method</label><select id="cp-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                <div className={`field${tried && problems.date ? " bad" : ""}`}>
                  <label htmlFor="cp-date">Transaction date</label>
                  <input id="cp-date" type="date" aria-invalid={tried && problems.date} value={date} onChange={(e) => setDate(e.target.value)} />
                  <span className="err">Pick the date.</span>
                </div>
              </div>
              <div className="qb-left">
                <div className="field"><label htmlFor="cp-ref">Reference #</label><input id="cp-ref" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                <div className="field"><label htmlFor="cp-details">Details</label><textarea id="cp-details" value={details} onChange={(e) => setDetails(e.target.value)} /></div>
              </div>
            </div>
          </section>

          <section className="qb-card" aria-label="Outstanding invoices">
            <div className="cp-head">
              <div><h2 className="qb-h">Outstanding invoices</h2><p className="sc-muted">Select the invoices you&apos;re paying and review the amounts before continuing.</p></div>
              <div className="cp-balance"><small>ACCOUNT BALANCE</small><b>{moneyCents(out.accountBalanceCents)}</b></div>
            </div>
            <div className="cp-selbar">
              <span>{allocations.length} selected</span>
              <button type="button" className="cj-link" onClick={() => setPicked(allocations.length === rows.length ? {} : Object.fromEntries(rows.map((r) => [r.id, centsToInput(r.balanceCents)])))}>
                {allocations.length === rows.length && rows.length > 0 ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="table-wrap">
              <table className="table single">
                <colgroup><col style={{ width: 56 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 170 }} /></colgroup>
                <thead><tr><th /><th>Invoice #</th><th>Due Date</th><th>Subject</th><th className="num">Total</th><th className="num">Balance</th><th className="num">Enter Payment</th></tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={7}><div className="empty" style={{ margin: "16px 0" }}>This client has no invoices waiting for payment. Anything entered as a deposit below stays on the client.</div></td></tr>}
                  {rows.map((r) => {
                    const on = picked[r.id] !== undefined;
                    const a = allocations.find((x) => x.row.id === r.id);
                    const bad = tried && !!a && badRow(a);
                    return (
                      <tr key={r.id}>
                        <td><input type="checkbox" aria-label={`Pay invoice #${r.number}`} checked={on} onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[r.id] = centsToInput(r.balanceCents); else delete n[r.id]; return n; })} /></td>
                        <td><Link href={`/invoices/${r.id}`}>#{r.number}</Link></td>
                        <td>{r.dueAt !== undefined ? utcDate(r.dueAt) : "—"} <span className={`pill ${INVOICE_PILL[r.status as InvoiceStatus]}`}><span className="dot" />{r.status}</span></td>
                        <td title={r.subject}>{r.subject}</td>
                        <td className="num">{moneyCents(r.totalCents)}</td>
                        <td className="num">{moneyCents(r.balanceCents)}</td>
                        <td className="num">
                          <div className={`field${bad ? " bad" : ""}`}>
                            <input inputMode="decimal" aria-label={`Amount paid on invoice #${r.number}`} aria-invalid={bad} disabled={!on} value={picked[r.id] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value.replace(/[^0-9.,$]/g, "") }))} onBlur={() => { const c = entered(r.id); if (Number.isFinite(c)) setPicked((p) => ({ ...p, [r.id]: centsToInput(c) })); }} />
                            {bad && <span className="err">Up to {moneyCents(r.balanceCents)}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={`field cp-deposit${tried && problems.deposit ? " bad" : ""}`}>
              <label htmlFor="cp-deposit">Deposit (money not applied to an invoice yet)</label>
              <input id="cp-deposit" inputMode="decimal" placeholder="0.00" aria-invalid={tried && problems.deposit} value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.,$]/g, ""))} />
              <span className="err">Enter an amount, or leave it empty.</span>
            </div>
          </section>
        </>
      )}

      <div className="qb-bar">
        <button type="button" className="btn plain" onClick={() => router.push(invoiceId ? `/invoices/${invoiceId}` : "/payments")} disabled={busy}>Cancel</button>
        <div className="qb-save">
          <button type="button" className="btn" disabled data-tip="Receipts by email come later">Save and Email Receipt</button>
          <button type="button" className="btn primary" disabled={busy || !clientId} style={{ marginLeft: 8 }} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
