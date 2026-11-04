import { Check } from "lucide-react";

export function ConfirmationHero() {
  return (
    <header className="confirmation-hero">
      <span className="confirmation-hero__mark" aria-hidden="true">
        <Check strokeWidth={2.4} />
      </span>
      <h1>Request received!</h1>
      <p>
        Thank you for choosing Quality First Turf. We&apos;ve received your information and will be in
        touch soon to discuss the next steps.
      </p>
    </header>
  );
}
