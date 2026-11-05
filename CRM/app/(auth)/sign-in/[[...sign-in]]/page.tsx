import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { signInAppearance } from "@/components/clerk-appearance";

export const metadata: Metadata = { title: "Log in" };

/** Email and password only. People are added by an Admin (and in Clerk), so there is no sign-up and no social login here. */
export default function Page() {
  return (
    <div className="auth-signin">
      <SignIn appearance={signInAppearance} fallbackRedirectUrl="/" />
      <p className="auth-note">Access is by invitation. Ask an Admin if you need an account.</p>
    </div>
  );
}
