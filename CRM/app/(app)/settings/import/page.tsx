import type { Metadata } from "next";
import { ImportPage } from "@/components/import-page";

export const metadata: Metadata = { title: "Import data" };

export default function Page() {
  return <ImportPage />;
}
