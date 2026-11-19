import type { Metadata } from "next";
import { Suspense } from "react";
import { NewJobPage } from "@/components/job-form";
import { NewRequestSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "New Job" };

export default function Page() {
  // useSearchParams (a client named in the address) needs a Suspense boundary during the build.
  return <Suspense fallback={<NewRequestSkeleton />}><NewJobPage /></Suspense>;
}
