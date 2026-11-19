import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireModule, requireProject } from "./lib/access";
import { normalizePhone, whatsAppDigits } from "./lib/phone";

/** WhatsApp (plan 2026-11-20-calls-whatsapp, PRD 5.4): sending a project's work package through WhatsApp, logged against the project. Until the
 *  WhatsApp Business Platform is connected the screen opens WhatsApp with the message filled in (wa.me) and this logs it as "sent by hand", the way
 *  texts are (crm/messages.ts). The same `messages` row, with channel "whatsapp", is what a connected sender would write. */

const MAX_BODY = 4000;

export const log = mutation({
  args: { businessId: v.id("businesses"), opportunityId: v.id("opportunities"), phone: v.string(), body: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "messages", "edit");
    const p = await ctx.db.get(args.opportunityId);
    if (p === null || p.businessId !== args.businessId || p.outcome !== "won") throw new ConvexError("A work package goes out from a Closed Won project of this business.");
    await requireProject(ctx, p, "pipelinePreplanning", "view");
    const phone = normalizePhone(args.phone);
    const digits = whatsAppDigits(args.phone);
    if (!phone || !digits) throw new ConvexError("Enter the WhatsApp number with its country code, for example +1 555 123 4567.");
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write the message first.");
    if (body.length > MAX_BODY) throw new ConvexError(`A message is up to ${MAX_BODY} characters.`);
    const id = await ctx.db.insert("messages", {
      businessId: args.businessId, opportunityId: p._id, phone, direction: "out", body, userId: staff.userId, userName: staff.name, status: "manual", channel: "whatsapp", at: args.now,
    });
    return { id, digits, body };
  },
});
