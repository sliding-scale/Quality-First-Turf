"use client";

import { ArrowRight, Check, Handshake, HardHat, House, Leaf, Lock, Shield } from "lucide-react";
import Image from "next/image";
import { FormEvent, ReactNode } from "react";
import { DiscoveryState, emailInput, phoneInput, zipInput } from "@/lib/discovery";
import { DiscoveryStep } from "@/lib/discovery-draft";
import { US_STATES, canonicalState } from "@/lib/us-states";

const quoteSteps: { id: DiscoveryStep; num: string; label: string }[] = [
  { id: "property", num: "01", label: "Property details" },
  { id: "services", num: "02", label: "Services" },
  { id: "details", num: "03", label: "Review" },
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
      <span className="brand-mark__leaf" aria-hidden="true">
        <Leaf className="brand-mark__leaf-back" strokeWidth={1.75} />
        <Leaf className="brand-mark__leaf-front" strokeWidth={1.75} />
      </span>
      <span className="brand-mark__name">Quality First Turf</span>
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
                <span className="intake-steps__label">{item.label}</span>
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
  return (
    <div className="intake-split">
      <section className="intake-hero">
        <div className="intake-hero__media" aria-hidden="true">
          <Image
            src="/images/turf-landscape.png"
            alt=""
            fill
            priority
            sizes="(max-width: 959px) 100vw, 50vw"
            className="intake-hero__photo"
          />
          <div className="intake-hero__wash" />
        </div>
        <div className="intake-hero__copy">
          <p className="intake-eyebrow">
            <span />
            Quality First Turf
          </p>
          <h1>
            Let&apos;s bring your <span className="intake-hero__break">outdoor vision to life.</span>
          </h1>
          <p className="intake-hero__sub">Tell us a little about your property to get started.</p>
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
                    checked={selected}
                    onChange={() => onPatch({ customerType: audience.value })}
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

      <form className="intake-pane" onSubmit={onSubmit} noValidate>
        <div className="intake-card">
          <h1>Property details</h1>
          <p className="intake-card__lead">
            Name, phone, and address help us understand your property.
            <br />
            The services come next.
          </p>
          <div className="intake-fields">
            <div className="intake-grid">
              <IntakeField id="firstName" label="First name" value={form.firstName} hint="Required" autoComplete="given-name" error={problems.firstName} onChange={(value) => onPatch({ firstName: value })} />
              <IntakeField id="lastName" label="Last name" value={form.lastName} hint="Required" autoComplete="family-name" error={problems.lastName} onChange={(value) => onPatch({ lastName: value })} />
            </div>
            <div className="intake-grid">
              <IntakeField id="phone" label="Phone" value={form.phone} hint="Required" autoComplete="tel" type="tel" inputMode="numeric" maxLength={10} error={problems.phone} onChange={(value) => onPatch({ phone: phoneInput(value) })} />
              <IntakeField id="email" label="Email" value={form.email} hint="Required" autoComplete="email" type="email" inputMode="email" maxLength={254} error={problems.email} onChange={(value) => onPatch({ email: emailInput(value) })} />
            </div>
            <div className="intake-grid">
              <IntakeField id="street1" label="Street address" value={form.street1} hint="Required" autoComplete="address-line1" error={problems.street1} onChange={(value) => onPatch({ street1: value })} />
              <IntakeField id="street2" label="Address line 2" value={form.street2} hint="Optional" autoComplete="address-line2" onChange={(value) => onPatch({ street2: value })} />
            </div>
            <div className="intake-grid intake-grid--address">
              <IntakeField id="city" label="City" value={form.city} hint="Required" autoComplete="address-level2" error={problems.city} onChange={(value) => onPatch({ city: value })} />
              <StateField value={form.state} error={problems.state} onChange={(value) => onPatch({ state: value })} />
              <IntakeField id="zip" label="ZIP code" value={form.zip} hint="Required" autoComplete="postal-code" inputMode="numeric" maxLength={10} error={problems.zip} onChange={(value) => onPatch({ zip: zipInput(value) })} />
            </div>
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
    </div>
  );
}

function IntakeField({
  id,
  label,
  value,
  onChange,
  type = "text",
  hint,
  error,
  autoComplete,
  inputMode,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint: string;
  error?: string;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "numeric" | "text" | "decimal";
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={error ? "intake-field is-invalid" : "intake-field"}>
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="intake-field__hint">{hint}</span>
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="intake-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StateField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const selected = canonicalState(value);
  const errorId = "state-error";
  return (
    <div className={error ? "intake-field is-invalid" : "intake-field"}>
      <label htmlFor="state">
        <span>State</span>
        <span className="intake-field__hint">Required</span>
      </label>
      <select
        id="state"
        value={selected}
        autoComplete="address-level1"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value=""> </option>
        {US_STATES.map((state) => (
          <option key={state.abbr} value={state.name}>
            {state.name}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="intake-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
