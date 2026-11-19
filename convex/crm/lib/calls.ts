/* Call log rules (plan 2026-11-20-calls-whatsapp, PRD 5.3). Pure TypeScript, no Convex or React imports. */

export const CALL_OUTCOMES = ["answered", "no_answer", "voicemail", "busy"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<CallOutcome, string> = { answered: "Answered", no_answer: "No answer", voicemail: "Left a voicemail", busy: "Busy" };

export const MAX_CALL_SECONDS = 24 * 60 * 60;
export const MAX_FUTURE_MS = 5 * 60 * 1000;

/** "4 min 12 s", "45 s", "1 h 5 min", "" for none. */
export function durationLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** The reason a call cannot be logged, or null. A call did not happen in the future, and only an answered call has a length. */
export function callProblem(a: { outcome: string; durationSeconds?: number; at: number; now: number; notes: string }): string | null {
  if (!(CALL_OUTCOMES as readonly string[]).includes(a.outcome)) return "Pick how the call went.";
  if (!Number.isFinite(a.at) || a.at <= 0) return "Check when the call happened.";
  if (a.at > a.now + MAX_FUTURE_MS) return "A call cannot be in the future.";
  if (a.durationSeconds !== undefined) {
    if (!Number.isInteger(a.durationSeconds) || a.durationSeconds < 0 || a.durationSeconds > MAX_CALL_SECONDS) return "Check how long the call was.";
    if (a.outcome !== "answered" && a.durationSeconds > 0) return "Only an answered call has a length.";
  }
  if (a.notes.trim().length > 3000) return "The notes are too long (3,000 characters at most).";
  return null;
}
