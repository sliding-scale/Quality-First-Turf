import type { Metadata } from "next";
import { ClientQuoteApp } from "@/components/client-quote";

// The link is a secret: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { token } = await params;
  const { preview } = await searchParams;
  return <ClientQuoteApp token={token} preview={preview === "1"} />;
}
