import { Suspense, type ReactNode } from "react";
import { VisitShell } from "@/components/visit-shell";

export default function VisitLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="visit-shell" aria-busy="true" />}>
      <VisitShell>{children}</VisitShell>
    </Suspense>
  );
}
