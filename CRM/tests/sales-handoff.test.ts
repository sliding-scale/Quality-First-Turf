/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { signedInAs, strangerIn } from "./helpers";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts", "!../../convex/node_modules/**"]);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("sales form sign-in by hand-off from the CRM (D-053)", () => {
  it("a Sales user gets a code, and the code becomes a working sales session", async () => {
    const t = setup();
    const sal = await signedInAs(t, { key: "sal", roles: ["sales"], name: "Sal Torres" });
    const code = await sal.mutation(api.sales.clerk.issueHandoff, {});
    const session = await t.mutation(api.sales.clerk.redeemHandoff, { code });
    expect(session).toMatchObject({ email: "sal@example.com", name: "Sal Torres" });
    // The token is a real sales session: the sales form's own queries accept it.
    expect(await t.query(api.sales.queries.me, { sessionToken: session.token })).toEqual({ email: "sal@example.com", name: "Sal Torres" });
  });

  it("an Admin may get one too", async () => {
    const t = setup();
    const admin = await signedInAs(t, { key: "boss", roles: ["admin"] });
    expect(await admin.mutation(api.sales.clerk.issueHandoff, {})).toHaveLength(64);
  });

  it("the code works once", async () => {
    const t = setup();
    const sal = await signedInAs(t, { key: "sal", roles: ["sales"] });
    const code = await sal.mutation(api.sales.clerk.issueHandoff, {});
    await t.mutation(api.sales.clerk.redeemHandoff, { code });
    await expect(t.mutation(api.sales.clerk.redeemHandoff, { code })).rejects.toThrow(/expired/);
  });

  it("the code stops working after a minute", async () => {
    const t = setup();
    const sal = await signedInAs(t, { key: "sal", roles: ["sales"] });
    const code = await sal.mutation(api.sales.clerk.issueHandoff, {});
    vi.advanceTimersByTime(61_000);
    await expect(t.mutation(api.sales.clerk.redeemHandoff, { code })).rejects.toThrow(/expired/);
  });

  it("a made-up code is refused", async () => {
    const t = setup();
    await expect(t.mutation(api.sales.clerk.redeemHandoff, { code: "a".repeat(64) })).rejects.toThrow(/expired/);
    await expect(t.mutation(api.sales.clerk.redeemHandoff, { code: "short" })).rejects.toThrow(/expired/);
  });

  it("only Sales and Admin users get a code: Office and Project Manager do not", async () => {
    const t = setup();
    const office = await signedInAs(t, { key: "office", roles: ["office"] });
    const pm = await signedInAs(t, { key: "pm", roles: ["pm"] });
    await expect(office.mutation(api.sales.clerk.issueHandoff, {})).rejects.toThrow(/sales access/);
    await expect(pm.mutation(api.sales.clerk.issueHandoff, {})).rejects.toThrow(/sales access/);
  });

  it("someone who signed up in Clerk but was never invited gets nothing", async () => {
    const t = setup();
    await expect(strangerIn(t).mutation(api.sales.clerk.issueHandoff, {})).rejects.toThrow(/No access/);
  });

  it("nobody signed in gets nothing", async () => {
    const t = setup();
    await expect(t.mutation(api.sales.clerk.issueHandoff, {})).rejects.toThrow(/Not signed in/);
  });

  it("a deactivated user gets nothing", async () => {
    const t = setup();
    const sal = await signedInAs(t, { key: "sal", roles: ["sales"] });
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").first();
      await ctx.db.patch(user!._id, { status: "deactivated" });
    });
    await expect(sal.mutation(api.sales.clerk.issueHandoff, {})).rejects.toThrow(/No access/);
  });

  it("the code is stored only as a hash", async () => {
    const t = setup();
    const sal = await signedInAs(t, { key: "sal", roles: ["sales"] });
    const code = await sal.mutation(api.sales.clerk.issueHandoff, {});
    const rows = await t.run((ctx) => ctx.db.query("salesHandoffs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].code).not.toBe(code);
  });
});
