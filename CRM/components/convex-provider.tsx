"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

/** Connects the whole app to the shared Convex deployment named in NEXT_PUBLIC_CONVEX_URL (CRM/.env.local). */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main style={{ padding: 32, maxWidth: 560 }}>
        <h1>Backend not configured</h1>
        <p>Set <b>NEXT_PUBLIC_CONVEX_URL</b> in <b>CRM/.env.local</b> to the dev deployment&apos;s URL, then restart the dev server.</p>
      </main>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
