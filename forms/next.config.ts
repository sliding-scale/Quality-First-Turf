import path from "node:path";
import type { NextConfig } from "next";

// The shared Convex backend lives in ../convex, outside this app's folder.
const repoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  images: {
    localPatterns: [{ pathname: "**" }],
  },
  experimental: {
    agentFeedback: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: repoRoot,
    rules: {
      // Only the app's own stylesheet goes through Tailwind. Running it on every
      // .css also hit the generated next/font CSS and broke the font URL query.
      "*.css": {
        condition: { path: /(^|\/)app\/globals\.css$/ },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
