import type { Metadata } from "next";
import { StockPage } from "@/components/stock-page";

export const metadata: Metadata = { title: "Stock" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <StockPage tab={tab === "orders" ? "orders" : "stock"} />;
}
