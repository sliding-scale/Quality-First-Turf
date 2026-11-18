import type { Metadata } from "next";
import { InvoiceSettingsPage } from "@/components/invoice-settings-page";

export const metadata: Metadata = { title: "Invoice settings" };

export default function Page() {
  return <InvoiceSettingsPage />;
}
