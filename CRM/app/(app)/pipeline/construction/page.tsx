import type { Metadata } from "next";
import { WorkPipelinePage } from "@/components/work-pipeline-page";

export const metadata: Metadata = { title: "Construction" };

export default function Page() {
  return <WorkPipelinePage pipeline="Construction" />;
}
