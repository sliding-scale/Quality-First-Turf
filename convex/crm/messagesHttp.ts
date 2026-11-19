import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { validTwilioSignature } from "./lib/phone";

/** Twilio's inbound text webhook (plan 2026-11-19-messages): Twilio posts each received text here, signed with the account's auth token. Anything
 *  unsigned or wrongly signed is refused, so nobody can write into the log from outside. The answer is an empty TwiML reply (no auto-reply). */
export const receive = httpAction(async (ctx, request) => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Texting is not set up.", { status: 503 });
  const params: Record<string, string> = {};
  new URLSearchParams(await request.text()).forEach((value, key) => { params[key] = value; });
  if (!(await validTwilioSignature(token, request.url, params, request.headers.get("X-Twilio-Signature")))) return new Response("Forbidden", { status: 403 });
  await ctx.runMutation(internal.crm.messages.receive, { to: params.To ?? "", from: params.From ?? "", body: params.Body ?? "", sid: params.MessageSid ?? "", now: Date.now() });
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
});
