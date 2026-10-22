"use client";

import { useAction, useMutation } from "convex/react";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  addOnsFor,
  allowsMultipleInstallTypes,
  areaPreview,
  asksForArea,
  asksForNotes,
  buildDiscovery,
  contactProblems,
  DiscoveryState,
  emptyDiscovery,
  hasFollowUp,
  installTypes,
  productsFor,
  selectionKey,
  services,
  turfInstallTypes,
} from "@/lib/discovery";
import { parseWorkAreas, WorkAreaDraft, WorkAreas } from "@/components/work-areas";
import SocialCards from "@/components/ui/card-fan-carousel";
import {
  clearDiscoveryDraft,
  readDiscoveryDraft,
  writeDiscoveryDraft,
  type DiscoveryStep,
} from "@/lib/discovery-draft";

const servicePhotos: Record<string, string> = {
  Demo: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=480&q=70",
  "Artificial Grass Installation": "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=480&q=70",
  "Putting Green": "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=480&q=70",
  Underground: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=480&q=70",
  "Low Voltage Lighting": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=480&q=70",
  SOD: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=480&q=70",
  "Patio Covers": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=480&q=70",
  Concrete: "https://images.unsplash.com/photo-1590496793929-36417d3117de?auto=format&fit=crop&w=480&q=70",
  "Retaining Walls": "https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=480&q=70",
  "Planter Walls": "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=480&q=70",
  Pavers: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=480&q=70",
  "Bar & Bbq": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=480&q=70",
  "Fire Pits": "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=480&q=70",
  "Decomposite Granite": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=480&q=70",
  "Decorative Rock": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=480&q=70",
  Irrigation: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=480&q=70",
  Planting: "https://images.unsplash.com/photo-1466692476866-aef1dfb1e735?auto=format&fit=crop&w=480&q=70",
};

export function DiscoveryForm({
  visit,
}: {
  visit?: {
    projectId: Id<"projects">;
    initialState: DiscoveryState;
    visitNote: string;
    areas: WorkAreaDraft[];
  };
} = {}) {
  const createProject = useMutation(api.projects.mutations.create);
  const updateProject = useMutation(api.projects.mutations.update);
  const generateUploadUrl = useMutation(api.projects.mutations.generateUploadUrl);
  const draftVisit = useAction(api.projects.actions.draftVisit);
  const publishVisit = useAction(api.projects.actions.publishVisit);
  const [form, setForm] = useState<DiscoveryState>(visit?.initialState ?? emptyDiscovery);
  const [areas, setAreas] = useState<WorkAreaDraft[]>(visit?.areas ?? []);
  const [visitNote, setVisitNote] = useState(visit?.visitNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const focusFirstError = useRef(false);
  const [pending, setPending] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [step, setStep] = useState<DiscoveryStep>("property");
  const customer = visit === undefined;
  const [hydrated, setHydrated] = useState(!customer);

  useEffect(() => {
    if (!customer) return;
    const saved = readDiscoveryDraft();
    if (saved !== null) {
      setForm(saved.form);
      setStep(saved.step);
    }
    setHydrated(true);
  }, [customer]);

  useEffect(() => {
    if (!customer || !hydrated) return;
    if (projectId !== null) {
      clearDiscoveryDraft();
      return;
    }
    writeDiscoveryDraft({ step, form });
  }, [customer, hydrated, projectId, step, form]);

  function patch(partial: Partial<DiscoveryState>) {
    setForm((current) => ({ ...current, ...partial }));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(partial)) delete next[key];
      return next;
    });
  }

  async function addPhoto(index: number, file: File) {
    setError(null);
    try {
      const postUrl = await generateUploadUrl();
      const response = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        setError("The photo could not be uploaded.");
        return;
      }
      const body = (await response.json()) as { storageId?: Id<"_storage"> };
      if (body.storageId === undefined) {
        setError("The photo could not be uploaded.");
        return;
      }
      const storageId = body.storageId;
      const preview = URL.createObjectURL(file);
      setAreas((current) =>
        current.map((area, areaIndex) =>
          areaIndex === index
            ? {
                ...area,
                photoIds: [...area.photoIds, storageId],
                photoUrls: [...area.photoUrls, preview],
              }
            : area,
        ),
      );
    } catch {
      setError("The photo could not be uploaded.");
    }
  }

  function toggleService(service: string) {
    setForm((current) => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service],
    }));
  }

  function continueFromProperty() {
    const problems = contactProblems(form);
    const message = Object.values(problems)[0] ?? null;
    setFieldErrors(problems);
    setError(message);
    if (message === null) {
      setStep("services");
      return;
    }
    focusFirstError.current = true;
  }

  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const firstId = Object.keys(fieldErrors)[0];
    const field = firstId ? document.getElementById(firstId) : null;
    field?.focus();
    field?.scrollIntoView({ block: "center" });
  }, [fieldErrors]);

  function continueFromServices() {
    if (form.services.length === 0) {
      setError("Choose at least one service.");
      return;
    }
    setError(null);
    if (form.services.some((service) => hasFollowUp(service))) {
      setStep("details");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visit === undefined && step === "property") {
      continueFromProperty();
      return;
    }
    if (visit === undefined && step === "services") {
      if (form.services.length === 0 || form.services.some((service) => hasFollowUp(service))) {
        continueFromServices();
        return;
      }
    }
    const built = buildDiscovery(form);
    if (built.error !== null || built.payload === null) {
      setError(built.error);
      return;
    }
    const parsedAreas = visit === undefined ? null : parseWorkAreas(areas);
    if (parsedAreas?.error !== null && parsedAreas !== null) {
      setError(parsedAreas.error);
      return;
    }
    setError(null);
    setPending(true);
    try {
      if (visit !== undefined) {
        if (parsedAreas === null || parsedAreas.workAreas === null) {
          setError("The work areas could not be saved.");
          return;
        }
        const note = [built.payload.notes, visitNote.trim()].filter((line) => line !== "").join("\n");
        await updateProject({
          projectId: visit.projectId,
          ...built.payload,
          notes: note,
          status: "on-site saved",
          workAreas: parsedAreas.workAreas,
        });
        const drafted = await draftVisit({ projectId: visit.projectId });
        setDraftReady(drafted.status === "quote drafted");
        setDraftMessage(
          drafted.status === "quote drafted"
            ? "A draft quote is in Jobber for the office to review. It has not been sent."
            : drafted.missingMapping ??
                drafted.integrationError ??
                "The visit is saved. The quote needs attention.",
        );
        setProjectId(visit.projectId);
      } else {
        const id = await createProject(built.payload);
        const published = await publishVisit({ projectId: id });
        if (published.integrationError === null && published.jobberQuoteId !== null) {
          setDraftReady(true);
          setDraftMessage(
            published.missingMapping === null
              ? "A draft quote is in Jobber."
              : "A draft quote is in Jobber. Some items are not in the catalogue yet.",
          );
        } else {
          setDraftReady(false);
          setDraftMessage("Your request is saved. The quote could not be created in Jobber yet.");
        }
        setProjectId(id);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The project could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  if (customer && !hydrated) {
    return <FormShell wide>{null}</FormShell>;
  }

  if (projectId !== null) {
    return (
      <FormShell>
        <div className="form-intro">
          <h1>{visit === undefined ? "Request received" : "Visit saved"}</h1>
          <p>
            {visit === undefined
              ? "Thank you. We have what you sent and will follow up."
              : `The measurements and photos are saved on this project. Your reference is ${projectId}.`}
          </p>
          {draftMessage !== null ? (
            <p className={draftReady ? undefined : "form-alert"} role={draftReady ? undefined : "alert"}>
              {draftMessage}
            </p>
          ) : null}
        </div>
      </FormShell>
    );
  }

  if (visit === undefined) {
    const needsDetails = form.services.some((service) => hasFollowUp(service));
    return (
      <FormShell wide={step !== "details"} fit={step !== "details"}>
        <form className="form-stack" onSubmit={onSubmit} noValidate>
          {step === "property" ? (
            <ContactCard form={form} problems={fieldErrors} onPatch={patch} />
          ) : null}
          {step === "services" ? (
            <section className="fan-screen">
              <div className="fan-head">
                <h1>Which services are you considering?</h1>
                <p>Choose one or more.</p>
              </div>
              <SocialCards
                cards={services.map((service) => ({
                  imgUrl: servicePhotos[service],
                  alt: service,
                  label: service,
                  selected: form.services.includes(service),
                }))}
                onToggle={(index) => toggleService(services[index])}
              />
              <p className="fan-picked">
                {form.services.length === 0 ? "Nothing selected yet." : form.services.join(", ")}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setError(null);
                    setStep("property");
                  }}
                >
                  Back
                </button>
                <button type="submit" className="button" disabled={pending}>
                  {pending ? "Saving" : form.services.length > 0 && !needsDetails ? "Get Estimate" : "Continue"}
                </button>
              </div>
            </section>
          ) : null}
          {step === "details" ? (
            <>
              <div className="form-intro">
                <h1>A few questions</h1>
                <p>
                  {`You chose ${form.services.join(", ")}.${nothingElse(form.services)} If you do not know a measurement, you can still send this in.`}
                </p>
              </div>
              {form.services.filter((service) => hasFollowUp(service)).map((service) => (
                <section key={service} className="form-panel">
                  <h2>{service}</h2>
                  <FollowUp service={service} form={form} setForm={setForm} />
                </section>
              ))}
              <div className="button-row">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setError(null);
                    setStep("services");
                  }}
                >
                  Back
                </button>
                <button type="submit" className="button" disabled={pending}>
                  {pending ? "Saving" : "Get Estimate"}
                </button>
              </div>
            </>
          ) : null}
          {error !== null ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </FormShell>
    );
  }

  return (
    <FormShell>
      <p className="eyebrow">On site</p>
      <div className="form-intro">
        <h1>Confirm this visit</h1>
        <p>
          The customer&apos;s answers are already filled in. Confirm them, add anything missing, and record the measurements from the property.
        </p>
      </div>
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <section className="form-panel">
          <h2>Contact and property</h2>
          <ChoiceGroup
            legend="Is this for your home or for a contractor?"
            name="customer-type"
            options={["Homeowner", "Contractor"]}
            value={form.customerType}
            onChange={(value) =>
              patch({ customerType: value as DiscoveryState["customerType"] })
            }
          />
          <div className="field-grid">
            <Field label="First name" value={form.firstName} onChange={(value) => patch({ firstName: value })} />
            <Field label="Last name" value={form.lastName} onChange={(value) => patch({ lastName: value })} />
            <Field label="Phone" value={form.phone} onChange={(value) => patch({ phone: value })} />
            <Field label="Email" value={form.email} onChange={(value) => patch({ email: value })} type="email" />
            <Field label="Street 1" value={form.street1} onChange={(value) => patch({ street1: value })} />
            <Field label="Street 2" value={form.street2} onChange={(value) => patch({ street2: value })} />
            <Field label="City" value={form.city} onChange={(value) => patch({ city: value })} />
            <Field label="State" value={form.state} onChange={(value) => patch({ state: value })} />
            <Field label="ZIP code" value={form.zip} onChange={(value) => patch({ zip: value })} />
          </div>
        </section>

        <section className="form-panel">
          <h2>Services</h2>
          <div className="service-list">
            {services.map((service) => {
              const checked = form.services.includes(service);
              return (
                <div key={service} className="service-block">
                  <label className="choice-card">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(service)}
                    />
                    <span>{service}</span>
                  </label>
                  {checked && hasFollowUp(service) ? (
                    <div className="service-expand">
                      <FollowUp service={service} form={form} setForm={setForm} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {visit !== undefined ? (
          <>
            <div className="form-field">
              <label htmlFor="visit-note">Visit notes</label>
              <textarea
                id="visit-note"
                value={visitNote}
                onChange={(event) => setVisitNote(event.target.value)}
              />
            </div>
            <WorkAreas areas={areas} onChange={setAreas} onPhoto={addPhoto} />
          </>
        ) : null}

        {error !== null ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Saving" : visit === undefined ? "Get Estimate" : "Save visit"}
          </button>
        </div>
      </form>
    </FormShell>
  );
}

export function FormShell({
  children,
  wide = false,
  fit = false,
}: {
  children: ReactNode;
  wide?: boolean;
  fit?: boolean;
}) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <span className="site-logo">Quality First Turf</span>
        </div>
      </header>
      <main className={fit ? "section section--soft form-page form-page--fit" : "section section--soft form-page"}>
        <div className={wide ? "container" : "container container--narrow"}>{children}</div>
      </main>
    </>
  );
}

const audiences = [
  { value: "Homeowner", title: "A home", detail: "The person who lives here", mark: "1" },
  { value: "Contractor", title: "A contractor", detail: "Installing for a client", mark: "2" },
] as const;

function ContactCard({
  form,
  problems,
  onPatch,
}: {
  form: DiscoveryState;
  problems: Record<string, string>;
  onPatch: (partial: Partial<DiscoveryState>) => void;
}) {
  return (
    <section className="contact-card">
      <div className="contact-card__copy">
        <h1>Start with the property</h1>
        <p>Name, phone, and address open the project. The services come next.</p>
        <fieldset className="audience">
          <legend className="visually-hidden">Is this for a home or a contractor?</legend>
          {audiences.map((audience) => (
            <label
              key={audience.value}
              className={form.customerType === audience.value ? "audience-choice is-selected" : "audience-choice"}
            >
              <input
                type="radio"
                name="customer-type"
                value={audience.value}
                checked={form.customerType === audience.value}
                onChange={() => onPatch({ customerType: audience.value })}
              />
              <span>
                <strong>{audience.title}</strong>
                <small>{audience.detail}</small>
              </span>
              <span className="audience-mark">{audience.mark}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="contact-card__fields">
        <div className="field-grid">
          <Field id="firstName" label="First name" value={form.firstName} error={problems.firstName} autoComplete="given-name" required onChange={(value) => onPatch({ firstName: value })} />
          <Field id="lastName" label="Last name" value={form.lastName} error={problems.lastName} autoComplete="family-name" required onChange={(value) => onPatch({ lastName: value })} />
          <Field id="phone" label="Phone" value={form.phone} error={problems.phone} autoComplete="tel" type="tel" required onChange={(value) => onPatch({ phone: value })} />
          <Field id="email" label="Email" value={form.email} error={problems.email} autoComplete="email" type="email" required onChange={(value) => onPatch({ email: value })} />
          <Field id="street1" label="Street" value={form.street1} error={problems.street1} autoComplete="address-line1" required onChange={(value) => onPatch({ street1: value })} />
          <Field label="Street 2" value={form.street2} autoComplete="address-line2" onChange={(value) => onPatch({ street2: value })} />
        </div>
        <div className="address-row">
          <Field id="city" label="City" value={form.city} error={problems.city} autoComplete="address-level2" required onChange={(value) => onPatch({ city: value })} />
          <Field id="state" label="State" value={form.state} error={problems.state} autoComplete="address-level1" required onChange={(value) => onPatch({ state: value })} />
          <Field id="zip" label="ZIP code" value={form.zip} error={problems.zip} autoComplete="postal-code" required onChange={(value) => onPatch({ zip: value })} />
        </div>
        <button type="submit" className="button contact-card__go">
          Continue
        </button>
      </div>
    </section>
  );
}

function nothingElse(services: string[]) {
  const quiet = services.filter((service) => !hasFollowUp(service));
  if (quiet.length === 0) return "";
  if (quiet.length === 1) return ` ${quiet[0]} needs nothing else here.`;
  return ` ${quiet.join(", ")} need nothing else here.`;
}

function choiceLabel(value: string) {
  return value === "Entertaintment Putting Green" ? "Entertainment Putting Green" : value;
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  error,
  required = false,
  autoComplete,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const fieldId = id ?? label.toLowerCase().replaceAll(" ", "-");
  const errorId = `${fieldId}-error`;
  return (
    <div className={error ? "form-field is-invalid" : "form-field"}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span className="field-required"> Required</span> : null}
      </label>
      <input
        id={fieldId}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FollowUp({
  service,
  form,
  setForm,
}: {
  service: string;
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
}) {
  const selected = form.installTypes[service] ?? [];
  const installType = selected[0] ?? "";
  const products = productsFor(service, installType);
  const addOns = addOnsFor(service, installType);
  const preview = areaPreview(form.length[service] ?? "", form.width[service] ?? "");

  function toggleInstallType(value: string) {
    setForm((current) => {
      const currentTypes = current.installTypes[service] ?? [];
      const next = allowsMultipleInstallTypes(service)
        ? currentTypes.includes(value)
          ? currentTypes.filter((item) => item !== value)
          : [...currentTypes, value]
        : currentTypes.includes(value)
          ? []
          : [value];
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: next },
      };
    });
  }

  const details = (
    <>
          {products.length > 0 ? (
            <ChoiceGroup
              legend="Product"
              name={`${service}-product`}
              look="cards"
              options={products.map((product) =>
                product.mark === null ? product.name : `${product.name} (${product.mark})`,
              )}
              values={products.map((product) => product.name)}
              value={form.product[service] ?? ""}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  product: { ...current.product, [service]: value },
                }))
              }
            />
          ) : null}
          {asksForNotes(installType) ? (
            <Notes
              id={`${service}-notes`}
              value={form.notes[installType] ?? ""}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  notes: { ...current.notes, [installType]: value },
                }))
              }
            />
          ) : null}
          {asksForArea(service, installType) ? (
            <div className="stack">
              <ChoiceGroup
                legend="Do you know the approximate area?"
                name={`${service}-area-known`}
                look="segment"
                options={["Yes", "No"]}
                values={["yes", "no"]}
                value={form.areaKnown[service] ?? ""}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    areaKnown: {
                      ...current.areaKnown,
                      [service]: value as "" | "yes" | "no",
                    },
                  }))
                }
              />
              {form.areaKnown[service] === "yes" ? (
                <div className="field-grid">
                  <Field
                    label={`${service} length`}
                    value={form.length[service] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        length: { ...current.length, [service]: value },
                      }))
                    }
                    type="number"
                  />
                  <Field
                    label={`${service} width`}
                    value={form.width[service] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        width: { ...current.width, [service]: value },
                      }))
                    }
                    type="number"
                  />
                  {preview !== null ? <p className="span-2 muted">{preview}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {service === "Underground" && selected.length > 0 ? (
            <div className="stack">
              <ChoiceGroup
                legend="Do you know the length?"
                name="underground-length-known"
                look="segment"
                options={["Yes", "No"]}
                values={["yes", "no"]}
                value={form.lengthKnown}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    lengthKnown: value as "" | "yes" | "no",
                  }))
                }
              />
              {form.lengthKnown === "yes" ? (
                <Field
                  label="Linear feet"
                  value={form.linearFeet}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, linearFeet: value }))
                  }
                  type="number"
                />
              ) : null}
            </div>
          ) : null}
          {addOns.length > 0 ? (
            <AddOnList
              addOns={addOns}
              selected={form.addOns[service] ?? []}
              quantities={form.addOnQuantity}
              quantityKey={(addOn) => `${service}::${addOn}`}
              onToggle={(addOn) =>
                setForm((current) => {
                  const chosen = current.addOns[service] ?? [];
                  const next = chosen.includes(addOn)
                    ? chosen.filter((item) => item !== addOn)
                    : [...chosen, addOn];
                  return { ...current, addOns: { ...current.addOns, [service]: next } };
                })
              }
              onQuantity={(addOn, value) =>
                setForm((current) => ({
                  ...current,
                  addOnQuantity: {
                    ...current.addOnQuantity,
                    [`${service}::${addOn}`]: value,
                  },
                }))
              }
            />
          ) : null}
    </>
  );

  if (service === "Artificial Grass Installation") {
    return <GrassFollowUp form={form} setForm={setForm} />;
  }

  return (
    <div className="service-list">
      <span className="expand-label">Install type</span>
      {(installTypes[service] ?? []).map((type) => {
        const checked = selected.includes(type);
        return (
          <div key={type} className="install-block">
            <label className="choice-card">
              <input
                type={allowsMultipleInstallTypes(service) ? "checkbox" : "radio"}
                name={allowsMultipleInstallTypes(service) ? undefined : `${service}-install-type`}
                checked={checked}
                onChange={() => toggleInstallType(type)}
              />
              <span>{choiceLabel(type)}</span>
            </label>
            {checked && selected.length === 1 ? (
              <div className="service-expand">{details}</div>
            ) : null}
          </div>
        );
      })}
      {selected.length > 1 ? <div className="service-expand">{details}</div> : null}
    </div>
  );
}

function GrassFollowUp({
  form,
  setForm,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
}) {
  const service = "Artificial Grass Installation";
  const selected = form.installTypes[service] ?? [];

  function toggleInstallType(value: string) {
    setForm((current) => {
      const currentTypes = current.installTypes[service] ?? [];
      const next = currentTypes.includes(value)
        ? currentTypes.filter((item) => item !== value)
        : [...currentTypes, value];
      return { ...current, installTypes: { ...current.installTypes, [service]: next } };
    });
  }

  return (
    <div className="service-list">
      <span className="expand-label">Install type</span>
      {selected.length > 1 ? (
        <p className="muted">Name the area for each installation type, such as front yard or back yard.</p>
      ) : null}
      {(installTypes[service] ?? []).map((installType) => {
        const checked = selected.includes(installType);
        const key = selectionKey(service, installType);
        const productInstall =
          installType === "Artificial Grass Replacement"
            ? (form.replacementInstall[key] ?? "")
            : installType;
        return (
          <div key={installType} className="install-block">
            <label className="choice-card">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleInstallType(installType)}
              />
              <span>{choiceLabel(installType)}</span>
            </label>
            {checked ? (
              <div className="service-expand">
                {selected.length > 1 ? (
                  <Field
                    id={`${key}-area`}
                    label="Which area is this?"
                    value={form.areaNames[key] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        areaNames: { ...current.areaNames, [key]: value },
                      }))
                    }
                  />
                ) : null}
                {installType === "Artificial Grass Repair" ? (
                  <Notes
                    id={`${key}-notes`}
                    value={form.notes[installType] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        notes: { ...current.notes, [installType]: value },
                      }))
                    }
                  />
                ) : null}
                {installType === "Artificial Grass Replacement" ? (
                  <div className="service-list">
                    <span className="expand-label">New turf installation</span>
                    {turfInstallTypes.map((type) => (
                      <div key={type} className="install-block">
                        <label className="choice-card">
                          <input
                            type="radio"
                            name={`${key}-replacement-install`}
                            checked={productInstall === type}
                            onChange={() =>
                              setForm((current) => ({
                                ...current,
                                replacementInstall: {
                                  ...current.replacementInstall,
                                  [key]: type,
                                },
                              }))
                            }
                          />
                          <span>{choiceLabel(type)}</span>
                        </label>
                        {productInstall === type ? (
                          <div className="service-expand">
                            <GrassScope
                              form={form}
                              setForm={setForm}
                              scopeKey={key}
                              productInstall={type}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {installType !== "Artificial Grass Replacement" &&
                installType !== "Artificial Grass Repair" ? (
                  <GrassScope
                    form={form}
                    setForm={setForm}
                    scopeKey={key}
                    productInstall={installType}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GrassScope({
  form,
  setForm,
  scopeKey,
  productInstall,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  scopeKey: string;
  productInstall: string;
}) {
  const service = "Artificial Grass Installation";
  const products = productsFor(service, productInstall);
  const addOns = addOnsFor(service, productInstall);
  const preview = areaPreview(form.length[scopeKey] ?? "", form.width[scopeKey] ?? "");
  return (
    <>
      {products.length > 0 ? (
        <ChoiceGroup
          legend="Turf product"
          name={`${scopeKey}-product`}
          look="cards"
          options={products.map((product) =>
            product.mark === null ? product.name : `${product.name} (${product.mark})`,
          )}
          values={products.map((product) => product.name)}
          value={form.product[scopeKey] ?? ""}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              product: { ...current.product, [scopeKey]: value },
            }))
          }
        />
      ) : null}
      <div className="field-grid">
        <Field
          id={`${scopeKey}-length`}
          label="Length, if you know it"
          value={form.length[scopeKey] ?? ""}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              length: { ...current.length, [scopeKey]: value },
            }))
          }
          type="number"
        />
        <Field
          id={`${scopeKey}-width`}
          label="Width, if you know it"
          value={form.width[scopeKey] ?? ""}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              width: { ...current.width, [scopeKey]: value },
            }))
          }
          type="number"
        />
        {preview !== null ? <p className="span-2 muted">{preview}</p> : null}
      </div>
      {addOns.length > 0 ? (
        <AddOnList
          addOns={addOns}
          selected={form.addOns[scopeKey] ?? []}
          quantities={form.addOnQuantity}
          quantityKey={(addOn) => `${scopeKey}::${addOn}`}
          onToggle={(addOn) =>
            setForm((current) => {
              const chosen = current.addOns[scopeKey] ?? [];
              const next = chosen.includes(addOn)
                ? chosen.filter((item) => item !== addOn)
                : [...chosen, addOn];
              return { ...current, addOns: { ...current.addOns, [scopeKey]: next } };
            })
          }
          onQuantity={(addOn, value) =>
            setForm((current) => ({
              ...current,
              addOnQuantity: {
                ...current.addOnQuantity,
                [`${scopeKey}::${addOn}`]: value,
              },
            }))
          }
        />
      ) : null}
    </>
  );
}

function AddOnList({
  legend = "Add-ons",
  addOns,
  selected,
  quantities,
  quantityKey,
  onToggle,
  onQuantity,
}: {
  legend?: string;
  addOns: string[];
  selected: string[];
  quantities: Record<string, string>;
  quantityKey: (addOn: string) => string;
  onToggle: (addOn: string) => void;
  onQuantity: (addOn: string, value: string) => void;
}) {
  if (addOns.length === 0) return null;
  const edgeNames = new Set([
    "1 x 4 Bender Board",
    "2 x 4 Pressure Treated Lumber",
    "Black Aluminum Border",
  ]);
  const edges = addOns.filter((addOn) => edgeNames.has(addOn));
  const rest = addOns.filter((addOn) => !edgeNames.has(addOn));
  const groups = [
    rest.length > 0 ? { legend: edges.length > 0 ? "For the green" : legend, addOns: rest } : null,
    edges.length > 0 ? { legend: "Edges", addOns: edges } : null,
  ].filter((group): group is { legend: string; addOns: string[] } => group !== null);

  return (
    <>
      {groups.map((group) => (
        <fieldset key={group.legend} className="choice-list">
          <legend>{group.legend}</legend>
          <div className="chip-set">
            {group.addOns.map((addOn) => (
              <label key={addOn} className="chip">
                <input
                  type="checkbox"
                  checked={selected.includes(addOn)}
                  onChange={() => onToggle(addOn)}
                />
                <span>{addOn}</span>
                <span className="chip-x" aria-hidden="true">
                  ×
                </span>
              </label>
            ))}
          </div>
          {group.addOns
            .filter((addOn) => selected.includes(addOn))
            .map((addOn) => (
              <Field
                key={quantityKey(addOn)}
                id={quantityKey(addOn)}
                label={`${addOn} quantity, if you know it`}
                value={quantities[quantityKey(addOn)] ?? ""}
                onChange={(value) => onQuantity(addOn, value)}
                type="number"
              />
            ))}
        </fieldset>
      ))}
    </>
  );
}

function Notes({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>Notes</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ChoiceGroup({
  legend,
  name,
  options,
  values,
  value = "",
  valuesSelected = [],
  multiple = false,
  look = "rows",
  onChange,
}: {
  legend: string;
  name: string;
  options: string[];
  values?: string[];
  value?: string;
  valuesSelected?: string[];
  multiple?: boolean;
  look?: "rows" | "cards" | "segment";
  onChange: (value: string) => void;
}) {
  const choices = options.map((option, index) => {
    const stored = values?.[index] ?? option;
    const checked = multiple ? valuesSelected.includes(stored) : value === stored;
    const className = look === "cards" ? "choice-card" : look === "segment" ? "segment-option" : "choice-row";
    return (
      <label key={stored} className={className}>
        <input
          type={multiple ? "checkbox" : "radio"}
          name={multiple ? undefined : name}
          checked={checked}
          onChange={() => onChange(stored)}
        />
        <span>{option}</span>
      </label>
    );
  });

  return (
    <fieldset className="choice-list">
      <legend>{legend}</legend>
      {look === "segment" ? <div className="segment">{choices}</div> : choices}
    </fieldset>
  );
}
