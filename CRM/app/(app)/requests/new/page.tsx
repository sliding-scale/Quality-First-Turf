import type { Metadata } from "next";
import { NewRequestPage } from "@/components/request-form";

export const metadata: Metadata = { title: "New Request" };

export default function Page() {
  return <NewRequestPage />;
}
