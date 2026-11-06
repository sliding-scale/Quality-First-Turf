"use client";

/* Decides what a visitor sees (D-046): the sign-in page if they are not signed in, a waiting screen while Clerk and Convex agree
   who they are, "no access" if they were never invited or were turned off, and otherwise the app. The backend repeats every
   check on every call, so this is about showing the right screen, not about security. */

import { RedirectToSignIn, SignOutButton, useAuth } from "@clerk/nextjs";
import Image from "next/image";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { getTokenInfo } from "./convex-provider";
import { StaffProvider } from "./staff-context";

export function AccessGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Waiting />
      </AuthLoading>
      <Unauthenticated>
        <NotAccepted />
      </Unauthenticated>
      <Authenticated>
        <StaffGate>{children}</StaffGate>
      </Authenticated>
    </>
  );
}

/**
 * Convex says nobody is signed in. If Clerk also says nobody is, that is normal: go to the sign-in page. If Clerk says someone IS
 * signed in, Convex refused the token. Sending them to the sign-in page would bounce straight back (Clerk redirects signed-in people
 * away from it), looping forever, so explain instead.
 */
function NotAccepted() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Waiting />;
  if (!isSignedIn) return <RedirectToSignIn />;
  const t = getTokenInfo();
  return (
    <div className="gate-page">
      <div className="gate-card" role="alert">
        <Image src="/brand/logo-full.png" alt="Quality First Turf" width={96} height={75} style={{ display: "block", marginBottom: 18 }} />
        <h1>Your sign-in was not accepted</h1>
        <p>You are logged in with Clerk, but the CRM backend refused your sign-in token, so it cannot load anything for you.</p>
        <p className="muted gate-detail">
          Token from: {t.source === "none" ? "nothing (Clerk gave no token)" : t.source === "template" ? 'the "convex" token template' : "Clerk's session token"}.
          {t.audience ? ` Audience: ${t.audience} (it must be "convex").` : ""}
          {t.issuer ? ` Issuer: ${t.issuer}.` : ""}
        </p>
        <p className="muted gate-detail">
          For whoever manages Clerk and Convex: the token&apos;s audience must be <b>convex</b> and its issuer must equal the
          deployment&apos;s <b>CLERK_JWT_ISSUER_DOMAIN</b>. In Clerk, open JWT templates, then convex, and check the <b>aud</b> claim.
        </p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button>{" "}
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="btn primary">Log out</button>
        </SignOutButton>
      </div>
    </div>
  );
}

/** A welcome screen with a loading bar while the sign-in is being confirmed. */
function Waiting() {
  return (
    <div className="gate-page welcome-page" role="status" aria-busy="true">
      <div className="welcome">
        <h1>Welcome back</h1>
        <p>Getting everything ready for you…</p>
        <div className="welcome-bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

function StaffGate({ children }: { children: ReactNode }) {
  const me = useQuery(api.crm.users.me, {});
  const claim = useMutation(api.crm.users.claim);
  const [claimed, setClaimed] = useState<"active" | "deactivated" | "none" | "noEmail" | "unverified" | "error" | null>(null);

  // Signed in with Clerk but not yet linked to a user row: try to link by verified email (an invite, or the first Admin).
  useEffect(() => {
    if (me?.state === "unclaimed" && claimed === null) {
      claim().then(setClaimed, () => setClaimed("error"));
    }
  }, [me?.state, claimed, claim]);

  if (me === undefined || me.state === "signedOut" || (me.state === "unclaimed" && claimed === null) || (me.state === "unclaimed" && claimed === "active")) {
    return <Waiting />;
  }
  if (me.state === "active") return <StaffProvider value={me.user}>{children}</StaffProvider>;

  const email = me.email;
  const off = me.state === "deactivated" || claimed === "deactivated";
  return (
    <div className="gate-page">
      <div className="gate-card" role="alert">
        <Image src="/brand/logo-full.png" alt="Quality First Turf" width={96} height={75} style={{ display: "block", marginBottom: 18 }} />
        <h1>{off ? "Your access is turned off" : "You do not have access yet"}</h1>
        {off ? (
          <p>An Admin has turned off access for this account. Ask an Admin if you think that is a mistake.</p>
        ) : claimed === "error" ? (
          <p>Something went wrong while checking your access. Try again in a moment.</p>
        ) : claimed === "noEmail" ? (
          <>
            <p>You are signed in, but your sign-in does not include an email address, so the CRM cannot tell who you are.</p>
            <p className="muted">For whoever manages Clerk: the token template named <b>convex</b> must include the claim <code>&quot;email&quot;: &quot;{"{{user.primary_email_address}}"}&quot;</code>. Then log out and in again.</p>
          </>
        ) : claimed === "unverified" ? (
          <p>Your email address ({email}) has not been verified yet. Verify it in Clerk, then log in again.</p>
        ) : (
          <>
            <p>Access to this CRM is by invitation. Being added in Clerk is not enough: an Admin also has to add this email in the CRM&apos;s Users screen.</p>
            <p>Ask an Admin to add this email address, then log in again.</p>
          </>
        )}
        {email && <p className="muted">Signed in as <b>{email}</b></p>}
        {me.state === "unclaimed" && (
          <p className="muted gate-detail">
            Your sign-in token carries: {me.claimNames.length ? me.claimNames.join(", ") : "nothing"}. Email taken from: {me.emailSource}.
          </p>
        )}
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="btn primary">Log out</button>
        </SignOutButton>
      </div>
    </div>
  );
}
