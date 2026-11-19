/* CSV rules for the data export (plan 2026-11-20-export). Pure TypeScript, no Convex or React imports. */

export type Cell = string | number | null | undefined;

/** A text cell that a spreadsheet would run as a formula gets a leading apostrophe. Phone numbers and plain numbers are left alone. */
export function safeCell(value: string): string {
  if (/^[=@\t\r]/.test(value)) return `'${value}`;
  if (/^[+-]/.test(value) && !/^[+-]?[\d().\s-]+$/.test(value)) return `'${value}`;
  return value;
}

/** One CSV field: text made safe, then quoted if it holds a comma, a quote or a line break. A number is written as it is. */
export function csvField(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" ? (Number.isFinite(cell) ? String(cell) : "") : safeCell(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvLine = (cells: Cell[]): string => cells.map(csvField).join(",");

/** A whole file: the header row, then the rows. Lines end with CRLF, and the file starts with a byte-order mark so Excel reads UTF-8. */
export function csvFile(headers: string[], rows: Cell[][]): string {
  return `﻿${[csvLine(headers), ...rows.map(csvLine)].join("\r\n")}\r\n`;
}

/** Whole cents as dollars with two decimals, "" for nothing. */
export const dollars = (cents: number | null | undefined): string => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));

/** A time as a UTC day, YYYY-MM-DD, "" for nothing. */
export const isoDay = (ms: number | null | undefined): string => (ms === null || ms === undefined ? "" : new Date(ms).toISOString().slice(0, 10));
