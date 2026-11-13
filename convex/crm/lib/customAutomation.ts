/* Custom automations (D-071): the ones an Admin builds with Jobber's "New Automation" panel (When this happens / And only if / Then do
   this). Pure rules and wording only (no Convex, no React), so the backend, the screen and the tests share one source of truth. The four
   fixed automations of D-065 stay in automationRules.ts and are untouched. */

import { CLIENT_TAGS } from "./stages";

export const MAX_CUSTOM_PER_BUSINESS = 50;
export const MIN_CUSTOM_DAYS = 0;
export const MAX_CUSTOM_DAYS = 365;

/* ---- What starts it ---- */

/** Jobber's three triggers. "Date arrives" (a time of day on a due date) belongs to invoices, which are not built, so it is offered greyed. */
export const TRIGGER_KINDS = ["datePassed", "occurs"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** What the trigger watches. Jobber's "Request pipeline opportunities" and "Quote pipeline opportunities" are one Sales pipeline here. */
export const OBJECTS = ["quote", "project"] as const;
export type TriggerObject = (typeof OBJECTS)[number];

export type Trigger = { kind: TriggerKind; object: TriggerObject; event: string; days?: number };

/** The events each kind of trigger can wait on, with the words the sentence uses ("5 days after quotes are sent"). */
export const EVENTS: Record<TriggerKind, Record<TriggerObject, { value: string; label: string }[]>> = {
  datePassed: {
    quote: [{ value: "sent", label: "sent" }, { value: "approved", label: "approved" }],
    project: [{ value: "created", label: "created" }],
  },
  occurs: {
    quote: [],
    project: [{ value: "updated", label: "updated" }],
  },
};

export const OBJECT_LABEL: Record<TriggerObject, string> = { quote: "quotes", project: "Sales pipeline projects" };
export const KIND_LABEL: Record<TriggerKind, string> = { datePassed: "Date passed", occurs: "Something occurs" };

/* ---- And only if ---- */

export const CONDITION_FIELDS = ["quoteStatus", "stage", "clientTag", "lineItem"] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];
export type Condition = { field: ConditionField; op: "is" | "isNot"; values: string[] };

/** Which conditions each kind of object offers (Jobber offers Status, Client tags and Line items on quotes, Stage on pipeline opportunities). */
export const FIELDS_FOR: Record<TriggerObject, ConditionField[]> = {
  quote: ["quoteStatus", "clientTag", "lineItem"],
  project: ["stage", "clientTag"],
};
export const FIELD_LABEL: Record<ConditionField, string> = { quoteStatus: "Status", stage: "Stage", clientTag: "Client tag", lineItem: "Line items" };
export const QUOTE_STATUSES = ["Awaiting response", "Changes requested", "Approved", "Converted", "Archived"] as const;

/* ---- Then do this ---- */

export const ACTION_KINDS = ["notify", "addTag", "updateStatus"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const NOTIFY_METHODS = ["both", "email", "text"] as const;
export type NotifyMethod = (typeof NOTIFY_METHODS)[number];
export const METHOD_LABEL: Record<NotifyMethod, string> = { both: "Email or text message", email: "Email", text: "Text message" };

export type Action = {
  kind: ActionKind;
  method?: NotifyMethod;
  subject?: string;
  body?: string;
  textBody?: string;
  tag?: string;
  status?: string;
};

/** Updating a quote's status is limited to archiving it (the one status change automation does in Jobber's own four). */
export const UPDATE_STATUSES = ["Archived"] as const;

export type CustomDefinition = { title: string; trigger: Trigger; conditions: Condition[]; action: Action };

/* ---- Message wording ---- */

export const CUSTOM_SUBJECT = "A message from {{COMPANY_NAME}}";
export const CUSTOM_BODY = `Hi {{CLIENT_FIRST_NAME}},

Thank you for choosing {{COMPANY_NAME}}.

Thanks,

{{COMPANY_NAME}}
{{DEFAULT_PHONE}}`;
export const CUSTOM_TEXT = "Hi {{CLIENT_FIRST_NAME}}, this is a message from {{COMPANY_NAME}}.";

export const CUSTOM_VARIABLES = ["CLIENT_FIRST_NAME", "CLIENT_NAME", "COMPANY_NAME", "DEFAULT_PHONE", "QUOTE_NUMBER", "PROJECT_TITLE"] as const;
export type CustomVars = Record<(typeof CUSTOM_VARIABLES)[number], string>;

const VARIABLE = /\{\{\s*([A-Z_]+)\s*\}\}/g;

export function unknownCustomVariables(template: string): string[] {
  const known = new Set<string>(CUSTOM_VARIABLES);
  const bad = new Set<string>();
  for (const m of template.matchAll(VARIABLE)) if (!known.has(m[1])) bad.add(m[1]);
  return [...bad];
}

export function renderCustom(template: string, vars: CustomVars): string {
  return template.replace(VARIABLE, (whole, name: string) => (name in vars ? vars[name as keyof CustomVars] : whole));
}

/* ---- Checking a definition ---- */

/** The first thing wrong with a definition, in plain words, or null when it can be saved. */
export function checkDefinition(d: CustomDefinition): string | null {
  const title = d.title.trim();
  if (!title) return "Give the automation a title.";
  if (title.length > 120) return "The title is too long (120 characters at most).";
  const t = d.trigger;
  if (!(TRIGGER_KINDS as readonly string[]).includes(t.kind)) return "Choose when this happens.";
  if (!(OBJECTS as readonly string[]).includes(t.object)) return "Choose what this is about.";
  if (!EVENTS[t.kind][t.object].some((e) => e.value === t.event)) return "That is not something this can wait for.";
  if (t.kind === "datePassed") {
    if (t.days === undefined || !Number.isInteger(t.days) || t.days < MIN_CUSTOM_DAYS || t.days > MAX_CUSTOM_DAYS) return `Days must be a whole number from ${MIN_CUSTOM_DAYS} to ${MAX_CUSTOM_DAYS}.`;
  } else if (t.days !== undefined) return "Days only apply to a date that has passed.";
  if (d.conditions.length > 5) return "An automation can have up to 5 conditions.";
  for (const c of d.conditions) {
    if (!FIELDS_FOR[t.object].includes(c.field)) return `${FIELD_LABEL[c.field]} is not a condition for ${OBJECT_LABEL[t.object]}.`;
    if (c.op !== "is" && c.op !== "isNot") return "Choose is or is not.";
    const value = (c.values[0] ?? "").trim();
    if (c.values.length !== 1 || !value) return `Choose a value for ${FIELD_LABEL[c.field]}.`;
    if (value.length > 100) return "A condition value is too long.";
    if (c.field === "quoteStatus" && !(QUOTE_STATUSES as readonly string[]).includes(value)) return "Choose one of the quote statuses.";
    if (c.field === "clientTag" && !(CLIENT_TAGS as readonly string[]).includes(value)) return "Choose one of the client tags.";
  }
  const a = d.action;
  if (!(ACTION_KINDS as readonly string[]).includes(a.kind)) return "Choose what to do.";
  if (a.kind === "notify") {
    if (!a.method || !(NOTIFY_METHODS as readonly string[]).includes(a.method)) return "Choose how to notify the client.";
    const subject = a.subject ?? "";
    const body = a.body ?? "";
    const text = a.textBody ?? "";
    if (a.method !== "text" && !subject.trim()) return "The email needs a subject.";
    if (a.method !== "text" && !body.trim()) return "The email needs a message.";
    if (a.method !== "email" && !text.trim()) return "The text message needs a message.";
    if (subject.length > 200) return "The subject is too long (200 characters at most).";
    if (body.length > 5000) return "The message is too long (5,000 characters at most).";
    if (text.length > 600) return "The text message is too long (600 characters at most).";
    const unknown = [...new Set([...unknownCustomVariables(subject), ...unknownCustomVariables(body), ...unknownCustomVariables(text)])];
    if (unknown.length) return `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}. Use Insert variable.`;
  } else if (a.kind === "addTag") {
    if (!a.tag || !(CLIENT_TAGS as readonly string[]).includes(a.tag)) return "Choose the tag to add.";
  } else {
    if (t.object !== "quote") return "Only a quote's status can be updated.";
    if (!a.status || !(UPDATE_STATUSES as readonly string[]).includes(a.status)) return "Choose the status to set.";
  }
  return null;
}

/* ---- Saying it in words, as Jobber's panel does ---- */

export function triggerSentence(t: Trigger): string {
  const object = OBJECT_LABEL[t.object];
  const event = EVENTS[t.kind][t.object].find((e) => e.value === t.event)?.label ?? t.event;
  if (t.kind === "occurs") return `When ${object} are ${event}`;
  const n = t.days ?? 0;
  return `${n} day${n === 1 ? "" : "s"} after ${object} are ${event}`;
}

export function conditionSentence(c: Condition): string {
  const value = c.values[0] ?? "";
  if (c.field === "lineItem") return `Line items ${c.op === "is" ? "include" : "do not include"} "${value}"`;
  return `${FIELD_LABEL[c.field]} ${c.op === "is" ? "is" : "is not"} ${value.toLowerCase()}`;
}

export function actionSentence(a: Action): string {
  if (a.kind === "notify") return a.method === "text" ? "Text the client" : a.method === "email" ? "Email the client" : "Notify the client by text or email";
  if (a.kind === "addTag") return `Add the "${a.tag ?? ""}" tag to the client`;
  return `Update the quote's status to ${(a.status ?? "").toLowerCase()}`;
}

/* ---- Running it ---- */

/** The facts about one item that a condition can look at. `lineNames` is for quotes; `stage` is for projects. */
export type Facts = { quoteStatus?: string; stage?: string; clientTags: readonly string[]; lineNames?: readonly string[] };

export function conditionPasses(c: Condition, f: Facts): boolean {
  const want = (c.values[0] ?? "").trim().toLowerCase();
  let has: boolean;
  switch (c.field) {
    case "quoteStatus": has = (f.quoteStatus ?? "").toLowerCase() === want; break;
    case "stage": has = (f.stage ?? "").toLowerCase() === want; break;
    case "clientTag": has = f.clientTags.some((t) => t.toLowerCase() === want); break;
    case "lineItem": has = (f.lineNames ?? []).some((n) => n.toLowerCase().includes(want)); break;
  }
  return c.op === "is" ? has : !has;
}

export const conditionsPass = (cs: readonly Condition[], f: Facts) => cs.every((c) => conditionPasses(c, f));

/** The default for a new automation's message, so a fresh "Notify" already has wording to edit (and Reset goes back to it). */
export const DEFAULT_WORDING = { subject: CUSTOM_SUBJECT, body: CUSTOM_BODY, textBody: CUSTOM_TEXT } as const;
