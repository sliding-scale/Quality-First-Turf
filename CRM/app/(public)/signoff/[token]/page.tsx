import type { Metadata } from "next";
import { ClientSignoffApp } from "@/components/client-signoff";

// The link is a secret: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Completion sign-off", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientSignoffApp token={token} />;
}
