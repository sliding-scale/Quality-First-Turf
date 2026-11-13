"use client";

/* Settings → Automations (D-065), laid out like Jobber's page: the four automations as cards grouped Quotes and Requests, each opening
   what Jobber's side panel shows (When this happens / And only if / Then do this) with the things Jobber lets you change: the days, the
   message and Active, and New Automation (D-071) opens Jobber's builder panel for ones of our own. Below them, the sending mode (log only, test address, live) and what the
   automations have done. Only Admins change anything; the backend refuses everyone else. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_DAYS, MIN_DAYS, VARIABLES, renderTemplate,
  type AutomationKey, type RunStatus, type TemplateVars,
} from "@/convex/crm/lib/automationRules";
import { useKept, useWorkspace } from "@/lib/clients";
import { failure } from "@/lib/pipeline";
import { AutomationBuilder } from "./automation-builder";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { AutomationsSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Overview = NonNullable<ReturnType<typeof useOverview>>;
type Automation = Overview["automations"][number];

function useOverview(businessId: Id<"businesses"> | undefined) {
  return useQuery(api.crm.automations.overview, businessId ? { businessId } : "skip");
}

const SAMPLE: TemplateVars = { CLIENT_FIRST_NAME: "Natasha", CLIENT_NAME: "Natasha Lee", COMPANY_NAME: "Quality First Turf Landscape", DEFAULT_PHONE: "(555) 010-0000", QUOTE_NUMBER: "#2345" };

const STATUS: Record<RunStatus | "done", { label: string; cls: string }> = {
  done: { label: "Done", cls: "active" },
  sent: { label: "Sent", cls: "active" },
  tested: { label: "Test sent", cls: "lead" },
  logged: { label: "Logged only", cls: "draft" },
  archived: { label: "Archived", cls: "active" },
  queued: { label: "Sending", cls: "lead" },
  skipped: { label: "Skipped", cls: "draft" },
  failed: { label: "Failed", cls: "overdue" },
};

const nowMs = () => Date.now();
const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function AutomationsPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const data = useKept(useOverview(businessId));
  const ensure = useMutation(api.crm.automations.ensure);
  const [open, setOpen] = useState<AutomationKey | null>(null);
  const [builder, setBuilder] = useState<"new" | Id<"customAutomations"> | null>(null);
  const custom = useQuery(api.crm.customAutomations.list, businessId ? { businessId } : "skip");
  const asked = useRef(false);

  // The four rows are created once, by an Admin opening this page (the cron makes them too, so this only saves waiting for it).
  useEffect(() => {
    if (!staff.isAdmin || !businessId || !data || data.ready || asked.current) return;
    asked.current = true;
    void ensure({ businessId, now: Date.now() }).catch(() => undefined);
  }, [staff.isAdmin, businessId, data, ensure]);

  if (!staff.isAdmin) {
    return (
      <div className="empty-state">
        <h2>Only Admins can manage automations</h2>
        <p>Ask an Admin if one needs to change.</p>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !data || !businessId) return <AutomationsSkeleton />;

  const groups = (["Quotes", "Requests"] as const).map((g) => ({
    name: g,
    items: data.automations.filter((a) => a.group === g),
    // The ones an Admin built sit after Jobber's, under the kind of thing they watch.
    mine: (custom ?? []).filter((c) => (c.trigger.object === "quote" ? "Quotes" : "Requests") === g),
  }));
  const current = data.automations.find((a) => a.key === open) ?? null;
  const editing = builder && builder !== "new" ? (custom ?? []).find((c) => c.id === builder) ?? null : null;

  return (
    <div className="fade-in au">
      <div className="page-head">
        <h1>Automations</h1>
        <button type="button" className="btn primary" onClick={() => { setOpen(null); setBuilder("new"); }}>New Automation</button>
      </div>
      <p className="au-lead">Configure the triggers and conditions and the CRM will complete routine tasks and perform actions automatically. Jobber&apos;s four are here to adjust (days, message, on or off); make your own with New Automation.</p>


      {groups.map((g) => (
        <section key={g.name} className="au-group">
          <h2>{g.name}</h2>
          <div className="au-cards">
            {g.items.map((a) => (
              <button key={a.key} type="button" className="au-card" aria-expanded={open === a.key} onClick={() => { setBuilder(null); setOpen((cur) => (cur === a.key ? null : a.key)); }}>
                <span className="au-icons"><Icon name="calendar" size={20} /><span aria-hidden>→</span><Icon name={a.action === "email" ? "mail" : "inbox"} size={20} /></span>
                <span className={`pill ${a.active ? "active" : "draft"}`}><span className="dot" />{a.active ? "Active" : "Off"}</span>
                <strong>{a.title}</strong>
              </button>
            ))}
            {g.mine.map((c) => (
              <button key={c.id} type="button" className="au-card" aria-expanded={builder === c.id} onClick={() => { setOpen(null); setBuilder((cur) => (cur === c.id ? null : c.id)); }}>
                <span className="au-icons"><Icon name="calendar" size={20} /><span aria-hidden>→</span><Icon name={c.action.kind === "notify" ? "mail" : c.action.kind === "addTag" ? "contact" : "stage"} size={20} /></span>
                <span className={`pill ${c.active ? "active" : "draft"}`}><span className="dot" />{c.active ? "Active" : "Off"}</span>
                <strong>{c.title}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Activity businessId={businessId} />
      {current && <AutomationDialog key={current.key} businessId={businessId} a={current} onClose={() => setOpen(null)} />}
      {builder === "new" && <AutomationBuilder key="new" businessId={businessId} automation={null} onClose={() => setBuilder(null)} />}
      {editing && <AutomationBuilder key={editing.id + editing.updatedAt} businessId={businessId} automation={editing} onClose={() => setBuilder(null)} />}
    </div>
  );
}

/* ---- One automation ---- */

function AutomationDialog({ businessId, a, onClose }: { businessId: Id<"businesses">; a: Automation; onClose: () => void }) {
  const { toast, dropdown } = useUI();
  const save = useMutation(api.crm.automations.update);
  const reset = useMutation(api.crm.automations.resetWording);
  const [days, setDays] = useState(String(a.days));
  const [active, setActive] = useState(a.active);
  const [subject, setSubject] = useState(a.subject ?? "");
  const [body, setBody] = useState(a.body ?? "");
  const [text, setText] = useState(a.textBody ?? "");
  const [tab, setTab] = useState<"email" | "text">("email");
  const [bad, setBad] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const email = a.action === "email";
  const n = Number(days);
  const unit = a.startsFrom;

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!Number.isInteger(n) || n < MIN_DAYS || n > MAX_DAYS) problems.days = `Enter a whole number from ${MIN_DAYS} to ${MAX_DAYS}.`;
    if (email && !subject.trim()) problems.subject = "The email needs a subject.";
    if (email && !body.trim()) problems.body = "The email needs a message.";
    if (email && !text.trim()) problems.text = "The text message needs a message.";
    setBad(problems);
    if (Object.keys(problems).length) {
      if (problems.text && !problems.subject && !problems.body) setTab("text");
      else setTab("email");
      return;
    }
    setBusy(true);
    try {
      await save({ businessId, key: a.key, days: n, active, ...(email ? { subject, body, textBody: text } : {}), now: nowMs() });
      toast("Automation saved.");
      close();
    } catch (err) {
      const msg = failure(err, "That could not be saved.");
      setBad(/day/i.test(msg) ? { days: msg } : /subject/i.test(msg) ? { subject: msg } : /variable|message/i.test(msg) ? { body: msg } : {});
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  async function putBack() {
    try {
      await reset({ businessId, key: a.key, now: Date.now() });
      toast("The wording is back to Jobber's.");
      onClose();
    } catch (err) {
      toast(failure(err, "That could not be reset."));
    }
  }

  function insertVariable(anchor: HTMLElement) {
    dropdown(anchor, VARIABLES.map((name) => ({
      label: name.toLowerCase().replace(/_/g, " "),
      onSelect: () => {
        const token = `{{${name}}}`;
        if (tab === "text") setText((t) => `${t}${token}`);
        else {
          const el = bodyRef.current;
          const at = el?.selectionStart ?? body.length;
          setBody((b) => `${b.slice(0, at)}${token}${b.slice(el?.selectionEnd ?? at)}`);
        }
      },
    })));
  }

  return (
    <PipelineModal title={a.title} onClose={onClose} busy={busy} className="au-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <label className="au-switch">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>{active ? "Active" : "Off"}</span>
          </label>
          <div className="au-steps">
            <div className="au-step">
              <h4>When this happens</h4>
              <div className={`au-line field${bad.days ? " bad" : ""}`}>
                <input aria-label="Days" aria-invalid={Boolean(bad.days)} inputMode="numeric" value={days} onChange={(e) => { setDays(e.target.value.replace(/\D/g, "").slice(0, 3)); setBad((b) => ({ ...b, days: "" })); }} />
                <span>day(s) after {unit}</span>
                <span className="err">{bad.days}</span>
              </div>
            </div>
            <div className="au-step"><h4>And only if</h4><p>{a.onlyIf}</p></div>
            <div className="au-step">
              <h4>Then do this</h4>
              <p>{email ? "Email the client with the message below" : a.group === "Quotes" ? "Archive the quote" : "Archive the request and close it as lost"}</p>
            </div>
          </div>
          <p className="au-note">Only {a.group.toLowerCase()} that {a.group === "Quotes" ? "were sent" : "came in"} after this was turned on are touched.</p>

          {email && (
            <div className="au-msg">
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "email"} className={`tab${tab === "email" ? " active" : ""}`} onClick={() => setTab("email")}>Email</button>
                <button type="button" role="tab" aria-selected={tab === "text"} className={`tab${tab === "text" ? " active" : ""}`} onClick={() => setTab("text")}>Text Message</button>
              </div>
              {tab === "email" ? (
                <>
                  <div className={`field${bad.subject ? " bad" : ""}`}>
                    <label htmlFor="au-sub">Email subject</label>
                    <input id="au-sub" value={subject} aria-invalid={Boolean(bad.subject)} onChange={(e) => { setSubject(e.target.value); setBad((b) => ({ ...b, subject: "" })); }} />
                    <span className="err">{bad.subject}</span>
                  </div>
                  <div className={`field${bad.body ? " bad" : ""}`}>
                    <label htmlFor="au-body">Message</label>
                    <textarea id="au-body" ref={bodyRef} rows={9} value={body} aria-invalid={Boolean(bad.body)} onChange={(e) => { setBody(e.target.value); setBad((b) => ({ ...b, body: "" })); }} />
                    <span className="err">{bad.body}</span>
                  </div>
                  <div className="au-preview" aria-label="Preview">
                    <strong>{renderTemplate(subject, SAMPLE)}</strong>
                    <p>{renderTemplate(body, SAMPLE)}</p>
                  </div>
                </>
              ) : (
                <>
                  <p className="au-note">Texts are not sent yet: the CRM has no text provider. The wording is kept for when it does.</p>
                  <div className={`field${bad.text ? " bad" : ""}`}>
                    <label htmlFor="au-text">Message</label>
                    <textarea id="au-text" rows={4} value={text} aria-invalid={Boolean(bad.text)} onChange={(e) => { setText(e.target.value); setBad((b) => ({ ...b, text: "" })); }} />
                    <span className="err">{bad.text}</span>
                  </div>
                  <div className="au-preview"><p>{renderTemplate(text, SAMPLE)}</p></div>
                </>
              )}
              <div className="au-msgbar">
                <button type="button" className="btn small" onClick={() => void putBack()}>Reset</button>
                <button type="button" className="btn small" onClick={(e) => insertVariable(e.currentTarget)}>Insert variable</button>
              </div>
            </div>
          )}

          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>Save</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

/* ---- What they did ---- */

function Activity({ businessId }: { businessId: Id<"businesses"> }) {
  const fixed = useKept(useQuery(api.crm.automations.activity, { businessId }));
  const mine = useKept(useQuery(api.crm.customAutomations.activity, { businessId }));
  // The fixed four and the custom ones in one list, newest first.
  const rows = fixed === undefined || mine === undefined ? undefined : [...fixed, ...mine].sort((a, b) => b.at - a.at).slice(0, 100);
  return (
    <section className="au-group">
      <h2>Activity</h2>
      <div className="table-card">
        <div className="table-wrap">
          <table className="table">
            <colgroup><col style={{ width: 170 }} /><col style={{ width: "26%" }} /><col style={{ width: "20%" }} /><col style={{ width: 130 }} /><col /></colgroup>
            <thead><tr><th>When</th><th>Automation</th><th>For</th><th>Result</th><th>Details</th></tr></thead>
            <tbody>
              {rows === undefined && <tr><td colSpan={5}><span className="sk" style={{ display: "block", height: 18 }} /></td></tr>}
              {rows?.length === 0 && <tr><td colSpan={5} className="sub">Nothing has run yet.</td></tr>}
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="sub">{when(r.at)}</td>
                  <td title={r.title}>{r.title}</td>
                  <td>
                    {r.quoteId ? <Link href={`/quotes/${r.quoteId}`}>Quote #{r.quoteNumber}</Link> : r.opportunityId ? <Link href={`/requests/${r.opportunityId}`}>{r.projectTitle || "Request"}</Link> : "—"}
                    {r.clientName && <div className="sub">{r.clientName}</div>}
                  </td>
                  <td><span className={`pill ${STATUS[r.status].cls}`}><span className="dot" />{STATUS[r.status].label}</span></td>
                  <td className="sub">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
