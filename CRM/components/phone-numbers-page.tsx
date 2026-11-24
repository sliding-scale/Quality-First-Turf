"use client";

/* Settings → Phone numbers (plan 2026-11-19-messages, PRD 5.3: multiple business numbers): the numbers a business texts from. Admins only. A text
   goes out from the business's first number, and a text sent to one of them is filed under that business. Texting is live once the Twilio keys are
   set on the deployment and a number is here; the page says which of the two is missing. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/lib/clients";
import { useTextingStatus } from "@/lib/messages";
import { clock, failure } from "@/lib/pipeline";
import { ConfirmDelete } from "./confirm-delete";
import { PipelineModal } from "./pipeline-dialogs";
import { DisclaimersSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

/** The address Twilio posts received texts to: this deployment's `.convex.site` address, from its `.convex.cloud` one. */
const webhook = () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  return url ? `${url.replace(".convex.cloud", ".convex.site")}/twilio/sms` : "";
};

export function PhoneNumbersPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const allowed = staff.can("settings");
  const numbers = useQuery(api.crm.phoneNumbers.list, businessId && allowed ? { businessId } : "skip");
  const status = useTextingStatus(businessId, allowed);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: Id<"phoneNumbers">; display: string } | null>(null);
  const remove = useMutation(api.crm.phoneNumbers.remove);

  if (!allowed) {
    return (
      <div className="empty-state">
        <h2>Only Admins can manage phone numbers</h2>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !businessId || numbers === undefined) return <DisclaimersSkeleton />;

  return (
    <div className="fade-in dc">
      <div className="page-head">
        <h1>Phone numbers</h1>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>Add number</button>
      </div>
      <p className="au-lead">The numbers {ws.state === "ready" ? ws.business.name : "this business"} texts from. A text goes out from the first number, and a text sent to any of them is kept in Messages under this business. A number belongs to one business only.</p>

      <div className={`msg-note${status?.connected ? " ok" : ""}`} role="status">
        {status === undefined ? "Checking…" : status.connected
          ? "Texting is connected: texts go out through Twilio from the first number below."
          : !status.keysSet
            ? "Texting is not connected: the Twilio account keys are not set on this deployment. Until then texts are logged as sent by hand."
            : "The Twilio keys are set, but this business has no number yet. Add one to start sending."}
      </div>

      {numbers.length === 0 ? (
        <div className="card dc-empty">No numbers yet. Add the first one.</div>
      ) : (
        <ul className="dc-list">
          {numbers.map((n, i) => (
            <li key={n.id} className="card dc-item">
              <div className="dc-body"><h3>{n.display}{i === 0 && <span className="pill active cat-off"><span className="dot" />Sends from this</span>}</h3><p>{n.label || "No label"}</p></div>
              <div className="dc-actions">
                <button type="button" className="btn danger" onClick={() => setRemoving({ id: n.id as Id<"phoneNumbers">, display: n.display })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="card cat-card">
        <h2>Receiving texts</h2>
        <p className="muted">In the Twilio console, set each number&apos;s messaging webhook (when a message comes in, HTTP POST) to:</p>
        <p><code>{webhook() || "this deployment's .convex.site address + /twilio/sms"}</code></p>
        <p className="muted">The keys are set once on the deployment, as the environment variables TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.</p>
      </section>

      {adding && <AddNumber businessId={businessId} onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmDelete
          title="Remove this number?"
          note={`${removing.display} is removed from this business's numbers. Texts already sent and received stay in the log, and you can add the number again later.`}
          confirmLabel="Remove"
          doneMessage="Number removed."
          failMessage="That could not be removed."
          action={() => remove({ id: removing.id })}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function AddNumber({ businessId, onClose }: { businessId: Id<"businesses">; onClose: () => void }) {
  const { toast } = useUI();
  const add = useMutation(api.crm.phoneNumbers.add);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (number.replace(/\D/g, "").length < 10) {
      document.getElementById("pn-number")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await add({ businessId, number, label, now: clock() });
      toast("Number added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  const bad = tried && number.replace(/\D/g, "").length < 10;
  return (
    <PipelineModal title="Add a number" onClose={onClose} busy={busy} className="au-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="pn-number">Phone number</label>
            <input id="pn-number" inputMode="tel" aria-invalid={bad} placeholder="(555) 123-4567" value={number} onChange={(e) => setNumber(e.target.value)} autoFocus />
            <span className="err">Enter the number with its area code.</span>
          </div>
          <div className="field"><label htmlFor="pn-label">Label (optional)</label><input id="pn-label" maxLength={60} placeholder="Main line, Install crew…" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Add"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
