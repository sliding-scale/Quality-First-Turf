import { describe, expect, it } from "vitest";
import { centsFromText, itemProblem, markupFromPrice, nameKeyOf, parseCsv, priceFromMarkup, rowsFromCsv, toCsv } from "../../convex/crm/lib/catalogue";

const item = { name: "Turf", description: "", kind: "service" as const, unitPriceCents: 800, taxExempt: false, available: true, customersSelectQuantity: false };

describe("Cost, markup and price move together (Jobber's Products & Services)", () => {
  it("gives the markup Jobber shows for 99.12: cost 111.87, price 200.00", () => {
    expect(markupFromPrice(11187, 20000)).toBe(78.77894);
  });
  it("gives the price back from the cost and the markup", () => {
    expect(priceFromMarkup(11187, 78.77894)).toBe(20000);
    expect(priceFromMarkup(380, 110.52632)).toBe(800);
  });
  it("has no markup when there is no cost", () => {
    expect(markupFromPrice(0, 500)).toBeUndefined();
  });
});

describe("Money in a file", () => {
  it("reads dollars and cents, with a $ or commas", () => {
    expect(centsFromText("111.87")).toBe(11187);
    expect(centsFromText("$1,000.5")).toBe(100050);
    expect(centsFromText("8")).toBe(800);
  });
  it("refuses what is not money", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1,2,3x"]) expect(centsFromText(bad)).toBeNull();
  });
});

describe("Item rules", () => {
  it("accepts a normal item", () => expect(itemProblem(item)).toBeNull());
  it("needs a name and a sane price and duration", () => {
    expect(itemProblem({ ...item, name: "  " })).toMatch(/name/);
    expect(itemProblem({ ...item, unitPriceCents: -1 })).toMatch(/price/);
    expect(itemProblem({ ...item, unitPriceCents: 1.5 })).toMatch(/price/);
    expect(itemProblem({ ...item, durationMinutes: 0 })).toMatch(/duration/);
    expect(itemProblem({ ...item, markupPercent: -150 })).toMatch(/markup/);
  });
  it("compares names without capitals or extra spaces", () => {
    expect(nameKeyOf("  10.01  RP - Olive ")).toBe("10.01 rp - olive");
  });
});

describe("Reading a CSV", () => {
  it("keeps commas, quotes and line breaks inside quoted cells", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
  });
  it("skips blank lines and a byte-order mark", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("turns our own export back into the same items", () => {
    const items = [
      { ...item, name: '10.01 RP - "Olive", Natural', description: "Line one\nLine two", costCents: 380, markupPercent: 110.52632, unitPriceCents: 800, durationMinutes: 60 },
      { ...item, name: "Plain", kind: "product" as const, unitPriceCents: 105, taxExempt: true, available: false, customersSelectQuantity: true },
    ];
    const back = rowsFromCsv(toCsv(items));
    expect(back.problems).toEqual([]);
    expect(back.rows.map(({ line: _line, ...r }) => r)).toEqual(items);
  });
  it("understands Jobber-style headings and works the price out from a cost and markup", () => {
    const r = rowsFromCsv("Name,Unit Cost,Markup,Taxable\nWall,100.00,50,No\n");
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: "Wall", costCents: 10000, markupPercent: 50, unitPriceCents: 15000, taxExempt: true, available: true, kind: "service" });
  });
  it("names the line, the item and the reason for every row it cannot read, and keeps the others", () => {
    const r = rowsFromCsv("Name,Unit Price\nGood,5.00\n,3.00\nBad price,abc\nNo price,\n");
    expect(r.rows.map((x) => x.name)).toEqual(["Good"]);
    expect(r.problems.map((p) => [p.line, p.name, p.message])).toEqual([
      [3, "", "Give the item a name."],
      [4, "Bad price", '"abc" is not a price.'],
      [5, "No price", "Give a unit price (or a cost and a markup)."],
    ]);
    expect(r.problems[1].raw).toEqual(["Bad price", "abc"]);
  });
  it("says what is wrong with a file that has no Name or no price column", () => {
    expect(rowsFromCsv("Thing,Qty\nA,1\n").headerProblem).toMatch(/Name/);
    expect(rowsFromCsv("Name,Qty\nA,1\n").headerProblem).toMatch(/Unit Price/);
    expect(rowsFromCsv("").headerProblem).toMatch(/empty/);
  });
});
