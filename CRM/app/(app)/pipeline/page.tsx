import type { Metadata } from "next";
import { Suspense } from "react";
import { PipelinePage } from "@/components/pipeline-page";
import { PipelineSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page() {
  // useSearchParams needs a Suspense boundary; the skeleton is what shows meanwhile.
  return (
    <Suspense fallback={<PipelineSkeleton />}>
      <PipelinePage />
    </Suspense>
  );
}
