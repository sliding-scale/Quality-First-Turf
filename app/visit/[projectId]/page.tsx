import { Suspense } from "react";
import { OnSiteForm } from "@/components/on-site-form";
import { VisitSkeleton } from "@/components/sales-skeleton";

/**
 * The staff area shows a sign-in screen until the browser has a session, so the layout cannot
 * render this page on the server. Instant-navigation validation has nothing to check here.
 */
export const instant = false;

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
