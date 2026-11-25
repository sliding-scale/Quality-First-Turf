"use client";

/* The invoice form (PRD 5.2, design 2026-11-18-finance): Jobber's New Invoice, for a new invoice, one made from a project's payment schedule
   row, and editing. Subject, client, Invoice #, issued date and payment terms, salesperson; line items; what the client sees; discount, tax,
   deposits and the balance; client message and contract; Save Invoice with Jobber's "Save and..." menu. Totals come from the same code the
   backend uses, so the screen cannot disagree with what is saved. One column on a phone, Save bar pinned. */

import { useConvex, useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useClientProjects, useWorkspace, type BusinessDoc } from "@/lib/clients";
import { money, moneyCents } from "@/lib/format";
import {
  centsToInput, dollarsToCents, inputToUtc, invoiceTotals, PAYMENT_METHODS, PAYMENT_TERMS, spreadDue, todayInput, todayUtc, useBilling, useDeposits, useInvoice, useInvoiceDefaults, utcToInput, utcDate
} from "@/lib/invoices";
import { clock, failure, usePeople } from "@/lib/pipeline";
import { useClientSearch } from "@/lib/quotes";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { InvoiceFormSkeleton } from "./skeletons";
import { NewClientDialog } from "./new-client-dialog";
import { PipelineModal } from "./pipeline-dialogs";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Line = { key: string; name: string; description: string; quantity: string; price: string; serviceDate: string };
type View = { quantities: boolean; unitPrices: boolean; lineTotals: boolean; accountBalance: boolean; lateStamp: boolean };
type Applied = { paymentId: Id<"payments">; amountCents: number; label: string };

type Draft = {
  subject: string;
  clientId?: Id<"clients">;
  clientName: string;
  opportunityId?: Id<"opportunities">;
  scheduleItemId?: Id<"paymentScheduleItems">;
  termsKey: string;
  customDue: string;
  salesperson: string;
  lines: Line[];
  discountKind: "amount" | "percent" | null;
  discount: string;
  tax: string;
  clientView: View;
  showMessage: boolean;
  clientMessage: string;
  contract: string;
  deposits: Applied[];
};

let counter = 0;
const newLine = (over: Partial<Line> = {}): Line => ({ key: `new-${++counter}`, name: "", description: "", quantity: "1", price: "0.00", serviceDate: "", ...over });
const ALL_ON: View = { quantities: true, unitPrices: true, lineTotals: true, accountBalance: true, lateStamp: true };

const lineCents = (l: Line) => {
  const q = Number(l.quantity);
  const p = dollarsToCents(l.price);
  return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p) : NaN;
};

function moneyOf(d: Draft) {
  const dv = d.discountKind === "amount" ? dollarsToCents(d.discount) : Number(d.discount);
  return { discountKind: d.discountKind ?? undefined, discountValue: Number.isFinite(dv) ? dv : 0, taxPercent: Number.isFinite(Number(d.tax)) ? Number(d.tax) : 0 };
}

/** The client named in the address, read once for its name. */
function useClientName(id: Id<"clients"> | undefined) {
  const [name, setName] = useState<string | null>(null);
  const convex = useConvex();
  useEffect(() => {
    if (!id) return;
    let live = true;
    void convex.query(api.crm.clients.get, { id }).then((c) => { if (live && c) setName(c.name); });
    return () => { live = false; };
  }, [id, convex]);
  return name;
}

export function NewInvoicePage({ clientId, projectId, scheduleItemId }: { clientId?: string; projectId?: string; scheduleItemId?: string }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <InvoiceFormSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Starter business={workspace.business} presetClient={clientId as Id<"clients"> | undefined} presetProject={projectId as Id<"opportunities"> | undefined} scheduleItemId={scheduleItemId as Id<"paymentScheduleItems"> | undefined} />;
}

/** Waits for what a new invoice starts from (the business's defaults and, for a schedule row, the project's quote), then opens the form. */
function Starter({ business, presetClient, presetProject, scheduleItemId }: { business: BusinessDoc; presetClient?: Id<"clients">; presetProject?: Id<"opportunities">; scheduleItemId?: Id<"paymentScheduleItems"> }) {
  const defaults = useInvoiceDefaults(business._id);
  const billing = useBilling(scheduleItemId ? presetProject : undefined);
  const projectClient = billing?.project.clientId ?? presetClient;
  const name = useClientName(projectClient);
  const deposits = useDeposits(scheduleItemId ? projectClient : undefined, presetProject);
  if (defaults === undefined) return <InvoiceFormSkeleton />;
  if (scheduleItemId && (billing === undefined || name === null || deposits === undefined)) return <InvoiceFormSkeleton />;
  if (scheduleItemId && billing === null) return <div className="empty-state"><h2>Project not found</h2><Link className="btn primary" href="/invoices">Back to invoices</Link></div>;

  let draft: Draft = {
    subject: defaults.subject, clientName: name ?? "", ...(projectClient ? { clientId: projectClient } : {}), ...(presetProject ? { opportunityId: presetProject } : {}), termsKey: defaults.termsKey,
    customDue: "", salesperson: defaults.salesperson, lines: [newLine()], discountKind: null, discount: "", tax: "", clientView: ALL_ON, showMessage: !!defaults.clientMessage,
    clientMessage: defaults.clientMessage, contract: defaults.contract, deposits: [],
  };
  if (scheduleItemId && billing) {
    const at = billing.rows.findIndex((r) => r.id === scheduleItemId);
    const row = billing.rows[at];
    if (!row) return <div className="empty-state"><h2>That payment is not on the schedule</h2><Link className="btn primary" href={`/opportunities/${billing.project.id}?tab=billing`}>Back to billing</Link></div>;
    const lines = billing.quoteLines.length
      ? billing.quoteLines.map((l) => newLine({ name: l.name, description: l.description, quantity: String(l.quantity), price: centsToInput(l.unitPriceCents) }))
      : [newLine({ name: billing.project.title, price: centsToInput(billing.billingTotalCents) })];
    // Jobber applies a deposit when it is there: the project's unused deposits start applied, up to what this invoice is worth.
    let room = row.amountCents;
    const applied: Applied[] = [];
    for (const dep of deposits ?? []) {
      const use = Math.min(dep.unappliedCents, room);
      if (use <= 0) continue;
      applied.push({ paymentId: dep.id as Id<"payments">, amountCents: use, label: `${dep.method} ${utcLabel(dep.paidAt)}` });
      room -= use;
    }
    draft = { ...draft, subject: `${billing.project.title} - ${at + 1} of ${billing.rows.length}`, scheduleItemId, lines, deposits: applied };
  }
  return <Builder business={business} initial={draft} schedule={scheduleItemId && billing ? { rowCents: billing.rows.find((r) => r.id === scheduleItemId)?.amountCents ?? 0, description: billing.rows.find((r) => r.id === scheduleItemId)?.description ?? "", index: billing.rows.findIndex((r) => r.id === scheduleItemId), count: billing.rows.length, totalCents: billing.billingTotalCents } : undefined} />;
}

const utcLabel = utcDate;

export function EditInvoicePage({ id }: { id: string }) {
  const workspace = useWorkspace();
  const inv = useInvoice(id);
  if (workspace.state === "loading" || inv === undefined) return <InvoiceFormSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  if (inv === null) return <div className="empty-state"><h2>Invoice not found</h2><Link className="btn primary" href="/invoices">Back to invoices</Link></div>;
  const business = workspace.businesses.find((b) => b._id === inv.invoice.businessId) ?? workspace.business;
  const i = inv.invoice;
  const draft: Draft = {
    subject: i.subject, clientId: inv.client?.id, clientName: inv.client?.name ?? "", opportunityId: inv.project?.id, scheduleItemId: i.scheduleItemId, termsKey: i.termsKey,
    customDue: i.customDueAt !== undefined ? utcToInput(i.customDueAt) : "", salesperson: i.salesperson,
    lines: inv.lines.map((l) => newLine({ name: l.name, description: l.description, quantity: String(l.quantity), price: centsToInput(l.unitPriceCents), serviceDate: l.serviceDate !== undefined ? utcToInput(l.serviceDate) : "" })),
    discountKind: i.discountKind ?? null, discount: i.discountKind === "amount" ? centsToInput(i.discountValue ?? 0) : i.discountKind === "percent" ? String(i.discountValue ?? 0) : "",
    tax: i.taxPercent ? String(i.taxPercent) : "", clientView: i.clientView, showMessage: !!i.clientMessage, clientMessage: i.clientMessage, contract: i.contract, deposits: [],
  };
  const schedule = inv.schedule ? { rowCents: inv.schedule.portionCents, description: inv.schedule.rows.find((r) => r.thisInvoice)?.description ?? "", index: inv.schedule.rows.findIndex((r) => r.thisInvoice), count: inv.schedule.rows.length, totalCents: inv.schedule.totalCents } : undefined;
  return <Builder key={i.id} business={business} initial={draft} invoice={{ id: i.id, number: i.number, paidCents: i.paidCents, status: i.storedStatus }} schedule={schedule} />;
}

type Schedule = { rowCents: number; description: string; index: number; count: number; totalCents: number };

function Builder({ business, initial, invoice, schedule }: { business: BusinessDoc; initial: Draft; invoice?: { id: Id<"invoices">; number: number; paidCents: number; status: string }; schedule?: Schedule }) {
  const router = useRouter();
  const { toast } = useUI();
  const staff = useStaff();
  const canBill = staff.can("invoices", "edit");
  const people = usePeople(business._id);
  const create = useMutation(api.crm.invoices.create);
  const update = useMutation(api.crm.invoices.update);
  const send = useMutation(api.crm.invoices.send);
  const markSent = useMutation(api.crm.invoices.markSent);
  const applyDeposit = useMutation(api.crm.payments.applyDeposit);

  const [d, setD] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [findingDeposit, setFindingDeposit] = useState(false);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const clear = (k: string) => setBad((b) => { const n = new Set(b); n.delete(k); return n; });

  const found = useClientSearch(business._id, clientQuery);
  const projects = useClientProjects(d.clientId);
  const defaults = useInvoiceDefaults(business._id);
  const locked = !!schedule; // a schedule invoice's lines come from the project
  const dirty = JSON.stringify(d) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const priced = d.lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPriceCents: Number.isFinite(dollarsToCents(l.price)) ? dollarsToCents(l.price) : 0 }));
  const dues = schedule ? spreadDue(priced, schedule.rowCents) : null;
  const totals = invoiceTotals(priced.map((l, i) => ({ ...l, ...(dues ? { dueCents: dues[i] } : {}) })), moneyOf(d));
  const applied = d.deposits.reduce((n, x) => n + x.amountCents, 0) + (invoice?.paidCents ?? 0);
  const balance = Math.max(0, totals.totalCents - applied);

  function validate(): Set<string> {
    const b = new Set<string>();
    if (!d.subject.trim()) b.add("subject");
    if (!d.clientId) b.add("client");
    if (d.termsKey === "custom" && !d.customDue) b.add("due");
    for (const l of d.lines) {
      if (!l.name.trim()) b.add(`${l.key}:name`);
      if (!(Number(l.quantity) > 0)) b.add(`${l.key}:qty`);
      if (!Number.isFinite(dollarsToCents(l.price)) || dollarsToCents(l.price) < 0) b.add(`${l.key}:price`);
    }
    if (applied > totals.totalCents && !invoice) b.add("deposits");
    return b;
  }

  async function persist(): Promise<Id<"invoices"> | null> {
    const flags = validate();
    setBad(flags);
    if (flags.size) {
      setError(flags.has("deposits") ? "The deposits are more than the invoice total." : "Some fields need attention. They are marked in red.");
      const first = flags.has("subject") ? "iv-subject" : flags.has("client") ? "iv-client" : flags.has("due") ? "iv-due" : null;
      const el = first ? document.getElementById(first) : document.querySelector<HTMLElement>(".qb-line .bad input");
      el?.scrollIntoView({ block: "center" });
      el?.focus();
      return null;
    }
    setError("");
    const m = moneyOf(d);
    const body = {
      subject: d.subject, termsKey: d.termsKey, ...(d.termsKey === "custom" ? { customDueAt: inputToUtc(d.customDue) } : {}), salesperson: d.salesperson, clientMessage: d.showMessage ? d.clientMessage : "",
      contract: d.contract, ...(m.discountKind ? { discountKind: m.discountKind, discountValue: m.discountValue } : {}), ...(m.taxPercent ? { taxPercent: m.taxPercent } : {}), clientView: d.clientView,
      lines: d.lines.map((l) => ({ name: l.name, description: l.description, quantity: Number(l.quantity), unitPriceCents: dollarsToCents(l.price), ...(l.serviceDate ? { serviceDate: inputToUtc(l.serviceDate) } : {}) })),
    };
    let id = invoice?.id;
    if (id) await update({ id, ...body, now: clock() });
    else {
      id = await create({
        businessId: business._id, clientId: d.clientId!, ...(d.opportunityId ? { opportunityId: d.opportunityId } : {}), ...(d.scheduleItemId ? { scheduleItemId: d.scheduleItemId } : {}), ...body,
        ...(d.deposits.length ? { deposits: d.deposits.map((x) => ({ paymentId: x.paymentId, amountCents: x.amountCents })) } : {}), now: clock(),
      });
    }
    setBaseline(JSON.stringify(d));
    return id;
  }

  async function run(after: "view" | "email" | "collect") {
    setBusy(true);
    try {
      const id = await persist();
      if (!id) return setBusy(false);
      if (after === "email") {
        await send({ id, now: clock(), today: todayUtc() });
        router.push(`/invoices/${id}?email=1`);
      } else if (after === "collect") {
        await markSent({ id, now: clock(), today: todayUtc() }).catch(() => undefined); // already sent is fine
        router.push(`/payments/new?invoice=${id}`);
      } else router.push(`/invoices/${id}`);
    } catch (e) {
      setError(failure(e, "The invoice could not be saved. Try again."));
      setBusy(false);
    }
  }

  const patchLine = (key: string, p: Partial<Line>) => set({ lines: d.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) });
  const moveLine = (key: string, dir: -1 | 1) => {
    const i = d.lines.findIndex((l) => l.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.lines.length) return;
    const next = [...d.lines];
    [next[i], next[j]] = [next[j], next[i]];
    set({ lines: next });
  };
  const cancel = () => (dirty ? setLeaving(true) : router.push(invoice ? `/invoices/${invoice.id}` : "/invoices"));
  const personNames = people?.map((p) => p.name) ?? [];
  const view = d.clientView;
  const fixedClient = !!invoice || !!schedule;

  return (
    <div className="qb fade-in">
      <div className="qb-top"><h1><Icon name="receipt" size={26} /> {invoice ? `Edit invoice #${invoice.number}` : "New Invoice"}</h1></div>
      {error && <p className="qb-error" role="alert">{error}</p>}
      {!canBill && <p className="qb-error" role="alert">Your role can look at invoices but not make or change them.</p>}

      <section className="qb-card qb-head">
        <div className={`field${bad.has("subject") ? " bad" : ""}`}>
          <label htmlFor="iv-subject">Subject</label>
          <input id="iv-subject" aria-invalid={bad.has("subject")} maxLength={200} value={d.subject} onChange={(e) => { set({ subject: e.target.value }); clear("subject"); }} />
          <span className="err">Give the invoice a subject.</span>
        </div>
        <div className="qb-headgrid">
          <div className="qb-left">
            <div className={`field${bad.has("client") ? " bad" : ""}`}>
              <label htmlFor="iv-client">Client</label>
              {d.clientId ? (
                <div className="sc-picked">
                  <span>{d.clientName || "Selected client"}</span>
                  {!fixedClient && <button type="button" className="icon-btn" aria-label="Choose a different client" onClick={() => set({ clientId: undefined, clientName: "", opportunityId: undefined })}><Icon name="x" size={18} /></button>}
                </div>
              ) : (
                <>
                  <input id="iv-client" aria-invalid={bad.has("client")} placeholder="Select a client" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} autoComplete="off" />
                  {clientQuery.trim() && found && (
                    <div className="sc-results" role="listbox">
                      {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
                      {found.rows.map((c) => (
                        <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { set({ clientId: c._id, clientName: c.name }); setClientQuery(""); clear("client"); }}>
                          <b>{c.name}</b> <span>{[c.street1, c.city].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                      <button type="button" className="sc-newclient" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client{clientQuery.trim() ? ` "${clientQuery.trim()}"` : ""}</button>
                    </div>
                  )}
                  {!(clientQuery.trim() && found) && <button type="button" className="btn link sc-newclient-link" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client</button>}
                  <span className="err">Pick the client this invoice is for.</span>
                </>
              )}
            </div>
            {d.clientId && (
              <div className="field">
                <label htmlFor="iv-project">Project</label>
                <select id="iv-project" disabled={fixedClient} value={d.opportunityId ?? ""} onChange={(e) => set({ opportunityId: (e.target.value || undefined) as Id<"opportunities"> | undefined })}>
                  <option value="">No project</option>
                  {(projects ?? []).filter((p) => p.pipeline !== "Sales" || p._id === d.opportunityId).map((p) => <option key={p._id} value={p._id}>{p.title} · {p.code}</option>)}
                </select>
              </div>
            )}
          </div>
          <dl className="qb-meta">
            <div><dt>Invoice #</dt><dd>{invoice ? invoice.number : defaults ? `${defaults.number} (assigned when saved)` : "…"}</dd></div>
            {schedule && <div><dt>Portion of job</dt><dd>{schedule.totalCents > 0 ? `${Math.round((schedule.rowCents / schedule.totalCents) * 1000) / 10}%` : "—"} ({moneyCents(schedule.rowCents)} of {moneyCents(schedule.totalCents)})</dd></div>}
            <div><dt>Issued date</dt><dd>When it is sent</dd></div>
            <div>
              <dt><label htmlFor="iv-terms">Payment terms</label></dt>
              <dd>
                <select id="iv-terms" value={d.termsKey} onChange={(e) => { set({ termsKey: e.target.value }); clear("due"); }}>
                  {PAYMENT_TERMS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                {d.termsKey === "custom" && (
                  <div className={`field${bad.has("due") ? " bad" : ""}`} style={{ marginTop: 8 }}>
                    <input id="iv-due" type="date" aria-label="Due date" aria-invalid={bad.has("due")} min={todayInput()} value={d.customDue} onChange={(e) => { set({ customDue: e.target.value }); clear("due"); }} />
                    <span className="err">Pick the due date.</span>
                  </div>
                )}
              </dd>
            </div>
            <div>
              <dt><label htmlFor="iv-sales">Salesperson</label></dt>
              <dd>
                <select id="iv-sales" value={d.salesperson} onChange={(e) => set({ salesperson: e.target.value })}>
                  {[...new Set([d.salesperson, ...personNames])].filter(Boolean).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="qb-sections" role="group" aria-label="Add section">
        <span><Icon name="plus" size={16} /> Add section</span>
        <button type="button" className={`chip outline${d.showMessage ? " on" : ""}`} aria-pressed={d.showMessage} onClick={() => set({ showMessage: !d.showMessage })}>Client Message</button>
      </div>

      <section className="qb-card" aria-label="Product / Service">
        <h2 className="qb-h">Product / Service</h2>
        {locked ? (
          <>
            <p className="qp-banner">This invoice is tied to a project with a payment schedule. To change the line item totals, change them on the project before making the invoice.</p>
            <table className="table inv-lines">
              <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 150 }} /></colgroup>
              <thead><tr><th>Line item</th><th className="num">Total</th><th className="num">Due this invoice</th></tr></thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={l.key}>
                    <td><div className="strong">{l.name}</div>{l.description && <div className="sub">{l.description}</div>}</td>
                    <td className="num">{Number.isFinite(lineCents(l)) ? moneyCents(lineCents(l)) : "—"}</td>
                    <td className="num">{moneyCents(dues?.[i] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="qb-lines">
              {d.lines.map((l, i) => (
                <div key={l.key} className="qb-line">
                  <div className="qb-grid">
                    <div className={`field name${bad.has(`${l.key}:name`) ? " bad" : ""}`}>
                      <label htmlFor={`n-${l.key}`}>Name</label>
                      <input id={`n-${l.key}`} aria-invalid={bad.has(`${l.key}:name`)} value={l.name} maxLength={200} onChange={(e) => { patchLine(l.key, { name: e.target.value }); clear(`${l.key}:name`); }} />
                      <span className="err">Give the line a name.</span>
                    </div>
                    <div className={`field qty${bad.has(`${l.key}:qty`) ? " bad" : ""}`}>
                      <label htmlFor={`q-${l.key}`}>Quantity</label>
                      <input id={`q-${l.key}`} inputMode="decimal" aria-invalid={bad.has(`${l.key}:qty`)} value={l.quantity} onChange={(e) => { patchLine(l.key, { quantity: e.target.value.replace(/[^0-9.]/g, "") }); clear(`${l.key}:qty`); }} />
                      <span className="err">Enter a number above zero.</span>
                    </div>
                    <div className={`field price${bad.has(`${l.key}:price`) ? " bad" : ""}`}>
                      <label htmlFor={`p-${l.key}`}>Unit price</label>
                      <input id={`p-${l.key}`} inputMode="decimal" aria-invalid={bad.has(`${l.key}:price`)} value={l.price} onChange={(e) => { patchLine(l.key, { price: e.target.value.replace(/[^0-9.,$]/g, "") }); clear(`${l.key}:price`); }} onBlur={() => { const c = dollarsToCents(l.price); if (Number.isFinite(c)) patchLine(l.key, { price: centsToInput(c) }); }} />
                      <span className="err">Enter a price.</span>
                    </div>
                    <div className="field total"><label>Total</label><output className="qb-out">{Number.isFinite(lineCents(l)) ? money(lineCents(l) / 100) : "—"}</output></div>
                  </div>
                  <div className="field desc"><label htmlFor={`d-${l.key}`}>Description</label><textarea id={`d-${l.key}`} value={l.description} onChange={(e) => patchLine(l.key, { description: e.target.value })} /></div>
                  <div className="qb-opt">
                    <div className="field inv-service">
                      <label htmlFor={`s-${l.key}`}>Service date</label>
                      <input id={`s-${l.key}`} type="date" value={l.serviceDate} onChange={(e) => patchLine(l.key, { serviceDate: e.target.value })} />
                    </div>
                    <div className="qb-tools">
                      <button type="button" className="icon-btn" aria-label="Move up" data-tip="Move up" disabled={i === 0} onClick={() => moveLine(l.key, -1)}><span style={{ display: "inline-grid", transform: "rotate(90deg)" }}><Icon name="chevleft" size={20} /></span></button>
                      <button type="button" className="icon-btn" aria-label="Move down" data-tip="Move down" disabled={i === d.lines.length - 1} onClick={() => moveLine(l.key, 1)}><span style={{ display: "inline-grid", transform: "rotate(-90deg)" }}><Icon name="chevleft" size={20} /></span></button>
                      <button type="button" className="icon-btn" aria-label="Delete this line" data-tip="Delete this line" disabled={d.lines.length === 1} onClick={() => set({ lines: d.lines.filter((x) => x.key !== l.key) })}><Icon name="trash" size={20} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="qb-adds"><button type="button" className="btn primary" onClick={() => set({ lines: [...d.lines, newLine()] })}>Add Line Item</button></div>
          </>
        )}
      </section>

      <section className="qb-card qb-money" aria-label="Invoice totals">
        <div className="qb-view">
          <span><Icon name="eye" size={20} /> Client view</span>
          <fieldset>
            <legend className="sr">What the client sees</legend>
            {([["quantities", "Quantities"], ["unitPrices", "Unit prices"], ["lineTotals", "Line item totals"], ["accountBalance", "Account balance"], ["lateStamp", "Late stamp (if overdue)"]] as const).map(([k, label]) => (
              <label key={k} className="sc-check"><input type="checkbox" checked={view[k]} onChange={(e) => set({ clientView: { ...view, [k]: e.target.checked } })} /> {label}</label>
            ))}
          </fieldset>
        </div>
        <dl className="qb-totals">
          <div><dt>Subtotal</dt><dd>{money(totals.subtotalCents / 100)}</dd></div>
          <div className="qb-adj">
            <dt>Discount</dt>
            <dd>
              {d.discountKind === null ? (
                <button type="button" className="cj-link" onClick={() => set({ discountKind: "amount", discount: "" })}>Add Discount</button>
              ) : (
                <span className="qb-inline">
                  <select aria-label="Discount type" value={d.discountKind} onChange={(e) => set({ discountKind: e.target.value as "amount" | "percent", discount: "" })}><option value="amount">$</option><option value="percent">%</option></select>
                  <input aria-label="Discount" inputMode="decimal" value={d.discount} placeholder={d.discountKind === "amount" ? "0.00" : "0"} onChange={(e) => set({ discount: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <button type="button" className="icon-btn" aria-label="Remove the discount" onClick={() => set({ discountKind: null, discount: "" })}><Icon name="trash" size={18} /></button>
                  <b>-{money(totals.discountCents / 100)}</b>
                </span>
              )}
            </dd>
          </div>
          <div className="qb-adj">
            <dt>Tax</dt>
            <dd>
              {d.tax === "" ? (
                <button type="button" className="cj-link" onClick={() => set({ tax: "0" })}>Add Tax</button>
              ) : (
                <span className="qb-inline">
                  <input aria-label="Tax percent" inputMode="decimal" value={d.tax} onChange={(e) => set({ tax: e.target.value.replace(/[^0-9.]/g, "") })} /> %
                  <button type="button" className="icon-btn" aria-label="Remove the tax" onClick={() => set({ tax: "" })}><Icon name="trash" size={18} /></button>
                  <b>{money(totals.taxCents / 100)}</b>
                </span>
              )}
            </dd>
          </div>
          <div className="qb-total"><dt>Total</dt><dd>{money(totals.totalCents / 100)}</dd></div>
          <div className="qb-adj">
            <dt>Deposits</dt>
            <dd>
              <span className="qb-inline">
                {!!invoice?.paidCents && <b>-{money(invoice.paidCents / 100)} paid</b>}
                {d.deposits.map((x) => (
                  <span key={x.paymentId} className="inv-dep">
                    {x.label}: <b>-{money(x.amountCents / 100)}</b>
                    <button type="button" className="icon-btn" aria-label={`Remove the ${x.label} deposit`} onClick={() => set({ deposits: d.deposits.filter((y) => y.paymentId !== x.paymentId) })}><Icon name="trash" size={18} /></button>
                  </span>
                ))}
                {d.clientId && canBill && <button type="button" className="cj-link" onClick={() => setFindingDeposit(true)}>Add Deposit</button>}
              </span>
            </dd>
          </div>
          <div className="qb-total inv-balance"><dt>Invoice balance</dt><dd>{money(balance / 100)}</dd></div>
        </dl>
        {bad.has("deposits") && <p className="sc-warn">The deposits are more than the invoice total.</p>}
        {d.lines.some((l) => !Number.isFinite(lineCents(l))) && <p className="sc-warn">A quantity or a price is not a number, so the totals are not final.</p>}
      </section>

      {d.showMessage && (
        <section className="qb-card" aria-label="Client message">
          <h2 className="qb-h">Client Message</h2>
          <div className="field"><label htmlFor="iv-msg">Message shown on the invoice</label><textarea id="iv-msg" value={d.clientMessage} onChange={(e) => set({ clientMessage: e.target.value })} /></div>
        </section>
      )}

      <section className="qb-card" aria-label="Contract / Disclaimer">
        <h2 className="qb-h">Contract / Disclaimer</h2>
        <div className="field"><label htmlFor="iv-contract">Description</label><textarea id="iv-contract" value={d.contract} onChange={(e) => set({ contract: e.target.value })} /></div>
      </section>

      <div className="qb-bar">
        <button type="button" className="btn plain" onClick={cancel} disabled={busy}>Cancel</button>
        <div className="qb-save">
          <button type="button" className="btn primary" disabled={busy || !canBill} onClick={() => void run("view")}>{busy ? "Saving…" : "Save Invoice"}</button>
          <SaveMenu disabled={busy || !canBill} onEmail={() => void run("email")} onCollect={() => void run("collect")} />
        </div>
      </div>

      {leaving && (
        <PipelineModal title="Leave without saving?" onClose={() => setLeaving(false)}>
          {(close) => (
            <div>
              <p className="modal-lead">You have changes that are not saved. If you leave now they are lost.</p>
              <div className="modal-foot">
                <button type="button" className="btn plain" onClick={close}>Keep editing</button>
                <button type="button" className="btn danger" onClick={() => { setBaseline(JSON.stringify(d)); router.push(invoice ? `/invoices/${invoice.id}` : "/invoices"); }}>Discard changes</button>
              </div>
            </div>
          )}
        </PipelineModal>
      )}
      {addingClient && (
        <NewClientDialog
          businessId={business._id}
          typed={clientQuery}
          onClose={() => setAddingClient(false)}
          onCreated={(c) => { set({ clientId: c.id, clientName: c.name }); setClientQuery(""); clear("client"); toast("Client saved."); }}
        />
      )}
      {findingDeposit && d.clientId && (
        <FindDeposit
          clientId={d.clientId}
          projectId={d.opportunityId}
          taken={new Set(d.deposits.map((x) => x.paymentId))}
          room={Math.max(0, totals.totalCents - applied)}
          onApply={async (payment, cents, label) => {
            if (invoice) {
              await applyDeposit({ paymentId: payment, invoiceId: invoice.id, amountCents: cents, now: clock() });
              toast("Deposit applied.");
            } else set({ deposits: [...d.deposits, { paymentId: payment, amountCents: cents, label }] });
          }}
          onClose={() => setFindingDeposit(false)}
        />
      )}
    </div>
  );
}

/** The arrow next to Save Invoice: "Save and..." choices, as in Jobber. */
function SaveMenu({ disabled, onEmail, onCollect }: { disabled: boolean; onEmail: () => void; onCollect: () => void }) {
  const { dropdown } = useUI();
  return (
    <button
      type="button"
      className="btn primary qb-arrow"
      aria-label="More ways to save"
      disabled={disabled}
      onClick={(e) =>
        dropdown(
          e.currentTarget,
          [
            { heading: "Save and..." },
            { label: "Send as Email", icon: "mail", onSelect: onEmail },
            { label: "Send as Text Message", icon: "sms", disabled: true },
            { label: "Collect Payment", icon: "card", onSelect: onCollect },
          ],
          { alignRight: true },
        )
      }
    >
      <Icon name="chevdown" size={18} />
    </button>
  );
}

/** Jobber's "Find Deposit": payments with money left, to apply to this invoice, or record a new deposit. */
function FindDeposit({ clientId, projectId, taken, room, onApply, onClose }: {
  clientId: Id<"clients">; projectId?: Id<"opportunities">; taken: Set<string>; room: number;
  onApply: (payment: Id<"payments">, cents: number, label: string) => Promise<void>; onClose: () => void;
}) {
  const deposits = useDeposits(clientId, projectId);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function apply(p: { id: string; unappliedCents: number; method: string; paidAt: number }, close: () => void) {
    const cents = Math.min(p.unappliedCents, room);
    if (cents <= 0) return setError("The invoice is already fully covered.");
    setBusy(p.id);
    try {
      await onApply(p.id as Id<"payments">, cents, `${p.method} ${utcLabel(p.paidAt)}`);
      close();
    } catch (e) {
      setError(failure(e, "The deposit could not be applied."));
      setBusy("");
    }
  }
  return (
    <>
      <PipelineModal title="Find Deposit" onClose={onClose} busy={!!busy}>
        {(close) => (
          <div className="inv-find">
            <p className="modal-lead">Which deposit would you like to use?</p>
            {deposits === undefined ? <div className="sk" style={{ height: 44 }} /> : deposits.filter((p) => !taken.has(p.id)).length === 0 ? <p className="sc-muted">No deposits available</p> : (
              <ul className="inv-deps">
                {deposits.filter((p) => !taken.has(p.id)).map((p) => (
                  <li key={p.id}>
                    <span><b>{money(p.unappliedCents / 100)}</b> · {p.method}{p.reference ? ` · ${p.reference}` : ""} · {utcLabel(p.paidAt)}</span>
                    <button type="button" className="btn small" disabled={!!busy} onClick={() => void apply(p, close)}>{busy === p.id ? "Applying…" : "Apply"}</button>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="modal-error" role="alert">{error}</p>}
            <div className="modal-foot">
              <button type="button" className="btn plain" onClick={close}>Cancel</button>
              <button type="button" className="btn" onClick={() => setRecording(true)}>Record a New Deposit</button>
            </div>
          </div>
        )}
      </PipelineModal>
      {recording && <RecordDeposit clientId={clientId} projectId={projectId} onClose={() => setRecording(false)} />}
    </>
  );
}

/** Jobber's "Record Deposit": money received before the invoice. It is saved as a payment with nothing applied, so it shows in the deposit list. */
function RecordDeposit({ clientId, projectId, onClose }: { clientId: Id<"clients">; projectId?: Id<"opportunities">; onClose: () => void }) {
  const { toast } = useUI();
  const create = useMutation(api.crm.payments.create);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("Other");
  const [date, setDate] = useState(todayInput());
  const [reference, setReference] = useState("");
  const [details, setDetails] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cents = dollarsToCents(amount);
  const badAmount = tried && !(Number.isFinite(cents) && cents > 0);
  async function save(close: () => void) {
    setTried(true);
    if (!(Number.isFinite(cents) && cents > 0) || !date) return;
    setBusy(true);
    try {
      await create({ clientId, ...(projectId ? { opportunityId: projectId } : {}), method, paidAt: inputToUtc(date), reference, details, amountCents: cents, allocations: [], now: clock() });
      toast("Deposit recorded. Apply it from the list.");
      close();
    } catch (e) {
      setError(failure(e, "The deposit could not be recorded."));
      setBusy(false);
    }
  }
  return (
    <PipelineModal title="Record Deposit" onClose={onClose} busy={busy}>
      {(close) => (
        <div className="inv-find">
          <div className={`field${badAmount ? " bad" : ""}`}>
            <label htmlFor="rd-amount">Payment amount</label>
            <input id="rd-amount" inputMode="decimal" placeholder="0.00" aria-invalid={badAmount} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,$]/g, ""))} />
            <span className="err">Enter the amount received.</span>
          </div>
          <div className="field"><label htmlFor="rd-method">Payment method</label><select id="rd-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="field"><label htmlFor="rd-date">Transaction date</label><input id="rd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="rd-ref">Reference #</label><input id="rd-ref" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="field"><label htmlFor="rd-details">Details</label><textarea id="rd-details" value={details} onChange={(e) => setDetails(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void save(close)}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
