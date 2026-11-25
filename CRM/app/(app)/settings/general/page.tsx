import type { Metadata } from "next";
import { GeneralSettingsPage } from "@/components/general-settings-page";

export const metadata: Metadata = { title: "General settings" };

export default function Page() {
  return <GeneralSettingsPage />;
}
