"use client";

/* One payment, laid out like Jobber's Payment Details: its status, the amount, the client, and the details (when, how, what it was applied to),
   with Send Receipt and a More menu. Nothing here changes the payment: money is recorded in Collect Payment and on the quote or invoice. */

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate } from "@/lib/format";
import { useWorkspace } from "@/lib/clients";
import { SendEmailDialog } from "./client-dialogs";
import { Icon } from "./icon";
import { PaymentSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function PaymentPage({ id }: { id: string }) {
  const p = useQuery(api.crm.payments.get, { id: id as Id<"payments"> });
  if (p === undefined) return <PaymentSkeleton />;
  if (p === null) {
    return (
      <div className="empty-state">
        <h2>Payment not found</h2>
        <p>This payment does not exist, or it was removed.</p>
        <Link className="btn primary" href="/payments">Back to payments</Link>
      </div>
    );
  }
  return <PaymentView p={p} />;
}

type Doc = NonNullable<ReturnType<typeof useQuery<typeof api.crm.payments.get>>>;

function PaymentView({ p }: { p: Doc }) {
  const { dropdown } = useUI();
  const { canEdit } = useStaff();
  const router = useRouter();
  const workspace = useWorkspace();
  const [emailing, setEmailing] = useState(false);
  const businessName = workspace.state === "ready" ? (workspace.businesses.find((b) => b._id === p.businessId)?.name ?? workspace.business.name) : "";
  const c = p.client;
  const appliedTo: { key: string; label: string; href: string }[] = [
    ...(p.quote ? [{ key: "q", label: `Quote #${p.quote.number}`, href: `/quotes/${p.quote.id}` }] : []),
    ...p.invoices.map((i) => ({ key: i.invoiceId, label: `Invoice #${i.number}`, href: `/invoices/${i.invoiceId}` })),
  ];
  const address = c ? [[c.street1, c.street2].filter(Boolean).join(", "), [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean) : [];
  const receipt = `Hi ${c?.name.split(" ")[0] ?? "there"},\n\nThank you. We received your payment of ${moneyCents(p.amountCents)} by ${p.method.toLowerCase()} on ${quoteDate(p.paidAt)}${appliedTo.length ? ` (${appliedTo.map((a) => a.label).join(", ")})` : ""}.\n\nThank you for your business.\n${businessName}`;

  return (
    <div className="page fade-in pay-page">
      <div className="pay-head">
        <div className="who">
          <Link className="back" href="/payments"><Icon name="chevleft" size={18} /> All payments</Link>
        </div>
        <div className="qh-actions">
          <button
            className="btn more-btn"
            type="button"
            aria-label="More"
            aria-haspopup="menu"
            onClick={(e) => dropdown(e.currentTarget, [
              { label: "View client", icon: "clients", onSelect: () => router.push(`/clients/${p.clientId}`) },
              { label: "Print or Save PDF", icon: "pdf", onSelect: () => window.print() },
            ], { alignRight: true, variant: "actions" })}
          >
            <Icon name="more" size={24} /><span className="lbl">More</span>
          </button>
          {canEdit && <button className="btn primary" type="button" disabled={!c?.email} data-tip={c?.email ? undefined : "This client has no email address"} onClick={() => setEmailing(true)}>Send Receipt</button>}
        </div>
      </div>

      <div className="pay-status"><span className="pill active"><span className="dot" />Succeeded</span></div>
      <h1 className="pay-amount">{moneyCents(p.amountCents)}</h1>

      {c && (
        <section className="card pay-client" aria-label="Client">
          <h3><Link href={`/clients/${p.clientId}`}>{c.name}</Link></h3>
          {address.map((line) => <div key={line}>{line}</div>)}
          {(c.phone || c.email) && (
            <div className="pay-contact">
              {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            </div>
          )}
        </section>
      )}

      <section className="pay-details" aria-label="Details">
        <h2>Details</h2>
        <dl>
          <div><dt>Transaction date</dt><dd>{quoteDate(p.paidAt)}</dd></div>
          <div><dt>Method</dt><dd>{p.method}</dd></div>
          {p.details && <div><dt>Details</dt><dd>{p.details}</dd></div>}
          {p.reference && p.source !== "quote deposit" && <div><dt>Reference</dt><dd>{p.reference}</dd></div>}
          <div>
            <dt>Applied to</dt>
            <dd>{appliedTo.length ? appliedTo.map((a, i) => <span key={a.key}>{i > 0 && ", "}<Link href={a.href}>{a.label}</Link></span>) : "Not applied to anything yet"}</dd>
          </div>
          {p.unappliedCents > 0 && p.invoices.length > 0 && <div><dt>Not yet applied to an invoice</dt><dd>{moneyCents(p.unappliedCents)}</dd></div>}
        </dl>
      </section>

      {emailing && c && (
        <SendEmailDialog
          client={{ id: p.clientId, name: c.name, email: c.email }}
          preset={{ subject: `Receipt for your payment of ${moneyCents(p.amountCents)} from ${businessName}`, body: receipt }}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}
