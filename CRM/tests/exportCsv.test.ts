import { describe, expect, it } from "vitest";
import { csvField, csvFile, csvLine, dollars, isoDay, safeCell } from "../../convex/crm/lib/exportCsv";

describe("export CSV rules", () => {
  it("neutralises cells a spreadsheet would run, but not phones or numbers", () => {
    expect(safeCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(safeCell("-2+3")).toBe("'-2+3"); // a spreadsheet would work this out
    expect(safeCell("-HYPERLINK(\"x\")")).toMatch(/^'/);
    expect(safeCell("+1 (555) 010-1111")).toBe("+1 (555) 010-1111");
    expect(safeCell("-5")).toBe("-5");
    expect(safeCell("\tfoo")).toBe("'\tfoo");
    expect(safeCell("Turf & more")).toBe("Turf & more");
  });
  it("escapes commas, quotes and line breaks, and writes numbers as they are", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(12.5)).toBe("12.5");
    expect(csvField(NaN)).toBe("");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField("")).toBe("");
    expect(csvLine(["a", 1, null, "b,c"])).toBe('a,1,,"b,c"');
  });
  it("makes a whole file with a byte-order mark and CRLF lines", () => {
    expect(csvFile(["A", "B"], [["x", 1], ["=y", 2]])).toBe("﻿A,B\r\nx,1\r\n'=y,2\r\n");
    expect(csvFile(["A"], [])).toBe("﻿A\r\n");
  });
  it("formats money and days", () => {
    expect(dollars(120000)).toBe("1200.00");
    expect(dollars(5)).toBe("0.05");
    expect(dollars(-250)).toBe("-2.50");
    expect(dollars(null)).toBe("");
    expect(isoDay(Date.UTC(2026, 10, 20, 23, 59))).toBe("2026-11-20");
    expect(isoDay(undefined)).toBe("");
  });
});
