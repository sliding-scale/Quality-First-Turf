import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "../_generated/server";
import { shortCode } from "./lib/codes";
import { clientSearchText, opportunitySearchText } from "./lib/clientInput";
import { DAY_MS, PREPLANNING_STAGES, SALES_STAGES } from "./lib/stages";
import { BUSINESS_NAMES, SAMPLE_SERVICES, generateSampleClients } from "./sampleData";

/* Dev sample data. Run from a terminal against the DEV deployment:
     npx convex run crm/seed:run        loads 98 sample clients and their projects (does nothing if businesses exist)
     npx convex run crm/seed:reset      deletes every CRM row (businesses, clients, projects, notes)
   Both refuse to run unless CRM_ALLOW_SAMPLE_DATA is "true", which only the dev deployment sets. */

function devOnly() {
  if (env.CRM_ALLOW_SAMPLE_DATA !== "true") throw new ConvexError("Sample data can only be loaded on the dev deployment.");
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    devOnly();
    if ((await ctx.db.query("businesses").first()) !== null) return "Already seeded. Run crm/seed:reset first to start again.";

    const businessIds = new Map<string, Doc<"businesses">["_id"]>();
    for (const name of BUSINESS_NAMES) {
      businessIds.set(name, await ctx.db.insert("businesses", { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
    }

    const now = Date.now();
    let projects = 0;
    for (const s of generateSampleClients()) {
      const businessId = businessIds.get(s.business);
      if (!businessId) continue;
      const stageIndex = s.numId % SALES_STAGES.length;
      const hasLaterProject = s.numId % 3 === 0;
      const archived = s.numId % 11 === 0 && s.numId !== 1001 && s.numId < 2000;
      const status = archived ? "archived" : SALES_STAGES[stageIndex] === "Closed Won" || hasLaterProject ? "active" : "lead";
      const client = {
        type: s.type,
        name: s.name,
        nameKey: s.name.toLowerCase(),
        contactName: s.contactName,
        company: s.company,
        phone: s.phone,
        email: s.email,
        street1: s.street1,
        street2: "",
        city: s.city,
        state: s.state,
        zip: s.zip,
      };
      const clientId = await ctx.db.insert("clients", {
        businessId,
        ...client,
        notes: s.notes,
        status,
        createdAt: now - (s.daysAgo + 2) * DAY_MS,
        lastActivityAt: now - s.daysAgo * DAY_MS,
        searchText: clientSearchText(client),
      });
      await addProject(ctx, {
        businessId, clientId, client, code: shortCode(s.numId), title: SAMPLE_SERVICES[s.numId % SAMPLE_SERVICES.length],
        pipeline: "Sales", stage: SALES_STAGES[stageIndex], requestedAt: now - (s.daysAgo + 2) * DAY_MS, owner: "Sal",
      });
      projects += 1;
      if (hasLaterProject) {
        await addProject(ctx, {
          businessId, clientId, client, code: shortCode(s.numId + 500), title: "Patio pavers",
          pipeline: "Preplanning", stage: PREPLANNING_STAGES[s.numId % PREPLANNING_STAGES.length], requestedAt: now - (s.daysAgo + 30) * DAY_MS, owner: "May",
        });
        projects += 1;
      }
    }
    return `Seeded ${BUSINESS_NAMES.length} businesses, ${generateSampleClients().length} clients and ${projects} projects.`;
  },
});

async function addProject(
  ctx: MutationCtx,
  p: {
    businessId: Doc<"businesses">["_id"]; clientId: Doc<"clients">["_id"]; client: Parameters<typeof clientSearchText>[0];
    code: string; title: string; pipeline: "Sales" | "Preplanning"; stage: string; requestedAt: number; owner: string;
  },
) {
  const { client, ...rest } = p;
  await ctx.db.insert("opportunities", { ...rest, searchText: opportunitySearchText(client, rest) });
}

export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    devOnly();
    let deleted = 0;
    // One transaction can only touch so many rows; the sample set is small, so a few batches are plenty.
    for (const table of ["quoteNotes", "quoteLineItems", "quotes", "clientNotes", "opportunities", "clients", "businesses"] as const) {
      for (let batch = 0; batch < 20; batch++) {
        const rows = await ctx.db.query(table).take(400);
        if (rows.length === 0) break;
        for (const row of rows) await ctx.db.delete(row._id);
        deleted += rows.length;
      }
    }
    return `Deleted ${deleted} CRM rows.`;
  },
});
