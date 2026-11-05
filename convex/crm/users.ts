import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, mutation, query, type QueryCtx } from "../_generated/server";
import { requireAdmin } from "./lib/access";
import { cleanEmail, cleanName, isValidEmail } from "./lib/fields";
import { ROLE_LABEL } from "./lib/stages";

/* Users and sign-in (D-046). Invite-only: an Admin adds a person's email, roles and businesses; the person then signs in
   through Clerk and claims that row by their verified email. Someone who signs up in Clerk without an invite gets nothing. */

/** The first Admin exists without an invite. This address always works, and CRM_BOOTSTRAP_ADMIN_EMAILS can add more. */
const FIRST_ADMIN = "admin@qualityfirstturf.com";

function bootstrapAdmins(): string[] {
  const extra = (env.CRM_BOOTSTRAP_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return [FIRST_ADMIN, ...extra];
}

type Identity = NonNullable<Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>>;

/**
 * The email in the sign-in token. Clerk's token template should send it as "email"; a few other names are accepted too,
 * because templates differ. Also returns which claim it came from and the claim NAMES present (never their values), which
 * the "no access" screen and the logs show so a wrong template can be spotted.
 */
function emailFrom(identity: Identity): { email: string; source: string; claimNames: string[] } {
  const claims = identity as unknown as Record<string, unknown>;
  const claimNames = Object.keys(claims).filter((k) => claims[k] !== undefined && claims[k] !== null && claims[k] !== "").sort();
  for (const key of ["email", "emailAddress", "email_address", "primary_email_address", "primaryEmailAddress"]) {
    const value = claims[key];
    if (typeof value === "string" && value.includes("@")) return { email: value.trim().toLowerCase(), source: key, claimNames };
  }
  return { email: "", source: "none", claimNames };
}

const role = v.union(v.literal("admin"), v.literal("sales"), v.literal("office"), v.literal("pm"));

/** What the app needs to know about the signed-in person. Never throws, so the app can decide what to show. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { state: "signedOut" as const };
    const user = await ctx.db.query("users").withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
    if (!user) {
      const found = emailFrom(identity);
      return { state: "unclaimed" as const, email: found.email, emailSource: found.source, claimNames: found.claimNames };
    }
    if (user.status !== "active") return { state: "deactivated" as const, email: user.email };
    return {
      state: "active" as const,
      user: { _id: user._id, name: user.name, email: user.email, roles: user.roles, isAdmin: user.roles.includes("admin"), businessIds: user.businessIds },
    };
  },
});

/**
 * Called by the app right after a person signs in. Links their Clerk identity to the user row that has their email (an
 * invite, or the first Admin) and marks it active. Safe to call again. Returns what happened, and never gives access
 * to anyone who was not invited. "noEmail" and "unverified" say why a match was impossible: the sign-in token carries no
 * email (the Clerk "convex" token template must include it), or Clerk has not verified it.
 */
export const claim = mutation({
  args: {},
  handler: async (ctx): Promise<"active" | "deactivated" | "none" | "noEmail" | "unverified"> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in.");
    const now = Date.now();

    const known = await ctx.db.query("users").withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
    if (known) {
      if (known.status !== "active") return "deactivated";
      await ctx.db.patch(known._id, { lastSignInAt: now });
      return "active";
    }

    // Matching is by email, so the email must be one Clerk has verified for this person.
    const { email, source, claimNames } = emailFrom(identity);
    // Safe to log: claim names and yes/no flags, no values. It lets a wrong Clerk token template be diagnosed from the logs.
    console.log(`claim: claims=[${claimNames.join(",")}] emailFrom=${source} emailVerified=${String(identity.emailVerified)} bootstrapAdmin=${bootstrapAdmins().includes(email)}`);
    if (!email) return "noEmail";
    if (identity.emailVerified === false) return "unverified";
    const row = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    const isFirstAdmin = bootstrapAdmins().includes(email);

    if (row) {
      if (row.status === "deactivated") return "deactivated";
      if (row.tokenIdentifier && row.tokenIdentifier !== identity.tokenIdentifier) return "none"; // already claimed by another Clerk account
      await ctx.db.patch(row._id, {
        tokenIdentifier: identity.tokenIdentifier,
        status: "active",
        name: row.name || identity.name || email,
        roles: isFirstAdmin && !row.roles.includes("admin") ? [...row.roles, "admin"] : row.roles,
        lastSignInAt: now,
      });
      return "active";
    }
    if (isFirstAdmin) {
      await ctx.db.insert("users", {
        email, name: identity.name || "Admin", roles: ["admin"], businessIds: [], status: "active",
        tokenIdentifier: identity.tokenIdentifier, invitedBy: "first admin", lastSignInAt: now,
      });
      return "active";
    }
    return "none";
  },
});

const sortKey = v.union(v.literal("name"), v.literal("roles"), v.literal("lastActive"), v.literal("status"));
const STATUS_ORDER = { active: 0, invited: 1, deactivated: 2 } as const;

/**
 * One page of everyone who has been invited or has signed in, for the Manage Team screen. Admins only. Searched, sorted,
 * counted and paged here, over a bounded read (at most 500 people; a company this size will not reach it).
 */
export const list = query({
  args: {
    search: v.optional(v.string()),
    sortKey: v.optional(sortKey),
    dir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const needle = (args.search ?? "").trim().toLowerCase();
    const all = await ctx.db.query("users").take(500);
    const rows = needle ? all.filter((u) => u.name.toLowerCase().includes(needle) || u.email.includes(needle)) : all;

    const key = args.sortKey ?? "name";
    const sign = (args.dir ?? "asc") === "asc" ? 1 : -1;
    const value = (u: Doc<"users">): string | number =>
      key === "name" ? u.name.toLowerCase()
      : key === "roles" ? u.roles.map((r) => ROLE_LABEL[r]).join(", ").toLowerCase()
      : key === "status" ? STATUS_ORDER[u.status]
      : u.lastSignInAt ?? -1; // people who have never signed in sort as oldest
    rows.sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * sign);

    const size = Math.min(Math.max(Math.floor(args.size ?? 100), 1), 100);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(Math.max(Math.floor(args.page ?? 1), 1), pages);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page };
  },
});

const userFields = {
  name: v.string(),
  roles: v.array(role),
  businessIds: v.array(v.id("businesses")),
};

function checked(input: { name: string; roles: Doc<"users">["roles"]; businessIds: Doc<"users">["businessIds"] }) {
  const name = cleanName(input.name).trim();
  if (!name) throw new ConvexError("Enter the person's name.");
  const roles = [...new Set(input.roles)];
  if (roles.length === 0) throw new ConvexError("Choose at least one role.");
  const businessIds = [...new Set(input.businessIds)];
  if (!roles.includes("admin") && businessIds.length === 0) throw new ConvexError("Choose at least one business.");
  return { name, roles, businessIds };
}

export const invite = mutation({
  args: { email: v.string(), ...userFields },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = cleanEmail(args.email).trim().toLowerCase();
    if (!isValidEmail(email)) throw new ConvexError("Enter a valid email address.");
    const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (existing) throw new ConvexError("That email is already a user.");
    for (const id of args.businessIds) if ((await ctx.db.get(id)) === null) throw new ConvexError("That business does not exist.");
    return await ctx.db.insert("users", { email, ...checked(args), status: "invited", invitedBy: admin.email });
  },
});

export const update = mutation({
  args: { id: v.id("users"), active: v.boolean(), ...userFields },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.id);
    if (!target) throw new ConvexError("That user no longer exists.");
    const fields = checked(args);
    for (const id of fields.businessIds) if ((await ctx.db.get(id)) === null) throw new ConvexError("That business does not exist.");

    const stillAdmin = fields.roles.includes("admin") && args.active;
    if (target.roles.includes("admin") && target.status !== "deactivated" && !stillAdmin) {
      // Never leave the CRM without an active Admin, and never let an Admin lock themselves out.
      if (target._id === admin.userId) throw new ConvexError("You cannot remove your own Admin access or deactivate yourself.");
      const admins = (await ctx.db.query("users").take(500)).filter((u) => u.status !== "deactivated" && u.roles.includes("admin"));
      if (admins.filter((u) => u._id !== target._id).length === 0) throw new ConvexError("There must be at least one active Admin.");
    }
    // A person who has never signed in stays "invited"; deactivating is reversible.
    const status = !args.active ? ("deactivated" as const) : target.tokenIdentifier ? ("active" as const) : ("invited" as const);
    await ctx.db.patch(args.id, { ...fields, status });
    return args.id;
  },
});
