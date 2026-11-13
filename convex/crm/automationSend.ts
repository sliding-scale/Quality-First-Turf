import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ZohoAuthError, ZohoError, parseZohoJson, readAccounts, unwrapZoho } from "./lib/zohoMail";
import { refresh, safeMessage, tokenForRead, zohoGet, zohoSettings, type Settings } from "./zohoMailSync";

/* Sends one automation email through Zoho Mail (D-065). This is the only place the CRM sends mail. It needs the ZohoMail.messages.CREATE scope
   on the refresh token, on top of the read scopes the Communication tab uses. The message goes out from the office mailbox, so Zoho puts it
   in Sent and the Communication tab's sync picks it up. */

export const sendOne = internalAction({
  args: { runId: v.id("automationRuns") },
  handler: async (ctx, a) => {
    const prep = await ctx.runMutation(internal.crm.automations.prepareSend, { runId: a.runId, now: Date.now() });
    if (!prep) return null;
    try {
      const settings = zohoSettings();
      if (!settings.configured) throw new ZohoError("Zoho Mail isn't connected. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN.", 400);
      await sendMail(ctx, settings, { to: prep.to, subject: prep.subject, html: prep.html });
      await ctx.runMutation(internal.crm.automations.finishSend, { runId: a.runId, mode: prep.mode, to: prep.to, subject: prep.subject, now: Date.now() });
    } catch (err) {
      await ctx.runMutation(internal.crm.automations.finishSend, { runId: a.runId, mode: prep.mode, to: prep.to, subject: prep.subject, error: safeMessage(err), now: Date.now() });
    }
    return null;
  },
});

/** The same for a custom automation (D-071): one email, from the office mailbox. */
export const sendCustomOne = internalAction({
  args: { runId: v.id("customAutomationRuns") },
  handler: async (ctx, a) => {
    const prep = await ctx.runMutation(internal.crm.customAutomations.prepareSend, { runId: a.runId, now: Date.now() });
    if (!prep) return null;
    try {
      const settings = zohoSettings();
      if (!settings.configured) throw new ZohoError("Zoho Mail isn't connected. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN.", 400);
      await sendMail(ctx, settings, { to: prep.to, subject: prep.subject, html: prep.html });
      await ctx.runMutation(internal.crm.customAutomations.finishSend, { runId: a.runId, mode: prep.mode, to: prep.to, subject: prep.subject, now: Date.now() });
    } catch (err) {
      await ctx.runMutation(internal.crm.customAutomations.finishSend, { runId: a.runId, mode: prep.mode, to: prep.to, subject: prep.subject, error: safeMessage(err), now: Date.now() });
    }
    return null;
  },
});

async function accountId(ctx: ActionCtx, settings: Settings, token: string): Promise<string> {
  const stored: string = await ctx.runQuery(internal.crm.automations.mailAccountId, {});
  if (stored) return stored;
  const found = readAccounts(await zohoGet(`${settings.mailApiUrl}/api/accounts`, token)).find((row) => row.email === settings.mailbox);
  if (!found) throw new ZohoError(`Zoho did not return ${settings.mailbox}.`, 404);
  return found.accountId;
}

async function sendMail(ctx: ActionCtx, settings: Settings, mail: { to: string; subject: string; html: string }): Promise<void> {
  let token = await tokenForRead(ctx, settings);
  const account = await accountId(ctx, settings, token);
  const url = `${settings.mailApiUrl}/api/accounts/${encodeURIComponent(account)}/messages`;
  const payload = { fromAddress: settings.mailbox, toAddress: mail.to, subject: mail.subject, content: mail.html, mailFormat: "html", askReceipt: "no" };
  try {
    await post(url, token, payload);
  } catch (err) {
    if (!(err instanceof ZohoAuthError)) throw err;
    token = await refresh(ctx, settings);
    try {
      await post(url, token, payload);
    } catch (again) {
      if (again instanceof ZohoAuthError) throw new ZohoError("Zoho refused to send. The refresh token needs the ZohoMail.messages.CREATE scope.", again.status);
      throw again;
    }
  }
}

async function post(url: string, accessToken: string, payload: Record<string, string>): Promise<void> {
  if (!url.startsWith("https://")) throw new ZohoError("Refusing a Zoho request that is not https.", 400);
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  unwrapZoho(response.status, text ? parseZohoJson(text) : {});
}
