import { Suspense } from "react";
import { SalesAccess } from "@/components/sales-access";

export const metadata = { title: "Sales form" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SalesAccess />
    </Suspense>
  );
}
