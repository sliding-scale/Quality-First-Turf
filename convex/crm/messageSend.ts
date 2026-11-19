import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";

/** Hands a queued text to Twilio (plan 2026-11-19-messages). Scheduled by `messages.send` only when the Twilio keys and a number are set. The
 *  outcome is written back to the log: sent with Twilio's id, or failed with the reason, so nothing is lost silently (CRM rule 6) and a failed
 *  text is visible in the thread. */

export const forDelivery = internalQuery({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.id);
    return m === null || m.direction !== "out" || m.status !== "queued" ? null : { to: m.phone, from: m.fromNumber ?? "", body: m.body };
  },
});

export const deliver = internalAction({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    const m: { to: string; from: string; body: string } | null = await ctx.runQuery(internal.crm.messageSend.forDelivery, { id: args.id });
    if (m === null) return;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token || !m.from) {
      await ctx.runMutation(internal.crm.messages.markFailed, { id: args.id, error: "Texting is not set up on this deployment." });
      return;
    }
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: m.to, From: m.from, Body: m.body }).toString(),
      });
      const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (res.ok && data.sid) await ctx.runMutation(internal.crm.messages.markSent, { id: args.id, sid: data.sid });
      else await ctx.runMutation(internal.crm.messages.markFailed, { id: args.id, error: data.message ?? `Twilio answered ${res.status}.` });
    } catch {
      await ctx.runMutation(internal.crm.messages.markFailed, { id: args.id, error: "Could not reach Twilio. Try again." });
    }
  },
});
