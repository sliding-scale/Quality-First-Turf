import type { Metadata } from "next";
import { NewInvoicePage } from "@/components/invoice-form";

export const metadata: Metadata = { title: "New Invoice" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { clientId, projectId, scheduleItem } = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <NewInvoicePage clientId={one(clientId)} projectId={one(projectId)} scheduleItemId={one(scheduleItem)} />;
}
