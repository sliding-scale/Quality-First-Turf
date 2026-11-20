/* When a new quote starts pre-filled from the site visit (client notes of 2026-11-20): only for a quote that is new, has a project, and still holds
   nothing but blank lines, so a page that is reloaded or a quote someone has begun typing is never added to twice. Pure rule, no React. */

type LineLike = { kind: "item" | "text"; name: string };

export function shouldPrefill(lines: LineLike[], hasProject: boolean, isNew: boolean): boolean {
  if (!isNew || !hasProject) return false;
  return lines.every((l) => l.kind === "item" && l.name.trim() === "");
}
