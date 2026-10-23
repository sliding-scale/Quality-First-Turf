import { ArrowRight } from "lucide-react";

export function ConfirmationCTA() {
  return (
    <div className="confirmation-actions">
      {/* A full page load clears the in-memory success state. A client Link would keep it. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="confirmation-cta" href="/">
        Back to Homepage
        <ArrowRight strokeWidth={2} aria-hidden="true" />
      </a>
    </div>
  );
}
