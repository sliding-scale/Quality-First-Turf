import type { Metadata } from "next";
import { Suspense } from "react";
import { SchedulePage } from "@/components/schedule-page";
import { ScheduleSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  // useSearchParams needs a Suspense boundary; the skeleton is what shows meanwhile.
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <SchedulePage />
    </Suspense>
  );
}
