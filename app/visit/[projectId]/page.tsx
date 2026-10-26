import { Suspense } from "react";
import { OnSiteForm } from "@/components/on-site-form";
import { VisitSkeleton } from "@/components/sales-skeleton";

export default function VisitProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<VisitSkeleton />}>
      <VisitProject params={params} />
    </Suspense>
  );
}

async function VisitProject({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <OnSiteForm projectId={projectId} />;
}
