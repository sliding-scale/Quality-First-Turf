import type { Metadata } from "next";
import { ClientForm } from "@/components/client-form";

export const metadata: Metadata = { title: "New client" };

export default function Page() {
  return <ClientForm />;
}
