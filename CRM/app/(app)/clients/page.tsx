import type { Metadata } from "next";
import { ClientsPage } from "@/components/clients-page";

export const metadata: Metadata = { title: "Clients" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { q, saved } = await searchParams;
  const query = typeof q === "string" ? q : "";
  // Keyed on the query so a new search from the top bar starts a fresh list.
  return <ClientsPage key={query} initialQuery={query} saved={typeof saved === "string"} />;
}
