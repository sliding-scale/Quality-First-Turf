import path from "node:path";
import type { NextConfig } from "next";

// The shared Convex backend lives in ../convex, outside this app's folder.
const repoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  // The Finance board is called Backend now (D-134); old links and bookmarks still open it.
  async redirects() {
    return [{ source: "/pipeline/finance", destination: "/pipeline/backend", permanent: false }];
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
