import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  decimalInput,
  emailInput,
  formatPhone,
  phoneInput,
  zipInput,
  type DiscoveryState,
} from "@/lib/discovery";
import { canonicalState, US_STATES } from "@/lib/us-states";

/** The three form surfaces share one field implementation and differ only in class names. */
export type FieldVariant = "intake" | "form" | "visit";

const classes: Record<FieldVariant, { root: string; error: string }> = {
  intake: { root: "intake-field", error: "intake-field__error" },
  form: { root: "form-field", error: "field-error" },
  visit: { root: "visit-field", error: "field-error" },
};

/** "Customer said: X" under a field the salesperson changed, with an optional way back. */
export function CustomerSaid({
  value,
  text,
  actionLabel = "Revert",
  onRevert,
}: {
  value?: string;
  /** Replaces the "Customer said: …" wording, e.g. for something added or removed on site. */
  text?: string;
  actionLabel?: string;
  onRevert?: () => void;
}) {
  return (
    <p className="field-original">
      {text !== undefined ? (
        <span>{text}</span>
      ) : (
        <span>
          Customer said: <strong>{value === undefined || value === "" ? "nothing" : value}</strong>
        </span>
      )}
      {onRevert ? (
        <button type="button" onClick={onRevert}>
          {actionLabel}
        </button>
      ) : null}
    </p>
  );
}

export type TextFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  variant?: FieldVariant;
  type?: string;
  /** Small text beside the label, e.g. "Required". */
  hint?: string;
  error?: string;
  numeric?: boolean;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "numeric" | "decimal" | "text";
  maxLength?: number;
  placeholder?: string;
  className?: string;
  /** What the customer originally submitted, shown when it differs from `value`. */
  customerValue?: string;
  onRevert?: () => void;
  /** Adds up/down arrows that change the number by this amount (use with `numeric`). */
  stepper?: number;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  variant = "form",
  type = "text",
  hint,
  error,
  numeric = false,
  required = false,
  autoComplete = "off",
  inputMode,
  maxLength,
  placeholder,
  className,
  customerValue,
  onRevert,
  stepper,
}: TextFieldProps) {
  const fieldId = id ?? label.toLowerCase().replaceAll(" ", "-");
  const errorId = `${fieldId}-error`;
  const style = classes[variant];
  const email = type === "email";
  const root = [style.root, error ? "is-invalid" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={root}>
      <label htmlFor={fieldId}>
        {variant === "intake" ? <span>{label}</span> : label}
        {hint ? <span className="intake-field__hint">{hint}</span> : null}
      </label>
      {stepper !== undefined ? (
        <div className="field-stepper">
        <input
          id={fieldId}
          name={fieldId}
          type={numeric ? "text" : type}
          value={value}
          placeholder={placeholder}
          required={required}
          aria-required={required || hint === "Required" ? true : undefined}
          autoComplete={autoComplete}
          autoCapitalize={email ? "none" : "words"}
          spellCheck={email ? false : undefined}
          inputMode={numeric ? "decimal" : inputMode}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(numeric ? decimalInput(event.target.value) : event.target.value)}
        />
          <span className="field-stepper__arrows">
            <button
              type="button"
              aria-label={`Increase ${label}`}
              onClick={() => onChange(stepNumber(value, stepper, 1))}
            >
              <ChevronUp strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Decrease ${label}`}
              onClick={() => onChange(stepNumber(value, stepper, -1))}
            >
              <ChevronDown strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : (
        <input
          id={fieldId}
          name={fieldId}
          type={numeric ? "text" : type}
          value={value}
          placeholder={placeholder}
          required={required}
          aria-required={required || hint === "Required" ? true : undefined}
          autoComplete={autoComplete}
          autoCapitalize={email ? "none" : "words"}
          spellCheck={email ? false : undefined}
          inputMode={numeric ? "decimal" : inputMode}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(numeric ? decimalInput(event.target.value) : event.target.value)}
        />
      )}
      {customerValue !== undefined ? <CustomerSaid value={customerValue} onRevert={onRevert} /> : null}
      {error ? (
        <p id={errorId} className={style.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** `value` as a number moved up or down by `amount`, never below zero, without float noise. */
function stepNumber(value: string, amount: number, direction: 1 | -1): string {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const next = Math.max(0, Math.round((base + direction * amount) * 100) / 100);
  return next === 0 ? "" : String(next);
}

export function StateSelect({
  value,
  onChange,
  error,
  variant = "form",
  hint,
  autoComplete = "off",
  customerValue,
  onRevert,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  variant?: FieldVariant;
  hint?: string;
  autoComplete?: string;
  customerValue?: string;
  onRevert?: () => void;
}) {
  const style = classes[variant];
  return (
    <div className={error ? `${style.root} is-invalid` : style.root}>
      <label htmlFor="state">
        {variant === "intake" ? <span>State</span> : "State"}
        {hint ? <span className="intake-field__hint">{hint}</span> : null}
      </label>
      <select
        id="state"
        name="state"
        value={canonicalState(value)}
        autoComplete={autoComplete}
        aria-required={hint === "Required" ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "state-error" : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled hidden={value !== ""}>
          Choose a state
        </option>
        {US_STATES.map((state) => (
          <option key={state.abbr} value={state.name}>
            {state.name}
          </option>
        ))}
      </select>
      {customerValue !== undefined ? <CustomerSaid value={customerValue} onRevert={onRevert} /> : null}
      {error ? (
        <p id="state-error" className={style.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type ContactKey =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "street1"
  | "street2"
  | "city"
  | "state"
  | "zip";

/**
 * The nine contact/address inputs with their placeholders, input masks and
 * autofill hints in one place. Callers decide how to lay the pieces out.
 */
export function contactFields({
  variant,
  form,
  problems,
  onPatch,
  required = false,
  original,
}: {
  variant: FieldVariant;
  form: DiscoveryState;
  problems: Record<string, string | undefined>;
  onPatch: (partial: Partial<DiscoveryState>) => void;
  /** Show a "Required" hint and use customer autofill (the visit screen turns autofill off). */
  required?: boolean;
  /** The customer's submission; fields that differ show "Customer said" with a revert. */
  original?: DiscoveryState;
}): Record<ContactKey, ReactNode> {
  const common = (id: ContactKey) => {
    const changed = original !== undefined && id !== "state" && original[id] !== form[id];
    return {
      variant,
      id,
      error: problems[id],
      hint: required ? "Required" : undefined,
      customerValue:
        changed && original !== undefined
          ? id === "phone"
            ? formatPhone(original.phone)
            : original[id]
          : undefined,
      onRevert:
        changed && original !== undefined
          ? () => onPatch({ [id]: original[id] } as Partial<DiscoveryState>)
          : undefined,
    };
  };
  const visit = variant === "visit";
  const auto = (value: string) => (visit ? "off" : value);
  return {
    firstName: (
      <TextField {...common("firstName")} label="First name" placeholder="Jane" autoComplete={auto("given-name")} value={form.firstName} onChange={(value) => onPatch({ firstName: value })} />
    ),
    lastName: (
      <TextField {...common("lastName")} label="Last name" placeholder="Smith" autoComplete={auto("family-name")} value={form.lastName} onChange={(value) => onPatch({ lastName: value })} />
    ),
    phone: (
      <TextField {...common("phone")} label="Phone" placeholder="(555) 123-4567" type="tel" inputMode="tel" autoComplete={auto("tel")} value={formatPhone(form.phone)} onChange={(value) => onPatch({ phone: phoneInput(value) })} />
    ),
    email: (
      <TextField {...common("email")} label="Email" placeholder="name@example.com" type="email" maxLength={254} autoComplete={auto("email")} value={form.email} onChange={(value) => onPatch({ email: emailInput(value) })} />
    ),
    street1: (
      <TextField {...common("street1")} label={visit ? "Street" : "Street address"} placeholder="123 Main St" autoComplete={auto("address-line1")} value={form.street1} onChange={(value) => onPatch({ street1: value })} />
    ),
    street2: (
      <TextField {...common("street2")} hint={required ? "Optional" : undefined} label={visit ? "Street 2" : "Address line 2"} placeholder="Apt, suite or unit" autoComplete={auto("address-line2")} value={form.street2} onChange={(value) => onPatch({ street2: value })} />
    ),
    city: (
      <TextField {...common("city")} label="City" placeholder="San Diego" autoComplete={auto("address-level2")} value={form.city} onChange={(value) => onPatch({ city: value })} />
    ),
    state: (
      <StateSelect variant={variant} hint={required ? "Required" : undefined} autoComplete={auto("address-level1")} value={form.state} error={problems.state} onChange={(value) => onPatch({ state: value })} customerValue={original !== undefined && original.state !== form.state ? original.state : undefined} onRevert={original !== undefined ? () => onPatch({ state: original.state }) : undefined} />
    ),
    zip: (
      <TextField {...common("zip")} label="ZIP code" placeholder="92101" inputMode="numeric" autoComplete={auto("postal-code")} maxLength={10} value={form.zip} onChange={(value) => onPatch({ zip: zipInput(value) })} />
    ),
  };
}
