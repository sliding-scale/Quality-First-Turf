"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo, type ReactNode } from "react";

/** What the last token looked like, for the "your sign-in was not accepted" screen. Claim names, issuer and audience only. */
export type TokenInfo = { source: "template" | "session" | "none"; issuer: string; audience: string; claimNames: string[] };
let lastToken: TokenInfo = { source: "none", issuer: "", audience: "", claimNames: [] };
export const getTokenInfo = () => lastToken;

function remember(token: string, source: "template" | "session") {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part)) as Record<string, unknown>;
    const aud = claims.aud;
    lastToken = {
      source,
      issuer: typeof claims.iss === "string" ? claims.iss : "",
      audience: Array.isArray(aud) ? aud.join(",") : typeof aud === "string" ? aud : "(none)",
      claimNames: Object.keys(claims).sort(),
    };
  } catch {
    lastToken = { source, issuer: "", audience: "", claimNames: [] };
  }
}

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

/**
 * What Convex gets as the signed-in person's token. Convex's own Clerk adapter sends Clerk's plain *session token* whenever that
 * token says aud "convex" (which Clerk's Convex integration switch causes), and then never uses the "convex" token template. The
 * session token has no email, so the CRM could not tell who signed in (D-048). This asks for the "convex" template first, which
 * carries the email, and falls back to the session token only if the template cannot be had.
 */
function useAuthFromClerk() {
  const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionId } = useAuth();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        const fromTemplate = await getToken({ template: "convex", skipCache: forceRefreshToken });
        if (fromTemplate) {
          remember(fromTemplate, "template");
          return fromTemplate;
        }
      } catch {
        // No "convex" template on this Clerk instance: use the session token below.
      }
      try {
        const fromSession = await getToken({ skipCache: forceRefreshToken });
        if (fromSession) remember(fromSession, "session");
        return fromSession;
      } catch {
        return null;
      }
    },
    // A new function (so Convex asks again) whenever the session changes. getToken is not stable, so it is left out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgRole, sessionId],
  );
  return useMemo(() => ({ isLoading: !isLoaded, isAuthenticated: isSignedIn ?? false, fetchAccessToken }), [isLoaded, isSignedIn, fetchAccessToken]);
}

/** Connects the app to the shared Convex deployment named in NEXT_PUBLIC_CONVEX_URL, sending the signed-in person's Clerk token with every call. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main style={{ padding: 32, maxWidth: 560 }}>
        <h1>Backend not configured</h1>
        <p>Set <b>NEXT_PUBLIC_CONVEX_URL</b> in <b>CRM/.env.local</b> to the dev deployment&apos;s URL, then restart the dev server.</p>
      </main>
    );
  }
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
      {children}
    </ConvexProviderWithAuth>
  );
}
