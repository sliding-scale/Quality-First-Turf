"use client";

/* The dialogs and helpers behind the job page's More menu (plan 2026-11-19-jobs-extras): Collect Signature, Delete, the job costs CSV, and the
   words of the follow-up email, the booking confirmation email and the booking text. Nothing here is sent by the CRM itself except the emails,
   which go through the existing Zoho sender (SendEmailDialog); a text is opened in the phone's messaging app until texting is registered (D-091). */

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate, quoteTime } from "@/lib/format";
import { utcDate } from "@/lib/invoices";
import { clock, failure } from "@/lib/pipeline";
import { uploadFile } from "@/lib/quotes";
export { openText } from "@/lib/sms";
import type { JobCosts } from "./job-costs";
import { PipelineModal } from "./pipeline-dialogs";
import { SignaturePad } from "./signature-pad";
import { useUI } from "./ui-provider";

export type Job = NonNullable<FunctionReturnType<typeof api.crm.jobs.get>>;

const dateTime = (ms: number) => `${quoteDate(ms)} at ${quoteTime(ms)}`;

/* ---- The words ---- */

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function followUpEmail(job: Job, from: string) {
  return {
    subject: `Following up on your ${job.title}`,
    body: `Hi ${firstName(job.client.name)},\n\nThank you for choosing us for your ${job.title}. If there is anything we missed, or anything you would like us to look at again, just reply to this email.\n\nThank you,\n${from}`,
  };
}

/** The booking confirmation for the job's next visit, or null when there is none to confirm. */
export function bookingMessage(job: Job, from: string): { subject: string; body: string; text: string } | null {
  const now = Date.now();
  const next = job.visits.find((v) => (v.status === "upcoming" || v.status === "confirmed") && v.start >= now - 60_000) ?? job.visits.find((v) => v.status === "upcoming" || v.status === "confirmed");
  if (!next) return null;
  const when = next.anytime ? `${quoteDate(next.start)} (anytime that day)` : dateTime(next.start);
  const where = job.property ? ` at ${job.property}` : "";
  return {
    subject: `Your visit is booked for ${quoteDate(next.start)}`,
    body: `Hi ${firstName(job.client.name)},\n\nThis is to confirm your visit for ${job.title}${where} on ${when}.\n\nIf you need to change it, just reply to this email.\n\nThank you,\n${from}`,
    text: `Hi ${firstName(job.client.name)}, this is to confirm your visit for ${job.title} on ${when}. Reply here if you need to change it. ${from}`,
  };
}

/* ---- The job costs CSV ---- */

const csv = (s: string | number) => {
  const t = String(s);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const d2 = (cents: number) => (cents / 100).toFixed(2);

/** The job's lines with their costs, then its Labor and Expenses, as a file the person downloads. */
export function jobCostsCsv(job: Job, costs: JobCosts): string {
  const rows: (string | number)[][] = [
    [`Job #${job.jobNumber}`, job.title, job.client.name],
    [],
    ["Product / Service", "Line item", "Quantity", "Unit cost", "Unit price", "Total cost", "Total price"],
    ...job.lines.map((l, i) => {
      const unit = costs.unitCosts[i];
      return ["Line", l.name, l.quantity, unit == null ? "" : d2(unit), d2(l.unitPriceCents), unit == null ? "" : d2(Math.round(l.quantity * unit)), d2(Math.round(l.quantity * l.unitPriceCents))];
    }),
    [],
    ["Labor", "Employee", "Date", "Start", "End", "Minutes", "Cost per hour", "Cost"],
    ...costs.time.map((t) => ["Labor", t.employeeName, quoteDate(t.startAt), quoteTime(t.startAt), quoteTime(t.endAt), t.minutes, d2(t.costPerHourCents), d2(t.costCents)]),
    [],
    ["Expenses", "Item", "Date", "Description", "Total"],
    ...costs.expenses.map((x) => ["Expense", x.name, utcDate(x.date), x.description, d2(x.totalCents)]),
    [],
    ["Revenue", d2(job.totalCents)],
    ["Lines cost", d2(costs.linesCostCents)],
    ["Labor cost", d2(costs.laborCents)],
    ["Expenses", d2(costs.expensesCents)],
    ["Total cost", d2(costs.costCents)],
    ["Profit", d2(job.totalCents - costs.costCents)],
  ];
  return rows.map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n";
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const costsFileName = (job: Job) => `job-${job.jobNumber}-costs.csv`;
export const money = moneyCents;

/* ---- Collect Signature ---- */

export function SignatureDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { toast } = useUI();
  const uploadUrl = useMutation(api.crm.jobs.signatureUploadUrl);
  const save = useMutation(api.crm.jobs.saveSignature);
  const [name, setName] = useState(job.client.name);
  const [png, setPng] = useState<Blob | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(close: () => void) {
    setTried(true);
    if (!name.trim() || !png) return;
    setBusy(true);
    setError("");
    try {
      const storageId = await uploadFile(await uploadUrl({ id: job.id }), new File([png], "signature.png", { type: "image/png" }));
      await save({ id: job.id, signedBy: name, signatureStorageId: storageId as Id<"_storage">, now: clock() });
      toast("Signature saved.");
      close();
    } catch (e) {
      setError(failure(e, "The signature could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="Collect signature" onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <div className="cat-fields">
          <p className="muted">The customer signs below for job #{job.jobNumber}, {job.title}.</p>
          <div className={`field${tried && !name.trim() ? " bad" : ""}`}>
            <label htmlFor="sg-name">Signed by</label>
            <input id="sg-name" aria-invalid={tried && !name.trim()} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            <span className="err">Enter the name of the person who signed.</span>
          </div>
          <div className={`field${tried && !png ? " bad" : ""}`}>
            <SignaturePad onChange={setPng} />
            <span className="err">The signature box is empty.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void submit(close)} disabled={busy}>{busy ? "Saving…" : "Save signature"}</button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}

/* ---- Delete ---- */

export function DeleteJobDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { toast } = useUI();
  const router = useRouter();
  const remove = useMutation(api.crm.jobs.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <PipelineModal title={`Delete job #${job.jobNumber}?`} onClose={onClose} busy={busy}>
      {(close) => (
        <div>
          <p className="modal-note">&ldquo;{job.title}&rdquo; is deleted with its visits, notes, time, expenses and history. This cannot be undone. A job that has a quote, an invoice or a payment cannot be deleted; close it instead.</p>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                remove({ id: job.id }).then(() => { toast("Job deleted."); router.push("/jobs"); }).catch((e) => { setError(failure(e, "That could not be deleted.")); setBusy(false); });
              }}
            >
              Delete job
            </button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
