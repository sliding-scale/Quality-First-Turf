"use node";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, env } from "../_generated/server";

function same(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

const loginResult = v.union(
  v.object({ token: v.string() }),
  v.object({ error: v.union(v.literal("unconfigured"), v.literal("rejected")) }),
);

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  returns: loginResult,
  handler: async (ctx, args): Promise<{ token: string } | { error: "unconfigured" | "rejected" }> => {
    const email = env.SALES_EMAIL;
    const password = env.SALES_PASSWORD;
    if (email === undefined || password === undefined || email === "" || password === "") {
      return { error: "unconfigured" };
    }
    const emailMatches = same(args.email.trim().toLowerCase(), email.trim().toLowerCase());
    const passwordMatches = same(args.password, password);
    if (!emailMatches || !passwordMatches) return { error: "rejected" };
    const token = randomBytes(32).toString("hex");
    const stored = await ctx.runMutation(internal.sales.mutations.start, { token });
    return { token: stored };
  },
});
