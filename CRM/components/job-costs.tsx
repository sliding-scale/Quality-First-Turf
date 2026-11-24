"use client";

/* A job's Labor and Expenses cards and their dialogs (plan 2026-11-19-jobs-costs), in Jobber's layout: "New time entry" (Employee, cost per hour,
   Start Date, Start and End time, Hours and Minutes, Notes) and "New expense" (Date, Item name, Description, Total, Accounting code, Reimburse to,
   Receipt). The backend (convex/crm/jobCosts.ts) checks everything again and works out every cost. Nothing is flagged red until Save (D-035). */

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { laborCostCents, minutesBetween } from "@/convex/crm/lib/jobCosts";
import { moneyCents, quoteDate, quoteTime } from "@/lib/format";
import { inputToUtc, todayInput, utcDate, utcToInput } from "@/lib/invoices";
import { clock, failure } from "@/lib/pipeline";
import { uploadFile } from "@/lib/quotes";
import { fromInputs, inputParts } from "@/lib/schedule";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";

export type JobCosts = NonNullable<FunctionReturnType<typeof api.crm.jobCosts.get>>;
type Person = { id: string; name: string };
const dollars = (cents: number) => (cents / 100).toFixed(2);
const timeLabel = quoteTime;
const hoursText = (minutes: number) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
const LATER = "Reading a receipt for you needs a service that is not set up yet";

/* ---- Labor ---- */

export function LaborCard({ jobId, costs, people, canEdit }: { jobId: Id<"opportunities">; costs: JobCosts; people: Person[] | undefined; canEdit: boolean }) {
  const { toast } = useUI();
  const remove = useMutation(api.crm.jobCosts.removeTime);
  const [editing, setEditing] = useState<JobCosts["time"][number] | "new" | null>(null);
  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Labor</h2>
        {costs.time.length > 0 && canEdit && <button type="button" className="cj-link" onClick={() => setEditing("new")}>Add Time Entry</button>}
      </div>
      {costs.time.length === 0 ? (
        <div className="job-empty"><Icon name="timeline" size={20} /><span>Time tracked to this job will show here</span>{canEdit ? <button type="button" className="cj-link" onClick={() => setEditing("new")}>Add Time Entry</button> : null}</div>
      ) : (
        <div className="op-scroll">
          <table className="table op-table">
            <colgroup><col /><col style={{ width: 170 }} /><col style={{ width: 80 }} /><col style={{ width: 110 }} /><col style={{ width: 104 }} /></colgroup>
            <thead><tr><th>Employee</th><th>Date and time</th><th className="num">Hours</th><th className="num">Cost</th><th /></tr></thead>
            <tbody>
              {costs.time.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.employeeName}</b>{t.notes && <div className="muted op-text">{t.notes}</div>}</td>
                  <td>{quoteDate(t.startAt)}<div className="muted">{timeLabel(t.startAt)} to {timeLabel(t.endAt)}</div></td>
                  <td className="num">{hoursText(t.minutes)}</td>
                  <td className="num">{moneyCents(t.costCents)}</td>
                  <td>
                    {canEdit && (
                      <span className="job-rowbtns">
                        <button type="button" className="btn icon" aria-label="Edit time entry" data-tip="Edit" onClick={() => setEditing(t)}><Icon name="pencil" size={18} /></button>
                        <button type="button" className="btn icon" aria-label="Delete time entry" data-tip="Delete" onClick={() => void remove({ id: t.id }).catch((e) => toast(failure(e, "That could not be deleted.")))}><Icon name="trash" size={18} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="op-sum"><td colSpan={3}>Labor cost</td><td className="num">{moneyCents(costs.laborCents)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {editing && <TimeDialog jobId={jobId} costs={costs} people={people ?? []} entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TimeDialog({ jobId, costs, people, entry, onClose }: { jobId: Id<"opportunities">; costs: JobCosts; people: Person[]; entry: JobCosts["time"][number] | null; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.jobCosts.saveTime);
  const start = entry ? inputParts(entry.startAt) : { date: todayInput(), time: "09:00" };
  const end = entry ? inputParts(entry.endAt) : { date: todayInput(), time: "17:00" };
  const [employee, setEmployee] = useState<string>(entry?.employeeId ?? "");
  const [rate, setRate] = useState(entry ? dollars(entry.costPerHourCents) : "");
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [hours, setHours] = useState(entry ? String(Math.floor(entry.minutes / 60)) : "8");
  const [minutes, setMinutes] = useState(entry ? String(entry.minutes % 60) : "0");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startAt = date && startTime ? fromInputs(date, startTime) : NaN;
  const endAt = date && endTime ? fromInputs(date, endTime) : NaN;
  const mins = Number.isFinite(startAt) && Number.isFinite(endAt) ? minutesBetween(startAt, endAt) : 0;
  const rateCents = centsFromText(rate || "0");
  const badEmployee = tried && !employee;
  const badRate = tried && rateCents === null;
  const badTime = tried && mins <= 0;

  // Start, End, Hours and Minutes move together: a change to the times sets the length; a change to the length moves the end.
  const setLength = (m: number) => { setHours(String(Math.floor(m / 60))); setMinutes(String(m % 60)); };
  function onTimes(nextStart: string, nextEnd: string) {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    if (date && nextStart && nextEnd) setLength(minutesBetween(fromInputs(date, nextStart), fromInputs(date, nextEnd)));
  }
  function onLength(h: string, m: string) {
    setHours(h);
    setMinutes(m);
    const total = (Number(h) || 0) * 60 + (Number(m) || 0);
    if (date && startTime && total > 0 && total < 24 * 60) setEndTime(inputParts(fromInputs(date, startTime) + total * 60_000).time);
  }
  function onEmployee(id: string) {
    setEmployee(id);
    // The hourly cost starts from what this person was last logged at on this job (Jobber keeps one on the team member).
    const last = costs.lastRates[id];
    if (!entry && last !== undefined && !rate) setRate(dollars(last));
  }

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!employee || rateCents === null || mins <= 0) {
      document.getElementById(!employee ? "te-employee" : rateCents === null ? "te-rate" : "te-start")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({ ...(entry ? { id: entry.id as Id<"jobTimeEntries"> } : {}), opportunityId: jobId, employeeId: employee as Id<"users">, costPerHourCents: rateCents, startAt, endAt, notes, now: clock() });
      toast(entry ? "Time entry saved." : "Time entry added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={entry ? "Edit time entry" : "New time entry"} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate className="cat-fields">
          <div className={`field${badEmployee ? " bad" : ""}`}>
            <label htmlFor="te-employee">Employee</label>
            <select id="te-employee" aria-invalid={badEmployee} value={employee} onChange={(e) => onEmployee(e.target.value)}>
              <option value="">Choose a person</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="err">Pick who did the work.</span>
          </div>
          <div className={`field${badRate ? " bad" : ""}`}>
            <label htmlFor="te-rate">Employee cost per hour ($)</label>
            <input id="te-rate" inputMode="decimal" aria-invalid={badRate} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
            <span className="err">Enter dollars and cents.</span>
            <small className="muted">Total cost: {rateCents === null ? "—" : moneyCents(laborCostCents(mins, rateCents))}</small>
          </div>
          <div className="field">
            <label htmlFor="te-date">Start Date</label>
            <input id="te-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={`cat-money two${badTime ? " bad" : ""}`}>
            <div className="field"><label htmlFor="te-start">Start Time</label><input id="te-start" type="time" aria-invalid={badTime} value={startTime} onChange={(e) => onTimes(e.target.value, endTime)} /></div>
            <div className="field"><label htmlFor="te-end">End Time</label><input id="te-end" type="time" aria-invalid={badTime} value={endTime} onChange={(e) => onTimes(startTime, e.target.value)} /></div>
          </div>
          {badTime && <p className="err-line">The end time has to be after the start time.</p>}
          <div className="cat-money two">
            <div className="field"><label htmlFor="te-hours">Hours</label><input id="te-hours" inputMode="numeric" value={hours} onChange={(e) => onLength(e.target.value.replace(/\D/g, ""), minutes)} /></div>
            <div className="field"><label htmlFor="te-minutes">Minutes</label><input id="te-minutes" inputMode="numeric" value={minutes} onChange={(e) => onLength(hours, e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="field">
            <label htmlFor="te-notes">Notes</label>
            <textarea id="te-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/* ---- Expenses ---- */

export function ExpensesCard({ jobId, businessId, costs, people, canEdit }: { jobId: Id<"opportunities">; businessId: Id<"businesses">; costs: JobCosts; people: Person[] | undefined; canEdit: boolean }) {
  const { toast, dropdown } = useUI();
  const remove = useMutation(api.crm.jobCosts.removeExpense);
  const [editing, setEditing] = useState<JobCosts["expenses"][number] | "new" | null>(null);
  const addMenu = (anchor: HTMLElement) =>
    dropdown(anchor, [
      { label: "Auto-fill", icon: "receipt", disabled: true },
      { label: "Create manually", icon: "pencil", onSelect: () => setEditing("new") },
    ], { alignRight: true });
  void businessId;
  return (
    <section className="card op-card">
      <div className="op-sechead">
        <h2>Expenses</h2>
        {costs.expenses.length > 0 && canEdit && <button type="button" className="cj-link" onClick={(e) => addMenu(e.currentTarget)}>Add Expense <Icon name="chevdown" size={14} /></button>}
      </div>
      {costs.expenses.length === 0 ? (
        <div className="job-empty"><Icon name="receipt" size={20} /><span>Upload receipts and we will fill in the expense details for you</span>{canEdit ? <button type="button" className="cj-link" data-tip={LATER} onClick={(e) => addMenu(e.currentTarget)}>Add Expense <Icon name="chevdown" size={14} /></button> : null}</div>
      ) : (
        <div className="op-scroll">
          <table className="table op-table">
            <colgroup><col style={{ width: 120 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 110 }} /><col style={{ width: 104 }} /></colgroup>
            <thead><tr><th>Date</th><th>Expense</th><th>Reimburse to</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {costs.expenses.map((x) => (
                <tr key={x.id}>
                  <td>{utcDate(x.date)}</td>
                  <td><b>{x.name}</b>{x.description && <div className="muted op-text">{x.description}</div>}{x.receiptUrl && <a className="cj-link" href={x.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt</a>}</td>
                  <td>{x.reimburseToName ?? <span className="muted">Not reimbursable</span>}</td>
                  <td className="num">{moneyCents(x.totalCents)}</td>
                  <td>
                    {canEdit && (
                      <span className="job-rowbtns">
                        <button type="button" className="btn icon" aria-label="Edit expense" data-tip="Edit" onClick={() => setEditing(x)}><Icon name="pencil" size={18} /></button>
                        <button type="button" className="btn icon" aria-label="Delete expense" data-tip="Delete" onClick={() => void remove({ id: x.id }).catch((e) => toast(failure(e, "That could not be deleted.")))}><Icon name="trash" size={18} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="op-sum"><td colSpan={3}>Expenses</td><td className="num">{moneyCents(costs.expensesCents)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {editing && <ExpenseDialog jobId={jobId} people={people ?? []} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ExpenseDialog({ jobId, people, expense, onClose }: { jobId: Id<"opportunities">; people: Person[]; expense: JobCosts["expenses"][number] | null; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.jobCosts.saveExpense);
  const uploadUrl = useMutation(api.crm.jobCosts.expenseUploadUrl);
  const [date, setDate] = useState(expense ? utcToInput(expense.date) : todayInput());
  const [name, setName] = useState(expense?.name ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [total, setTotal] = useState(expense ? dollars(expense.totalCents) : "");
  const [code, setCode] = useState(expense?.accountingCode ?? "");
  const [reimburse, setReimburse] = useState<string>(expense?.reimburseToId ?? "");
  const [receipt, setReceipt] = useState<{ id: Id<"_storage"> | null; name: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const totalCents = centsFromText(total || "0");
  const badName = tried && !name.trim();
  const badTotal = tried && totalCents === null;

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) return toast("A receipt is a picture or a PDF.");
    try {
      setReceipt({ id: await uploadFile(await uploadUrl({ opportunityId: jobId }), f), name: f.name });
    } catch (e) {
      toast(failure(e, "The receipt could not be uploaded."));
    }
  }

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || totalCents === null || !date) {
      document.getElementById(!name.trim() ? "ex-name" : "ex-total")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({
        ...(expense ? { id: expense.id as Id<"jobExpenses"> } : {}), opportunityId: jobId, date: inputToUtc(date), name, description, totalCents, accountingCode: code,
        ...(reimburse ? { reimburseToId: reimburse as Id<"users"> } : {}), ...(receipt ? { receiptId: receipt.id } : {}), now: clock(),
      });
      toast(expense ? "Expense saved." : "Expense added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={expense ? "Edit expense" : "New expense"} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate className="cat-fields">
          <div className="field"><label htmlFor="ex-date">Date</label><input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className={`field${badName ? " bad" : ""}`}>
            <label htmlFor="ex-name">Item name</label>
            <input id="ex-name" aria-invalid={badName} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <span className="err">Give the expense a name.</span>
          </div>
          <div className="field"><label htmlFor="ex-desc">Description</label><textarea id="ex-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className={`field${badTotal ? " bad" : ""}`}>
            <label htmlFor="ex-total">Total ($)</label>
            <input id="ex-total" inputMode="decimal" aria-invalid={badTotal} placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} />
            <span className="err">Enter dollars and cents.</span>
          </div>
          <div className="field"><label htmlFor="ex-code">Accounting code</label><input id="ex-code" maxLength={100} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="ex-reimburse">Reimburse to</label>
            <select id="ex-reimburse" value={reimburse} onChange={(e) => setReimburse(e.target.value)}>
              <option value="">Not reimbursable</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="cat-image">
            <span className="muted">{receipt ? receipt.name : expense?.receiptUrl ? "A receipt is attached" : "No receipt"}</span>
            <div className="cat-image-actions">
              <button type="button" className="btn" onClick={() => file.current?.click()}>{receipt || expense?.receiptUrl ? "Change Receipt" : "Upload Receipt"}</button>
              {(receipt || expense?.receiptUrl) && <button type="button" className="btn plain" onClick={() => setReceipt({ id: null, name: "Receipt removed" })}>Remove</button>}
              <input ref={file} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save Expense"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
