import type { Metadata } from "next";
import { PipelineEditPage } from "@/components/pipeline-edit-page";

export const metadata: Metadata = { title: "Edit stages" };

export default function Page() {
  return <PipelineEditPage />;
}
