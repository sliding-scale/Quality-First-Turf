import { describe, expect, it } from "vitest";
import { shouldPrefill } from "../lib/quote-prefill";

const blank = { kind: "item" as const, name: "" };

describe("Pre-filling a new quote from the site visit", () => {
  it("starts for a new quote with a project and only a blank line", () => {
    expect(shouldPrefill([blank], true, true)).toBe(true);
    expect(shouldPrefill([], true, true)).toBe(true);
    expect(shouldPrefill([{ kind: "item", name: "   " }], true, true)).toBe(true);
  });

  it("does not start for an existing quote, or with no project", () => {
    expect(shouldPrefill([blank], true, false)).toBe(false);
    expect(shouldPrefill([blank], false, true)).toBe(false);
  });

  it("does not start once a line has been typed or a text line added", () => {
    expect(shouldPrefill([{ kind: "item", name: "Turf" }], true, true)).toBe(false);
    expect(shouldPrefill([blank, { kind: "text", name: "" }], true, true)).toBe(false);
  });
});
