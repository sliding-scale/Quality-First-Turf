/* Installer work package rules (PRD 4.3, plan 2026-11-20-work-packages). Pure TypeScript, no Convex or React imports. Money is whole cents. */

export type BudgetLine = { description: string; quantity: number; unit: string; rateCents: number };

export const MAX_BUDGET_LINES = 60;
export const DEFAULT_LINK_DAYS = 14;
export const MAX_LINK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One budget line's amount: quantity times rate, to the cent. */
export const lineTotalCents = (l: Pick<BudgetLine, "quantity" | "rateCents">): number => Math.round(l.quantity * l.rateCents);

export const budgetTotalCents = (lines: Pick<BudgetLine, "quantity" | "rateCents">[]): number => lines.reduce((s, l) => s + lineTotalCents(l), 0);

/** The reason a budget line is not allowed, or null. */
export function budgetLineProblem(l: BudgetLine): string | null {
  if (!l.description.trim()) return "Every budget line needs a description.";
  if (l.description.trim().length > 200) return "A budget line description is too long.";
  if (!Number.isFinite(l.quantity) || l.quantity < 0 || l.quantity > 100_000) return "Check a budget line's quantity.";
  if (!Number.isInteger(l.rateCents) || l.rateCents < 0 || l.rateCents > 100_000_000_00) return "Check a budget line's rate.";
  if (l.unit.trim().length > 30) return "A budget line's unit is too long.";
  return null;
}

/** Whether a share link works: none was made (or it was revoked), it is live, or it ran out. */
export function shareState(p: { shareToken?: string; shareExpiresAt?: number }, now: number): "none" | "live" | "expired" {
  if (!p.shareToken) return "none";
  return p.shareExpiresAt !== undefined && p.shareExpiresAt <= now ? "expired" : "live";
}

/** Days a link stays open, a whole number from 1 to 90. */
export function linkDaysProblem(days: number): string | null {
  return Number.isInteger(days) && days >= 1 && days <= MAX_LINK_DAYS ? null : `A link stays open for 1 to ${MAX_LINK_DAYS} days.`;
}

export const expiryFrom = (now: number, days: number): number => now + days * DAY_MS;
