/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const today = new Date().setHours(0, 0, 0, 0);
const listArgs = { status: "All", type: "All", search: "", sortKey: "lastActivity", dir: "desc", page: 1, size: 100 } as const;
const requestArgs = { status: "All", from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today, page: 1, size: 100 } as const;

/** What the customer form sends to projects.create. */
const submission = {
  firstName: "Maya", lastName: "Patel", phone: "(951) 555-0199", email: "Maya.Patel@Example.com",
  street1: "12 Orchard Ln", street2: "", city: "Temecula", state: "California", zip: "92592",
  services: ["Artificial Grass Installation"], answers: [{ question: "Customer type", value: "Homeowner" }],
};

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

/** Fills in the form as the live app does, then lets the scheduled CRM step run. */
async function submit(t: ReturnType<typeof setup>, patch: Partial<typeof submission> = {}) {
  const projectId = await t.mutation(api.projects.mutations.create, { ...submission, ...patch });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return projectId;
}

async function business(t: ReturnType<typeof setup>) {
  const list = await t.withIdentity({ name: "Sal" }).query(api.crm.businesses.list, {});
  return list.find((b) => b.slug === "quality-first-turf");
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("customer form -> CRM (D-040)", () => {
  it("a new person becomes a client, and their submission becomes a request", async () => {
    const t = setup();
    const projectId = await submit(t);
    const staff = t.withIdentity({ name: "Sal" });
    const qft = (await business(t))!;

    // The form's own record is exactly as before.
    const project = await t.run((ctx) => ctx.db.get(projectId));
    expect(project?.firstName).toBe("Maya");

    // A client was created, in Quality First Turf, as a lead.
    const clients = await staff.query(api.crm.clients.list, { businessId: qft._id, ...listArgs });
    expect(clients.total).toBe(1);
    expect(clients.rows[0]).toMatchObject({
      name: "Maya Patel", type: "homeowner", status: "lead", phone: "(951) 555-0199", email: "maya.patel@example.com", state: "CA", zip: "92592",
    });

    // And a request: a Sales project at New Request, showing as New on the Requests screen.
    const requests = await staff.query(api.crm.requests.list, { businessId: qft._id, ...requestArgs });
    expect(requests.total).toBe(1);
    expect(requests.rows[0]).toMatchObject({ stage: "New Request", status: "New", title: "Artificial Grass Installation", code: project?.shortCode });
    expect(requests.rows[0].property).toContain("12 Orchard Ln");
  });

  it("the same person again is not a second client, but is a second request", async () => {
    const t = setup();
    await submit(t);
    await submit(t, { firstName: "Maya", lastName: "Patel-Smith", email: "MAYA.PATEL@example.com", phone: "9515550000" }); // same email, other case
    await submit(t, { email: "other@example.com", phone: "951-555-0199" }); // same phone, other email
    const staff = t.withIdentity({ name: "Sal" });
    const qft = (await business(t))!;
    expect((await staff.query(api.crm.clients.list, { businessId: qft._id, ...listArgs })).total).toBe(1);
    expect((await staff.query(api.crm.requests.list, { businessId: qft._id, ...requestArgs })).total).toBe(3);
  });

  it("a different person is a new client", async () => {
    const t = setup();
    await submit(t);
    await submit(t, { firstName: "Leo", lastName: "Chen", email: "leo@example.com", phone: "(760) 555-0111" });
    const qft = (await business(t))!;
    const clients = await t.withIdentity({ name: "Sal" }).query(api.crm.clients.list, { businessId: qft._id, ...listArgs });
    expect(clients.rows.map((c) => c.name).sort()).toEqual(["Leo Chen", "Maya Patel"]);
  });

  it("a contractor is recorded as a contractor", async () => {
    const t = setup();
    await submit(t, { answers: [{ question: "Customer type", value: "Contractor" }] });
    const qft = (await business(t))!;
    const clients = await t.withIdentity({ name: "Sal" }).query(api.crm.clients.list, { businessId: qft._id, ...listArgs });
    expect(clients.rows[0].type).toBe("contractor");
  });

  it("an archived client who submits again is a lead again, with their details left as staff have them", async () => {
    const t = setup();
    await submit(t);
    const qft = (await business(t))!;
    const staff = t.withIdentity({ name: "Sal" });
    const clientId = (await staff.query(api.crm.clients.list, { businessId: qft._id, ...listArgs })).rows[0]._id;
    await t.run((ctx) => ctx.db.patch(clientId, { status: "archived", street1: "Changed by staff" }));
    await submit(t, { street1: "A different street" });
    const again = await staff.query(api.crm.clients.get, { id: clientId });
    expect(again).toMatchObject({ status: "lead", street1: "Changed by staff" });
  });

  it("running the CRM step twice for one submission does not create a second request", async () => {
    const t = setup();
    const projectId = await submit(t);
    await t.mutation(internal.crm.intake.recordSubmission, { projectId });
    const qft = (await business(t))!;
    expect((await t.withIdentity({ name: "Sal" }).query(api.crm.requests.list, { businessId: qft._id, ...requestArgs })).total).toBe(1);
  });

  it("the CRM step is separate from saving the form: the submission is saved first, the CRM follows", async () => {
    const t = setup();
    const projectId = await t.mutation(api.projects.mutations.create, submission);

    // Right after the form's own save, before anything else runs: the submission exists and the CRM has not been touched.
    // So whatever the CRM step does later, it cannot undo or block what the form already saved.
    expect(await t.run((ctx) => ctx.db.get(projectId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.query("clients").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("opportunities").collect())).toHaveLength(0);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("clients").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("opportunities").collect())).toHaveLength(1);
  });

  it("ignores a submission that no longer exists instead of failing", async () => {
    const t = setup();
    const projectId = await t.mutation(api.projects.mutations.create, submission);
    await t.run((ctx) => ctx.db.delete(projectId));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("clients").collect())).toHaveLength(0);
  });

  it("catches up submissions made before the CRM existed, once, oldest first", async () => {
    const t = setup();
    // Three older submissions saved the way the form used to (no CRM step ran for them).
    const ids: Id<"projects">[] = [];
    for (const [n, email] of [[1, "a@example.com"], [2, "b@example.com"], [3, "a@example.com"]] as const) {
      ids.push(await t.run((ctx) =>
        ctx.db.insert("projects", {
          status: "discovery saved", firstName: "Old", lastName: `Customer${n}`, phone: `95155500${n}0`, email, street1: "1 St", street2: "", city: "Temecula",
          state: "CA", zip: "92592", services: ["Pavers"], products: [], addOns: [], answers: [], notes: "", measurements: [],
          jobberClientId: null, jobberQuoteId: null, missingMapping: null, integrationError: null, shortCode: `OLD${n}`,
        }),
      ));
    }
    await t.mutation(internal.crm.intake.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.crm.intake.backfill, {}); // a second run adds nothing
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const qft = (await business(t))!;
    const staff = t.withIdentity({ name: "Sal" });
    expect((await staff.query(api.crm.requests.list, { businessId: qft._id, ...requestArgs })).total).toBe(3);
    expect((await staff.query(api.crm.clients.list, { businessId: qft._id, ...listArgs })).total).toBe(2); // a@ appears twice
  });
});
