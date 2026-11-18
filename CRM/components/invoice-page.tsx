"use client";

/* One invoice (PRD 5.2, design 2026-11-18-finance), laid out like Jobber's invoice page and this CRM's quote page: status and subject, the
   client and a table of facts, the invoice as the client reads it (lines, totals, payments and balance, the payment schedule, message,
   contract), and Notes on the right. Jobber's More menu: send by email, mark as sent, collect payment, preview as client, print; Admin adds
   void, bad debt, reopen and delete a draft. The money is worked out in the backend, never here. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/lib/clients";
import { moneyCents, quoteDateTime } from "@/lib/format";
import { INVOICE_DOT, INVOICE_PILL, PAYMENT_TERMS, todayUtc, useInvoice, utcDate } from "@/lib/invoices";
import { clock, failure } from "@/lib/pipeline";
import { useStoredString, writeItem } from "@/lib/store";
import { SendEmailDialog } from "./client-dialogs";
import { Icon } from "./icon";
import { InvoiceSkeleton } from "./skeletons";
import { PipelineModal } from "./pipeline-dialogs";
import { useStaff } from "./staff-context";
import { useUI, type MenuItem } from "./ui-provider";

export function InvoicePage({ id }: { id: string }) {
  const inv = useInvoice(id);
  if (inv === undefined) return <InvoiceSkeleton />;
  if (inv === null) {
    return (
      <div className="empty-state">
        <h2>Invoice not found</h2>
        <p>This invoice does not exist, or it was removed.</p>
        <Link className="btn primary" href="/invoices">Back to invoices</Link>
      </div>
    );
  }
  return <InvoiceView d={inv} />;
}

type Doc = NonNullable<ReturnType<typeof useInvoice>>;

const SIDE_KEY = "qft-invoice-notes-closed";
const LABEL: Record<string, string> = {
  created: "Created", edited: "Edited", sent: "Sent", marked_sent: "Marked as sent", payment: "Payment", deposit: "Deposit", void: "Voided", bad_debt: "Bad debt", reopened: "Reopened",
};

function InvoiceView({ d }: { d: Doc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { dropdown, toast } = useUI();
  const { roles } = useStaff();
  const workspace = useWorkspace();
  const canBill = d.canBill;
  const isAdmin = roles.includes("admin");
  const i = d.invoice;
  const send = useMutation(api.crm.invoices.send);
  const markSent = useMutation(api.crm.invoices.markSent);
  const setStatus = useMutation(api.crm.invoices.setStatus);
  const remove = useMutation(api.crm.invoices.remove);
  const [dialog, setDialog] = useState<null | "email" | "activity" | "delete" | "void" | "debt">(() => (params.get("email") === "1" && i.token ? "email" : null));
  const sideOpen = useStoredString(SIDE_KEY, "0") !== "1";
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));
  const c = d.client;
  const businessName = workspace.state === "ready" ? (workspace.businesses.find((b) => b._id === i.businessId)?.name ?? workspace.business.name) : "";
  const live = i.storedStatus === "Draft" || i.storedStatus === "Sent" || i.storedStatus === "Paid";

  useEffect(() => {
    document.title = `Invoice #${i.number} · Quality First Turf CRM`;
  }, [i.number]);

  async function openEmail() {
    try {
      await send({ id: i.id, now: clock(), today: todayUtc() }); // a draft becomes Sent here; a sent one only returns its link
      setDialog("email");
    } catch (e) {
      fail(e, "The invoice could not be sent.");
    }
  }

  const terms = PAYMENT_TERMS.find((t) => t.key === i.termsKey)?.label ?? i.termsKey;
  const scheduleRow = d.schedule?.rows.find((r) => r.thisInvoice);
  const facts: [string, React.ReactNode][] = [
    ["Invoice #", i.number],
    ...(d.project ? ([["Invoice for", <Link key="p" href={`/opportunities/${d.project.id}?tab=billing`}>{d.project.title} · {d.project.code}</Link>]] as [string, React.ReactNode][]) : []),
    ...(d.schedule && scheduleRow ? ([["Portion of job", `${d.schedule.totalCents > 0 ? Math.round((scheduleRow.amountCents / d.schedule.totalCents) * 1000) / 10 : 0}% (${moneyCents(scheduleRow.amountCents)} of ${moneyCents(d.schedule.totalCents)})`]] as [string, React.ReactNode][]) : []),
    ["Issued", i.issuedAt !== undefined ? utcDate(i.issuedAt) : "Not sent yet"],
    ["Payment terms", terms],
    ...(i.dueAt !== undefined ? ([["Due date", utcDate(i.dueAt)]] as [string, React.ReactNode][]) : []),
    ["Salesperson", i.salesperson || "—"],
    ...(i.viewedAt ? ([["Viewed", quoteDateTime(i.viewedAt)]] as [string, React.ReactNode][]) : []),
  ];

  const later = (label: string, icon: string): MenuItem => ({ label, icon, disabled: true });
  const rule: MenuItem = { divider: true };
  const moreItems: MenuItem[] = [
    ...(canBill && i.storedStatus !== "Void" && i.storedStatus !== "Bad debt"
      ? [
          { heading: "Send as..." } as MenuItem,
          { label: "Email", icon: "mail", onSelect: () => void openEmail() } as MenuItem,
          later("Text Message", "sms"),
          ...(i.storedStatus === "Draft" ? [{ heading: "Mark as..." } as MenuItem, { label: "Sent", icon: "check", onSelect: () => void markSent({ id: i.id, now: clock(), today: todayUtc() }).then(() => toast("Invoice marked as sent.")).catch((e) => fail(e, "The invoice could not be marked as sent.")) } as MenuItem] : []),
          rule,
          { label: "Collect Payment", icon: "card", disabled: i.storedStatus === "Draft" || i.balanceCents <= 0, onSelect: () => router.push(`/payments/new?invoice=${i.id}`) } as MenuItem,
        ]
      : []),
    i.token ? ({ label: "Preview as Client", icon: "eye", onSelect: () => window.open(`/i/${i.token}?preview=1`, "_blank", "noopener") } as MenuItem) : later("Preview as Client", "eye"),
    ...(canBill ? [later("Collect Signature", "signature")] : []),
    { label: "Print or Save PDF", icon: "pdf", onSelect: () => window.print() },
    ...(isAdmin && i.storedStatus === "Sent" ? [{ label: "Mark as Bad Debt", icon: "flag", onSelect: () => setDialog("debt") } as MenuItem] : []),
    ...(isAdmin && live && i.storedStatus !== "Draft" ? [{ label: "Void", icon: "stage", danger: true, onSelect: () => setDialog("void") } as MenuItem] : []),
    ...(isAdmin && (i.storedStatus === "Void" || i.storedStatus === "Bad debt") ? [{ label: "Reopen", icon: "history", onSelect: () => void setStatus({ id: i.id, status: "Reopen", now: clock() }).then(() => toast("Invoice reopened.")).catch((e) => fail(e, "The invoice could not be reopened.")) } as MenuItem] : []),
    ...(isAdmin && i.storedStatus === "Draft" ? [{ label: "Delete", icon: "trash", danger: true, onSelect: () => setDialog("delete") } as MenuItem] : []),
  ];
  const clientItems: MenuItem[] = c ? [{ label: "View client", onSelect: () => router.push(`/clients/${c.id}`) }] : [];
  const editable = canBill && i.storedStatus !== "Void" && i.storedStatus !== "Bad debt";
  const cityLine = c ? [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

  return (
    <div className="quote-shell fade-in">
      <div className={`quote-scroll${sideOpen ? "" : " wide"}`}>
        <div className="quote-head">
          <div className="qh-row">
            <div className="who">
              <span className="quote-mark" aria-hidden="true"><Icon name="receipt" size={22} /></span>
              <span className={`pill tag ${INVOICE_PILL[i.status]}`}><span className="dot" style={{ background: INVOICE_DOT[i.status] }} />{i.status}</span>
              <Link href="/invoices" className="btn link plain" style={{ marginLeft: 8 }}><Icon name="chevleft" size={18} /> All invoices</Link>
            </div>
            <div className="qh-actions">
              <button type="button" className="icon-btn" aria-label="View activity" title="View activity" onClick={() => setDialog("activity")}><Icon name="history" size={24} /></button>
              {canBill && i.storedStatus === "Draft" && <button className="btn primary" type="button" onClick={() => void openEmail()}><Icon name="mail" size={22} />Send as Email</button>}
              {canBill && i.storedStatus === "Sent" && i.balanceCents > 0 && <Link className="btn primary" href={`/payments/new?invoice=${i.id}`}><Icon name="card" size={22} />Collect Payment</Link>}
              <button className="btn more-btn" type="button" aria-label="More" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, moreItems, { alignRight: true, variant: "actions" })}>
                <Icon name="more" size={24} /><span className="lbl">More</span>
              </button>
            </div>
          </div>
          <div className="quote-title-row">
            <h1>{i.subject}</h1>
            {editable && <Link className="icon-btn" aria-label="Edit invoice" title="Edit invoice" href={`/invoices/${i.id}/edit`}><Icon name="pencil" size={24} /></Link>}
          </div>
          {i.storedStatus === "Void" && <div className="qp-banner bad" role="status"><b>This invoice is voided</b><span>It no longer counts toward what is owed. Any payment on it is back on the client as a deposit.</span></div>}
          {i.storedStatus === "Bad debt" && <div className="qp-banner warn" role="status"><b>This invoice was written off as bad debt</b><span>What was still owed no longer counts.</span></div>}
          {i.status === "Past due" && <div className="qp-banner bad" role="status"><b>Past due</b><span>{moneyCents(i.balanceCents)} was due {i.dueAt !== undefined ? utcDate(i.dueAt) : ""}.</span></div>}
        </div>

        <div className="main-col">
          <div className="quote-top">
            <section className="card quote-client">
              <div className="qc-head">
                <h3>{c ? <Link href={`/clients/${c.id}`}>{c.name}</Link> : "Client"}</h3>
                <button type="button" className="icon-btn" aria-label="More options" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, clientItems, { alignRight: true })}><Icon name="more" size={24} /></button>
              </div>
              <div className="qc-label">Billing Address</div>
              <address>
                {[c?.street1, c?.street2].filter(Boolean).map((line) => (<div key={line}>{line}</div>))}
                {cityLine && <div>{cityLine}</div>}
              </address>
              {c && (c.phone || c.email) && (
                <div className="qc-contact">
                  {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                </div>
              )}
            </section>
            <dl className="quote-facts">
              {facts.map(([label, value]) => (<div className="f" key={label}><dt>{label}</dt><dd>{value}</dd></div>))}
            </dl>
          </div>

          <section className="card panel quote-section">
            <div className="ph"><h3>Product / Service</h3></div>
            <div className="qs-body flush">
              <table className="table quote-lines">
                <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} />{d.schedule && <col style={{ width: 160 }} />}</colgroup>
                <thead>
                  <tr><th>Line Item</th><th className="num">Quantity</th><th className="num">Unit Price</th><th className="num">{d.schedule ? "Item Total" : "Total"}</th>{d.schedule && <th className="num">Due This Invoice</th>}</tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="ql-main">
                        <div className="ql-name"><b>{l.name}</b></div>
                        {l.description && <div className="ql-desc">{l.description}</div>}
                        {l.serviceDate !== undefined && <div className="ql-desc">Service date: {utcDate(l.serviceDate)}</div>}
                      </td>
                      <td className="num" data-label="Quantity">{l.quantity}</td>
                      <td className="num" data-label="Price">{moneyCents(l.unitPriceCents)}</td>
                      <td className="num" data-label="Total">{moneyCents(l.totalCents)}</td>
                      {d.schedule && <td className="num" data-label="Due">{moneyCents(l.dueCents ?? 0)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="quote-totals">
                <div><dt>Subtotal</dt><dd>{moneyCents(i.subtotalCents)}</dd></div>
                {i.discountCents > 0 && <div><dt>Discount{i.discountKind === "percent" ? ` (${i.discountValue}%)` : ""}</dt><dd>-{moneyCents(i.discountCents)}</dd></div>}
                {i.taxCents > 0 && <div><dt>Tax ({i.taxPercent}%)</dt><dd>{moneyCents(i.taxCents)}</dd></div>}
                <div className="grand"><dt>Total</dt><dd>{moneyCents(i.totalCents)}</dd></div>
                {d.payments.map((p) => (
                  <div key={`${p.id}-${p.paidAt}`} className="rule"><dt><Link href="/payments">Payment</Link> • {utcDate(p.paidAt)} • {p.method}{p.reference ? ` • ${p.reference}` : ""}</dt><dd>-{moneyCents(p.amountCents)}</dd></div>
                ))}
                <div className={d.payments.length ? "" : "rule"}><dt><b>Invoice balance</b></dt><dd><b>{moneyCents(i.balanceCents)}</b></dd></div>
                {i.clientView.accountBalance && <div><dt>Account balance</dt><dd>{moneyCents(d.accountBalanceCents)}</dd></div>}
              </dl>
            </div>
          </section>

          {d.schedule && (
            <section className="card panel quote-section">
              <div className="ph"><h3>Payment Schedule</h3>{d.project && <Link className="btn small" href={`/opportunities/${d.project.id}?tab=billing`}>Open billing</Link>}</div>
              <div className="qs-body flush">
                <table className="table inv-lines">
                  <colgroup><col style={{ width: 150 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 130 }} /></colgroup>
                  <thead><tr><th>Status</th><th className="num">% of Job</th><th>Description</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {d.schedule.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.thisInvoice ? <b>This Invoice</b> : r.invoice ? <Link href={`/invoices/${r.invoice.id}`}>#{r.invoice.number} · {r.invoice.status}</Link> : <span className="pill draft"><span className="dot" />Upcoming</span>}</td>
                        <td className="num">{d.schedule && d.schedule.totalCents > 0 ? `${Math.round((r.amountCents / d.schedule.totalCents) * 1000) / 10}%` : "—"}</td>
                        <td>{r.description}</td>
                        <td className="num">{moneyCents(r.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {i.clientMessage && (
            <section className="card panel quote-section"><div className="ph"><h3>Client Message</h3></div><div className="qs-body"><p className="qs-text">{i.clientMessage}</p></div></section>
          )}
          {i.contract && (
            <section className="card panel quote-section"><div className="ph"><h3>Contract / Disclaimer</h3></div><div className="qs-body"><p className="qs-text">{i.contract}</p></div></section>
          )}
        </div>
      </div>

      <button type="button" className="quote-toggle" aria-label={sideOpen ? "Hide notes" : "Show notes"} aria-expanded={sideOpen} title={sideOpen ? "Hide notes" : "Show notes"} onClick={() => writeItem(SIDE_KEY, sideOpen ? "1" : "0")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
          <path d={sideOpen ? "M8 9.5 10.5 12 8 14.5" : "M10.5 9.5 8 12l2.5 2.5"} />
        </svg>
      </button>

      <aside className={`quote-side${sideOpen ? "" : " closed"}`} aria-label="Notes" inert={!sideOpen}>
        <div className="quote-side-inner"><Notes d={d} /></div>
      </aside>

      {dialog === "email" && c && i.token && (
        <SendEmailDialog
          client={{ id: c.id, name: c.name, email: c.email }}
          preset={{
            subject: `Invoice #${i.number} from ${businessName}`,
            body: `Hi ${c.name},\n\nYour invoice #${i.number} (${i.subject}) for ${moneyCents(i.totalCents)} is ready. You can view it here:\n${typeof window === "undefined" ? "" : window.location.origin}/i/${i.token}\n\nThank you for your business.\n${businessName}`,
          }}
          onClose={() => { setDialog(null); if (params.get("email")) router.replace(`/invoices/${i.id}`); }}
        />
      )}
      {dialog === "activity" && <ActivityDialog events={d.events} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <ConfirmDialog title={`Delete invoice #${i.number}?`} lead="Only this draft is removed. A payment-schedule payment it was made from can be invoiced again, and any deposit applied to it goes back to the client." action="Delete invoice" onClose={() => setDialog(null)} onConfirm={async () => { await remove({ id: i.id }); toast(`Invoice #${i.number} was deleted.`); router.push("/invoices"); }} />}
      {dialog === "void" && <ConfirmDialog title={`Void invoice #${i.number}?`} lead="A voided invoice no longer counts toward what is owed. Money paid on it goes back to the client as a deposit that can be applied to another invoice. You can reopen it later." action="Void invoice" onClose={() => setDialog(null)} onConfirm={async () => { await setStatus({ id: i.id, status: "Void", now: clock() }); toast("Invoice voided."); }} />}
      {dialog === "debt" && <ConfirmDialog title={`Mark invoice #${i.number} as bad debt?`} lead={`The ${moneyCents(i.balanceCents)} still owed is written off and no longer counts. You can reopen the invoice later.`} action="Mark as bad debt" onClose={() => setDialog(null)} onConfirm={async () => { await setStatus({ id: i.id, status: "Bad debt", now: clock() }); toast("Invoice marked as bad debt."); }} />}
    </div>
  );
}

function Notes({ d }: { d: Doc }) {
  const { toast } = useUI();
  const add = useMutation(api.crm.invoices.addNote);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card quote-notes">
      <div className="qn-head"><h3>Notes</h3></div>
      {d.canBill && (
        <form
          className="pl-noteform"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            add({ id: d.invoice.id, text, now: clock() })
              .then(() => setText(""))
              .catch((err) => toast(failure(err, "The note could not be saved.")))
              .finally(() => setBusy(false));
          }}
        >
          <textarea className="cd-input" rows={4} value={text} disabled={busy} maxLength={2000} aria-label="Note" placeholder="Leave an internal note for yourself or a team member" onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}>{busy ? "Saving…" : "Save note"}</button>
        </form>
      )}
      {d.invoice.notes.length ? (
        [...d.invoice.notes].reverse().map((n, k) => (
          <div className="qn-item" key={`${n.at}-${k}`}>
            <div className="qn-who">
              <span className="qn-avatar" aria-hidden="true">{n.byName.slice(0, 1).toUpperCase()}</span>
              <div><b>{n.byName}</b><div className="muted">{quoteDateTime(n.at)}</div></div>
            </div>
            <p className="qs-text">{n.text}</p>
          </div>
        ))
      ) : (
        !d.canBill && <p className="muted">No notes yet.</p>
      )}
    </section>
  );
}

function ActivityDialog({ events, onClose }: { events: Doc["events"]; onClose: () => void }) {
  return (
    <PipelineModal title="Activity" onClose={onClose}>
      {(close) => (
        <>
          <ul className="qd-events">
            {events.map((e) => (
              <li key={e._id}><span><b>{LABEL[e.kind] ?? e.kind}</b>{e.detail ? ` · ${e.detail}` : ""}</span><small>{e.byName} · {quoteDateTime(e.at)}</small></li>
            ))}
          </ul>
          <div className="modal-foot"><button type="button" className="btn primary" onClick={close}>Close</button></div>
        </>
      )}
    </PipelineModal>
  );
}

function ConfirmDialog({ title, lead, action, onClose, onConfirm }: { title: string; lead: string; action: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <PipelineModal title={title} onClose={onClose} busy={busy}>
      {(close) => (
        <div>
          <p className="modal-lead">{lead}</p>
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onConfirm().then(close).catch((e) => { toast(failure(e, "That did not work. Try again.")); setBusy(false); });
              }}
            >
              {busy ? "Working…" : action}
            </button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
