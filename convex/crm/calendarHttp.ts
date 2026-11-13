import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { env } from "../_generated/server";

/* Where Zoho sends the browser back after "Allow" (D-069): /zoho/calendar/callback. It finishes the connection and returns the person to
   the CRM's My calendar screen with a short result. No tokens or codes are put in that address. */

export const callback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const app = (env.CRM_APP_URL ?? "").trim().replace(/\/$/, "");
  const back = (result: string) => new Response(null, { status: 302, headers: { Location: `${app}/settings/calendar?zoho=${result}` } });
  if (!app) return new Response("The CRM address is not set up.", { status: 500 });
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back("cancelled");
  const r = await ctx.runAction(internal.crm.calendarConnect.finish, { code, state, accountsServer: url.searchParams.get("accounts-server") ?? undefined });
  return back(r.ok ? "connected" : r.error);
});
