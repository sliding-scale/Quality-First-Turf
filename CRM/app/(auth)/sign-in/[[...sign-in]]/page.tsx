import type { Metadata } from "next";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Log in" };

/** Email and password only, with an emailed code as the other way in. People are added by an Admin (and in Clerk), so there is no sign-up and no social login here. */
export default function Page() {
  return (
    <>
      <SignInForm />
      <p className="auth-note">Access is by invitation. Ask an Admin if you need an account.</p>
    </>
  );
}
