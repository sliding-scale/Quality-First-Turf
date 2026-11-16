/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { buildDiscovery, emptyDiscovery } from "../../convex/shared/discovery";
import { adminOf, signedInAs } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);
const today = new Date().setHours(0, 0, 0, 0);
const listArgs = { status: "All", type: "All", search: "", sortKey: "lastActivity", dir: "desc", page: 1, size: 100 } as const;

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

/** What the New Request flow sends: the customer form's own payload, built by the customer form's own builder. */
function answers(patch: Partial<ReturnType<typeof emptyDiscovery>> = {}) {
  const built = buildDiscovery({
    ...emptyDiscovery(),
    customerType: "Contractor",
    firstName: "Maya", lastName: "Patel", phone: "9515550199", email: "Maya.Patel@Example.com",
    street1: "12 Orchard Ln", street2: "", city: "Temecula", state: "California", zip: "92592",
    services: ["SOD"],
    ...patch,
  });
  if (built.payload === null) throw new Error(built.error ?? "The test form did not build.");
  return built.payload;
}

async function turf(t: ReturnType<typeof setup>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("businesses", { name: "Quality First Turf Landscape", slug: "quality-first-turf" });
    await ctx.db.insert("businesses", { name: "Quality First Patios", slug: "quality-first-patios" });
  });
  const staff = await adminOf(t);
  const list = await staff.query(api.crm.businesses.list, {});
  return { staff, business: list.find((b) => b.slug === "quality-first-turf")! };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("New Request with the customer form's questions (D-079)", () => {
  it("one save writes the forms' record, a new client and the request, linked together", async () => {
    const t = setup();
    const { staff, business } = await turf(t);
    const saved = await staff.mutation(api.crm.requestForm.create, { businessId: business._id, note: "Called in on Monday.", ...answers() });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(saved.createdClient).toBe(true);

    // The forms' record is shaped as the customer form writes it, and nothing was sent to Jobber.
    const project = await t.run((ctx) => ctx.db.get(saved.projectId));
    expect(project).toMatchObject({ status: "discovery saved", firstName: "Maya", state: "California", services: ["SOD"], jobberClientId: null, jobberRequestId: null });
    expect(project?.submitted?.email).toBe("Maya.Patel@Example.com");
    expect(project?.shortCode).toMatch(/^[A-Z0-9]{6}$/);

    // The client, cleaned the CRM's way.
    const clients = await staff.query(api.crm.clients.list, { businessId: business._id, ...listArgs });
    expect(clients.total).toBe(1);
    expect(clients.rows[0]).toMatchObject({ name: "Maya Patel", type: "contractor", status: "lead", phone: "(951) 555-0199", email: "maya.patel@example.com", state: "CA" });

    // The request: New Request, the same code as the forms' record, the form's answers on its Overview, and the note.
    const request = await staff.query(api.crm.requests.get, { id: saved.opportunityId, today });
    expect(request).toMatchObject({ title: "SOD", stage: "New Request", code: project?.shortCode });
    expect(request?.overview.fields).toContainEqual({ label: "Property address", value: "12 Orchard Ln, Temecula, California, 92592" });
    const all = await t.run((ctx) => ctx.db.query("opportunities").collect());
    expect(all).toHaveLength(1); // one request, not a second one from the customer-form step
    const notes = await t.run((ctx) => ctx.db.query("opportunityNotes").collect());
    expect(notes.map((n) => n.text)).toEqual(["Called in on Monday."]);
  });

  it("a picked client is used as they are; otherwise the same email or phone is the same client", async () => {
    const t = setup();
    const { staff, business } = await turf(t);
    const first = await staff.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers() });
    // Same email, different name: matched, not duplicated, and their details are left alone.
    const second = await staff.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers({ firstName: "M", lastName: "P" }) });
    expect(second).toMatchObject({ clientId: first.clientId, createdClient: false });
    // Picked outright, with different contact details on this request.
    const third = await staff.mutation(api.crm.requestForm.create, {
      businessId: business._id, clientId: first.clientId, ...answers({ email: "other@example.com", phone: "9515550111" }),
    });
    expect(third).toMatchObject({ clientId: first.clientId, createdClient: false });
    const clients = await staff.query(api.crm.clients.list, { businessId: business._id, ...listArgs });
    expect(clients.total).toBe(1);
    expect(clients.rows[0].name).toBe("Maya Patel");
    expect(await t.run((ctx) => ctx.db.query("projects").collect())).toHaveLength(3);
  });

  it("refuses what the customer form refuses, a client from another business, and people who cannot edit", async () => {
    const t = setup();
    const { staff, business } = await turf(t);
    await expect(staff.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers(), email: "nope" })).rejects.toThrow(/email/i);
    await expect(staff.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers(), services: [] })).rejects.toThrow(/service/i);

    const other = (await staff.query(api.crm.businesses.list, {})).find((b) => b._id !== business._id)!;
    const elsewhere = await staff.mutation(api.crm.requestForm.create, { businessId: other._id, ...answers() });
    await expect(staff.mutation(api.crm.requestForm.create, { businessId: business._id, clientId: elsewhere.clientId, ...answers() })).rejects.toThrow(/client/i);

    const outsider = await signedInAs(t, { key: "sales-elsewhere", roles: ["sales"], businessIds: [other._id] });
    await expect(outsider.mutation(api.crm.requestForm.create, { businessId: business._id, ...answers() })).rejects.toThrow();
    // Nothing half-saved by the refusals.
    expect(await t.run((ctx) => ctx.db.query("projects").collect())).toHaveLength(1);
  });
});
