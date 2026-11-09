"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* The box the sign-in form sits in. While Clerk is signing the person in, the whole form, including the Log In button, is hidden and a
   single spinner shows in the middle (see `[data-busy]` in app/globals.css). Clerk's own button reports "loading" only while its request
   runs, then briefly goes back to normal before the page changes, which would flash the button again, so the busy state is kept until
   the form shows an error (a wrong password, say) or 20 seconds pass. */
export function SignInShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer: number | undefined;
    const check = () => {
      if (root.querySelector('.cl-formButtonPrimary[data-loading="true"]')) {
        setBusy(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setBusy(false), 20000);
      } else if (root.querySelector(".cl-formFieldErrorText, .cl-alert")) {
        window.clearTimeout(timer);
        setBusy(false);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-loading"] });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="auth-signin"
      ref={ref}
      data-busy={busy ? "true" : undefined}
      aria-busy={busy}
      onKeyDown={(e) => {
        // Tab from the email box always lands in the password box, whatever Clerk has redrawn in between.
        const t = e.target as HTMLElement;
        if (e.key !== "Tab" || e.shiftKey || !(t instanceof HTMLInputElement) || t.name !== "identifier") return;
        const password = ref.current?.querySelector<HTMLInputElement>("input[name='password']");
        if (!password) return;
        e.preventDefault();
        password.focus();
      }}
    >
      {children}
    </div>
  );
}
