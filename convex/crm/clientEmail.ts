import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalQuery } from "../_generated/server";
import { sendMail } from "./automationSend";
import { followUpHtml, isEmail } from "./lib/automationRules";
import { EDIT_ROLES } from "./lib/stages";
import { ZohoError } from "./lib/zohoMail";
import { safeMessage, zohoSettings } from "./zohoMailSync";

/* The Email button on a client (D-077): a staff member writes a subject and a message and it is sent to the client from the office mailbox
   through Zoho. "Send me a copy" copies the person's own address. Plain text only for now (no attachments). Zoho puts the message in Sent, so
   the client's Communication tab picks it up with the rest of the mail. Only people whose role can make changes may send. */

const MAX_RECIPIENTS = 5;
/** Jobber's limit, which the dialog shows: 19 MB of attachments in all, and up to ten files. */
export const MAX_ATTACHMENT_BYTES = 19 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|vbs|js|jar|ps1|sh|dll)$/i;

/** Who is asking, and whether they may email this client. An action cannot read the database itself, so it asks here. */
export const prepare = internalQuery({
  args: { tokenIdentifier: v.string(), clientId: v.id("clients") },
  handler: async (ctx, a) => {
    const user = await ctx.db.query("users").withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", a.tokenIdentifier)).unique();
    if (!user || user.status !== "active") throw new ConvexError("No access.");
    if (!user.roles.some((r) => (EDIT_ROLES as readonly string[]).includes(r))) throw new ConvexError("Your role can view this but not change it.");
    const client = await ctx.db.get(a.clientId);
    if (!client) throw new ConvexError("That client no longer exists.");
    if (!user.roles.includes("admin") && !user.businessIds.includes(client.businessId)) throw new ConvexError("No access to this business.");
    return { staffEmail: user.email, clientName: client.name };
  },
});

export const send = action({
  args: {
    clientId: v.id("clients"), to: v.array(v.string()), subject: v.string(), body: v.string(), copyMe: v.boolean(),
    /** Files the browser already uploaded to storage. They are checked here, sent, and deleted from storage afterwards. */
    attachments: v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() }))),
  },
  handler: async (ctx, a): Promise<{ sent: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in.");
    const who: { staffEmail: string; clientName: string } = await ctx.runQuery(internal.crm.clientEmail.prepare, { tokenIdentifier: identity.tokenIdentifier, clientId: a.clientId });
    const to = [...new Set(a.to.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    const subject = a.subject.trim();
    const body = a.body.trim();
    if (to.length === 0) throw new ConvexError("Add an email address to send to.");
    if (to.length > MAX_RECIPIENTS) throw new ConvexError(`You can send to up to ${MAX_RECIPIENTS} addresses.`);
    const bad = to.find((t) => !isEmail(t));
    if (bad) throw new ConvexError(`${bad} is not a usable email address.`);
    if (!subject) throw new ConvexError("Write a subject.");
    if (subject.length > 200) throw new ConvexError("The subject is too long (200 characters at most).");
    if (!body) throw new ConvexError("Write a message.");
    if (body.length > 10000) throw new ConvexError("The message is too long (10,000 characters at most).");
    const settings = zohoSettings();
    const files = a.attachments ?? [];
    try {
      if (!settings.configured) throw new ConvexError("Email sending is not set up on this deployment yet.");
      if (files.length > MAX_ATTACHMENTS) throw new ConvexError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      const attachments: { name: string; type: string; bytes: ArrayBuffer }[] = [];
      let total = 0;
      for (const f of files) {
        const meta = await ctx.storage.getMetadata(f.storageId);
        const blob = meta ? await ctx.storage.get(f.storageId) : null;
        if (!meta || !blob) throw new ConvexError("A file was not uploaded. Try again.");
        const name = safeFileName(f.name);
        if (BLOCKED.test(name)) throw new ConvexError(`${name} cannot be sent: email programs block that kind of file.`);
        total += meta.size;
        if (total > MAX_ATTACHMENT_BYTES) throw new ConvexError("The attachments are over the 19 MB limit.");
        attachments.push({ name, type: meta.contentType ?? "", bytes: await blob.arrayBuffer() });
      }
      const cc = a.copyMe && isEmail(who.staffEmail) && !to.includes(who.staffEmail.toLowerCase()) ? who.staffEmail : undefined;
      try {
        await sendMail(ctx, settings, { to: to.join(","), ...(cc ? { cc } : {}), ...(attachments.length ? { attachments } : {}), subject, html: followUpHtml(body, null) });
      } catch (err) {
        if (err instanceof ZohoError || err instanceof Error) throw new ConvexError(`The email could not be sent: ${safeMessage(err)}`);
        throw new ConvexError("The email could not be sent.");
      }
    } finally {
      // The copies in storage were only there to carry the files here.
      for (const f of files) await ctx.storage.delete(f.storageId).catch(() => undefined);
    }
    return { sent: to.length };
  },
});

/** A file name safe to put on an email: no path or reserved characters, no control characters, at most 200 long. */
function safeFileName(raw: string): string {
  let clean = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    clean += code < 32 || code === 127 || "\\/:*?\"<>|".includes(ch) ? "_" : ch;
  }
  return clean.trim().slice(0, 200) || "attachment";
}
