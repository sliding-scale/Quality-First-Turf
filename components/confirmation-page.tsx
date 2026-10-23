import { ConfirmationCTA } from "@/components/confirmation-cta";
import { ConfirmationHero } from "@/components/confirmation-hero";
import { ConfirmationStatusCard } from "@/components/confirmation-status-card";
import { NextStepsTimeline } from "@/components/next-steps-timeline";

export function ConfirmationPage() {
  return (
    <main className="confirmation">
      <ConfirmationHero />
      <ConfirmationStatusCard />
      <NextStepsTimeline />
      <ConfirmationCTA />
    </main>
  );
}
