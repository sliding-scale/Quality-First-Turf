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
    // CRM: set to "true" on the DEV deployment only, until Clerk sign-in exists. Unset means every CRM call is rejected.
    CRM_ALLOW_ANONYMOUS_DEV: v.optional(v.string()),
  },
});

app.use(rateLimiter);

export default app;
