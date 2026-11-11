/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { adminOf, signedInAs } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
export const NOW = Date.UTC(2026, 10, 10, 20, 0, 0);

/** Seeded sample data plus one fresh project at "New Request" that the tests can move around. */
export async function seeded() {
  process.env.CRM_ALLOW_SAMPLE_DATA = "true";
  const base = convexTest(schema, modules);
  rateLimiterTest.register(base);
  await base.mutation(internal.crm.seed.run, {});
  const admin = await adminOf(base);
  const businesses = await admin.query(api.crm.businesses.list, {});
  const qft = businesses[0]._id as Id<"businesses">;
  const other = businesses[1]._id as Id<"businesses">;
  const sales = await signedInAs(base, { key: "sales-1", roles: ["sales"], businessIds: [qft], name: "Sam Sales" });
  const pm = await signedInAs(base, { key: "pm-1", roles: ["pm"], businessIds: [qft], name: "Pat PM" });
  const outsider = await signedInAs(base, { key: "sales-2", roles: ["sales"], businessIds: [other], name: "Olive Outsider" });
  const project = await base.run(async (ctx) => {
    const client = (await ctx.db.query("clients").collect()).find((c) => c.businessId === qft)!;
    const id = await ctx.db.insert("opportunities", {
      businessId: qft, clientId: client._id, code: "TST-001", title: "Test turf", pipeline: "Sales", stage: "New Request",
      requestedAt: NOW - 3_600_000, owner: "Unassigned", searchText: `${client.name} Test turf TST-001 New Request`,
    });
    return { id, clientId: client._id };
  });
  return { base, admin, sales, pm, outsider, qft, other, project: project.id, clientId: project.clientId };
}

