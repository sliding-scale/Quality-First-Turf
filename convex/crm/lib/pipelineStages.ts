import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { PIPELINE_GROUPS, type PipelineGroup } from "./stages";

export type StageColumn = { name: string; group: PipelineGroup; custom: boolean; hidden: boolean; order: number; rowId?: Id<"pipelineStages"> };

/** Every stage of the board for a business, in display order: the PRD's open stages, with the business's hiding and ordering
 *  applied, plus its own extra stages. Hidden stages are included (hidden: true) so Edit Stages can show them. */
export async function stageList(ctx: QueryCtx, businessId: Id<"businesses">): Promise<StageColumn[]> {
  const rows: Doc<"pipelineStages">[] = await ctx.db.query("pipelineStages").withIndex("by_business", (q) => q.eq("businessId", businessId)).take(200);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const out: StageColumn[] = [];
  for (const group of Object.keys(PIPELINE_GROUPS) as PipelineGroup[]) {
    const prd = PIPELINE_GROUPS[group].map((name, i): StageColumn => {
      const row = byName.get(name);
      return { name, group, custom: false, hidden: row?.hidden ?? false, order: row?.order ?? i, rowId: row?._id };
    });
    const extra = rows
      .filter((r) => r.custom && r.group === group)
      .map((r): StageColumn => ({ name: r.name, group, custom: true, hidden: r.hidden, order: r.order, rowId: r._id }));
    out.push(...[...prd, ...extra].sort((a, b) => a.order - b.order));
  }
  return out;
}
