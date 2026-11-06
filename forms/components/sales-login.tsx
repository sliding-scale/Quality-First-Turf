"use client";

import { useMutation } from "convex/react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { friendlyError } from "@/convex/shared/errors";
import { crmUrl } from "@/lib/crm-url";

/**
 * The sales sign-in (D-053). People sign in with Clerk on the CRM, not here. "Sign In" sends them to the CRM, which checks they are an
 * active user with the Sales or Admin role and sends them back to this page with a one-time code in the address. This swaps the code
 * for a sales session token (once), removes it from the address, and the rest of the sales area works as before.
 */
export function SalesLogin({ onSignedIn }: { onSignedIn: (token: string, remember?: boolean) => void }) {
  const redeem = useMutation(api.sales.clerk.redeemHandoff);
  const [error, setError] = useState<string | null>(null);
  // Starts true when the address carries a code, so the button never flashes before the swap.
  const [working, setWorking] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code"));
  const tried = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code === null || tried.current) return;
    tried.current = true;
    params.delete("code");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "")); // the code never stays in the history
    setWorking(true);
    redeem({ code })
      .then((session) => onSignedIn(session.token, true))
      .catch((problem) => setError(friendlyError(problem, "Could not sign you in. Try again.")))
      .finally(() => setWorking(false));
  }, [redeem, onSignedIn]);

  function signIn() {
    const params = new URLSearchParams(window.location.search);
    params.delete("code");
    const rest = params.toString();
    const next = window.location.pathname + (rest ? "?" + rest : "");
    const target = crmUrl(`/sales-access?return=${encodeURIComponent(window.location.origin)}&next=${encodeURIComponent(next)}`);
    if (target === null) {
      setError("Sales sign-in is not set up yet. Ask an Admin to set the CRM address for this site.");
      return;
    }
    window.location.assign(target);
  }

  return (
    <div className="sales-login">
      <div className="sales-login__stage">
        <div className="sales-login__card" aria-busy={working}>
          <Image className="sales-login__logo" src="/brand/logo-mark.png" alt="Quality First Turf" width={771} height={605} priority />
          <h1>Welcome Back</h1>
          <p className="sales-login__lead">Sign in with your Quality First Turf account to open your projects.</p>

          {error !== null ? (
            <p className="sales-login__alert" role="alert">
              {error}
            </p>
          ) : null}

          {working ? (
            <p className="sales-login__lead" role="status">
              Signing you in…
            </p>
          ) : (
            <button type="button" className="sales-login__submit" onClick={signIn}>
              Sign In
              <ArrowRight aria-hidden="true" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
