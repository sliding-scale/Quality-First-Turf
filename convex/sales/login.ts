"use node";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, env } from "../_generated/server";
import { rateLimiter } from "../rateLimits";

function same(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

type Account = { email: string; password: string };

/** One login is shared by every salesperson, set with SALES_EMAIL and SALES_PASSWORD. */
function configuredAccounts(): Account[] {
  const email = env.SALES_EMAIL?.trim() ?? "";
  const password = env.SALES_PASSWORD ?? "";
  return email !== "" && password !== "" ? [{ email, password }] : [];
}

const loginResult = v.union(
  v.object({ token: v.string(), email: v.string() }),
  v.object({
    error: v.union(v.literal("unconfigured"), v.literal("rejected"), v.literal("limited")),
  }),
);

type LoginResult =
  | { token: string; email: string }
  | { error: "unconfigured" | "rejected" | "limited" };

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  returns: loginResult,
  handler: async (ctx, args): Promise<LoginResult> => {
    const attempt = args.email.trim().toLowerCase().slice(0, 254);
    const overall = await rateLimiter.limit(ctx, "loginGlobal");
    const perEmail = await rateLimiter.limit(ctx, "loginPerEmail", { key: attempt });
    if (!overall.ok || !perEmail.ok) return { error: "limited" };

    const accounts = configuredAccounts();
    if (accounts.length === 0) {
      console.error("SALES_EMAIL / SALES_PASSWORD are not set on this deployment.");
      return { error: "rejected" };
    }
    // Check every account so the response time does not reveal which emails exist.
    let matched: Account | null = null;
    for (const account of accounts) {
      const emailMatches = same(attempt, account.email.trim().toLowerCase());
      const passwordMatches = same(args.password, account.password);
      if (emailMatches && passwordMatches && matched === null) matched = account;
    }
    if (matched === null) return { error: "rejected" };
    const email = matched.email.trim().toLowerCase();
    const token = randomBytes(32).toString("hex");
    await ctx.runMutation(internal.sales.mutations.start, { token, email });
    return { token, email };
  },
});
