import { Suspense } from "react";
import { DiscoveryForm } from "@/components/discovery-form";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <DiscoveryForm />
    </Suspense>
  );
}
