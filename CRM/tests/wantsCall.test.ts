import { describe, expect, it } from "vitest";
import { buildDiscovery, emptyDiscovery, projectBudgets, projectGoals, projectSizes, projectTimelines, projectTypes, type DiscoveryState } from "../../convex/shared/discovery";

/* "Have a professional reach out" (client notes of 2026-11-20): a request with no services, marked as wanting a call. */

function filled(over: Partial<DiscoveryState> = {}): DiscoveryState {
  return {
    ...emptyDiscovery(),
    firstName: "Test", lastName: "Layout", phone: "(555) 123-4567", email: "t@example.com",
    street1: "12 Main St", city: "Portland", state: "Oregon", zip: "97201",
    project: { type: projectTypes[0].value, scope: ["Backyard"], size: projectSizes[1].value, goal: projectGoals[2].value, timeline: projectTimelines[0].value, budget: projectBudgets[1].value },
    ...over,
  };
}

describe("wants a call", () => {
  it("is off by default, and no services is still refused", () => {
    expect(emptyDiscovery().wantsCall).toBe(false);
    expect(buildDiscovery(filled(), { requireProject: true })).toMatchObject({ fieldId: "services", error: "Choose at least one service." });
  });

  it("builds a request with no services and a contact-preference answer", () => {
    const built = buildDiscovery(filled({ wantsCall: true }), { requireProject: true });
    expect(built.error).toBeNull();
    expect(built.payload?.services).toEqual([]);
    expect(built.payload?.answers).toContainEqual({ question: "Contact preference", value: "A professional will reach out" });
    expect(built.payload?.answers).toContainEqual({ question: "Project scope", value: "Backyard" });
  });

  it("still needs the contact details and the project answers", () => {
    expect(buildDiscovery(filled({ wantsCall: true, phone: "" }), { requireProject: true })).toMatchObject({ fieldId: "phone" });
    const blank = filled({ wantsCall: true });
    expect(buildDiscovery({ ...blank, project: { ...blank.project, budget: "" } }, { requireProject: true })).toMatchObject({ fieldId: "project-budget" });
  });

  it("ignores services that were ticked before the customer chose to be called", () => {
    const built = buildDiscovery(filled({ wantsCall: true, services: ["SOD"], where: {} }), { requireProject: true });
    expect(built.error).toBeNull();
    expect(built.payload?.services).toEqual([]);
    expect(built.payload?.answers.some((a) => a.question.startsWith("SOD"))).toBe(false);
  });

  it("does not mark a request that picked services", () => {
    const built = buildDiscovery(filled({ services: ["SOD"], where: { SOD: ["Front yard"] } }), { requireProject: true });
    expect(built.payload?.answers.some((a) => a.question === "Contact preference")).toBe(false);
  });
});
