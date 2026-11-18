import type { Metadata } from "next";
import { InvoicePage } from "@/components/invoice-page";

export const metadata: Metadata = { title: "Invoice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePage id={id} />;
}
