"use client";

/* Log a call by hand (plan 2026-11-20-calls-whatsapp, PRD 5.3): who called whom, how it went, how long and what was said. It is kept in the
   conversation with the client (or the bare number) beside the texts, against the person who logged it. */

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CALL_OUTCOMES, OUTCOME_LABEL, type CallOutcome } from "@/convex/crm/lib/calls";
import { clock, failure } from "@/lib/pipeline";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";

const pad = (n: number) => String(n).padStart(2, "0");
const dayInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeInput = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function LogCall({ businessId, clientId, phone, opportunityId, onClose }: { businessId: Id<"businesses">; clientId?: Id<"clients">; phone?: string; opportunityId?: Id<"opportunities">; onClose: () => void }) {
  const { toast } = useUI();
  const log = useMutation(api.crm.calls.log);
  const [start] = useState(() => clock());
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [outcome, setOutcome] = useState<CallOutcome>("answered");
  const [day, setDay] = useState(dayInput(start));
  const [time, setTime] = useState(timeInput(start));
  const [mins, setMins] = useState("");
  const [secs, setSecs] = useState("");
  const [number, setNumber] = useState(clientId ? "" : phone ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answered = outcome === "answered";

  async function submit() {
    setBusy(true);
    setError("");
    const at = new Date(`${day}T${time}`).getTime();
    if (!Number.isFinite(at)) {
      setError("Check the date and time of the call.");
      setBusy(false);
      return;
    }
    const seconds = answered && (mins || secs) ? (Number(mins) || 0) * 60 + (Number(secs) || 0) : undefined;
    try {
      await log({
        businessId, ...(clientId ? { clientId } : {}), ...(opportunityId ? { opportunityId } : {}), ...(number.trim() ? { phone: number } : {}), direction, outcome,
        ...(seconds ? { durationSeconds: seconds } : {}), notes, at, now: clock(),
      });
      toast("Call logged.");
      onClose();
    } catch (e) {
      setError(failure(e, "The call could not be logged."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="Log a call" onClose={onClose} busy={busy} className="au-modal">
      {(close) => (
        <form className="cat-fields" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="field">
            <label htmlFor="lc-dir">Direction</label>
            <select id="lc-dir" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
              <option value="out">We called them</option>
              <option value="in">They called us</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lc-out">How it went</label>
            <select id="lc-out" value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
              {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </select>
          </div>
          <div className="as-row two">
            <div className="field"><label htmlFor="lc-day">Date</label><input id="lc-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
            <div className="field"><label htmlFor="lc-time">Time</label><input id="lc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          {answered && (
            <div className="as-row two">
              <div className="field"><label htmlFor="lc-min">Minutes</label><input id="lc-min" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
              <div className="field"><label htmlFor="lc-sec">Seconds</label><input id="lc-sec" inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
            </div>
          )}
          <div className="field">
            <label htmlFor="lc-num">{clientId ? "Number (optional)" : "Number"}</label>
            <input id="lc-num" type="tel" inputMode="tel" placeholder={clientId ? "Leave blank to use the client's number" : "(555) 123-4567"} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="lc-notes">Notes</label><textarea id="lc-notes" rows={3} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Log call"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
