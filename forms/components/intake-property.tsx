"use client";

import { ArrowRight, HardHat, House, Lock } from "lucide-react";
import { RetryNextImage } from "@/components/ui/retry-image";
import { FormEvent, ReactNode } from "react";
import { ConfirmationFit } from "@/components/confirmation-fit";
import { contactFields } from "@/components/ui/fields";
import type { DiscoveryState } from "@/lib/discovery";
import { DiscoveryStep } from "@/lib/discovery-draft";
import { toggleRadio } from "@/components/ui/inputs";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";

const quoteSteps: { id: DiscoveryStep; num: string; label: string }[] = [
  { id: "property", num: "01", label: "Your details" },
  { id: "services", num: "02", label: "Services" },
  { id: "details", num: "03", label: "Questions" },
  { id: "confirmation", num: "04", label: "Confirmation" },
];

const audiences = [
  {
    value: "Homeowner" as const,
    title: "A homeowner",
    detail: "The person who lives here",
    icon: House,
  },
  {
    value: "Contractor" as const,
    title: "A contractor",
    detail: "Installing for a client",
    icon: HardHat,
  },
];

export function BrandMark() {
  return (
    <span className="brand-mark">
      <RetryNextImage
        className="brand-mark__logo"
        src="/brand/logo-mark.png"
        alt="Quality First Turf"
        width={771}
        height={605}
        priority
      />
    </span>
  );
}

export function IntakeFrame({
  step,
  onStep,
  children,
}: {
  step: DiscoveryStep;
  onStep?: (step: DiscoveryStep) => void;
  children: ReactNode;
}) {
  if (step === "confirmation") {
    return (
      <div className="intake intake--confirmation">
        <ConfirmationFit>
          <IntakeHeader step={step} onStep={onStep} />
          {children}
        </ConfirmationFit>
      </div>
    );
  }

  if (step === "property") {
    return (
      <div className="intake intake--simple">
        <IntakeHeader step={step} onStep={onStep} />
        {children}
      </div>
    );
  }

  return (
    <div className="intake">
      <IntakeHeader step={step} onStep={onStep} />
      {children}
    </div>
  );
}

function IntakeHeader({
  step,
  onStep,
}: {
  step: DiscoveryStep;
  onStep?: (step: DiscoveryStep) => void;
}) {
  const currentIndex = quoteSteps.findIndex((item) => item.id === step);

  return (
    <header className="intake-header">
      <BrandMark />
      <Stepper
        aria-label="Quote progress"
        value={currentIndex + 1}
        // Only steps already finished can be revisited; the rest follow the form.
        onValueChange={(value) => {
          const target = quoteSteps[value - 1];
          if (target && value - 1 < currentIndex && onStep) onStep(target.id);
        }}
        className="w-full md:ml-auto md:max-w-xl md:flex-1"
      >
        <StepperNav className="gap-2 md:gap-3.5">
          {quoteSteps.map((item, index) => {
            const done = index < currentIndex;
            const clickable = done && onStep !== undefined;
            return (
              <StepperItem key={item.id} step={index + 1} className="relative flex-1 items-start">
                <StepperTrigger
                  className={`m-0 flex grow flex-col items-start justify-center gap-3 border-0 bg-transparent p-0 text-inherit ${clickable ? "" : "cursor-default"}`}
                >
                  <StepperIndicator className="h-1 w-full bg-white/25 data-[state=active]:bg-white data-[state=completed]:bg-[#d7f33c]" />
                  <StepperTitle className="m-0 text-start font-[inherit] text-xs tracking-normal font-semibold md:text-sm group-data-[state=active]/step:text-white group-data-[state=completed]/step:text-white/85 group-data-[state=inactive]/step:text-white/55">
                    {done ? <span className="sr-only">Completed: </span> : null}
                    {item.label}
                  </StepperTitle>
                </StepperTrigger>
              </StepperItem>
            );
          })}
        </StepperNav>
      </Stepper>
    </header>
  );
}

export function PropertyStep({
  form,
  problems,
  pending,
  onPatch,
  onSubmit,
}: {
  form: DiscoveryState;
  problems: Record<string, string>;
  pending: boolean;
  onPatch: (partial: Partial<DiscoveryState>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fields = contactFields({ variant: "intake", form, problems, onPatch, required: true });
  return (
    <main className="simple-main">
      <form className="simple-card" onSubmit={onSubmit} noValidate>
        <div>
          <h1>Your details</h1>
          <p className="simple-card__lead">Tell us who you are, and where the work is. The services come next.</p>
        </div>
        <div className="intake-fields">
          <fieldset className="intake-group">
            <legend>I am</legend>
            <div className="simple-audiences">
              {audiences.map((audience) => {
                const selected = form.customerType === audience.value;
                const Icon = audience.icon;
                return (
                  <label
                    key={audience.value}
                    className={selected ? "simple-audience is-selected" : "simple-audience"}
                  >
                    <input
                      className="visually-hidden"
                      type="radio"
                      name="customer-type"
                      value={audience.value}
                      {...toggleRadio(
                        selected,
                        () => onPatch({ customerType: audience.value }),
                        () => onPatch({ customerType: "" }),
                      )}
                    />
                    <span className="simple-audience__icon">
                      <Icon strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="simple-audience__text">
                      <strong>{audience.title}</strong>
                      <small>{audience.detail}</small>
                    </span>
                    <span className="simple-audience__radio" aria-hidden="true">
                      <span />
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="intake-group">
            <legend>Contact</legend>
            <div className="intake-grid">
              {fields.firstName}
              {fields.lastName}
            </div>
            <div className="intake-grid">
              {fields.phone}
              {fields.email}
            </div>
          </fieldset>
          <fieldset className="intake-group">
            <legend>Property address</legend>
            <div className="intake-grid">
              {fields.street1}
              {fields.street2}
            </div>
            <div className="intake-grid intake-grid--address">
              {fields.city}
              {fields.state}
              {fields.zip}
            </div>
          </fieldset>
        </div>
        <div className="simple-card__footer">
          <button className="intake-continue" type="submit" disabled={pending}>
            {pending ? "Saving" : "Continue"}
            {pending ? null : <ArrowRight strokeWidth={2} aria-hidden="true" />}
          </button>
          <p className="intake-secure">
            <Lock strokeWidth={1.75} aria-hidden="true" />
            Your information is kept secure and used only to provide a quote.
          </p>
        </div>
      </form>
    </main>
  );
}
