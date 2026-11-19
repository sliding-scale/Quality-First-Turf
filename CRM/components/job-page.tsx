"use client";

/* The job page (design 2026-11-19-jobs): Jobber's job page. A job is a Closed Won project, so everything here is read from the project's own
   records (its quote lines, visits, invoices, payment schedule and notes) and the page links back to the project. The Labor and Expenses cards
   and the greyed More items are built in later steps. */

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate } from "@/lib/format";
import { JOB_PILL, useJob } from "@/lib/jobs";
import { clock, failure } from "@/lib/pipeline";
import { todayKey } from "@/lib/schedule";
import { startOfToday } from "@/lib/clients";
import { BillingTab } from "./billing-tab";
import { Icon } from "./icon";
import { ProjectNotes } from "./project-notes";
import { JobSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Job = NonNullable<FunctionReturnType<typeof api.crm.jobs.get>>;

export function JobPage({ id }: { id: string }) {
  const job = useJob(id);
  if (job === undefined) return <JobSkeleton />;
  if (job === null) {
    return (
      <div className="empty-state">
        <h2>Job not found</h2>
        <p>This job does not exist, or it was removed.</p>
        <Link className="btn primary" href="/jobs">Back to Jobs</Link>
      </div>
    );
  }
  return <JobView key={job.id} job={job} />;
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const LATER = "Built in a later step";

function JobView({ job }: { job: Job }) {
  const router = useRouter();
  const { dropdown, toast } = useUI();
  const staff = useStaff();
  const close = useMutation(api.crm.jobs.close);
  const reopen = useMutation(api.crm.jobs.reopen);
  const setStatus = useMutation(api.crm.schedule.setStatus);
  const canEdit = staff.can("jobs", "edit");
  const canSchedule = staff.can("schedule", "edit");
  const closed = job.closedAt !== null;
  const dayStart = startOfToday();
  const open = job.visits.filter((v) => v.status === "upcoming" || v.status === "confirmed");
  const late = open.find((v) => v.start < dayStart);
  const next = late ?? open.find((v) => v.start >= dayStart);
  const live = job.visits.filter((v) => v.status !== "lost");
  const lastVisit = live.length ? live[live.length - 1] : undefined;
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));

  const moreItems = () => [
    closed
      ? { label: "Reopen Job", icon: "hammer", iconColor: "var(--green)", disabled: !canEdit, onSelect: () => void reopen({ id: job.id, now: clock() }).then(() => toast("Job reopened")).catch((e) => fail(e, "The job could not be reopened.")) }
      : { label: "Close Job", icon: "hammer", iconColor: "var(--green)", disabled: !canEdit, onSelect: () => void close({ id: job.id, now: clock() }).then(() => toast("Job closed")).catch((e) => fail(e, "The job could not be closed.")) },
    { label: "Create Similar Job", icon: "duplicate", disabled: true },
    { label: "Send Job Follow-up Email", icon: "mail", disabled: true },
    { label: "Text Booking Confirmation", icon: "sms", disabled: true },
    { label: "Email Booking Confirmation", icon: "mail", disabled: true },
    { label: "Create Invoice", icon: "receipt", disabled: !staff.can("invoices", "edit"), onSelect: () => router.push(`/invoices/new?clientId=${job.clientId}&projectId=${job.id}`) },
    { label: "Collect Signature", icon: "signature", disabled: true },
    { label: "Email Job Costs CSV", icon: "import", disabled: true },
    { label: "Print or Save PDF", icon: "pdf", onSelect: () => window.print() },
    { label: "Delete", icon: "trash", danger: true, disabled: true },
  ];

  return (
    <div className="fade-in op job">
      <div className="op-top">
        <Link className="rq-back" href="/jobs"><Icon name="chevleft" size={18} /> Jobs</Link>
        <div className="op-actions">
          <button type="button" className="btn" aria-label="Job history" data-tip="History is on the project's Activity tab" onClick={() => router.push(`/opportunities/${job.id}?tab=activity`)}><Icon name="history" size={18} /></button>
          <button type="button" className="btn" onClick={(e) => dropdown(e.currentTarget, moreItems(), { alignRight: true })}><Icon name="more" size={18} /> More</button>
          {next && <Link className="btn primary" href={`/schedule?view=day&date=${todayKey(next.start)}`}>{late ? "Show Late Visit" : "Show Next Visit"}</Link>}
        </div>
      </div>

      <div className="op-title">
        <span className={`pill tag ${JOB_PILL[job.status]}`}><span className="dot" />{job.status}</span>
        <h1>{job.title}</h1>
        <span className="op-code">#{job.jobNumber}</span>
      </div>
      <p className="muted job-where">
        <Link href={`/opportunities/${job.id}`}>{job.pipeline}: {job.stage}</Link>
        {closed && <> · Closed {quoteDate(job.closedAt as number)}{job.closedByName ? ` by ${job.closedByName}` : ""}</>}
      </p>

      <div className="op-body">
        <div className="op-col">
          <section className="card op-card job-head">
            <div className="job-client">
              <Link href={`/clients/${job.client.id}`} className="rq-clientname">{job.client.name}</Link>
              {job.property && <div><span className="muted">Property address</span><br />{job.property}</div>}
              {job.client.phone && <div className="rq-gap"><a href={`tel:${job.client.phone}`}>{job.client.phone}</a></div>}
              {job.client.email && <div><a href={`mailto:${job.client.email}`}>{job.client.email}</a></div>}
            </div>
            <dl className="op-facts">
              <div><dt>Job #</dt><dd>{job.jobNumber}</dd></div>
              <div><dt>Job type</dt><dd>One-off job</dd></div>
              <div><dt>Started on</dt><dd>{job.firstVisitAt ? quoteDate(job.firstVisitAt) : job.wonAt ? quoteDate(job.wonAt) : "—"}</dd></div>
              <div><dt>Ends on</dt><dd>{lastVisit ? quoteDate(lastVisit.start) : "—"}</dd></div>
              <div><dt>Billing frequency</dt><dd>{job.hasPaymentPlan ? "Per payment schedule" : "Upon job completion"}</dd></div>
            </dl>
          </section>

          <section className="card op-card">
            <div className="op-sechead">
              <h2>Product / Service</h2>
              {job.quoteId && staff.can("quotes") && <Link className="btn icon" aria-label="Open the quote" data-tip="Edit on the quote" href={`/quotes/${job.quoteId}`}><Icon name="pencil" size={18} /></Link>}
            </div>
            {job.lines.length ? (
              <div className="op-scroll">
                <table className="table op-table">
                  <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /></colgroup>
                  <thead><tr><th>Line Item</th><th className="num">Quantity</th><th className="num">Unit Price</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {job.lines.map((l, i) => (
                      <tr key={i}>
                        <td><b>{l.name}</b>{l.description && <div className="muted op-text">{l.description}</div>}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{moneyCents(l.unitPriceCents)}</td>
                        <td className="num">{moneyCents(Math.round(l.quantity * l.unitPriceCents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">This job has no line items.</p>
            )}
            <dl className="job-sums">
              <div><dt>Subtotal</dt><dd>{moneyCents(job.subtotalCents)}</dd></div>
              <div className="bold"><dt>Total price</dt><dd>{moneyCents(job.totalCents)}</dd></div>
              <div><dt>Total cost</dt><dd>{moneyCents(0)}</dd></div>
            </dl>
          </section>

          <section className="card op-card">
            <div className="op-sechead"><h2>Labor</h2></div>
            <div className="job-empty"><Icon name="timeline" size={20} /><span>Time tracked to this job will show here</span><button type="button" className="cj-link" disabled data-tip={LATER}>Add Time Entry</button></div>
          </section>

          <section className="card op-card">
            <div className="op-sechead"><h2>Expenses</h2></div>
            <div className="job-empty"><Icon name="receipt" size={20} /><span>Upload receipts and we will fill in the expense details for you</span><button type="button" className="cj-link" disabled data-tip={LATER}>Add Expense</button></div>
          </section>

          <section className="card op-card">
            <div className="op-sechead">
              <h2>Scheduled visits</h2>
              {canSchedule && <Link className="btn icon" aria-label="Add a visit" data-tip="Add a visit" href={`/schedule?new=visit&job=1&projectId=${job.id}&title=${encodeURIComponent(job.title)}`}><Icon name="plus" size={18} /></Link>}
            </div>
            <dl className="op-facts job-visit-facts">
              <div><dt>First visit</dt><dd>{job.firstVisitAt ? quoteDate(job.firstVisitAt) : "—"}</dd></div>
              <div><dt>Arrival window</dt><dd>Arrive at start time</dd></div>
            </dl>
            <div className="op-scroll">
              <table className="table op-table">
                <colgroup><col style={{ width: 150 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 160 }} /><col style={{ width: 56 }} /></colgroup>
                <thead><tr><th>Date and time</th><th>Title and instructions</th><th>Status</th><th>Assigned</th><th /></tr></thead>
                <tbody>
                  {job.visits.length ? job.visits.map((v) => {
                    const overdue = (v.status === "upcoming" || v.status === "confirmed") && v.start < dayStart;
                    const label = v.status === "completed" ? "Completed" : v.status === "lost" ? "Lost" : overdue ? "Overdue" : "Upcoming";
                    const cls = v.status === "completed" ? "active" : overdue ? "overdue" : v.status === "lost" ? "draft" : "consult";
                    return (
                      <tr key={v.id}>
                        <td><b>{quoteDate(v.start)}</b><div className="muted">{v.anytime ? "Anytime" : timeOf(v.start)}</div></td>
                        <td><div>{v.title}</div>{v.notes && <div className="muted op-text">{v.notes}</div>}</td>
                        <td><span className={`pill ${cls}`}><span className="dot" />{label}</span></td>
                        <td>{v.assignees.length ? v.assignees.join(", ") : <i className="muted">Unassigned</i>}</td>
                        <td>
                          {canSchedule && v.status !== "lost" && (
                            <button type="button" className="btn icon" aria-label={v.status === "completed" ? "Mark visit not complete" : "Mark visit complete"} data-tip={v.status === "completed" ? "Mark not complete" : "Mark complete"}
                              onClick={() => void setStatus({ id: v.id as Id<"calendarEvents">, status: v.status === "completed" ? "upcoming" : "completed" }).catch((e) => fail(e, "The visit could not be changed."))}>
                              <Icon name="check" size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5}><div className="empty" style={{ margin: "14px 0" }}>No visits yet. The + books one.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* The Billing tab brings its own headings: the payment schedule, the invoices and the payments. */}
          {staff.can("invoices") && <BillingTab id={job.id} />}
        </div>

        <div className="op-col">
          <section className="card op-card job-totals">
            <h2>Total cost to date</h2>
            <div className="job-big">{moneyCents(0)}</div>
            <dl className="op-facts">
              <div><dt>Revenue</dt><dd>{moneyCents(job.totalCents)}</dd></div>
              <div><dt>Invoiced</dt><dd>{moneyCents(job.invoicedCents)}</dd></div>
              <div><dt>Paid</dt><dd>{moneyCents(job.paidCents)}</dd></div>
              <div><dt>Cost</dt><dd>{moneyCents(0)}</dd></div>
            </dl>
            <p className="muted">Costs are added in a later step, with Labor and Expenses.</p>
          </section>
          {staff.can("tasks") && <ProjectNotes id={job.id} canEdit={staff.can("tasks", "edit")} />}
        </div>
      </div>
    </div>
  );
}
