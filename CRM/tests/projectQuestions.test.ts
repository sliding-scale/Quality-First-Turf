import { describe, expect, it } from "vitest";
import {
  asksWhere,
  buildDiscovery,
  emptyDiscovery,
  needsQuestions,
  projectBudgets,
  projectGoals,
  projectSizes,
  projectTypes,
  projectTimelines,
  projectToForm,
  type DiscoveryState,
} from "../../convex/shared/discovery";

/* The "Your project" questions and "Where in your yard?" (D-087): what they validate, what they write, and that the sales form gets them back. */

function filled(services: string[]): DiscoveryState {
  return {
    ...emptyDiscovery(),
    firstName: "Test", lastName: "Layout", phone: "(555) 123-4567", email: "t@example.com",
    street1: "12 Main St", city: "Portland", state: "Oregon", zip: "97201",
    services,
    project: { type: projectTypes[0].value, scope: ["Backyard", "Putting green"], size: projectSizes[1].value, goal: projectGoals[2].value, timeline: projectTimelines[0].value, budget: projectBudgets[1].value },
    where: { SOD: ["Front yard", "Side yard"] },
  };
}

describe("project questions", () => {
  it("asks where for every service except the ones that list their yards one by one", () => {
    expect(["Demo", "Putting Green", "Artificial Grass"].map(asksWhere)).toEqual([false, false, false]);
    expect(["SOD", "Pavers", "Underground"].map(asksWhere)).toEqual([true, true, true]);
    expect(needsQuestions(["SOD"])).toBe(true);
    expect(needsQuestions([])).toBe(false);
  });

  it("refuses an unanswered project question, and a service with no place, when they are required", () => {
    const blank = filled(["SOD"]);
    expect(buildDiscovery({ ...blank, project: { ...blank.project, budget: "" } }, { requireProject: true })).toMatchObject({ fieldId: "project-budget" });
    expect(buildDiscovery({ ...blank, project: { ...blank.project, scope: [] } }, { requireProject: true })).toMatchObject({ fieldId: "project-scope" });
    expect(buildDiscovery({ ...blank, where: {} }, { requireProject: true })).toMatchObject({ fieldId: "where-sod", error: "Choose where in your yard SOD goes." });
    expect(buildDiscovery(blank, { requireProject: true }).error).toBeNull();
  });

  it("still saves a project that has none of them, as the sales form does for projects submitted earlier", () => {
    const old = { ...filled(["SOD"]), project: emptyDiscovery().project, where: {} };
    expect(buildDiscovery(old).error).toBeNull();
  });

  it("writes the answers first, one answer per choice, so Jobber's first 60 always carry them", () => {
    const built = buildDiscovery(filled(["SOD"]), { requireProject: true });
    expect(built.payload?.answers.slice(0, 10)).toEqual([
      { question: "Customer type", value: "Homeowner" },
      { question: "Project type", value: projectTypes[0].value },
      { question: "Project scope", value: "Backyard" },
      { question: "Project scope", value: "Putting green" },
      { question: "Space size", value: projectSizes[1].value },
      { question: "Main goal", value: projectGoals[2].value },
      { question: "Timeline", value: projectTimelines[0].value },
      { question: "Investment range", value: projectBudgets[1].value },
      { question: "SOD location", value: "Front yard" },
      { question: "SOD location", value: "Side yard" },
    ]);
  });

  it("gives them back to the form from the saved answers", () => {
    const built = buildDiscovery(filled(["SOD"]), { requireProject: true });
    const saved = { ...built.payload!, products: [], measurements: built.payload!.measurements };
    const { form } = projectToForm(saved);
    expect(form.project).toEqual(filled(["SOD"]).project);
    expect(form.where).toEqual({ SOD: ["Front yard", "Side yard"] });
    // Saving again from that form writes the same answers: nothing is lost by a visit.
    expect(buildDiscovery(form).payload?.answers.filter((a) => /scope|size|goal|Timeline|Investment|location/.test(a.question))).toEqual(
      built.payload?.answers.filter((a) => /scope|size|goal|Timeline|Investment|location/.test(a.question)),
    );
  });
});
