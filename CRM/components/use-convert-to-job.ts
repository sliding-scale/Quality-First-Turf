"use client";

/* Jobber's Convert to Job (design 2026-11-19-jobs): one hook for the quote builder, the quote page and the request page. It runs the usual
   Closed Won move on the project, so a refusal (the quote is not signed, the deposit is not in) comes back in the backend's own words. */

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clock, failure } from "@/lib/pipeline";
import { useUI } from "./ui-provider";

/** Returns a function that converts a project to a job and opens it, or says why not. Resolves to whether it worked. */
export function useConvertToJob() {
  const convert = useMutation(api.crm.jobs.convert);
  const router = useRouter();
  const { toast } = useUI();
  return async (projectId: Id<"opportunities"> | undefined): Promise<boolean> => {
    if (!projectId) {
      toast("This quote is not linked to a request, so there is no project to make a job from.");
      return false;
    }
    try {
      await convert({ id: projectId, now: clock() });
      router.push(`/jobs/${projectId}`);
      return true;
    } catch (e) {
      toast(failure(e, "The job could not be made."));
      return false;
    }
  };
}
