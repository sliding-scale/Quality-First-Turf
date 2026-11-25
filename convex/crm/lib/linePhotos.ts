import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { canonicalService } from "../../shared/discovery";
import type { CatalogueItem } from "../../shared/catalogue";
import type { ReadArea } from "./visitData";

const MAX_PER_LINE = 6;

/** The visit photos for a quote line, per work area (client request, 2026-11-24): a line gets the photos of the work areas for its service and
 *  installation type. An add-on has none, and an area with no service chosen matches no line. */
export function photoIdsForLine(item: CatalogueItem | undefined, areas: ReadArea[]): Id<"_storage">[] {
  if (!item || item.addOn !== null) return [];
  const ids: Id<"_storage">[] = [];
  for (const a of areas) {
    if (!a.service || canonicalService(a.service) !== item.service) continue;
    if (a.installType && item.installType && a.installType !== item.installType) continue;
    for (const id of a.photoIds) if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_PER_LINE);
}

/** Id and URL of stored photos, skipping any that no longer exist. */
export async function photosOf(ctx: QueryCtx, ids: Id<"_storage">[] | undefined): Promise<{ id: Id<"_storage">; url: string }[]> {
  const out: { id: Id<"_storage">; url: string }[] = [];
  for (const id of (ids ?? []).slice(0, 12)) {
    const url = await ctx.storage.getUrl(id);
    if (url) out.push({ id, url });
  }
  return out;
}
