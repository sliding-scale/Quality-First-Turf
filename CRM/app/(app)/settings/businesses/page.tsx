import type { Metadata } from "next";
import { BusinessesSettings } from "@/components/businesses-settings";

export const metadata: Metadata = { title: "Businesses" };

export default function Page() {
  return <BusinessesSettings />;
}
