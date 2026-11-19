import type { Metadata } from "next";
import { ExportPage } from "@/components/export-page";

export const metadata: Metadata = { title: "Export data" };

export default function Page() {
  return <ExportPage />;
}
