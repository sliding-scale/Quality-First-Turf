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
  },
});

app.use(rateLimiter);

export default app;
