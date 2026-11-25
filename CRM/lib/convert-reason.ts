/* Why a quote cannot be turned into a job yet, in words for the person who clicked "Convert to Job" (client request, 2026-11-24). The button is
   always clickable; this is the pop-up it shows when the quote is not ready. null means nothing stands in the way here (the backend still checks the
   signature and the deposit). Pure rule, no React. */

export function convertBlockReason(status: string, hasProject: boolean): string | null {
  if (!hasProject) return "This quote is not linked to a project, so there is nothing to make a job from. Open it from a project, or create the project first.";
  switch (status) {
    case "Approved":
    case "Converted":
      return null;
    case "Draft":
      return "This quote is still a draft. Send it to the client first; it can become a job once they approve it with their signature.";
    case "Awaiting response":
      return "The client has not approved this quote yet. It can become a job once they approve it with their signature.";
    case "Changes requested":
      return "The client asked for changes to this quote. Update it and send it again; it can become a job once they approve it.";
    case "Rejected":
      return "The client declined this quote, so it cannot become a job.";
    case "Archived":
      return "This quote is archived. Restore it, or make a new quote, before making a job.";
    default:
      return "This quote cannot become a job yet.";
  }
}
