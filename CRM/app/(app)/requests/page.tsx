import type { Metadata } from "next";
import { RequestsPage } from "@/components/requests-page";

export const metadata: Metadata = { title: "Requests" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  return <RequestsPage key={query} initialQuery={query} />;
}
