"use client";

import { useAction, useMutation } from "convex/react";
import {
  Camera,
  Check,
  ChevronDown,
  Flag,
  Home,
  Lightbulb,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Shovel,
  Sprout,
  Trash2,
  UserRound,
  Waves,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  addOnsForSelected,
  allowsMultipleInstallTypes,
  asksForNotes,
  buildDiscovery,
  contactProblems,
  decimalInput,
  emailInput,
  fieldIdFor,
  grassService,
  grassWorks,
  grassUsesLinearFeet,
  hasFollowUp,
  installTypeDetail,
  installTypes,
  orderServices,
  phoneInput,
  productsFor,
  projectToForm,
  selectionKey,
  serviceLabel,
  services,
  soilConditions,
  turfInstallTypes,
  withAddOn,
  zipInput,
  type DiscoveryState,
} from "@/lib/discovery";
import { canonicalState, US_STATES } from "@/lib/us-states";
import { parseWorkAreas } from "@/components/work-areas";
import {
  areasForService,
  asWorkAreaDrafts,
  emptyServiceArea,
  estimateFor,
  formatEstimate,
  labelsForService,
  measuredSquareFeet,
  seedVisitAreas,
  serviceNeedsAreas,
  serviceStatus,
  SITE_PHOTOS_LABEL,
  sitePhotosArea,
  type CustomerMeasurement,
  type ServiceStatus,
  type VisitArea,
  type VisitWorkArea,
} from "@/lib/visit-areas";

const serviceIcons: Record<string, LucideIcon> = {
  Demo: Shovel,
  [grassService]: Sprout,
  "Putting Green": Flag,
  Underground: Waves,
  "Low Voltage Lighting": Lightbulb,
};

const steps = [
  { id: "property", title: "Property overview", detail: "Customer information" },
  { id: "services", title: "Services & areas", detail: "Verify and update" },
  { id: "photos", title: "Photos & notes", detail: "Document the site" },
  { id: "review", title: "Review & submit", detail: "Finalize and save" },
] as const;

type VisitStep = (typeof steps)[number]["id"];

function choiceLabel(value: string) {
  return value === "Entertaintment Putting Green" ? "Entertainment Putting Green" : value;
}

export function OnSiteVisit({
  projectId,
  sessionToken,
  project,
  workAreas,
}: {
  projectId: Id<"projects">;
  sessionToken: string;
  project: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    services: string[];
    products: string[];
    answers: { question: string; value: string }[];
    notes: string;
    measurements: CustomerMeasurement[];
  };
  workAreas: VisitWorkArea[];
}) {
  const updateProject = useMutation(api.projects.mutations.update);
  const generateUploadUrl = useMutation(api.projects.mutations.generateUploadUrl);
  const draftVisit = useAction(api.projects.actions.draftVisit);
  const loaded = useMemo(() => projectToForm(project), [project]);
  const [form, setForm] = useState<DiscoveryState>(loaded.form);
  const [areas, setAreas] = useState<VisitArea[]>(() =>
    seedVisitAreas(workAreas, project.measurements, loaded.form),
  );
  const [visitNote, setVisitNote] = useState(loaded.visitNote);
  const [editingProperty, setEditingProperty] = useState(false);
  const [openServices, setOpenServices] = useState<string[]>(() => [...loaded.form.services]);
  const [addingService, setAddingService] = useState(false);
  const [section, setSection] = useState<VisitStep>("property");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; ready: boolean } | null>(null);
  const focusFirstError = useRef(false);
  const estimates = project.measurements;

  function patch(partial: Partial<DiscoveryState>) {
    setForm((current) => ({ ...current, ...partial }));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(partial)) delete next[key];
      return next;
    });
  }

  function clearProblem(id: string) {
    setFieldErrors((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function showProblems(problems: Record<string, string>, message: string | null) {
    setFieldErrors(problems);
    setError(message);
    if (message !== null) focusFirstError.current = true;
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target.id) setSection(visible.target.id as VisitStep);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4] },
    );
    for (const item of steps) {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const firstId = Object.keys(fieldErrors)[0];
    const field = firstId ? document.getElementById(firstId) : null;
    if (field) {
      const focusable =
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement;
      field.scrollIntoView({ block: "center" });
      if (focusable) field.focus({ preventScroll: true });
      return;
    }
    document.querySelector(".visit-alert")?.scrollIntoView({ block: "center" });
  }, [error, fieldErrors]);

  function goTo(next: VisitStep) {
    setSection(next);
    document.getElementById(next)?.scrollIntoView({ block: "start" });
  }

  function updateArea(index: number, partial: Partial<VisitArea>) {
    setAreas((current) =>
      current.map((area, areaIndex) => (areaIndex === index ? { ...area, ...partial } : area)),
    );
    if (partial.label !== undefined) clearProblem(`area-${index}-label`);
    if (partial.quantity !== undefined) clearProblem(`area-${index}-quantity`);
  }

  function setAreaInstall(index: number, service: string, installType: string) {
    setAreas((current) => {
      const next = current.map((area, areaIndex) =>
        areaIndex === index
          ? {
              ...area,
              installType,
              label:
                area.label === area.installType || area.label.trim() === ""
                  ? installType
                  : area.label,
            }
          : area,
      );
      setForm((formState) => syncServiceFromAreas(formState, service, next));
      return next;
    });
    clearProblem(fieldIdFor("install", service));
  }

  function setAreaProduct(index: number, service: string, product: string) {
    const area = areas[index];
    if (area === undefined) return;
    const key =
      service === grassService
        ? selectionKey(service, area.installType)
        : service;
    setForm((current) => ({
      ...current,
      product: { ...current.product, [key]: product },
    }));
    clearProblem(fieldIdFor("product", service === "Putting Green" ? service : key));
  }

  function addArea(service: string) {
    setAreas((current) => [...current, emptyServiceArea(service, form)]);
    setOpenServices((current) => (current.includes(service) ? current : [...current, service]));
  }

  function removeArea(index: number) {
    const removed = areas[index];
    setAreas((current) => {
      const next = current.filter((_, areaIndex) => areaIndex !== index);
      if (removed !== undefined && serviceNeedsAreas(removed.service)) {
        setForm((formState) => syncServiceFromAreas(formState, removed.service, next));
      }
      return next;
    });
  }

  function toggleService(service: string) {
    setForm((current) => {
      const selected = current.services.includes(service);
      const servicesList = orderServices(
        selected
          ? current.services.filter((item) => item !== service)
          : [...current.services, service],
      );
      return { ...current, services: servicesList };
    });
    setAreas((current) => {
      if (form.services.includes(service)) {
        return current.filter((area) => area.service !== service);
      }
      if (!serviceNeedsAreas(service)) return current;
      if (current.some((area) => area.service === service)) return current;
      return [...current, emptyServiceArea(service, form)];
    });
    setOpenServices((current) =>
      current.includes(service) ? current.filter((item) => item !== service) : [...current, service],
    );
    setAddingService(false);
    clearProblem("services");
  }

  function chooseGrassWork(nextWork: DiscoveryState["grassWork"]) {
    clearProblem(fieldIdFor("grass-work", grassService));
    setForm((current) => {
      const packages = (current.installTypes[grassService] ?? []).filter((type) =>
        turfInstallTypes.includes(type),
      );
      const next =
        nextWork === "Replacement"
          ? ["Artificial Grass Replacement"]
          : nextWork === "Repair"
            ? ["Artificial Grass Repair"]
            : packages;
      return {
        ...current,
        grassWork: nextWork,
        installTypes: { ...current.installTypes, [grassService]: next },
      };
    });
    setAreas((current) =>
      current.map((area) => {
        if (area.service !== grassService) return area;
        if (nextWork === "Replacement") return { ...area, installType: "Artificial Grass Replacement" };
        if (nextWork === "Repair") return { ...area, installType: "Artificial Grass Repair" };
        return turfInstallTypes.includes(area.installType) ? area : { ...area, installType: "" };
      }),
    );
  }

  function toggleInstall(service: string, value: string) {
    clearProblem(fieldIdFor("install", service));
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

  async function addPhoto(index: number, file: File) {
    setError(null);
    try {
      const postUrl = await generateUploadUrl({ sessionToken });
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
      const preview = URL.createObjectURL(file);
      setAreas((current) =>
        current.map((area, areaIndex) =>
          areaIndex === index
            ? {
                ...area,
                photoIds: [...area.photoIds, body.storageId as Id<"_storage">],
                photoUrls: [...area.photoUrls, preview],
              }
            : area,
        ),
      );
    } catch {
      setError("The photo could not be uploaded.");
    }
  }

  async function persist(mode: "draft" | "quote") {
    const problems = contactProblems(form);
    const contactMessage = Object.values(problems)[0] ?? null;
    if (contactMessage !== null) {
      setEditingProperty(true);
      goTo("property");
      showProblems(problems, contactMessage);
      return false;
    }
    const built = buildDiscovery(form);
    if (built.error !== null || built.payload === null) {
      goTo("services");
      showProblems(
        built.fieldId !== null && built.error !== null ? { [built.fieldId]: built.error } : {},
        built.error,
      );
      return false;
    }
    const parsedAreas = parseWorkAreas(asWorkAreaDrafts(areas));
    if (parsedAreas.error !== null || parsedAreas.workAreas === null) {
      goTo("services");
      showProblems(
        parsedAreas.fieldId !== null && parsedAreas.error !== null
          ? { [parsedAreas.fieldId]: parsedAreas.error }
          : {},
        parsedAreas.error,
      );
      return false;
    }
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      const { measurements: _customerArea, ...scope } = built.payload;
      const note = [scope.notes, visitNote.trim()].filter((line) => line !== "").join("\n");
      await updateProject({
        sessionToken,
        projectId,
        ...scope,
        notes: note,
        status: "on-site saved",
        workAreas: parsedAreas.workAreas,
      });
      if (mode === "quote") {
        const drafted = await draftVisit({ sessionToken, projectId });
        setDone({
          ready: drafted.status === "quote drafted",
          message:
            drafted.status === "quote drafted"
              ? "A draft quote is in Jobber for the office to review. It has not been sent."
              : drafted.missingMapping ??
                drafted.integrationError ??
                "The visit is saved. The quote needs attention.",
        });
      } else {
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      }
      return true;
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "The visit could not be saved.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = steps.map((item) => item.id);
    if (section === "property") {
      const problems = contactProblems(form);
      const contactMessage = Object.values(problems)[0] ?? null;
      if (contactMessage !== null) {
        setEditingProperty(true);
        showProblems(problems, contactMessage);
        return;
      }
      setPending(true);
      try {
        await updateProject({
          sessionToken,
          projectId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone,
          email: form.email.trim(),
          street1: form.street1.trim(),
          street2: form.street2.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip,
        });
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        goTo("services");
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "The visit could not be saved.");
      } finally {
        setPending(false);
      }
      return;
    }
    if (section !== "review") {
      const saved = await persist("draft");
      if (saved) goTo(order[order.indexOf(section) + 1] ?? "review");
      return;
    }
    await persist("quote");
  }

  if (done !== null) {
    return (
      <VisitFrame>
        <div className="visit-done">
          <h1>Visit saved</h1>
          <p>The measured areas and photos are on this project. The customer&apos;s original sizes are still there for the office to see.</p>
          <p className={done.ready ? "visit-done__ok" : "visit-alert"} role={done.ready ? undefined : "alert"}>
            {done.message}
          </p>
        </div>
      </VisitFrame>
    );
  }

  const unusedServices = services.filter((service) => !form.services.includes(service));
  const address = [form.street1, form.street2, form.city, form.state, form.zip]
    .filter((part) => part.trim() !== "")
    .join(", ");
  const site = sitePhotosArea(areas);
  const siteIndex = site === undefined ? -1 : areas.indexOf(site);
  const allOpen = form.services.every((service) => openServices.includes(service));

  return (
    <VisitFrame>
      <aside className="visit-nav" aria-label="Visit steps">
        <a className="visit-brand" href="/visit">
          <Image src="/brand/logo-mark.png" alt="Quality First Turf" width={44} height={44} />
          <span>Quality First Turf</span>
        </a>
        <ol className="visit-steps">
          {steps.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={section === item.id ? "is-current" : undefined}
                onClick={() => goTo(item.id)}
              >
                <span className="visit-steps__num">{index + 1}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="visit-main">
        <header className="visit-hero">
          <Image
            src="/images/turf-landscape.png"
            alt=""
            fill
            priority
            sizes="(max-width: 960px) 100vw, 80vw"
          />
          <div className="visit-hero__copy">
            <h1>Verify & confirm details</h1>
            <p>
              Review the customer&apos;s request and confirm each area, measurement, and option on
              site. Measured sizes stay separate from the original estimate.
            </p>
          </div>
        </header>

        <form className="visit-body" onSubmit={onSubmit} noValidate>
          <div className="visit-column">
            <section id="property" className="visit-card">
              <div className="visit-card__head">
                <div>
                  <h2>
                    <UserRound size={18} aria-hidden="true" />
                    Property information
                  </h2>
                  <p>From the customer form</p>
                </div>
                <button
                  type="button"
                  className="visit-icon-btn"
                  onClick={() => setEditingProperty((current) => !current)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  {editingProperty ? "Done" : "Edit"}
                </button>
              </div>
              {editingProperty ? (
                <div className="visit-grid">
                  <VisitField
                    id="firstName"
                    label="First name"
                    value={form.firstName}
                    error={fieldErrors.firstName}
                    onChange={(value) => patch({ firstName: value })}
                  />
                  <VisitField
                    id="lastName"
                    label="Last name"
                    value={form.lastName}
                    error={fieldErrors.lastName}
                    onChange={(value) => patch({ lastName: value })}
                  />
                  <VisitField
                    id="phone"
                    label="Phone"
                    value={form.phone}
                    error={fieldErrors.phone}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(value) => patch({ phone: phoneInput(value) })}
                  />
                  <VisitField
                    id="email"
                    label="Email"
                    value={form.email}
                    error={fieldErrors.email}
                    type="email"
                    onChange={(value) => patch({ email: emailInput(value) })}
                  />
                  <VisitField
                    id="street1"
                    label="Street"
                    value={form.street1}
                    error={fieldErrors.street1}
                    onChange={(value) => patch({ street1: value })}
                  />
                  <VisitField
                    id="street2"
                    label="Street 2"
                    value={form.street2}
                    onChange={(value) => patch({ street2: value })}
                  />
                  <VisitField
                    id="city"
                    label="City"
                    value={form.city}
                    error={fieldErrors.city}
                    onChange={(value) => patch({ city: value })}
                  />
                  <div className={fieldErrors.state ? "visit-field is-invalid" : "visit-field"}>
                    <label htmlFor="state">State</label>
                    <select
                      id="state"
                      value={canonicalState(form.state)}
                      aria-invalid={fieldErrors.state ? true : undefined}
                      onChange={(event) => patch({ state: event.target.value })}
                    >
                      <option value="">Select</option>
                      {US_STATES.map((state) => (
                        <option key={state.abbr} value={state.name}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.state ? <p className="field-error">{fieldErrors.state}</p> : null}
                  </div>
                  <VisitField
                    id="zip"
                    label="ZIP code"
                    value={form.zip}
                    error={fieldErrors.zip}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(value) => patch({ zip: zipInput(value) })}
                  />
                  <fieldset className="visit-choice">
                    <legend>Customer type</legend>
                    {(["Homeowner", "Contractor"] as const).map((type) => (
                      <label key={type}>
                        <input
                          type="radio"
                          name="customer-type"
                          checked={form.customerType === type}
                          onChange={() => patch({ customerType: type })}
                        />
                        {type}
                      </label>
                    ))}
                  </fieldset>
                </div>
              ) : (
                <dl className="visit-facts">
                  <div>
                    <dt>Name</dt>
                    <dd>{`${form.firstName} ${form.lastName}`.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{form.email || "—"}</dd>
                  </div>
                  <div>
                    <dt>City</dt>
                    <dd>{form.city || "—"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{form.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{form.street1 || "—"}</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>{form.state || "—"}</dd>
                  </div>
                  <div>
                    <dt>ZIP code</dt>
                    <dd>{form.zip || "—"}</dd>
                  </div>
                  <div>
                    <dt>Customer</dt>
                    <dd>{form.customerType}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section id="services" className="visit-stack">
              <div className="visit-section-head">
                <div>
                  <h2>Services to verify</h2>
                  <p>Confirm each selected service, area, and measurement.</p>
                </div>
                <div className="visit-section-head__actions">
                  <button
                    type="button"
                    className="visit-text-btn"
                    onClick={() => setOpenServices(allOpen ? [] : [...form.services])}
                  >
                    {allOpen ? "Collapse all" : "Expand all"}
                  </button>
                </div>
              </div>

              {form.services.length === 0 ? (
                <p className="visit-empty">No services yet. Add the work you found on site.</p>
              ) : null}

              {orderServices(form.services).map((service) => {
                const Icon = serviceIcons[service] ?? Home;
                const status = serviceStatus(service, form, areas);
                const open = openServices.includes(service);
                const estimate = estimateFor(estimates, labelsForService(service, form));
                return (
                  <article key={service} className="visit-card visit-service">
                    <button
                      type="button"
                      className="visit-service__toggle"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenServices((current) =>
                          current.includes(service)
                            ? current.filter((item) => item !== service)
                            : [...current, service],
                        )
                      }
                    >
                      <span className="visit-service__icon">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="visit-service__title">
                        <strong>{serviceLabel(service)}</strong>
                        <small>{statusCopy(service, form, areas)}</small>
                      </span>
                      <StatusPill status={status} />
                      <ChevronDown size={18} aria-hidden="true" />
                    </button>

                    {open ? (
                      <div className="visit-service__body">
                        {estimate !== undefined || serviceNeedsAreas(service) ? (
                          <p className="visit-estimate">{formatEstimate(estimate)}</p>
                        ) : null}

                        {service === "Low Voltage Lighting" ||
                        (hasFollowUp(service) && !serviceNeedsAreas(service)) ? (
                          <InstallGrid
                            service={service}
                            selected={form.installTypes[service] ?? []}
                            error={fieldErrors[fieldIdFor("install", service)]}
                            form={form}
                            problems={fieldErrors}
                            onToggle={(value) => toggleInstall(service, value)}
                            onAreaName={(type, value) => {
                              const key = selectionKey(service, type);
                              clearProblem(fieldIdFor("area", key));
                              setForm((current) => ({
                                ...current,
                                areaNames: { ...current.areaNames, [key]: value },
                              }));
                            }}
                          />
                        ) : null}

                        {service === "Underground" ? (
                          <>
                            <AreaNames
                              service={service}
                              form={form}
                              problems={fieldErrors}
                              onChange={(type, value) => {
                                const key = selectionKey(service, type);
                                clearProblem(fieldIdFor("area", key));
                                setForm((current) => ({
                                  ...current,
                                  areaNames: { ...current.areaNames, [key]: value },
                                }));
                              }}
                            />
                            <fieldset className="visit-soil">
                              <legend>Soil</legend>
                              {soilConditions.map((soil) => (
                                <label key={soil} className="choice-card">
                                  <input
                                    type="radio"
                                    name="visit-underground-soil"
                                    checked={form.soil === soil}
                                    onChange={() =>
                                      setForm((current) => ({ ...current, soil }))
                                    }
                                  />
                                  <span>{soil}</span>
                                </label>
                              ))}
                            </fieldset>
                            <UndergroundMeasure
                              areas={areas}
                              error={fieldErrors["area-underground-quantity"] ?? fieldErrors["underground-feet"]}
                              onChange={(index, value) => updateArea(index, { quantity: value })}
                            />
                          </>
                        ) : null}

                        {service === grassService ? (
                          <fieldset className="visit-installs" id={fieldIdFor("grass-work", service)}>
                            <legend>What do you need?</legend>
                            {fieldErrors[fieldIdFor("grass-work", service)] ? (
                              <p className="field-error" role="alert">
                                {fieldErrors[fieldIdFor("grass-work", service)]}
                              </p>
                            ) : null}
                            <div className="visit-installs__grid">
                              {grassWorks.map((option) => (
                                <label key={option}>
                                  <input
                                    type="radio"
                                    name="visit-grass-work"
                                    checked={form.grassWork === option}
                                    onChange={() => chooseGrassWork(option)}
                                  />
                                  <span>{option}</span>
                                  {form.grassWork === option ? <Check size={14} aria-hidden="true" /> : null}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ) : null}

                        {serviceNeedsAreas(service) && service !== "Underground" ? (
                          <AreaList
                            service={service}
                            form={form}
                            areas={areas}
                            problems={fieldErrors}
                            onArea={updateArea}
                            onInstall={setAreaInstall}
                            onProduct={setAreaProduct}
                            onName={(index, value) => {
                              updateArea(index, { label: value });
                              const area = areas[index];
                              if (area?.installType) {
                                const key = selectionKey(service, area.installType);
                                setForm((current) => ({
                                  ...current,
                                  areaNames: { ...current.areaNames, [key]: value },
                                }));
                              }
                            }}
                            onRemove={removeArea}
                            onAdd={() => addArea(service)}
                            onReplace={(key, value) =>
                              setForm((current) => ({
                                ...current,
                                replacementInstall: { ...current.replacementInstall, [key]: value },
                              }))
                            }
                          />
                        ) : null}

                        {service === grassService ||
                        service === "Putting Green" ||
                        service === "Demo" ? (
                          <AddOnBlock
                            service={service}
                            form={form}
                            problems={fieldErrors}
                            onToggle={(key, addOn) =>
                              setForm((current) =>
                                withAddOn(current, key, addOn, !(current.addOns[key] ?? []).includes(addOn)),
                              )
                            }
                            onQuantity={(quantityKey, value) => {
                              clearProblem(fieldIdFor("qty", quantityKey));
                              const split = quantityKey.indexOf("::");
                              const owner = split > 0 ? quantityKey.slice(0, split) : "";
                              const addOn = split > 0 ? quantityKey.slice(split + 2) : "";
                              if (value.trim() !== "" && Number(value) === 0 && owner !== "" && addOn !== "") {
                                setForm((current) => withAddOn(current, owner, addOn, false));
                                return;
                              }
                              setForm((current) => ({
                                ...current,
                                addOnQuantity: { ...current.addOnQuantity, [quantityKey]: value },
                              }));
                            }}
                          />
                        ) : null}

                        {asksForNotes((form.installTypes[service] ?? [])[0] ?? "") ? (
                          <VisitNoteField
                            id={`${service}-notes`}
                            label="Repair or replacement notes"
                            value={form.notes[(form.installTypes[service] ?? [])[0] ?? ""] ?? ""}
                            onChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                notes: {
                                  ...current.notes,
                                  [(current.installTypes[service] ?? [])[0] ?? ""]: value,
                                },
                              }))
                            }
                          />
                        ) : null}

                        {!hasFollowUp(service) ? (
                          <p className="visit-quiet">Selected by the customer. Nothing else to confirm here.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {unusedServices.length > 0 ? (
                <div className="visit-add">
                  {addingService ? (
                    <div className="visit-add__list">
                      {unusedServices.map((service) => (
                        <button key={service} type="button" onClick={() => toggleService(service)}>
                          {serviceLabel(service)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="button" className="visit-text-btn" onClick={() => setAddingService(true)}>
                      <Plus size={16} aria-hidden="true" />
                      Add a service the customer skipped
                    </button>
                  )}
                </div>
              ) : null}
            </section>

            <section id="photos" className="visit-card visit-card--mobile">
              <PhotosPanel
                areas={areas}
                siteIndex={siteIndex}
                onPhoto={addPhoto}
              />
            </section>

            <section id="review" className="visit-card">
              <div className="visit-card__head">
                <div>
                  <h2>Review & submit</h2>
                  <p>Save the visit, then send a draft quote to Jobber when the measurements are ready.</p>
                </div>
              </div>
              <ul className="visit-review">
                <li>
                  <strong>Property</strong>
                  <span>{address || "Address missing"}</span>
                </li>
                {orderServices(form.services).map((service) => (
                  <li key={service}>
                    <strong>{serviceLabel(service)}</strong>
                    <span>{reviewLine(service, form, areas)}</span>
                  </li>
                ))}
                <li>
                  <strong>Photos</strong>
                  <span>{areas.reduce((sum, area) => sum + area.photoIds.length, 0)} uploaded</span>
                </li>
              </ul>
            </section>
          </div>

          <aside className="visit-rail">
            <section className="visit-card">
              <div className="visit-card__head">
                <div>
                  <h2>
                    <Camera size={18} aria-hidden="true" />
                    Site photos
                  </h2>
                </div>
                {siteIndex >= 0 ? (
                  <label className="visit-icon-btn">
                    <Plus size={16} aria-hidden="true" />
                    Add photos
                    <input
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file !== undefined) void addPhoto(siteIndex, file);
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div className="visit-photos">
                {(site?.photoUrls ?? []).map((url, photoIndex) =>
                  url === null ? (
                    <span key={site?.photoIds[photoIndex]} className="visit-photo-fallback">
                      Photo saved
                    </span>
                  ) : (
                    <img key={site?.photoIds[photoIndex]} src={url} alt="" />
                  ),
                )}
                {siteIndex >= 0 ? (
                  <label className="visit-photo-add">
                    <Plus size={20} aria-hidden="true" />
                    <span>Add photo</span>
                    <input
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file !== undefined) void addPhoto(siteIndex, file);
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </section>

            <section className="visit-card">
              <h2>
                <NotebookPen size={18} aria-hidden="true" />
                Quick notes
              </h2>
              <textarea
                id="visit-note"
                value={visitNote}
                placeholder="Add notes about the property, access, layout, or special considerations."
                onChange={(event) => setVisitNote(event.target.value)}
              />
            </section>

            <section className="visit-card">
              <div className="visit-card__head">
                <div>
                  <h2>
                    <MapPin size={18} aria-hidden="true" />
                    Property details
                  </h2>
                </div>
              </div>
              <p className="visit-address">{address || "Address will appear here."}</p>
              {address !== "" ? (
                <>
                  <p className="visit-map-links">
                    <span>Open in Maps</span>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google
                    </a>
                    <a
                      href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Apple
                    </a>
                  </p>
                  <iframe
                    className="visit-map"
                    title="Property map"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`}
                    loading="lazy"
                  />
                </>
              ) : null}
            </section>

            {error !== null ? (
              <p className="visit-alert" role="alert">
                {error}
              </p>
            ) : null}

            <div className="visit-actions">
              <button type="submit" className="visit-primary" disabled={pending}>
                {pending ? "Saving" : "Save & continue"}
              </button>
              <button
                type="button"
                className="visit-secondary"
                disabled={pending}
                onClick={() => void persist("draft")}
              >
                Save draft
              </button>
              <p className="visit-save-hint">
                {savedAt !== null ? `Draft saved at ${savedAt}.` : "Customer estimates stay on the project."}
              </p>
            </div>
          </aside>
        </form>
      </div>
    </VisitFrame>
  );
}

export function VisitFrame({ children }: { children: ReactNode }) {
  return <div className="visit-app">{children}</div>;
}

export function VisitPlain({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="visit-app visit-app--plain">
      <header className="visit-plain-bar">
        <Image src="/brand/logo.jpeg" alt="Quality First Turf" width={1599} height={458} priority />
      </header>
      <main className={wide ? "visit-plain-main visit-plain-main--list" : "visit-plain-main"}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

function syncServiceFromAreas(
  form: DiscoveryState,
  service: string,
  areas: VisitArea[],
): DiscoveryState {
  const types = [
    ...new Set(
      areas
        .filter((area) => area.service === service && area.installType !== "")
        .map((area) => area.installType),
    ),
  ];
  const areaNames = { ...form.areaNames };
  for (const area of areas) {
    if (area.service !== service || area.installType === "") continue;
    areaNames[selectionKey(service, area.installType)] = area.label;
  }
  return {
    ...form,
    installTypes: { ...form.installTypes, [service]: types },
    areaNames,
  };
}

function statusCopy(service: string, form: DiscoveryState, areas: VisitArea[]): string {
  const status = serviceStatus(service, form, areas);
  if (service === "Low Voltage Lighting") {
    const count = (form.installTypes[service] ?? []).length;
    return `${count} item${count === 1 ? "" : "s"} selected`;
  }
  const owned = areasForService(areas, service);
  if (serviceNeedsAreas(service) && service !== "Underground") {
    return `${owned.length} area${owned.length === 1 ? "" : "s"} on this visit`;
  }
  if (status === "verified") return "Ready for the quote";
  if (status === "partial") return "Partially verified";
  return "Needs verification";
}

function reviewLine(service: string, form: DiscoveryState, areas: VisitArea[]): string {
  const types = form.installTypes[service] ?? [];
  const owned = areasForService(areas, service);
  if (owned.length > 0) {
    const measured = owned
      .map((area) => {
        const feet = measuredSquareFeet(area);
        return feet === "" ? area.label : `${area.label}: ${feet}`;
      })
      .join(" · ");
    return measured;
  }
  if (types.length > 0) return types.map(choiceLabel).join(", ");
  return "Selected";
}

function StatusPill({ status }: { status: ServiceStatus }) {
  const label =
    status === "verified" ? "Verified" : status === "partial" ? "Partially verified" : "Needs verification";
  return <span className={`visit-pill visit-pill--${status}`}>{label}</span>;
}

function VisitField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  inputMode?: "numeric" | "email" | "decimal";
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={error ? "visit-field is-invalid" : "visit-field"}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
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

function VisitNoteField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="visit-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function InstallGrid({
  service,
  selected,
  error,
  form,
  problems,
  onToggle,
  onAreaName,
}: {
  service: string;
  selected: string[];
  error?: string;
  form: DiscoveryState;
  problems: Record<string, string>;
  onToggle: (value: string) => void;
  onAreaName: (type: string, value: string) => void;
}) {
  const id = fieldIdFor("install", service);
  return (
    <fieldset className="visit-installs" id={id}>
      <legend>Installation items</legend>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="visit-installs__grid">
        {(installTypes[service] ?? []).map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={selected.includes(type)}
              onChange={() => onToggle(type)}
            />
            <span className="visit-installs__copy">
              <span>{choiceLabel(type)}</span>
              {installTypeDetail[type] ? (
                <span className="visit-installs__detail">{installTypeDetail[type]}</span>
              ) : null}
            </span>
            {selected.includes(type) ? <Check size={14} aria-hidden="true" /> : null}
          </label>
        ))}
      </div>
      <AreaNames service={service} form={form} problems={problems} onChange={onAreaName} />
    </fieldset>
  );
}

function AreaNames({
  service,
  form,
  problems,
  onChange,
}: {
  service: string;
  form: DiscoveryState;
  problems: Record<string, string>;
  onChange: (type: string, value: string) => void;
}) {
  const selected = form.installTypes[service] ?? [];
  if (selected.length < 2) return null;
  return (
    <div className="visit-area-names">
      <p className="visit-quiet">Name the area for each installation type if you know it, such as front yard or back yard.</p>
      {selected.map((type) => {
        const key = selectionKey(service, type);
        const id = fieldIdFor("area", key);
        return (
          <VisitField
            key={type}
            id={id}
            label={`${choiceLabel(type)} area, if you know it`}
            value={form.areaNames[key] ?? ""}
            error={problems[id]}
            onChange={(value) => onChange(type, value)}
          />
        );
      })}
    </div>
  );
}

function UndergroundMeasure({
  areas,
  error,
  onChange,
}: {
  areas: VisitArea[];
  error?: string;
  onChange: (index: number, value: string) => void;
}) {
  const index = areas.findIndex((area) => area.service === "Underground");
  const area = index >= 0 ? areas[index] : undefined;
  if (area === undefined) return null;
  return (
    <VisitField
      id={`area-${index}-quantity`}
      label="Measured linear feet"
      value={area.quantity}
      error={error}
      inputMode="decimal"
      onChange={(value) => onChange(index, decimalInput(value))}
    />
  );
}

function AreaList({
  service,
  form,
  areas,
  problems,
  onArea,
  onInstall,
  onProduct,
  onName,
  onRemove,
  onAdd,
  onReplace,
}: {
  service: string;
  form: DiscoveryState;
  areas: VisitArea[];
  problems: Record<string, string>;
  onArea: (index: number, partial: Partial<VisitArea>) => void;
  onInstall: (index: number, service: string, value: string) => void;
  onProduct: (index: number, service: string, value: string) => void;
  onName: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onReplace: (key: string, value: string) => void;
}) {
  const owned = areas
    .map((area, index) => ({ area, index }))
    .filter(({ area }) => area.service === service);
  const types =
    service === grassService
      ? form.grassWork === "Installation"
        ? [...turfInstallTypes]
        : []
      : (installTypes[service] ?? []);

  return (
    <div className="visit-areas">
      {owned.map(({ area, index }, order) => {
        const productKey =
          service === grassService
            ? selectionKey(service, area.installType)
            : service;
        const measureInstall =
          area.installType === "Artificial Grass Replacement"
            ? (form.replacementInstall[productKey] ?? "")
            : area.installType;
        const products =
          service === grassService
            ? productsFor(service, measureInstall)
            : productsFor(service, area.installType || ((form.installTypes[service] ?? [])[0] ?? ""));
        const linear =
          service === grassService &&
          grassUsesLinearFeet(measureInstall, form.product[productKey] ?? "");
        return (
          <div key={`${area.label}-${index}`} className="visit-area">
            <div className="visit-area__head">
              <span>{order + 1}</span>
              <strong>{area.label || `Area ${order + 1}`}</strong>
              <em>Measured on site</em>
              <button type="button" className="visit-icon-btn" onClick={() => onRemove(index)}>
                <Trash2 size={15} aria-hidden="true" />
                Remove
              </button>
            </div>
            <div className="visit-area__grid">
              <VisitField
                id={`area-${index}-label`}
                label="Area name"
                value={area.label}
                error={problems[`area-${index}-label`]}
                onChange={(value) => onName(index, value)}
              />
              <VisitField
                id={`area-${index}-quantity`}
                label={linear ? "Linear feet" : "Square feet"}
                value={area.quantity}
                error={problems[`area-${index}-quantity`]}
                inputMode="decimal"
                onChange={(value) => onArea(index, { quantity: decimalInput(value) })}
              />
              {types.length > 0 ? (
                <div className="visit-field">
                  <label htmlFor={`area-${index}-install`}>Installation type</label>
                  <select
                    id={`area-${index}-install`}
                    value={area.installType}
                    onChange={(event) => onInstall(index, service, event.target.value)}
                  >
                    <option value="">Select</option>
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {choiceLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {products.length > 0 ? (
                <div className="visit-field">
                  <label htmlFor={`area-${index}-product`}>Turf product</label>
                  <select
                    id={`area-${index}-product`}
                    value={form.product[productKey] ?? form.product[service] ?? ""}
                    onChange={(event) => onProduct(index, service, event.target.value)}
                  >
                    <option value="">Select</option>
                    {products.map((product) => (
                      <option key={product.name} value={product.name}>
                        {product.mark === null ? product.name : `${product.name} (${product.mark})`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {area.installType === "Artificial Grass Replacement" ? (
                <div className="visit-field">
                  <label htmlFor={`area-${index}-replacement`}>New installation</label>
                  <select
                    id={`area-${index}-replacement`}
                    value={form.replacementInstall[productKey] ?? ""}
                    onChange={(event) => onReplace(productKey, event.target.value)}
                  >
                    <option value="">Select</option>
                    {turfInstallTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <button type="button" className="visit-text-btn" onClick={onAdd}>
        <Plus size={16} aria-hidden="true" />
        Add another area
      </button>
    </div>
  );
}

function AddOnBlock({
  service,
  form,
  problems,
  onToggle,
  onQuantity,
}: {
  service: string;
  form: DiscoveryState;
  problems: Record<string, string>;
  onToggle: (key: string, addOn: string) => void;
  onQuantity: (quantityKey: string, value: string) => void;
}) {
  const selectedTypes =
    service === grassService
      ? form.grassWork === "Replacement"
        ? [form.replacementInstall[selectionKey(service, "Artificial Grass Replacement")] ?? ""]
        : form.grassWork === "Repair"
          ? []
          : (form.installTypes[service] ?? [])
      : (form.installTypes[service] ?? []);
  const addOns = addOnsForSelected(service, selectedTypes);
  if (addOns.length === 0) return null;
  const selected = form.addOns[service] ?? [];
  return (
    <div className="visit-addons">
      <fieldset>
        <legend>Add-on</legend>
        {addOns.map((addOn) => {
          const quantityKey = `${service}::${addOn}`;
          const checked = selected.includes(addOn);
          return (
            <div key={addOn} className="visit-addon">
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(service, addOn)}
                />
                <span>{addOn}</span>
              </label>
              {checked ? (
                <input
                  aria-label={`${addOn} quantity`}
                  inputMode="decimal"
                  value={form.addOnQuantity[quantityKey] ?? ""}
                  onChange={(event) => onQuantity(quantityKey, decimalInput(event.target.value))}
                />
              ) : null}
              {problems[fieldIdFor("qty", quantityKey)] ? (
                <p className="field-error">{problems[fieldIdFor("qty", quantityKey)]}</p>
              ) : null}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}

function PhotosPanel({
  areas,
  siteIndex,
  onPhoto,
}: {
  areas: VisitArea[];
  siteIndex: number;
  onPhoto: (index: number, file: File) => void;
}) {
  const all = areas.flatMap((area, index) =>
    area.photoUrls.map((url, photoIndex) => ({
      url,
      id: area.photoIds[photoIndex],
      label: area.label,
      index,
    })),
  );
  return (
    <>
      <div className="visit-card__head">
        <div>
          <h2>Photos & notes</h2>
          <p>Every photo stays with its work area. Site photos are for the whole property.</p>
        </div>
      </div>
      <div className="visit-photos visit-photos--wide">
        {all.map((photo) =>
          photo.url === null ? (
            <span key={photo.id} className="visit-photo-fallback">
              {photo.label}
            </span>
          ) : (
            <figure key={photo.id}>
              <img src={photo.url} alt="" />
              <figcaption>{photo.label}</figcaption>
            </figure>
          ),
        )}
        {siteIndex >= 0 ? (
          <label className="visit-photo-add">
            <Plus size={20} aria-hidden="true" />
            <span>Add photo</span>
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) onPhoto(siteIndex, file);
              }}
            />
          </label>
        ) : null}
      </div>
    </>
  );
}
