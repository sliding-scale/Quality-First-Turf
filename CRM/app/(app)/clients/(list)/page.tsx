import type { Metadata } from "next";
import { ClientsPage } from "@/components/clients-page";
import type { ClientsSearch } from "@/lib/clients-place";

export const metadata: Metadata = { title: "Clients" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const query = one(sp.q);
  const list: ClientsSearch = { page: one(sp.page), size: one(sp.size), status: one(sp.status), sort: one(sp.sort), dir: one(sp.dir), tags: one(sp.tags) };
  // Keyed on the query so a new search from the top bar starts a fresh list.
  return <ClientsPage key={query} initialQuery={query} saved={typeof sp.saved === "string"} list={list} />;
}
