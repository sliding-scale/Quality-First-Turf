import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { signInAppearance } from "@/components/clerk-appearance";

export const metadata: Metadata = { title: "Accept your invitation" };

/**
 * Where the link in the invitation email lands (D-055). Clerk adds a one-time `__clerk_ticket` to the address; its sign-up form reads
 * that, already knows the email, asks the person to create a password, signs them in, and sends them to the CRM, where the access
 * gate links them to the team member an Admin added. Nobody can sign up here without a ticket: the Clerk instance is invite-only, and a
 * link that was cancelled or ran out arrives without one, so the message below is shown instead of an empty form.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ "accept-invite"?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const steps = (await params)["accept-invite"] ?? [];
  const ticket = (await searchParams)["__clerk_ticket"];
  // Only the first screen needs the ticket in the address; later steps of Clerk's form (/accept-invite/continue, say) carry it inside.
  if (steps.length === 0 && !ticket) {
    return (
      <div className="auth-invite">
        <div className="auth-invite-head">
          <h1>This invitation link is no longer valid</h1>
          <p>It may have expired (links work for 7 days) or been cancelled. Ask an Admin to send you a new invitation.</p>
        </div>
        <p className="auth-note"><Link href="/sign-in">Already have a password? Log in</Link></p>
      </div>
    );
  }
  return (
    <div className="auth-invite">
      <div className="auth-invite-head">
        <h1>Create your password</h1>
        <p>You have been invited to the Quality First Turf CRM. Choose a password to finish and you will be logged in.</p>
      </div>
      <SignUp appearance={signInAppearance} path="/accept-invite" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </div>
  );
}
