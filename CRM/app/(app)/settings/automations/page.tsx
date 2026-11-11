import type { Metadata } from "next";
import { AutomationsPage } from "@/components/automations-page";

export const metadata: Metadata = { title: "Automations" };

export default function Page() {
  return <AutomationsPage />;
}
