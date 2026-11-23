/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { pageSlice, sortRows, viewFromParam } from "../lib/pipeline-list";

const row = (id: string, timeInStageMs: number, valueCents: number, requestedAt: number) => ({ id, timeInStageMs, valueCents, requestedAt });

describe("the list view's paging", () => {
  it("says what is shown and keeps the page inside the range", () => {
    expect(pageSlice(0, 1, 25)).toEqual({ page: 1, pages: 1, from: 0, to: 0 });
    expect(pageSlice(60, 3, 25)).toEqual({ page: 3, pages: 3, from: 51, to: 60 });
    expect(pageSlice(60, 9, 25)).toMatchObject({ page: 3 });
    expect(pageSlice(60, 0, 25)).toMatchObject({ page: 1, from: 1, to: 25 });
    expect(pageSlice(25, 1, 25)).toEqual({ page: 1, pages: 1, from: 1, to: 25 });
  });
});

describe("the list view's order", () => {
  const rows = [row("a", 30, 500, 3), row("b", 10, 900, 1), row("c", 20, 100, 2)];
  it("sorts every project together by the board's sort, either way, without changing the input", () => {
    expect(sortRows(rows, "timeInStage", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "value", "desc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, "createdDate", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps the order it was given for ties", () => {
    const tied = [row("x", 1, 100, 1), row("y", 1, 100, 1), row("z", 1, 100, 1)];
    expect(sortRows(tied, "value", "desc").map((r) => r.id)).toEqual(["x", "y", "z"]);
  });
});

describe("which view the address asks for", () => {
  it("is the board unless the address says list", () => {
    expect(viewFromParam("list")).toBe("list");
    expect(viewFromParam("board")).toBe("board");
    expect(viewFromParam(null)).toBe("board");
    expect(viewFromParam("nonsense")).toBe("board");
  });
});
