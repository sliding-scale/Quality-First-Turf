/* Who may do what (PRD 5.5, design 2026-11-18-permissions). Each role is a preset of levels per module; a person gets the most any of their
   roles gives, and an Admin can override a module for one person. Pure TypeScript, shared by the backend (access.ts enforces it, never only
   the UI, CRM rule 3) and the screens (the menu and the Permissions form). No Convex or React imports. */

import type { Role } from "./stages";

export const MODULES = [
  "clients", "requests", "quotes", "schedule", "jobs", "messages", "tasks",
  "pipelineSales", "pipelinePreplanning", "pipelineConstruction", "pipelineFinance",
  "invoices", "payments", "prices", "templates", "settings",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABEL: Record<Module, string> = {
  clients: "Clients", requests: "Requests", quotes: "Quotes", schedule: "Schedule", jobs: "Jobs", messages: "Messages", tasks: "Tasks",
  pipelineSales: "Pipeline: Sales", pipelinePreplanning: "Pipeline: Preplanning", pipelineConstruction: "Pipeline: Construction", pipelineFinance: "Pipeline: Finance",
  invoices: "Invoices", payments: "Payments", prices: "Show pricing", templates: "Disclaimers and invoice settings", settings: "Team and settings",
};

/** None: no access. View: look. Edit: add and change. Full: also delete and reopen. For "prices", View means prices and costs are shown. */
export const LEVELS = ["none", "view", "edit", "full"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { none: "None", view: "View", edit: "Create and edit", full: "Edit and delete" };
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, full: 3 };

export const allows = (have: Level, need: Level): boolean => RANK[have] >= RANK[need];
export const isLevel = (x: unknown): x is Level => typeof x === "string" && (LEVELS as readonly string[]).includes(x);

type Levels = Record<Module, Level>;
const row = (l: [Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level, Level]): Levels =>
  Object.fromEntries(MODULES.map((m, i) => [m, l[i]])) as Levels;

/*                   clients  requests quotes   schedule jobs     messages tasks    p.Sales  p.Plan   p.Constr p.Fin    invoices payments prices   templates settings */
export const PRESETS: Record<Role, Levels> = {
  admin:     row(["full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full", "full"]),
  office:    row(["edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "edit", "view", "edit", "none"]),
  sales:     row(["edit", "edit", "edit", "edit", "view", "edit", "edit", "edit", "view", "view", "view", "view", "view", "view", "view", "none"]),
  pm:        row(["view", "view", "view", "edit", "edit", "edit", "edit", "view", "edit", "edit", "view", "view", "view", "view", "none", "none"]),
  installer: row(["none", "none", "none", "view", "none", "none", "view", "none", "none", "edit", "none", "none", "none", "none", "none", "none"]),
};

/** A person's level in every module: the most any of their roles gives, then the Admin's overrides for that person. */
export function levelsOf(roles: readonly Role[], overrides?: Partial<Record<Module, Level>>): Levels {
  const out = Object.fromEntries(MODULES.map((m) => [m, "none" as Level])) as Levels;
  for (const r of roles) for (const m of MODULES) if (RANK[PRESETS[r][m]] > RANK[out[m]]) out[m] = PRESETS[r][m];
  if (overrides) for (const m of MODULES) if (isLevel(overrides[m])) out[m] = overrides[m] as Level;
  return out;
}

/** Whether a person only sees the records they are assigned to: on by default for someone who is only an Installer; otherwise the Admin's switch. */
export function assignedOnlyOf(roles: readonly Role[], override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return roles.length > 0 && roles.every((r) => r === "installer");
}

/** A record is theirs when they are its salesperson, its project manager or on its work team. */
export function canSeeRecord(
  who: { assignedOnly: boolean; userId: string },
  rec: { salespersonId?: string; projectManagerId?: string; installerIds?: readonly string[] },
): boolean {
  if (!who.assignedOnly) return true;
  return rec.salespersonId === who.userId || rec.projectManagerId === who.userId || (rec.installerIds ?? []).includes(who.userId);
}

/** Jobber-like starting points for the Permissions form. They only fill the levels; the Admin can change each one. */
export const PRESET_BUTTONS: { label: string; hint: string; levels: Levels }[] = [
  { label: "Field crew", hint: "Their own schedule and tasks, and the work they are assigned. No prices.", levels: PRESETS.installer },
  { label: "Crew lead", hint: "Preplanning and construction work and the schedule. Looks at the rest.", levels: PRESETS.pm },
  { label: "Office", hint: "Everything except team and settings.", levels: PRESETS.office },
  { label: "Manager", hint: "Everything, including team and settings.", levels: PRESETS.admin },
];

/** The module a project is governed by, from the pipeline it is in. */
export function pipelineModule(pipeline: string): Module {
  return pipeline === "Preplanning" ? "pipelinePreplanning" : pipeline === "Construction" ? "pipelineConstruction" : pipeline === "Finance" ? "pipelineFinance" : "pipelineSales";
}
