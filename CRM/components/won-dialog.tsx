"use client";

/* "Close as won" (D-063). Instead of an error, closing a project as won opens this checklist: the signed contract (required: it is met by
   the project's quote being approved and signed, or by uploading the signed contract here), the deposit when a signed quote asks for one,
   and an invoice (optional). Mark as won turns on once the required things are done. The server checks the same rules again. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { money } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { uploadFile } from "@/lib/quotes";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";

const OK_TYPES = "application/pdf,image/*";

export function CloseWonDialog({ projectId, businessId, title, onClose }: { projectId: Id<"opportunities">; businessId: Id<"businesses">; title: string; onClose: () => void }) {
  const { toast } = useUI();
  const req = useQuery(api.crm.pipeline.wonRequirements, { id: projectId });
  const uploadUrl = useMutation(api.crm.pipeline.uploadUrl);
  const attachContract = useMutation(api.crm.pipeline.attachContract);
  const attachInvoice = useMutation(api.crm.pipeline.attachInvoice);
  const markOutcome = useMutation(api.crm.pipeline.markOutcome);
  const contractInput = useRef<HTMLInputElement>(null);
  const invoiceInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "contract" | "invoice" | "won">(null);
  const [error, setError] = useState("");
  const [badContract, setBadContract] = useState(false);

  async function upload(kind: "contract" | "invoice", file: File | undefined) {
    if (!file) return;
    if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
      setError(`The ${kind} has to be a PDF or an image.`);
      if (kind === "contract") setBadContract(true);
      return;
    }
    setBusy(kind);
    setError("");
    setBadContract(false);
    try {
      const storageId = await uploadFile(await uploadUrl({ businessId }), file);
      if (kind === "contract") await attachContract({ id: projectId, storageId, name: file.name, now: clock() });
      else await attachInvoice({ id: projectId, storageId, name: file.name });
    } catch (e) {
      setError(failure(e, `The ${kind} could not be uploaded. Try again.`));
    }
    setBusy(null);
  }

  async function confirm(close: () => void) {
    if (!req) return;
    if (!req.contract.ok) {
      setBadContract(true);
      setError("Upload the signed contract first. It is required.");
      return;
    }
    setBusy("won");
    setError("");
    try {
      await markOutcome({ id: projectId, outcome: "won", now: clock() });
      toast(`${title} was marked as won.`);
      close();
    } catch (e) {
      setError(failure(e, "The project could not be marked as won. Try again."));
      setBusy(null);
    }
  }

  return (
    <PipelineModal title="Close as won" onClose={onClose} busy={busy !== null}>
      {(close) => (
        <div className="wd">
          <p className="modal-lead">{title}</p>
          {req === undefined ? (
            <div className="sk" style={{ height: 120 }} />
          ) : (
            <>
              <section className={`wd-row${req.contract.ok ? " ok" : badContract ? " bad" : ""}`}>
                <div className="wd-head">
                  <span className="wd-mark" aria-hidden="true">{req.contract.ok ? <Icon name="check" size={16} /> : "!"}</span>
                  <div>
                    <b>Signed contract <small>Required</small></b>
                    {req.contract.ok && req.contract.via === "quote" && (
                      <p>Quote #{req.contract.quoteNumber} is approved and signed. {req.contract.quoteId && <Link href={`/quotes/${req.contract.quoteId}`}>Open the quote</Link>}</p>
                    )}
                    {req.contract.ok && req.contract.via === "upload" && (
                      <p>Uploaded: {req.contract.url ? <a href={req.contract.url} target="_blank" rel="noreferrer">{req.contract.name}</a> : req.contract.name}</p>
                    )}
                    {!req.contract.ok && (
                      <p>
                        Upload the signed contract (a PDF or an image).
                        {req.contract.quoteId && <> Or <Link href={`/quotes/${req.contract.quoteId}`}>open quote #{req.contract.quoteNumber}</Link> to collect the signature.</>}
                      </p>
                    )}
                  </div>
                </div>
                <input ref={contractInput} type="file" accept={OK_TYPES} hidden onChange={(e) => { void upload("contract", e.target.files?.[0]); e.target.value = ""; }} />
                {req.contract.via !== "quote" && (
                  <button type="button" className={`btn${req.contract.ok ? "" : " primary"}`} disabled={busy !== null} onClick={() => contractInput.current?.click()}>
                    <Icon name="upload" size={16} /> {busy === "contract" ? "Uploading…" : req.contract.ok ? "Replace" : "Upload the contract"}
                  </button>
                )}
              </section>

              {req.deposit.required && (
                <section className={`wd-row${req.deposit.ok ? " ok" : " bad"}`}>
                  <div className="wd-head">
                    <span className="wd-mark" aria-hidden="true">{req.deposit.ok ? <Icon name="check" size={16} /> : "!"}</span>
                    <div>
                      <b>Deposit received <small>Required</small></b>
                      <p>
                        {req.deposit.ok ? "The deposit is in." : `Still to receive: ${money(req.deposit.outstandingCents / 100)}.`}{" "}
                        {req.deposit.quoteId && <Link href={`/quotes/${req.deposit.quoteId}`}>{req.deposit.ok ? "Open the quote" : "Open the quote to record it"}</Link>}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <section className={`wd-row${req.invoice ? " ok" : ""}`}>
                <div className="wd-head">
                  <span className="wd-mark" aria-hidden="true">{req.invoice ? <Icon name="check" size={16} /> : "–"}</span>
                  <div>
                    <b>Invoice <small>Optional</small></b>
                    <p>{req.invoice ? <>Uploaded: {req.invoice.url ? <a href={req.invoice.url} target="_blank" rel="noreferrer">{req.invoice.name}</a> : req.invoice.name}</> : "You can attach the invoice now, or leave it."}</p>
                  </div>
                </div>
                <input ref={invoiceInput} type="file" accept={OK_TYPES} hidden onChange={(e) => { void upload("invoice", e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" className="btn" disabled={busy !== null} onClick={() => invoiceInput.current?.click()}>
                  <Icon name="upload" size={16} /> {busy === "invoice" ? "Uploading…" : req.invoice ? "Replace" : "Upload the invoice"}
                </button>
              </section>
            </>
          )}
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy !== null}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy !== null || req === undefined || !req.canClose} onClick={() => void confirm(close)}>
              {busy === "won" ? "Saving…" : "Mark as won"}
            </button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
