import type { Metadata } from "next";
import { EditInvoicePage } from "@/components/invoice-form";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditInvoicePage id={id} />;
}
