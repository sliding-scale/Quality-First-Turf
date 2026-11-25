import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import { sendMail } from "./automationSend";
import { requireModule } from "./lib/access";
import { followUpHtml, isEmail } from "./lib/automationRules";
import { queueBookingEmail, wantsConfirmation } from "./lib/bookingEmailQueue";
import { ZohoError } from "./lib/zohoMail";
import { businessZone } from "./settings";
import { safeMessage, zohoSettings } from "./zohoMailSync";

/* The booking confirmation (D-127): when a consultation is booked, or moved to another time, the customer gets an email from the office
   mailbox through Zoho (the same sender as the automations and the client's Email button), saying who is coming, when and where. Jobber used to
   send this; it is ending (D-123). It follows the business's sending mode from Automations settings: Log only sends nothing and writes what it
   would have sent, Test address sends to the test address, Live emails the customer. A time is never emailed twice. */

const LONG_DATE = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const CLOCK = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

const addressOf = (c: Doc<"clients">) =>
  [c.street1, [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");

type Status = "sent" | "tested" | "logged" | "skipped" | "failed";
type Prep =
  | { go: false }
  | { go: true; mode: "log" | "test" | "live"; to: string; subject: string; text: string; start: number; wouldEmail: string };

/** Everything the send needs, read in one go. */
export const prepare = internalQuery({
  args: { eventId: v.id("calendarEvents") },
  handler: async (ctx, { eventId }): Promise<Prep> => {
    const event = await ctx.db.get(eventId);
    if (event === null || !wantsConfirmation(event) || event.confirmEmail?.start === event.start) return { go: false };
    const project = event.opportunityId ? await ctx.db.get(event.opportunityId) : null;
    const client = project ? await ctx.db.get(project.clientId) : null;
    if (project === null || client === null) return { go: false };
    const business = await ctx.db.get(event.businessId);
    const settings = await ctx.db.query("automationSettings").withIndex("by_business", (q) => q.eq("businessId", event.businessId)).unique();
    const mode = settings?.mode ?? "log";
    const tz = await businessZone(ctx);
    const person = event.assigneeIds[0] ? await ctx.db.get(event.assigneeIds[0]) : null;
    const first = client.name.trim().split(/\s+/)[0] || "there";
    const phone = settings?.companyPhone ?? business?.phone ?? "";
    const when = `${LONG_DATE(tz).format(event.start)} at ${CLOCK(tz).format(event.start)}`;
    const address = addressOf(client);
    const lines = [
      `Hi ${first},`,
      `Your on-site consultation with ${business?.name ?? "us"} is booked for ${when}.`,
      ...(person ? [`${person.name} will be coming out to meet you.`] : []),
      ...(address ? [`We will see you at ${address}.`] : []),
      `If you need to change the time, just reply to this email${phone ? ` or call us at ${phone}` : ""}.`,
      `Thank you,\n${business?.name ?? "The team"}`,
    ];
    const clientEmail = client.email.trim();
    const to = mode === "test" ? (settings?.testAddress ?? "") : clientEmail;
    return {
      go: true, mode, start: event.start, wouldEmail: clientEmail,
      to, subject: `Your consultation on ${LONG_DATE(tz).format(event.start)} at ${CLOCK(tz).format(event.start)}`, text: lines.join("\n\n"),
    };
  },
});

export const finish = internalMutation({
  args: {
    eventId: v.id("calendarEvents"), start: v.number(),
    status: v.union(v.literal("sent"), v.literal("tested"), v.literal("logged"), v.literal("skipped"), v.literal("failed")), detail: v.string(),
  },
  handler: async (ctx, a) => {
    const event = await ctx.db.get(a.eventId);
    // The time moved while this was sending: the newer time has its own email.
    if (event === null || event.start !== a.start) return;
    await ctx.db.patch(a.eventId, { confirmEmail: { start: a.start, status: a.status, detail: a.detail, at: Date.now() } });
  },
});

/** Sends (or logs) the confirmation for one consultation. */
export const send = internalAction({
  args: { eventId: v.id("calendarEvents") },
  handler: async (ctx, { eventId }): Promise<void> => {
    const prep: Prep = await ctx.runQuery(internal.crm.bookingEmail.prepare, { eventId });
    if (!prep.go) return;
    const done = async (status: Status, detail: string): Promise<void> => {
      await ctx.runMutation(internal.crm.bookingEmail.finish, { eventId, start: prep.start, status, detail });
    };
    if (prep.mode === "log") return await done("logged", `Would email ${prep.wouldEmail || "no address"}: ${prep.subject}`);
    if (!prep.to || !isEmail(prep.to)) {
      return await done("skipped", prep.mode === "test" ? "No test address is set in Automations settings." : "The client has no usable email address.");
    }
    try {
      const settings = zohoSettings();
      if (!settings.configured) throw new ZohoError("Zoho Mail isn't connected. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN.", 400);
      await sendMail(ctx, settings, { to: prep.to, subject: prep.subject, html: followUpHtml(prep.text, null) });
      await done(prep.mode === "test" ? "tested" : "sent", `Emailed ${prep.to}`);
    } catch (e) {
      console.error(`Could not email the consultation confirmation for ${eventId}`, e);
      await done("failed", safeMessage(e));
    }
  },
});

/** "Email the customer again" on the request page: forgets the earlier result for this time and sends it afresh. */
export const resend = mutation({
  args: { id: v.id("calendarEvents") },
  handler: async (ctx, { id }) => {
    const event = await ctx.db.get(id);
    if (event === null) throw new ConvexError("That consultation no longer exists.");
    await requireModule(ctx, event.businessId, "schedule", "edit");
    if (!wantsConfirmation(event)) throw new ConvexError("This consultation does not get a confirmation email.");
    await ctx.db.patch(id, { confirmEmail: undefined });
    await queueBookingEmail(ctx, id as Id<"calendarEvents">);
  },
});
