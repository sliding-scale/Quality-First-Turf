import { describe, expect, it } from "vitest";
import { JOB_STATUSES, jobStatusOf, type JobFacts } from "../../convex/crm/lib/jobStatus";

const DAY = 86_400_000;
const D = Date.UTC(2026, 10, 19);
const facts = (over: Partial<JobFacts> = {}): JobFacts => ({ archived: false, closed: false, inFinance: false, invoicesCover: false, visits: [], dayStart: D, ...over });
const visit = (start: number, status: JobFacts["visits"][number]["status"] = "upcoming") => ({ start, status });

describe("Job status (design 2026-11-19-jobs)", () => {
  it("lists the statuses in the order the rules are tried", () => {
    expect([...JOB_STATUSES]).toEqual(["Archived", "Requires Invoicing", "Late", "Unscheduled", "Today", "Upcoming", "Active"]);
  });

  it("is Archived when archived or closed, even with a late visit", () => {
    expect(jobStatusOf(facts({ archived: true, visits: [visit(D - DAY)] }))).toBe("Archived");
    expect(jobStatusOf(facts({ closed: true, visits: [visit(D - DAY)] }))).toBe("Archived");
  });

  it("is Requires Invoicing in Finance until the sent invoices cover the total", () => {
    expect(jobStatusOf(facts({ inFinance: true, invoicesCover: false, visits: [visit(D + DAY)] }))).toBe("Requires Invoicing");
    expect(jobStatusOf(facts({ inFinance: true, invoicesCover: true, visits: [visit(D + DAY)] }))).toBe("Upcoming");
  });

  it("is Late only for an open visit before today", () => {
    expect(jobStatusOf(facts({ visits: [visit(D - 1)] }))).toBe("Late");
    expect(jobStatusOf(facts({ visits: [visit(D - 1, "confirmed")] }))).toBe("Late");
    expect(jobStatusOf(facts({ visits: [visit(D - 1, "completed")] }))).toBe("Active");
    expect(jobStatusOf(facts({ visits: [visit(D - 1, "lost"), visit(D + DAY)] }))).toBe("Upcoming");
  });

  it("is Unscheduled with no visit other than a lost one", () => {
    expect(jobStatusOf(facts())).toBe("Unscheduled");
    expect(jobStatusOf(facts({ visits: [visit(D + DAY, "lost")] }))).toBe("Unscheduled");
  });

  it("is Today for a visit during today, Upcoming for a later one, otherwise Active", () => {
    expect(jobStatusOf(facts({ visits: [visit(D + 3600_000)] }))).toBe("Today");
    expect(jobStatusOf(facts({ visits: [visit(D + DAY)] }))).toBe("Upcoming");
    expect(jobStatusOf(facts({ visits: [visit(D + DAY, "completed")] }))).toBe("Active");
  });
});
