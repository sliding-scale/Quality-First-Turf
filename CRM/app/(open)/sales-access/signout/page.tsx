import { Suspense } from "react";
import { SalesSignOut } from "@/components/sales-access";

export const metadata = { title: "Signing out" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SalesSignOut />
    </Suspense>
  );
}
