/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { adminOf } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const today = new Date().setHours(0, 0, 0, 0);
const listArgs = { status: "All", type: "All", search: "", sortKey: "name", dir: "asc", page: 1, size: 100 } as const;

async function seeded() {
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  const base = convexTest(schema, modules);
  await base.mutation(internal.crm.seed.run, {});
  const t = await adminOf(base);
  const businesses = await t.query(api.crm.businesses.list, {});
  return { t, qft: businesses[0]._id };
}

describe("client tags and archive (Clients list, Jobber style)", () => {
  it("sets tags, refuses an unknown one, and the tag filter finds the client", async () => {
    const { t, qft } = await seeded();
    const first = (await t.query(api.crm.clients.list, { businessId: qft, ...listArgs })).rows[0];
    await t.mutation(api.crm.clients.setTags, { id: first._id, tags: ["Company", "Sub-Contractor", "Company"] });
    const tagged = await t.query(api.crm.clients.list, { businessId: qft, ...listArgs, tags: ["Sub-Contractor"] });
    expect(tagged.rows.map((c) => c._id)).toEqual([first._id]);
    expect(tagged.rows[0].tags).toEqual(["Company", "Sub-Contractor"]);
    await expect(t.mutation(api.crm.clients.setTags, { id: first._id, tags: ["Made up"] })).rejects.toThrow(/does not exist/);
  });

  it("archives a client, which then leaves the default list but shows under Archived", async () => {
    const { t, qft } = await seeded();
    const first = (await t.query(api.crm.clients.list, { businessId: qft, ...listArgs })).rows[0];
    expect(await t.mutation(api.crm.clients.archive, { ids: [first._id] })).toBe(1);
    expect(await t.mutation(api.crm.clients.archive, { ids: [first._id] })).toBe(0);
    const live = await t.query(api.crm.clients.list, { businessId: qft, ...listArgs, status: "Leads and Active" });
    expect(live.rows.some((c) => c._id === first._id)).toBe(false);
    const archived = await t.query(api.crm.clients.list, { businessId: qft, ...listArgs, status: "Archived" });
    expect(archived.rows.map((c) => c._id)).toContain(first._id);
  });

  it("counts clients created this year for the third card", async () => {
    const { t, qft } = await seeded();
    const stats = await t.query(api.crm.clients.stats, { businessId: qft, today });
    expect(stats.newThisYear).toBeGreaterThan(0);
    expect(stats.newThisYear).toBeLessThanOrEqual(stats.total);
  });
});
