import type { Metadata } from "next";
import { CataloguePage } from "@/components/catalogue-page";

export const metadata: Metadata = { title: "Products & Services" };

export default function Page() {
  return <CataloguePage />;
}
