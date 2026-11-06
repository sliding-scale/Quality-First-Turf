"use client";

/* The CRM's half of the sales-form sign-in (D-053). The person is already signed in with Clerk and checked by the access gate when
   this renders. It asks the backend for a one-time code (which only an active Sales or Admin user gets) and sends them back to the
   sales form with it. The other page signs them out of the CRM too, when they sign out of the sales form. */

import { useClerk } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { salesFormOrigin, salesFormPath } from "@/lib/sales-form";

function Waiting({ title }: { title: string }) {
  return (
    <div className="gate-page welcome-page" role="status" aria-busy="true">
      <div className="welcome">
        <h1>{title}</h1>
        <p>One moment…</p>
        <div className="welcome-bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
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
      <div className="gate-page">
        <div className="gate-card" role="alert">
          <h1>That link is not valid</h1>
          <p>This page opens the sales form after you sign in. Start from the sales form and choose Sign In.</p>
        </div>
      </div>
    );
  }
  if (error !== null) {
    return (
      <div className="gate-page">
        <div className="gate-card" role="alert">
          <h1>Could not open the sales form</h1>
          <p>{error}</p>
          <button type="button" className="btn primary" onClick={() => void signOut({ redirectUrl: "/sign-in" })}>Use a different account</button>
        </div>
      </div>
    );
  }
  return <Waiting title="Opening the sales form" />;
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

  return <Waiting title="Signing you out" />;
}
