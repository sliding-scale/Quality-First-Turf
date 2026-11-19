import type { Metadata } from "next";
import { ChecklistsPage } from "@/components/checklists-page";

export const metadata: Metadata = { title: "Checklists" };

export default function Page() {
  return <ChecklistsPage />;
}
