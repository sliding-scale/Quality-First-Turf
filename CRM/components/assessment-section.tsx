"use client";

/* The On-site assessment card (D-129), shared by the request page and the opportunity page's Overview so both have the same options: the pencil
   books, moves or deletes the consultation (time picker, team, instructions), "Complete assessment", the team, the confirmation email
   (D-127), and the consultation worksheet. The worksheet (the Visit tab) opens only once a consultation is booked (user, 2026-11-25). */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock, failure } from "@/lib/pipeline";
import { useRequest } from "@/lib/requests";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import { AssessmentInline, whenLabel, type AssessmentInput } from "./request-assessment";
import { useUI } from "./ui-provider";

type Request = NonNullable<ReturnType<typeof useRequest>>;

const CONFIRM_LABEL = { sent: "sent to the customer", tested: "sent to the test address", logged: "not sent (the business is set to Log only)", skipped: "not sent", failed: "could not be sent" } as const;

/** Jobber's red "nobody" mark next to Unassigned: a person with a slash through it. */
function NoOne() {
  return (
    <svg className="as-noone" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

/** True once a consultation is booked (or was done offline): the worksheet, the Visit tab and a quote need one first (user, 2026-11-25). */
export const hasConsultation = (r: Pick<Request, "assessment">) => r.assessment !== null && r.assessment.status !== "lost";

export function AssessmentSection({ r, people, canEdit, editing, onEditing, locked }: {
  r: Request;
  people: { id: string; name: string }[] | undefined;
  canEdit: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  /** Another section of the page is being edited, so the pencil waits. */
  locked?: boolean;
}) {
  const { toast } = useUI();
  const updateRequest = useMutation(api.crm.requests.update);
  const book = useMutation(api.crm.schedule.book);
  const updateEvent = useMutation(api.crm.schedule.update);
  const removeEvent = useMutation(api.crm.schedule.remove);
  const setStatus = useMutation(api.crm.schedule.setStatus);
  const resendConfirmation = useMutation(api.crm.bookingEmail.resend);
  const [resending, setResending] = useState(false);
  const teamNames = (r.assessment?.assigneeIds ?? []).map((id) => people?.find((p) => p.id === id)?.name).filter(Boolean).join(", ");

  /** Saves the assessment form: the instructions always, then the booking. A date books (or changes) the consultation on the Schedule, so a clash
   *  with someone's time throws and the form shows it; "Schedule later" takes any booked time off the Schedule and keeps the instructions. Booking
   *  one moves the project to Onsite Consultation (crm/schedule.book). */
  async function save(a: AssessmentInput) {
    const assigneeIds = a.assigneeIds as Id<"users">[];
    await updateRequest({ id: r.id, assessmentInstructions: a.instructions });
    if (a.scheduleLater) {
      if (r.assessment) await removeEvent({ id: r.assessment.id });
    } else if (r.assessment) {
      await updateEvent({ id: r.assessment.id, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, now: clock() });
    } else {
      await book({ businessId: r.businessId, type: "consultation", title: r.title, start: a.start, end: a.end, anytime: a.anytime, assigneeIds, notes: a.instructions, opportunityId: r.id, clientId: r.clientId, now: clock() });
    }
    onEditing(false);
    toast("The assessment is saved.");
  }
  async function remove() {
    if (r.assessment) await removeEvent({ id: r.assessment.id });
    await updateRequest({ id: r.id, assessmentInstructions: "" });
    onEditing(false);
    toast("The assessment is deleted.");
  }
  async function complete(done: boolean) {
    if (!r.assessment) return;
    try {
      await setStatus({ id: r.assessment.id, status: done ? "completed" : "upcoming" });
    } catch (e) {
      toast(failure(e, "The assessment could not be updated."));
    }
  }
  async function emailAgain() {
    if (!r.assessment) return;
    setResending(true);
    try {
      await resendConfirmation({ id: r.assessment.id as Id<"calendarEvents"> });
    } catch (e) {
      toast(failure(e, "The confirmation could not be sent."));
    } finally {
      setResending(false);
    }
  }

  const booked = hasConsultation(r);
  return (
    <section className={`card rq-overview${editing ? " rq-editing" : ""}`} aria-label="On-site assessment">
      <div className="rq-sechead">
        <h2>On-site assessment</h2>
        {canEdit && !editing && <button type="button" className="icon-btn" aria-label="Edit the on-site assessment" aria-disabled={locked || undefined} onClick={() => (locked ? toast("Save or cancel the section you are editing first") : onEditing(true))}><Icon name="pencil" size={20} /></button>}
      </div>
      {editing ? (
        <AssessmentInline people={people} initial={r.assessment} instructions={r.assessmentInstructions} onSave={save} onDelete={remove} onCancel={() => onEditing(false)} />
      ) : (
        <>
          <div className="rq-label">Instructions</div>
          {r.assessmentInstructions && <p className="rq-text">{r.assessmentInstructions}</p>}
          <dl className="as-facts as-three as-view">
            <div>
              <dt>Schedule</dt>
              <dd>
                {r.assessment ? whenLabel(r.assessment) : "Unscheduled"}
                <label className="ai-check as-done">
                  <Checkbox state={r.assessment?.status === "completed"} label="Complete assessment" onChange={() => (!canEdit ? toast("Your role can look at this but not change it.") : !r.assessment ? toast("Schedule the assessment first, then it can be marked complete.") : void complete(r.assessment.status !== "completed"))} />
                  <span>Complete assessment</span>
                </label>
              </dd>
            </div>
            <div><dt>Team</dt><dd>{teamNames || <span className="as-unassigned"><NoOne /><i>Unassigned</i></span>}</dd></div>
            <div><dt>Checklists</dt><dd>—</dd></div>
          </dl>
          {r.assessment?.offline ? (
            <p className="as-jobber">Done offline. Marked complete when the request moved to Onsite Consultation.</p>
          ) : r.assessment && !r.assessment.anytime && r.assessment.status !== "completed" ? (
            <p className={`as-jobber${r.assessment.confirmEmail?.status === "failed" ? " bad" : ""}`} role="status">
              <span>
                {r.assessment.confirmEmail === null ? "Confirmation email: being sent." : `Confirmation email: ${CONFIRM_LABEL[r.assessment.confirmEmail.status]}${r.assessment.confirmEmail.detail ? `. ${r.assessment.confirmEmail.detail}` : ""}`}
              </span>
              {canEdit && r.assessment.confirmEmail !== null && <button type="button" className="btn small" disabled={resending} onClick={() => void emailAgain()}>{resending ? "Sending…" : "Email the customer again"}</button>}
            </p>
          ) : null}
          <div className="as-worksheet">
            <div>
              <div className="rq-label">Consultation worksheet</div>
              <p className="rq-text">{booked
                ? "The salesperson's on-site form: the work areas measured, products, photos and notes. Only staff see it. The quote can start from it."
                : "Schedule the consultation first. The worksheet opens once it is booked."}</p>
            </div>
            {booked && canEdit ? (
              <Link className="btn" href={`/opportunities/${r.id}?tab=visit`}><Icon name="pencil" size={16} /> Open worksheet</Link>
            ) : (
              <button type="button" className="btn" aria-disabled="true" onClick={() => toast(booked ? "Your role can look at the worksheet but not change it." : "Schedule the consultation first. The worksheet opens once it is booked.")}><Icon name="pencil" size={16} /> Open worksheet</button>
            )}
          </div>
          <div className="as-reminder">
            <div className="rq-label">Assessment Reminder</div>
            <div>Remind client 1 hour before by text</div>
            <div>Remind client 1 day before at 1:30 PM by email</div>
            <small>Reminders are not sent yet.</small>
          </div>
        </>
      )}
    </section>
  );
}
