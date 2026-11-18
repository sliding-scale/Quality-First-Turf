import type { Metadata } from "next";
import { PaymentsPage } from "@/components/payments-page";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <PaymentsPage />;
}
