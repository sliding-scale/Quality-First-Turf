import { defineConfig } from "vitest/config";

// Backend tests run Convex functions in memory (convex-test). They live in CRM/tests/, outside convex/, so the
// Convex dev server and deploys never bundle them.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
