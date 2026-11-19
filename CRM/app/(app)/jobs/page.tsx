import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsPage } from "@/components/jobs-page";
import { JobsSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Jobs" };

export default function Page() {
  // useSearchParams (the Status filter in the address) needs a Suspense boundary during the build.
  return <Suspense fallback={<JobsSkeleton />}><JobsPage /></Suspense>;
}
