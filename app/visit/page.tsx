import { OpenVisit } from "@/components/on-site-form";

/**
 * The staff area shows a sign-in screen until the browser has a session, so the layout cannot
 * render this page on the server. Instant-navigation validation has nothing to check here.
 */
export const instant = false;

export default function VisitIndexPage() {
  return <OpenVisit />;
}
