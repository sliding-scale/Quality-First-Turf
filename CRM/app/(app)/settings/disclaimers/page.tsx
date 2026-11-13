import type { Metadata } from "next";
import { DisclaimersPage } from "@/components/disclaimers-page";

export const metadata: Metadata = { title: "Disclaimers" };

export default function Page() {
  return <DisclaimersPage />;
}
