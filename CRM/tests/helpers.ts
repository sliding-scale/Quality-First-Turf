import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

type T = TestConvex<typeof schema>;
type Role = "admin" | "sales" | "office" | "pm";

const ISSUER = "https://clerk.test";

/** Adds an active user (as if they had been invited and had signed in) and returns a test handle that is signed in as them. */
export async function signedInAs(
  t: T,
  who: { key: string; roles: Role[]; businessIds?: Id<"businesses">[]; email?: string; name?: string },
) {
  const email = who.email ?? `${who.key}@example.com`;
  await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: who.name ?? who.key,
      roles: who.roles,
      businessIds: who.businessIds ?? [],
      status: "active",
      tokenIdentifier: `${ISSUER}|${who.key}`,
    }),
  );
  return t.withIdentity({ issuer: ISSUER, subject: who.key, name: who.name ?? who.key, email, emailVerified: true });
}

/** A signed-in identity with no user row at all: someone who signed up in Clerk but was never invited. */
export function strangerIn(t: T, key = "stranger", email = "stranger@example.com") {
  return t.withIdentity({ issuer: ISSUER, subject: key, name: key, email, emailVerified: true });
}

const admins = new WeakMap<object, ReturnType<T["withIdentity"]>>();

/** One Admin per test database, created on first use. */
export async function adminOf(t: T) {
  let a = admins.get(t);
  if (!a) {
    a = await signedInAs(t, { key: "admin-test", roles: ["admin"], name: "Sal" });
    admins.set(t, a);
  }
  return a;
}
