import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { signInAppearance } from "@/components/clerk-appearance";
import { ForgotPasswordLink } from "@/components/forgot-password-link";
import { WelcomeBar } from "@/components/welcome-loading";
import { SignInShell } from "@/components/sign-in-shell";

export const metadata: Metadata = { title: "Log in" };

/** Email and password only. People are added by an Admin (and in Clerk), so there is no sign-up and no social login here. */
export default function Page() {
  return (
    <SignInShell>
      <div className="auth-head">
        <h1 className="auth-product">LaunchPad</h1>
        <p className="auth-welcome">Welcome back</p>
        <p>Log in to the Quality First Turf CRM.</p>
      </div>
      {/* Shown until Clerk's form has drawn itself (see .auth-skel in globals.css), so the page never opens on just the note below. */}
      <div className="auth-skel" role="status" aria-busy="true">
        <span className="sr">Loading the sign-in form…</span>
        <WelcomeBar />
      </div>
      <SignIn appearance={signInAppearance} fallbackRedirectUrl="/home" />
      <ForgotPasswordLink />
      <p className="auth-note">Access is by invitation. Ask an Admin if you need an account.</p>
    </SignInShell>
  );
}
