"use client";

/* The New Automation panel (D-071), copied from Jobber's: a side panel with an editable title, then three steps written as a sentence you
   fill in: When this happens (Date passed or Something occurs), And only if (conditions, added with the + button) and Then do this (Notify,
   Add tag or Update status). The words in green are the choices: each opens a small menu. Saving an existing automation, turning it on or
   off and deleting it are here too. "Date arrives" and invoices are Jobber's but need invoices, so they are shown greyed. Admin only. */

import { useMutation } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CONDITION_FIELDS, CUSTOM_VARIABLES, DEFAULT_WORDING, EVENTS, FIELDS_FOR, FIELD_LABEL, KIND_LABEL, MAX_CUSTOM_DAYS, METHOD_LABEL, NOTIFY_METHODS, OBJECT_LABEL,
  QUOTE_STATUSES, UPDATE_STATUSES, checkDefinition, renderCustom,
  type Action, type Condition, type ConditionField, type CustomDefinition, type CustomVars, type NotifyMethod, type Trigger, type TriggerKind, type TriggerObject,
} from "@/convex/crm/lib/customAutomation";
import { CLIENT_TAGS, SALES_STAGES } from "@/convex/crm/lib/stages";
import { failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI, type MenuItem } from "./ui-provider";

export type SavedCustom = {
  id: Id<"customAutomations">;
  title: string;
  active: boolean;
  trigger: Trigger;
  conditions: Condition[];
  action: Action;
};

const SAMPLE: CustomVars = { CLIENT_FIRST_NAME: "Natasha", CLIENT_NAME: "Natasha Lee", COMPANY_NAME: "Quality First Turf Landscape", DEFAULT_PHONE: "(555) 010-0000", QUOTE_NUMBER: "#2345", PROJECT_TITLE: "Backyard turf" };
const METHOD_WORDS: Record<NotifyMethod, string> = { both: "text or email", email: "email", text: "text" };
const EXIT_MS = 200;

const lower = (s: string) => s.toLowerCase();

/** What the "value" box of each condition offers. */
function valueChoices(field: ConditionField): string[] | null {
  if (field === "quoteStatus") return [...QUOTE_STATUSES];
  if (field === "stage") return [...SALES_STAGES];
  if (field === "clientTag") return [...CLIENT_TAGS];
  return null; // line items are typed
}
const VALUE_HINT: Record<ConditionField, string> = { quoteStatus: "this status", stage: "this stage", clientTag: "this tag", lineItem: "this line item" };

export function AutomationBuilder({ businessId, automation, onClose }: { businessId: Id<"businesses">; automation: SavedCustom | null; onClose: () => void }) {
  const { toast, dropdown } = useUI();
  const save = useMutation(api.crm.customAutomations.save);
  const setActive = useMutation(api.crm.customAutomations.setActive);
  const remove = useMutation(api.crm.customAutomations.remove);
  const [title, setTitle] = useState(automation?.title ?? "");
  const [trigger, setTrigger] = useState<Trigger | null>(automation?.trigger ?? null);
  const [conditions, setConditions] = useState<Condition[]>(automation?.conditions ?? []);
  const [action, setAction] = useState<Action | null>(automation?.action ?? null);
  const [days, setDays] = useState(String(automation?.trigger.days ?? ""));
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editingMessage && !confirmDelete && !busy) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingMessage, confirmDelete, busy]);
  useEffect(() => { if (!automation) titleRef.current?.focus(); }, [automation]);

  const nDays = days.trim() === "" ? undefined : Number(days);
  const fullTrigger: Trigger | null = trigger ? { ...trigger, ...(trigger.kind === "datePassed" ? { days: nDays } : { days: undefined }) } : null;
  const definition: CustomDefinition | null = fullTrigger && action ? { title, trigger: fullTrigger, conditions, action } : null;
  const problem = !trigger ? "Choose when this happens." : !action ? "Choose what to do." : checkDefinition(definition!);

  /* ---- the trigger ---- */

  function chooseKind(kind: TriggerKind) {
    const object: TriggerObject = "project";
    setTrigger({ kind, object: kind === "occurs" ? "project" : object, event: EVENTS[kind][kind === "occurs" ? "project" : object][0].value });
    if (kind === "occurs") setDays("");
    setConditions([]);
    setAction((a) => (a?.kind === "updateStatus" ? null : a));
  }
  function chooseObject(object: TriggerObject) {
    if (!trigger) return;
    setTrigger({ ...trigger, object, event: EVENTS[trigger.kind][object][0].value });
    setConditions((cs) => cs.filter((c) => FIELDS_FOR[object].includes(c.field)));
    if (object !== "quote") setAction((a) => (a?.kind === "updateStatus" ? null : a));
  }
  const kindMenu = (anchor: HTMLElement) =>
    dropdown(anchor, [
      { label: KIND_LABEL.datePassed, icon: "calendar", onSelect: () => chooseKind("datePassed") },
      { label: "Date arrives (needs invoices)", icon: "calendar", disabled: true },
      { label: KIND_LABEL.occurs, icon: "calendar", onSelect: () => chooseKind("occurs") },
    ]);
  const objectMenu = (anchor: HTMLElement) => {
    if (!trigger) return;
    const items: MenuItem[] = (["quote", "project"] as const)
      .filter((o) => EVENTS[trigger.kind][o].length > 0)
      .map((o) => ({ label: OBJECT_LABEL[o].charAt(0).toUpperCase() + OBJECT_LABEL[o].slice(1), checked: trigger.object === o, onSelect: () => chooseObject(o) }));
    if (trigger.kind === "datePassed") items.push({ label: "Invoices (not built yet)", disabled: true });
    dropdown(anchor, items);
  };
  const eventMenu = (anchor: HTMLElement) => {
    if (!trigger) return;
    dropdown(anchor, EVENTS[trigger.kind][trigger.object].map((e) => ({ label: e.label, checked: trigger.event === e.value, onSelect: () => setTrigger({ ...trigger, event: e.value }) })));
  };

  /* ---- conditions ---- */

  const addCondition = (anchor: HTMLElement) => {
    if (!trigger) return;
    const taken = new Set(conditions.map((c) => c.field));
    dropdown(anchor, [
      { heading: "Add condition" },
      ...CONDITION_FIELDS.filter((f) => FIELDS_FOR[trigger.object].includes(f)).map((f) => ({
        label: FIELD_LABEL[f], disabled: taken.has(f), onSelect: () => setConditions((cs) => [...cs, { field: f, op: "is" as const, values: [""] }]),
      })),
    ]);
  };
  const patchCondition = (i: number, p: Partial<Condition>) => setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  /* ---- the action ---- */

  const actionMenu = (anchor: HTMLElement) =>
    dropdown(anchor, [
      { label: "Notify", icon: "mail", onSelect: () => setAction({ kind: "notify", method: "both", ...DEFAULT_WORDING }) },
      { label: "Add tag", icon: "contact", onSelect: () => setAction({ kind: "addTag", tag: "" }) },
      { label: trigger?.object === "quote" ? "Update status" : "Update status (quotes only)", icon: "stage", disabled: trigger?.object !== "quote", onSelect: () => setAction({ kind: "updateStatus", status: "Archived" }) },
    ]);

  /* ---- saving ---- */

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setTriedSave(true);
    if (problem || !definition) {
      if (!title.trim()) titleRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await save({ businessId, ...(automation ? { id: automation.id } : {}), title: definition.title, trigger: definition.trigger, conditions, action: definition.action, now: Date.now() });
      toast(automation ? "Automation saved." : "Automation created.");
      setLeaving(true);
    } catch (err) {
      toast(failure(err, "That could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive() {
    if (!automation) return;
    try {
      await setActive({ id: automation.id, active: !automation.active, now: Date.now() });
      toast(automation.active ? "Automation deactivated." : "Automation activated.");
      setLeaving(true);
    } catch (err) {
      toast(failure(err, "That could not be changed."));
    }
  }
  async function doDelete() {
    if (!automation) return;
    try {
      await remove({ id: automation.id });
      toast("Automation deleted.");
      setConfirmDelete(false);
      setLeaving(true);
    } catch (err) {
      toast(failure(err, "That could not be deleted."));
    }
  }

  const triggerBad = triedSave && !trigger;
  const actionBad = triedSave && !action;

  return (
    <aside className={`ab-panel${leaving ? " leaving" : ""}`} aria-label={automation ? automation.title : "New automation"}>
      <div className="ab-head">
        <div className="ab-headrow">
          {automation ? <span className={`pill ${automation.active ? "active" : "draft"}`}><span className="dot" />{automation.active ? "Active" : "Inactive"}</span> : <span />}
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setLeaving(true)}><Icon name="x" size={22} /></button>
        </div>
        <input
          ref={titleRef}
          className={`ab-title${triedSave && !title.trim() ? " bad" : ""}`}
          aria-label="Automation title"
          aria-invalid={triedSave && !title.trim()}
          placeholder="Add a title"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <form className="ab-body" onSubmit={(e) => void submit(e)} noValidate>
        <div className="ab-step">
          <div className="ab-label">When this happens</div>
          <div className={`ab-card${triggerBad ? " bad" : ""}`}>
            {!trigger || !fullTrigger ? (
              <button type="button" className="ab-link ab-center" aria-haspopup="menu" onClick={(e) => kindMenu(e.currentTarget)}>When this happens</button>
            ) : (
              <>
                <span className="ab-ico"><Icon name="calendar" size={20} /></span>
                <span className="ab-sentence">
                  {trigger.kind === "datePassed" ? (
                    <>
                      <input className="ab-days" aria-label="Days" inputMode="numeric" placeholder="X" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} /> day(s) after{" "}
                      <button type="button" className="ab-link" onClick={(e) => objectMenu(e.currentTarget)}>{OBJECT_LABEL[trigger.object]}</button> are{" "}
                      <button type="button" className="ab-link" onClick={(e) => eventMenu(e.currentTarget)}>{EVENTS[trigger.kind][trigger.object].find((x) => x.value === trigger.event)?.label}</button>
                    </>
                  ) : (
                    <>
                      When <button type="button" className="ab-link" onClick={(e) => objectMenu(e.currentTarget)}>{OBJECT_LABEL[trigger.object]}</button> are{" "}
                      <button type="button" className="ab-link" onClick={(e) => eventMenu(e.currentTarget)}>{EVENTS[trigger.kind][trigger.object].find((x) => x.value === trigger.event)?.label}</button>
                    </>
                  )}
                </span>
                <button type="button" className="icon-btn ab-trash" aria-label="Remove this trigger" onClick={() => { setTrigger(null); setDays(""); setConditions([]); }}><Icon name="trash" size={18} /></button>
              </>
            )}
          </div>
          {triggerBad && <p className="ab-err">Choose when this happens.</p>}
        </div>

        {conditions.map((c, i) => {
          const choices = valueChoices(c.field);
          const value = c.values[0] ?? "";
          return (
            <div key={c.field} className="ab-step">
              <div className="ab-label">{i === 0 ? "And only if" : "And"}</div>
              <div className={`ab-card${triedSave && !value.trim() ? " bad" : ""}`}>
                <span className="ab-ico"><Icon name="sliders" size={20} /></span>
                <span className="ab-sentence">
                  {FIELD_LABEL[c.field]}{" "}
                  <button type="button" className="ab-link" onClick={(e) => dropdown(e.currentTarget, (c.field === "lineItem" ? [{ label: "include", v: "is" }, { label: "do not include", v: "isNot" }] : [{ label: "is", v: "is" }, { label: "is not", v: "isNot" }]).map((o) => ({ label: o.label, checked: c.op === o.v, onSelect: () => patchCondition(i, { op: o.v as Condition["op"] }) })))}>
                    {c.field === "lineItem" ? (c.op === "is" ? "include" : "do not include") : c.op === "is" ? "is" : "is not"}
                  </button>{" "}
                  {choices ? (
                    <button type="button" className="ab-link" onClick={(e) => dropdown(e.currentTarget, choices.map((o) => ({ label: o, checked: value === o, onSelect: () => patchCondition(i, { values: [o] }) })))}>
                      {value ? lower(value) : VALUE_HINT[c.field]}
                    </button>
                  ) : (
                    <input className="ab-text" aria-label="Line item name" placeholder={VALUE_HINT[c.field]} maxLength={100} value={value} onChange={(e) => patchCondition(i, { values: [e.target.value] })} />
                  )}
                </span>
                <button type="button" className="icon-btn ab-trash" aria-label={`Remove the ${FIELD_LABEL[c.field]} condition`} onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
              </div>
            </div>
          );
        })}

        {trigger && (
          <div className="ab-plus">
            <button type="button" className="ab-plusbtn" aria-label="Add a condition" aria-haspopup="menu" onClick={(e) => addCondition(e.currentTarget)}><Icon name="plus" size={16} /></button>
          </div>
        )}

        <div className="ab-step">
          <div className="ab-label">Then do this</div>
          <div className={`ab-card${actionBad ? " bad" : ""}`}>
            {!action ? (
              <button type="button" className="ab-link ab-center" aria-haspopup="menu" onClick={(e) => actionMenu(e.currentTarget)}>Then do this</button>
            ) : (
              <>
                <span className="ab-ico"><Icon name={action.kind === "notify" ? "mail" : action.kind === "addTag" ? "contact" : "stage"} size={20} /></span>
                <span className="ab-sentence">
                  {action.kind === "notify" && (<>Notify the client by {METHOD_WORDS[action.method ?? "both"]} with <button type="button" className="ab-link" onClick={() => setEditingMessage(true)}>this message</button></>)}
                  {action.kind === "addTag" && (
                    <>
                      Add{" "}
                      <button type="button" className="ab-link" onClick={(e) => dropdown(e.currentTarget, CLIENT_TAGS.map((t) => ({ label: t, checked: action.tag === t, onSelect: () => setAction({ ...action, tag: t }) })))}>{action.tag ? `the "${action.tag}"` : "this"}</button> tag to the client
                    </>
                  )}
                  {action.kind === "updateStatus" && (
                    <>
                      Update the quote&apos;s status to{" "}
                      <button type="button" className="ab-link" onClick={(e) => dropdown(e.currentTarget, UPDATE_STATUSES.map((s) => ({ label: s, checked: action.status === s, onSelect: () => setAction({ ...action, status: s }) })))}>{lower(action.status ?? "this status")}</button>
                    </>
                  )}
                </span>
                <button type="button" className="icon-btn ab-trash" aria-label="Remove this action" onClick={() => setAction(null)}><Icon name="trash" size={18} /></button>
              </>
            )}
          </div>
          {actionBad && <p className="ab-err">Choose what to do.</p>}
        </div>

        {triedSave && problem && <p className="ab-err" role="alert">{problem}</p>}
        {(trigger?.kind === "datePassed" || trigger?.kind === "occurs") && (
          <p className="ab-note">
            {trigger.kind === "datePassed" ? `Only ${trigger.object === "quote" ? "quotes" : "projects"} from after this was turned on are touched. ` : "Only what changes after this was turned on is acted on. "}
            It follows the Sending mode below: in log-only mode it only writes what it would do. Days: 0 to {MAX_CUSTOM_DAYS}.
          </p>
        )}
      </form>

      <div className="ab-foot">
        <button type="button" className="btn primary ab-save" disabled={busy || !!problem} title={problem ?? undefined} onClick={() => void submit()}>{busy ? "Saving…" : "Save"}</button>
        {automation && (
          <button
            type="button"
            className="btn"
            aria-haspopup="menu"
            onClick={(e) =>
              dropdown(e.currentTarget, [
                { label: automation.active ? "Deactivate" : "Activate", onSelect: () => void toggleActive() },
                { divider: true },
                { label: "Delete", danger: true, onSelect: () => setConfirmDelete(true) },
              ], { alignRight: true })
            }
          >
            <Icon name="more" size={20} /> More
          </button>
        )}
      </div>

      {editingMessage && action?.kind === "notify" && (
        <MessageEditor action={action} onClose={() => setEditingMessage(false)} onSave={(a) => { setAction(a); setEditingMessage(false); }} />
      )}
      {confirmDelete && (
        <PipelineModal title="Delete this automation?" onClose={() => setConfirmDelete(false)}>
          {(close) => (
            <div>
              <p className="modal-note">&ldquo;{automation?.title}&rdquo; stops running. What it already did stays in the activity list. This cannot be undone.</p>
              <div className="modal-foot">
                <button type="button" className="btn" onClick={close}>Cancel</button>
                <button type="button" className="btn danger" onClick={() => void doDelete()}>Delete</button>
              </div>
            </div>
          )}
        </PipelineModal>
      )}
    </aside>
  );
}

/* ---- The message (Jobber's "New automation template") ---- */

function MessageEditor({ action, onClose, onSave }: { action: Action; onClose: () => void; onSave: (a: Action) => void }) {
  const { dropdown } = useUI();
  const [method, setMethod] = useState<NotifyMethod>(action.method ?? "both");
  const [subject, setSubject] = useState(action.subject ?? DEFAULT_WORDING.subject);
  const [body, setBody] = useState(action.body ?? DEFAULT_WORDING.body);
  const [text, setText] = useState(action.textBody || DEFAULT_WORDING.textBody);
  const [tab, setTab] = useState<"email" | "text">(method === "text" ? "text" : "email");
  const [bad, setBad] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const showEmail = method !== "text";
  const showText = method !== "email";
  const activeTab = tab === "email" && !showEmail ? "text" : tab === "text" && !showText ? "email" : tab;

  function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    const check = checkDefinition({
      title: "x", trigger: { kind: "occurs", object: "project", event: "updated" }, conditions: [],
      action: { kind: "notify", method, subject, body, textBody: text },
    });
    const problems: Record<string, string> = {};
    if (check) {
      if (/subject/i.test(check)) problems.subject = check;
      else if (/text message/i.test(check)) problems.text = check;
      else problems.body = check;
    }
    setBad(problems);
    if (check) {
      setTab(problems.text ? "text" : "email");
      return;
    }
    onSave({ kind: "notify", method, subject, body, textBody: text });
    close();
  }

  function insertVariable(anchor: HTMLElement) {
    dropdown(anchor, CUSTOM_VARIABLES.map((name) => ({
      label: name.toLowerCase().replace(/_/g, " "),
      onSelect: () => {
        const token = `{{${name}}}`;
        if (activeTab === "text") setText((t) => `${t}${token}`);
        else {
          const el = bodyRef.current;
          const at = el?.selectionStart ?? body.length;
          setBody((b) => `${b.slice(0, at)}${token}${b.slice(el?.selectionEnd ?? at)}`);
        }
      },
    })));
  }

  return (
    <PipelineModal title="New automation template" onClose={onClose} className="au-modal">
      {(close) => (
        <form onSubmit={(e) => submit(e, close)} noValidate>
          <div className="field">
            <label htmlFor="ab-method">Notification method</label>
            <select id="ab-method" value={method} onChange={(e) => setMethod(e.target.value as NotifyMethod)}>
              {NOTIFY_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="au-msg">
            <div className="tabs" role="tablist">
              {showEmail && <button type="button" role="tab" aria-selected={activeTab === "email"} className={`tab${activeTab === "email" ? " active" : ""}`} onClick={() => setTab("email")}>Email</button>}
              {showText && <button type="button" role="tab" aria-selected={activeTab === "text"} className={`tab${activeTab === "text" ? " active" : ""}`} onClick={() => setTab("text")}>Text Message</button>}
            </div>
            {activeTab === "email" ? (
              <>
                <div className={`field${bad.subject ? " bad" : ""}`}>
                  <label htmlFor="ab-sub">Email subject</label>
                  <input id="ab-sub" value={subject} aria-invalid={Boolean(bad.subject)} onChange={(e) => { setSubject(e.target.value); setBad((b) => ({ ...b, subject: "" })); }} />
                  <span className="err">{bad.subject}</span>
                </div>
                <div className={`field${bad.body ? " bad" : ""}`}>
                  <label htmlFor="ab-body">Message</label>
                  <textarea id="ab-body" ref={bodyRef} rows={9} value={body} aria-invalid={Boolean(bad.body)} onChange={(e) => { setBody(e.target.value); setBad((b) => ({ ...b, body: "" })); }} />
                  <span className="err">{bad.body}</span>
                </div>
                <div className="au-preview" aria-label="Preview">
                  <strong>{renderCustom(subject, SAMPLE)}</strong>
                  <p>{renderCustom(body, SAMPLE)}</p>
                </div>
              </>
            ) : (
              <>
                <p className="au-note">Texts are not sent yet: the CRM has no text provider. The wording is kept for when it does.</p>
                <div className={`field${bad.text ? " bad" : ""}`}>
                  <label htmlFor="ab-text">Message</label>
                  <textarea id="ab-text" rows={4} value={text} aria-invalid={Boolean(bad.text)} onChange={(e) => { setText(e.target.value); setBad((b) => ({ ...b, text: "" })); }} />
                  <span className="err">{bad.text}</span>
                </div>
                <div className="au-preview"><p>{renderCustom(text, SAMPLE)}</p></div>
              </>
            )}
            <div className="au-msgbar">
              <button type="button" className="btn small" onClick={() => { setSubject(DEFAULT_WORDING.subject); setBody(DEFAULT_WORDING.body); setText(DEFAULT_WORDING.textBody); setBad({}); }}>Reset</button>
              <button type="button" className="btn small" onClick={(e) => insertVariable(e.currentTarget)}>Insert variable</button>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn primary">Save</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
