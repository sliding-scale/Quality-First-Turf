import type { Metadata } from "next";
import { EditQuotePage } from "@/components/quote-builder";
import { parseSection } from "@/lib/quote-sections";

export const metadata: Metadata = { title: "Edit quote" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const { id } = await params;
  const { section } = await searchParams;
  return <EditQuotePage id={id} section={parseSection(section)} />;
}
