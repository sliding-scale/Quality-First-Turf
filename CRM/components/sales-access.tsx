"use client";

/* The CRM's half of the sales-form sign-in (D-053). The person is already signed in with Clerk and checked by the access gate when
   this renders. It asks the backend for a one-time code (which only an active Sales or Admin user gets) and sends them back to the
   sales form with it. The other page signs them out of the CRM too, when they sign out of the sales form. Both look like the sales
   form's own sign-in screen (dark card, lime heading), so the person does not see two different apps while they are passed along. */

import { useClerk } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { salesFormOrigin, salesFormPath } from "@/lib/sales-form";

function Card({ lead, children, busy }: { lead: string; children?: ReactNode; busy?: boolean }) {
  return (
    <div className="sa-page">
      <div className="sa-card" role={busy ? "status" : undefined} aria-busy={busy}>
        <Image className="sa-logo" src="/brand/logo-mark.png" alt="Quality First Turf" width={771} height={605} priority />
        <h1>Welcome Back</h1>
        <p className="sa-lead">{lead}</p>
        {busy && <span className="sa-spin" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}

/** What shows while the CRM is still confirming who is signing in. */
export function SalesAccessWaiting() {
  return <Card lead="Signing you in…" busy />;
}

export function SalesAccess() {
  const params = useSearchParams();
  const origin = salesFormOrigin(params.get("return"));
  const next = salesFormPath(params.get("next"));
  const issue = useMutation(api.sales.clerk.issueHandoff);
  const { signOut } = useClerk();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (origin === null || started.current) return;
    started.current = true;
    issue()
      .then((code) => {
        const url = new URL(next, origin);
        url.searchParams.set("code", code);
        window.location.replace(url.toString());
      })
      .catch((problem) => setError(problem instanceof ConvexError && typeof problem.data === "string" ? problem.data : "Could not open the sales form. Try again."));
  }, [origin, next, issue]);

  if (origin === null) {
    return (
      <Card lead="This page opens the sales form after you sign in.">
        <p className="sa-alert" role="alert">That link is not valid. Start from the sales form and choose Sign In.</p>
      </Card>
    );
  }
  if (error !== null) {
    return (
      <Card lead="Sign in with your Quality First Turf account to open your projects.">
        <p className="sa-alert" role="alert">{error}</p>
        <button type="button" className="sa-button" onClick={() => void signOut({ redirectUrl: "/sign-in" })}>Use a different account</button>
      </Card>
    );
  }
  return <Card lead="Opening the sales form…" busy />;
}

export function SalesSignOut() {
  const params = useSearchParams();
  const origin = salesFormOrigin(params.get("return"));
  const { signOut } = useClerk();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Back to the sales form when it asked, otherwise to the CRM's own sign-in.
    void signOut().finally(() => window.location.replace(origin ? origin + "/visit" : "/sign-in"));
  }, [origin, signOut]);

  return <Card lead="Signing you out…" busy />;
}
