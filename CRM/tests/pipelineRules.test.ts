import { describe, expect, it } from "vitest";
import { checkMove, checkWorkMove, timeInStage, PIPELINE_GROUPS, CLOSED_STAGES, LEAD_SOURCES, PREPLANNING_STAGES, CONSTRUCTION_STAGES } from "../../convex/crm/lib/stages";

const staff = { isAdmin: false };
const admin = { isAdmin: true };

describe("pipeline stage rules", () => {
  it("lists the board's columns in the PRD's order", () => {
    expect([...PIPELINE_GROUPS.Requests, ...PIPELINE_GROUPS.Quotes]).toEqual([
      "New Request",
      "Schedule Onsite Consultation",
      "Onsite Consultation",
      "Quote Draft & Site Plan / Design",
      "Proposal Delivered — Awaiting Response",
      "Changes Requested",
      "Quotes Approved — Contract Out for Signature",
    ]);
    expect([...CLOSED_STAGES]).toEqual(["Closed Won", "Closed Lost"]);
    expect(LEAD_SOURCES).toHaveLength(9);
  });

  it("refuses a move to the stage the project is already in", () => {
    expect(checkMove("New Request", "New Request", staff).ok).toBe(false);
  });

  it("allows forward and backward moves between open stages", () => {
    expect(checkMove("New Request", "Onsite Consultation", staff).ok).toBe(true);
    expect(checkMove("Changes Requested", "Quote Draft & Site Plan / Design", staff).ok).toBe(true);
  });

  it("needs a reason for Closed Lost", () => {
    expect(checkMove("Changes Requested", "Closed Lost", staff).ok).toBe(false);
    expect(checkMove("Changes Requested", "Closed Lost", { isAdmin: false, reason: "   " }).ok).toBe(false);
    expect(checkMove("Changes Requested", "Closed Lost", { isAdmin: false, reason: "Chose another company" }).ok).toBe(true);
  });

  it("leaves Closed Won to the server, which checks the project's quote (not a role)", () => {
    expect(checkMove("Quotes Approved — Contract Out for Signature", "Closed Won", staff).ok).toBe(true);
    expect(checkMove("Quotes Approved — Contract Out for Signature", "Closed Won", admin).ok).toBe(true);
  });

  it("lets only an Admin reopen a closed project", () => {
    expect(checkMove("Closed Won", "New Request", staff).ok).toBe(false);
    expect(checkMove("Closed Lost", "New Request", admin).ok).toBe(true);
  });

  it("refuses unknown stages unless they are the business's custom stages", () => {
    expect(checkMove("New Request", "Made Up", staff).ok).toBe(false);
    expect(checkMove("New Request", "Site Survey", { isAdmin: false, custom: ["Site Survey"] }).ok).toBe(true);
  });

  it("lists the Preplanning and Construction stages in the PRD's order", () => {
    expect([...PREPLANNING_STAGES]).toEqual([
      "Ready for Preplanning",
      "Contract & Scope of Work Review",
      "Material Takeoff & Availability",
      "Installer Work Package",
      "Crew Alignment & Hold",
      "Schedule & Access Confirmation",
      "Order & Schedule Delivery for Materials",
      "Ready for Construction / Installs Scheduled",
    ]);
    expect([...CONSTRUCTION_STAGES]).toEqual([
      "Ready to Start",
      "PM Job Walk & Mark-up",
      "20% Completed",
      "40% Completed",
      "60% Completed",
      "80% Completed",
      "PM Job Walk with Client",
      "Punch List / Corrections Needed",
      "100% Completed & Sign-off",
    ]);
  });

  it("moves freely inside Preplanning and Construction, and holds the last construction stage for sign-off", () => {
    expect(checkWorkMove("Preplanning", "Ready for Preplanning", "Installer Work Package").ok).toBe(true);
    expect(checkWorkMove("Construction", "Ready to Start", "80% Completed").ok).toBe(true);
    expect(checkWorkMove("Construction", "Punch List / Corrections Needed", "100% Completed & Sign-off").ok).toBe(false);
    expect(checkWorkMove("Construction", "Punch List / Corrections Needed", "100% Completed & Sign-off", { signOff: true }).ok).toBe(true);
    expect(checkWorkMove("Preplanning", "Ready for Preplanning", "Ready to Start").ok).toBe(false);
    expect(checkWorkMove("Construction", "Ready to Start", "Ready to Start").ok).toBe(false);
  });

  it("computes time in stage, falling back to the request time", () => {
    expect(timeInStage(undefined, 1000, 5000)).toBe(4000);
    expect(timeInStage(3000, 1000, 5000)).toBe(2000);
    expect(timeInStage(9000, 1000, 5000)).toBe(0);
  });
});
