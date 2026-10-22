import { Suspense } from "react";
import { OnSiteForm } from "@/components/on-site-form";

export default function VisitProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading the project.</p>}>
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
