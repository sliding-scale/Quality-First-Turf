import { describe, expect, it } from "vitest";
import { convertBlockReason } from "../lib/convert-reason";

describe("convertBlockReason", () => {
  it("lets an approved or converted quote through to the backend's own checks", () => {
    expect(convertBlockReason("Approved", true)).toBeNull();
    expect(convertBlockReason("Converted", true)).toBeNull();
  });
  it("says why a quote that is not approved cannot become a job", () => {
    for (const status of ["Draft", "Awaiting response", "Changes requested", "Rejected", "Archived"]) expect(convertBlockReason(status, true)).toMatch(/\w/);
    expect(convertBlockReason("Draft", true)).toMatch(/draft/i);
    expect(convertBlockReason("Awaiting response", true)).toMatch(/not approved/i);
  });
  it("says so when there is no project, whatever the status", () => {
    expect(convertBlockReason("Approved", false)).toMatch(/not linked to a project/);
  });
});
