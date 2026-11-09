import { internal } from "../_generated/api";
import { env, httpAction } from "../_generated/server";
import { verifySvix } from "./lib/svix";

/* Clerk tells the CRM when something changes on its side (D-055). Today that is one thing: a person's login was deleted in Clerk
   (from the Clerk dashboard, say), so the CRM removes them too instead of keeping a row that can never sign in. Set up once per
   Clerk instance: Webhooks, add an endpoint at <deployment's .convex.site address>/clerk/webhook, subscribe to user.deleted, and put
   its signing secret in CLERK_WEBHOOK_SECRET on that deployment. Anything not signed by Clerk is refused. */

export const handle = httpAction(async (ctx, req) => {
  const secret = env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not set up.", { status: 503 });

  const body = await req.text();
  const signed = await verifySvix(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signatures: req.headers.get("svix-signature") },
    body,
  );
  if (!signed) return new Response("Bad signature.", { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad body.", { status: 400 });
  }
  const type = (event as { type?: unknown }).type;
  const data = (event as { data?: { id?: unknown } }).data;
  if (type === "user.deleted" && typeof data?.id === "string") {
    const result = await ctx.runMutation(internal.crm.users.removeByClerkUser, { clerkUserId: data.id });
    console.log(`clerk webhook: user.deleted ${data.id} -> ${result}`);
  }
  // Other events are acknowledged and ignored, so Clerk does not keep retrying them.
  return new Response("ok", { status: 200 });
});
