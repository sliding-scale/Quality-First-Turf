import type { Metadata } from "next";
import { OpportunityPage } from "@/components/opportunity-page";

export const metadata: Metadata = { title: "Opportunity" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpportunityPage id={id} />;
}
