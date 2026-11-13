"use client";

/* The pop-ups on the staff quote page (D-063): the client link (Send), Collect Signature, Record deposit, the Activity list, and the
   Closed Won refusal (which can open the quote). Email and text delivery are not built: the client moved to Zoho Workspace, and those
   come with that connection, so Send gives the link to copy and an email draft to finish by hand. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { centsToInput, dollarsToCents, uploadFile, useQuoteEvents, useQuoteRevisions } from "@/lib/quotes";
import { quoteDate, quoteDateTime } from "@/lib/format";
import { inputParts } from "@/lib/schedule";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { SignaturePad } from "./signature-pad";
import { useUI } from "./ui-provider";
import { NoteEditor } from "./note-editor";

export const clientLink = (token: string) => `${window.location.origin}/q/${token}`;

export function SendDialog({ token, revision, clientName, clientEmail, title, onClose }: { token: string; revision: number; clientName: string; clientEmail: string; title: string; onClose: () => void }) {
  const { toast } = useUI();
  const link = clientLink(token);
  const subject = encodeURIComponent(`Your quote: ${title}`);
  const body = encodeURIComponent(`Hi ${clientName.split(" ")[0]},\n\nHere is your quote. You can read it, ask for changes or approve it with your signature here:\n${link}\n\nThank you.`);
  return (
    <PipelineModal title="Client link" onClose={onClose}>
      {(close) => (
        <div>
          <p className="modal-lead">The quote is now waiting for the client{revision > 1 ? ` (revision ${revision})` : ""}. Share this link with {clientName}. They can read the quote, ask for changes, decline, or approve it with a signature.</p>
          <div className="qd-link">
            <input readOnly aria-label="The client's link" value={link} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn primary"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast("The link is copied."), () => toast("Select the link and copy it by hand."))}
            >
              <Icon name="duplicate" size={16} /> Copy link
            </button>
          </div>
          <div className="qd-actions">
            <a className="btn" href={`mailto:${clientEmail}?subject=${subject}&body=${body}`}><Icon name="mail" size={16} /> Open an email draft</a>
            <a className="btn" href={link} target="_blank" rel="noreferrer"><Icon name="newtab" size={16} /> Open the client page</a>
          </div>
          <p className="sc-muted" style={{ marginTop: 12 }}>Sending email and texts from the CRM comes with the Zoho connection. Until then, paste the link into your own message.</p>
          <div className="modal-foot"><button type="button" className="btn plain" onClick={close}>Done</button></div>
        </div>
      )}
    </PipelineModal>
  );
}

export function SignDialog({ quoteId, businessId, defaultName, onClose }: { quoteId: Id<"quotes">; businessId: Id<"businesses">; defaultName: string; onClose: () => void }) {
  const upload = useMutation(api.crm.quoteDraft.uploadUrl);
  const collect = useMutation(api.crm.quoteFlow.collectSignature);
  const { toast } = useUI();
  const [name, setName] = useState(defaultName);
  const [png, setPng] = useState<Blob | null>(null);
  const [bad, setBad] = useState<{ name?: boolean; sig?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Collect Signature" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const next = { name: !name.trim(), sig: !png };
            setBad(next);
            if (next.name || next.sig) return;
            setBusy(true);
            setError("");
            try {
              const id = await uploadFile(await upload({ businessId }), new File([png!], "signature.png", { type: "image/png" }));
              await collect({ id: quoteId, signedBy: name, signatureStorageId: id, now: clock() });
              toast("The quote is approved and signed.");
              close();
            } catch (err) {
              setError(failure(err, "The signature could not be saved. Try again."));
              setBusy(false);
            }
          }}
        >
          <p className="modal-lead">The client signs here, on this device. Signing approves the quote.</p>
          <div className={`field${bad.name ? " bad" : ""}`}>
            <label htmlFor="sg-name">Name of the person signing</label>
            <input id="sg-name" aria-invalid={!!bad.name} value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setBad((b) => ({ ...b, name: false })); }} />
            <span className="err">Type the name of the person signing.</span>
          </div>
          <div className={`field${bad.sig ? " bad" : ""}`} style={{ marginTop: 12 }}>
            <label>Signature</label>
            <SignaturePad onChange={(b) => { setPng(b); setBad((x) => ({ ...x, sig: false })); }} />
            <span className="err">Sign in the box.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save signature"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

export function DepositDialog({ quoteId, businessId, outstandingCents, onClose }: { quoteId: Id<"quotes">; businessId: Id<"businesses">; outstandingCents: number; onClose: () => void }) {
  const upload = useMutation(api.crm.quoteDraft.uploadUrl);
  const record = useMutation(api.crm.quoteFlow.recordDeposit);
  const { toast } = useUI();
  const [amount, setAmount] = useState(outstandingCents > 0 ? centsToInput(outstandingCents) : "");
  const [date, setDate] = useState(() => inputParts(clock()).date);
  const [file, setFile] = useState<File | null>(null);
  const [bad, setBad] = useState<{ amount?: boolean; file?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Record deposit received" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const cents = dollarsToCents(amount);
            const fileBad = !!file && !(file.type === "application/pdf" || file.type.startsWith("image/"));
            setBad({ amount: !(cents > 0), file: fileBad });
            if (!(cents > 0) || fileBad) return;
            setBusy(true);
            setError("");
            try {
              const proof = file ? await uploadFile(await upload({ businessId }), file) : undefined;
              await record({ id: quoteId, amountCents: cents, receivedAt: new Date(`${date}T12:00:00`).getTime(), ...(proof ? { proofStorageId: proof, proofName: file!.name } : {}) });
              toast("The deposit is recorded.");
              close();
            } catch (err) {
              setError(failure(err, "The deposit could not be recorded. Try again."));
              setBusy(false);
            }
          }}
        >
          <div className="qd-two">
            <div className={`field${bad.amount ? " bad" : ""}`}>
              <label htmlFor="dp-amt">Amount received</label>
              <input id="dp-amt" inputMode="decimal" aria-invalid={!!bad.amount} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.,$]/g, "")); setBad((b) => ({ ...b, amount: false })); }} />
              <span className="err">Enter the amount, more than zero.</span>
            </div>
            <div className="field"><label htmlFor="dp-date">Date received</label><input id="dp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className={`field${bad.file ? " bad" : ""}`} style={{ marginTop: 12 }}>
            <label htmlFor="dp-file">Proof of payment (optional)</label>
            <input id="dp-file" type="file" accept="application/pdf,image/*" aria-invalid={!!bad.file} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setBad((b) => ({ ...b, file: false })); }} />
            <span className="err">The proof has to be a PDF or an image.</span>
          </div>
          {outstandingCents > 0 && <p className="sc-muted" style={{ marginTop: 10 }}>Still to receive: {money(outstandingCents / 100)}.</p>}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Record deposit"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created", sent: "Sent to the client", resubmitted: "Resubmitted", link: "Client link created", awaiting: "Marked as awaiting response", viewed: "Viewed by the client",
  changes: "Changes requested", approved: "Approved", rejected: "Declined", signed: "Signed", deposit: "Deposit received", archived: "Archived",
};

export function ActivityDialog({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const events = useQuoteEvents(quoteId);
  const revisions = useQuoteRevisions(quoteId);
  return (
    <PipelineModal title="Activity" onClose={onClose}>
      {(close) => (
        <div>
          {events === undefined ? (
            <div className="sk" style={{ height: 80 }} />
          ) : (
            <ol className="qd-events">
              {[...events].reverse().map((e) => (
                <li key={e._id}>
                  <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
                  <span>{e.detail}</span>
                  <small>{e.byName} · {quoteDateTime(e.at)}</small>
                </li>
              ))}
            </ol>
          )}
          {revisions && revisions.length > 0 && (
            <>
              <h3 className="qd-h">Versions sent</h3>
              <ul className="qd-revs">
                {revisions.map((r) => (
                  <li key={r._id}>Revision {r.revision} · {quoteDate(r.sentAt)} · {money(r.snapshot.totalCents / 100)} · {r.snapshot.lines.filter((l) => l.kind === "item").length} lines</li>
                ))}
              </ul>
            </>
          )}
          <div className="modal-foot"><button type="button" className="btn plain" onClick={close}>Close</button></div>
        </div>
      )}
    </PipelineModal>
  );
}

/** Closed Won was refused (it needs the quote signed, and the deposit when one is asked for). Offers to open the quote at once. */
export function WonRefusedDialog({ message, quoteId, onClose }: { message: string; quoteId?: string; onClose: () => void }) {
  return (
    <PipelineModal title="Cannot close as won yet" onClose={onClose}>
      {(close) => (
        <div>
          <p className="modal-lead">{message}</p>
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close}>Not now</button>
            {quoteId ? <Link className="btn primary" href={`/quotes/${quoteId}`}>Open the quote</Link> : <Link className="btn primary" href="/quotes/new">Make a quote</Link>}
          </div>
        </div>
      )}
    </PipelineModal>
  );
}

/** An internal note on the quote, with an optional file. */
export function NoteDialog({ quoteId, businessId, onClose }: { quoteId: Id<"quotes">; businessId: Id<"businesses">; onClose: () => void }) {
  const upload = useMutation(api.crm.quoteDraft.uploadUrl);
  const add = useMutation(api.crm.quoteDraft.addNote);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title="Add a note" onClose={onClose} busy={busy}>
      {(close) => (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() && !file) { setBad(true); return; }
            setBusy(true);
            setError("");
            try {
              const id = file ? await uploadFile(await upload({ businessId }), file) : undefined;
              await add({ quoteId, text, ...(id ? { attachmentId: id, attachmentName: file!.name } : {}) });
              close();
            } catch (err) {
              setError(failure(err, "The note could not be saved. Try again."));
              setBusy(false);
            }
          }}
        >
          <div className={`field${bad ? " bad" : ""}`}>
            <label htmlFor="nt-text">Leave an internal note for yourself or a team member</label>
            <NoteEditor id="nt-text" noFiles rows={6} value={text} onChange={(t) => { setText(t); setBad(false); }} files={[]} onFiles={() => undefined} />
            <span className="err">Write a note or add a file.</span>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="nt-file">A file (PDF or image, optional)</label>
            <input id="nt-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save note"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
