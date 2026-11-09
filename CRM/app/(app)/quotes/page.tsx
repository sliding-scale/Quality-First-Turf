import type { Metadata } from "next";
import { QuotesPage } from "@/components/quotes-page";

export const metadata: Metadata = { title: "Quotes" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  return <QuotesPage key={query} initialQuery={query} />;
}
