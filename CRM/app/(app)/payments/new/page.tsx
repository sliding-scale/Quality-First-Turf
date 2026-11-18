import type { Metadata } from "next";
import { CollectPaymentPage } from "@/components/collect-payment";

export const metadata: Metadata = { title: "Collect Payment" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { invoice, clientId } = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <CollectPaymentPage invoiceId={one(invoice)} clientId={one(clientId)} />;
}
