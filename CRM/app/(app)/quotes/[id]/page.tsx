import type { Metadata } from "next";
import { QuotePage } from "@/components/quote-page";

export const metadata: Metadata = { title: "Quote" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotePage id={id} />;
}
