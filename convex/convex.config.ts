import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { v } from "convex/values";

const app = defineApp({
  env: {
    JOBBER_CLIENT_ID: v.optional(v.string()),
    JOBBER_CLIENT_SECRET: v.optional(v.string()),
    JOBBER_CONNECT_KEY: v.optional(v.string()),
    SALES_EMAIL: v.optional(v.string()),
    SALES_PASSWORD: v.optional(v.string()),
    SALES_NAME: v.optional(v.string()),
    SALES_ACCOUNTS: v.optional(v.string()),
    // CRM (D-046). Comma-separated emails that become Admin on their first sign-in. This is how the first Admin exists;
    // after that, Admins invite everyone else in the CRM. Set on each deployment, never kept in code.
    CRM_BOOTSTRAP_ADMIN_EMAILS: v.optional(v.string()),
    // CRM: set to "true" on the DEV deployment only, to allow loading sample data. Unset means seeding is refused.
    CRM_ALLOW_SAMPLE_DATA: v.optional(v.string()),
    // CRM team invitations (D-055). The Clerk instance's secret key (test key on dev, live key on prod): the backend uses it to send,
    // cancel and delete invitations and accounts. CRM_APP_URL is the CRM's public address, which the invitation link returns to
    // (https://launchpad.qualityfirstturf.com on prod); when unset, the address of the Admin's browser is used. CLERK_WEBHOOK_SECRET
    // is the signing secret of the Clerk webhook that tells the CRM when someone is deleted in Clerk.
    CLERK_SECRET_KEY: v.optional(v.string()),
    CRM_APP_URL: v.optional(v.string()),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    // Zoho Mail (D-064 reads, D-065 sends the pipeline automations' emails). One mailbox, office@qualityfirstturf.com unless ZOHO_MAILBOX is set.
    // The refresh token is created once in the Zoho API console with ZohoMail.accounts.READ, ZohoMail.folders.READ and
    // ZohoMail.messages.READ. Sending the automations' emails (D-065) also needs ZohoMail.messages.CREATE; there is no update or delete scope. ZOHO_ACCOUNTS_URL and ZOHO_MAIL_API_URL are only
    // needed when the mailbox is not on Zoho's US servers (for example https://accounts.zoho.eu and https://mail.zoho.eu).
    ZOHO_CLIENT_ID: v.optional(v.string()),
    ZOHO_CLIENT_SECRET: v.optional(v.string()),
    ZOHO_REFRESH_TOKEN: v.optional(v.string()),
    ZOHO_MAILBOX: v.optional(v.string()),
    ZOHO_ACCOUNTS_URL: v.optional(v.string()),
    ZOHO_MAIL_API_URL: v.optional(v.string()),
    // Zoho Calendar, one connection per person (D-069). A Zoho "Server-based Application" (its Client ID and Secret) whose redirect address is
    // <this deployment's .convex.site address>/zoho/calendar/callback, and a key that encrypts each person's stored token
    // (32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
    ZOHO_CAL_CLIENT_ID: v.optional(v.string()),
    ZOHO_CAL_CLIENT_SECRET: v.optional(v.string()),
    CALENDAR_TOKEN_KEY: v.optional(v.string()),
  },
});

app.use(rateLimiter);

export default app;
