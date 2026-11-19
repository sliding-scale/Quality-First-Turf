import type { Metadata } from "next";
import { ClientWorkPackageApp } from "@/components/client-work-package";

// The link is a secret: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Work package", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientWorkPackageApp token={token} />;
}
