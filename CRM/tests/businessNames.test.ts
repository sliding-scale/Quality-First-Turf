/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { seeded } from "./pipelineSeed";

describe("business names (D-066)", () => {
  it("renames the old names in place and leaves the slugs alone", async () => {
    const w = await seeded();
    await w.base.run(async (ctx) => {
      const all = await ctx.db.query("businesses").collect();
      await ctx.db.patch(all[0]._id, { name: "Quality First Turf" });
      await ctx.db.patch(all[1]._id, { name: "Quality First Construction" });
    });
    const before = await w.base.run((ctx) => ctx.db.query("businesses").collect());
    await w.admin.mutation(api.crm.businesses.alignNames, {});
    const after = await w.base.run((ctx) => ctx.db.query("businesses").collect());
    expect(after.map((b) => b.name).sort()).toEqual(["Quality First Patios", "Quality First Turf Construction", "Quality First Turf Landscape"]);
    expect(after.map((b) => b.slug)).toEqual(before.map((b) => b.slug));
    await w.admin.mutation(api.crm.businesses.alignNames, {}); // safe to run again
  });
});
