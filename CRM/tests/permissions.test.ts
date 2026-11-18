import { describe, expect, it } from "vitest";
import { allows, assignedOnlyOf, canSeeRecord, levelsOf, MODULES, PRESETS, PRESET_BUTTONS, type Level, type Module } from "../../convex/crm/lib/permissions";
import { ROLES } from "../../convex/crm/lib/stages";

const at = (roles: Parameters<typeof levelsOf>[0], m: Module, overrides?: Parameters<typeof levelsOf>[1]) => levelsOf(roles, overrides)[m];

describe("The permission presets (PRD 5.5, design 2026-11-18-permissions)", () => {
  it("give every role a level for every module, and the five PRD groups exist", () => {
    expect([...ROLES]).toEqual(["admin", "sales", "office", "pm", "installer"]);
    for (const r of ROLES) for (const m of MODULES) expect(["none", "view", "edit", "full"]).toContain(PRESETS[r][m]);
  });

  it("match the approved table", () => {
    expect(at(["admin"], "settings")).toBe("full");
    expect(at(["office"], "settings")).toBe("none");
    expect(at(["office"], "templates")).toBe("edit");
    expect(at(["sales"], "quotes")).toBe("edit");
    expect(at(["sales"], "invoices")).toBe("view");
    expect(at(["sales"], "pipelinePreplanning")).toBe("view");
    expect(at(["pm"], "pipelinePreplanning")).toBe("edit");
    expect(at(["pm"], "pipelineConstruction")).toBe("edit");
    expect(at(["pm"], "pipelineSales")).toBe("view");
    expect(at(["pm"], "payments")).toBe("view");
    expect(at(["installer"], "pipelineConstruction")).toBe("edit");
    expect(at(["installer"], "schedule")).toBe("view");
    expect(at(["installer"], "clients")).toBe("none");
    expect(at(["installer"], "prices")).toBe("none");
    expect(at(["office", "sales", "pm"], "prices")).toBe("view");
  });

  it("give a person with several roles the most any of them gives", () => {
    expect(at(["pm", "office"], "pipelineSales")).toBe("edit");
    expect(at(["installer", "pm"], "prices")).toBe("view");
    expect(at(["installer", "pm"], "clients")).toBe("view");
  });

  it("let an Admin's override raise or lower one module for one person, and leave the rest alone", () => {
    expect(at(["sales"], "invoices", { invoices: "edit" })).toBe("edit");
    expect(at(["office"], "invoices", { invoices: "none" })).toBe("none");
    expect(at(["office"], "quotes", { invoices: "none" })).toBe("edit");
    expect(at(["office"], "quotes", { quotes: "bogus" as Level })).toBe("edit"); // an unknown level is ignored
  });

  it("compare levels in order", () => {
    expect(allows("full", "edit")).toBe(true);
    expect(allows("edit", "edit")).toBe(true);
    expect(allows("view", "edit")).toBe(false);
    expect(allows("none", "view")).toBe(false);
  });

  it("limit an Installer to assigned records by default, anyone else only when the Admin switches it on", () => {
    expect(assignedOnlyOf(["installer"], undefined)).toBe(true);
    expect(assignedOnlyOf(["installer", "pm"], undefined)).toBe(false);
    expect(assignedOnlyOf(["sales"], undefined)).toBe(false);
    expect(assignedOnlyOf(["sales"], true)).toBe(true);
    expect(assignedOnlyOf(["installer"], false)).toBe(false);
  });

  it("show an assigned-only person just their own records", () => {
    const rec = { salespersonId: "s", projectManagerId: "p", installerIds: ["i1", "i2"] };
    expect(canSeeRecord({ assignedOnly: false, userId: "x" }, rec)).toBe(true);
    expect(canSeeRecord({ assignedOnly: true, userId: "x" }, rec)).toBe(false);
    expect(canSeeRecord({ assignedOnly: true, userId: "i2" }, rec)).toBe(true);
    expect(canSeeRecord({ assignedOnly: true, userId: "p" }, rec)).toBe(true);
    expect(canSeeRecord({ assignedOnly: true, userId: "s" }, rec)).toBe(true);
    expect(canSeeRecord({ assignedOnly: true, userId: "i1" }, {})).toBe(false);
  });

  it("offer Jobber-like preset buttons that are real levels", () => {
    for (const b of PRESET_BUTTONS) for (const m of MODULES) expect(["none", "view", "edit", "full"]).toContain(b.levels[m]);
    expect(PRESET_BUTTONS.map((b) => b.label)).toEqual(["Field crew", "Crew lead", "Office", "Manager"]);
  });
});
