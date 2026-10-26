"use client";

import { ArrowRight, Check, Handshake, HardHat, House, Leaf, Lock, Shield } from "lucide-react";
import { RetryNextImage } from "@/components/ui/retry-image";
import { FormEvent, ReactNode } from "react";
import { ConfirmationFit, ViewportFit } from "@/components/confirmation-fit";
import { contactFields } from "@/components/ui/fields";
import type { DiscoveryState } from "@/lib/discovery";
import { DiscoveryStep } from "@/lib/discovery-draft";
import { toggleRadio } from "@/components/ui/inputs";

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
      <div className="intake intake--property">
        <ViewportFit className="intake-fit" minLayoutWidth={1440}>
          <IntakeHeader step={step} onStep={onStep} />
          {children}
        </ViewportFit>
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
      <nav className="intake-steps" aria-label="Quote progress">
        <ol>
          {quoteSteps.map((item, index) => {
            const current = item.id === step;
            const done = index < currentIndex;
            const control = (
              <>
                <span className="intake-steps__num">
                  {done ? <Check strokeWidth={2.75} aria-hidden="true" /> : item.num}
                </span>
                <span className="intake-steps__label">
                  {done ? <span className="visually-hidden">Completed: </span> : null}
                  {item.label}
                </span>
              </>
            );
            return (
              <li key={item.id} className={current ? "is-current" : done ? "is-done" : undefined}>
                {done && onStep ? (
                  <button type="button" onClick={() => onStep(item.id)}>
                    {control}
                  </button>
                ) : (
                  <span aria-current={current ? "step" : undefined}>{control}</span>
                )}
                {index < quoteSteps.length - 1 ? <i className="intake-steps__rule" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ol>
      </nav>
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
    <div className="intake-split">
      <form className="intake-pane" onSubmit={onSubmit} noValidate>
        <div className="intake-card">
          <h2>Your details</h2>
          <p className="intake-card__lead">
            Who we should contact, and the address of the property.
            <br />
            The services come next.
          </p>
          <div className="intake-fields">
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
      <section className="intake-hero">
        <div className="intake-hero__media" aria-hidden="true">
          <RetryNextImage
            src="/images/turf-landscape.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 959px) 100vw, 50vw"
            className="intake-hero__photo"
          />
          <div className="intake-hero__wash" />
        </div>
        <div className="intake-hero__copy">
          <h1>
            Let&apos;s bring your <span className="intake-hero__break">outdoor vision to life.</span>
          </h1>
          <p className="intake-hero__sub">Tell us who you are, and where the work is.</p>
          <fieldset className="intake-audiences">
            <legend className="visually-hidden">Are you a homeowner or a contractor?</legend>
            {audiences.map((audience) => {
              const selected = form.customerType === audience.value;
              const Icon = audience.icon;
              return (
                <label key={audience.value} className={selected ? "intake-audience is-selected" : "intake-audience"}>
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
                  <span className="intake-audience__icon">
                    <Icon strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="intake-audience__text">
                    <strong>{audience.title}</strong>
                    <small>{audience.detail}</small>
                  </span>
                  <span className="intake-audience__radio" aria-hidden="true">
                    <span />
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <ul className="intake-trust">
          <li>
            <Shield strokeWidth={1.75} aria-hidden="true" />
            Premium quality turf
          </li>
          <li>
            <Leaf strokeWidth={1.75} aria-hidden="true" />
            Professional installation
          </li>
          <li>
            <Handshake strokeWidth={1.75} aria-hidden="true" />
            Trusted across Southern California
          </li>
        </ul>
      </section>
    </div>
  );
}
