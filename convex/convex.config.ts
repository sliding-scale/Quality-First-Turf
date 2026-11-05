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
  },
});

app.use(rateLimiter);

export default app;
