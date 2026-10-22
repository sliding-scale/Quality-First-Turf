import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    JOBBER_CLIENT_ID: v.optional(v.string()),
    JOBBER_CLIENT_SECRET: v.optional(v.string()),
  },
});

export default app;
