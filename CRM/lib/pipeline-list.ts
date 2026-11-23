/* The pipeline boards' list view (D-115): pure helpers, kept apart from lib/pipeline.ts so they can be tested without the app. */

export type BoardView = "board" | "list";

/** The board is the default; only `?view=list` asks for the list. */
export const viewFromParam = (param: string | null): BoardView => (param === "list" ? "list" : "board");

/** Which rows of a list are on a page, and the numbers to say so ("51–60 of 60"). A page outside the range is brought back into it. */
export function pageSlice(total: number, page: number, size: number): { page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  if (total === 0) return { page: 1, pages: 1, from: 0, to: 0 };
  return { page: current, pages, from: (current - 1) * size + 1, to: Math.min(total, current * size) };
}

type Sortable = { timeInStageMs: number; valueCents: number; requestedAt: number };

/** All projects in one order, by the board's own sort choice and direction. Ties keep the order they came in. */
export function sortRows<T extends Sortable>(rows: readonly T[], sortKey: "timeInStage" | "createdDate" | "value", dir: "asc" | "desc"): T[] {
  const by = (r: T) => (sortKey === "value" ? r.valueCents : sortKey === "createdDate" ? r.requestedAt : r.timeInStageMs);
  const sign = dir === "asc" ? 1 : -1;
  return rows.map((r, i) => ({ r, i })).sort((x, y) => sign * (by(x.r) - by(y.r)) || x.i - y.i).map((x) => x.r);
}
