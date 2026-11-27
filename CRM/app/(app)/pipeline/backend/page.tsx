import type { Metadata } from "next";
import { WorkPipelinePage } from "@/components/work-pipeline-page";

export const metadata: Metadata = { title: "Backend" };

export default function Page() {
  return <WorkPipelinePage pipeline="Finance" />;
}
