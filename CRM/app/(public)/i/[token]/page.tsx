import type { Metadata } from "next";
import { ClientInvoiceApp } from "@/components/client-invoice";

// The link is a secret: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Your invoice", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { token } = await params;
  const { preview } = await searchParams;
  return <ClientInvoiceApp token={token} preview={preview === "1"} />;
}
