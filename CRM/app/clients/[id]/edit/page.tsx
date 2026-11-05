import type { Metadata } from "next";
import { ClientForm } from "@/components/client-form";

export const metadata: Metadata = { title: "Edit client" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientForm editId={id} />;
}
