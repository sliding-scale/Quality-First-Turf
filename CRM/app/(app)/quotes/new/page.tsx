import type { Metadata } from "next";
import { NewQuotePage } from "@/components/quote-builder";

export const metadata: Metadata = { title: "New Quote" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { clientId, projectId } = await searchParams;
  return <NewQuotePage clientId={typeof clientId === "string" ? clientId : undefined} projectId={typeof projectId === "string" ? projectId : undefined} />;
}
