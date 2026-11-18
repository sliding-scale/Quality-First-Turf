"use client";

/* Settings > Invoices (design 2026-11-18-finance): each business's invoice defaults and the review link used at Get Client Review. An Admin
   edits them; anyone in the business can read them. These stand in for the client's own wording until they send it (golden rule, D-091). */

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { PAYMENT_TERMS, useInvoiceSettings } from "@/lib/invoices";
import { failure } from "@/lib/pipeline";
import { EmptyBackend } from "./empty-backend";
import { SettingsFormSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function InvoiceSettingsPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <SettingsFormSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Settings business={workspace.business} />;
}

function Settings({ business }: { business: BusinessDoc }) {
  const settings = useInvoiceSettings(business._id);
  if (settings === undefined) return <SettingsFormSkeleton />;
  return <Form business={business} settings={settings} />;
}

function Form({ business, settings }: { business: BusinessDoc; settings: NonNullable<ReturnType<typeof useInvoiceSettings>> }) {
  const { isAdmin } = useStaff();
  const { toast } = useUI();
  const save = useMutation(api.crm.invoiceSettings.save);
  const [terms, setTerms] = useState(settings.defaultTermsKey);
  const [message, setMessage] = useState(settings.defaultClientMessage);
  const [contract, setContract] = useState(settings.defaultContract);
  const [review, setReview] = useState(settings.reviewLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({ businessId: business._id, defaultTermsKey: terms, defaultClientMessage: message, defaultContract: contract, reviewLink: review });
      toast("Invoice settings saved.");
    } catch (e) {
      setError(failure(e, "The settings could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qb fade-in">
      <div className="qb-top"><h1>Invoice settings</h1></div>
      <p className="sc-muted">For {business.name}. New invoices start with these. {isAdmin ? "" : "Only an Admin can change them."}</p>
      {error && <p className="qb-error" role="alert">{error}</p>}
      <section className="qb-card">
        <div className="field">
          <label htmlFor="is-terms">Default payment terms</label>
          <select id="is-terms" disabled={!isAdmin} value={terms} onChange={(e) => setTerms(e.target.value)}>
            {PAYMENT_TERMS.filter((t) => t.key !== "custom").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="is-msg">Default client message</label><textarea id="is-msg" disabled={!isAdmin} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div className="field"><label htmlFor="is-contract">Default contract / disclaimer</label><textarea id="is-contract" disabled={!isAdmin} maxLength={5000} value={contract} onChange={(e) => setContract(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="is-review">Review link</label>
          <input id="is-review" disabled={!isAdmin} maxLength={500} placeholder="https://g.page/r/..." value={review} onChange={(e) => setReview(e.target.value)} />
          <span className="sc-muted">The link a card in Get Client Review copies, to send the client (for example a Google review link).</span>
        </div>
      </section>
      {isAdmin && (
        <div className="qb-bar">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
    </div>
  );
}
