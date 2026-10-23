"use client";

import { useAction, useMutation } from "convex/react";
import { ArrowRight, Box, Check, ChevronDown, ChevronUp, Flag, Gem, Layers, Leaf, Lightbulb, type LucideIcon, PawPrint, RefreshCw, Ruler, Shovel, Sprout, Star, Waves, Wrench } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { readSalesSession } from "@/lib/sales-session";
import { Id } from "@/convex/_generated/dataModel";
import {
  addOnsFor,
  addOnsForSelected,
  allowsMultipleInstallTypes,
  unitForAddOn,
  asksForArea,
  asksForNotes,
  buildDiscovery,
  grassUsesLinearFeet,
  contactProblems,
  decimalInput,
  DiscoveryState,
  emailInput,
  emptyDiscovery,
  fieldIdFor,
  grassJobAreaKey,
  grassService,
  grassWorks,
  hasFollowUp,
  installTypeDetail,
  orderServices,
  installTypes,
  phoneInput,
  productsFor,
  selectionKey,
  serviceLabel,
  services,
  soilConditions,
  soilDetail,
  turfInstallTypes,
  withAddOn,
  zipInput,
} from "@/lib/discovery";
import { canonicalState, US_STATES } from "@/lib/us-states";
import { ConfirmationPage } from "@/components/confirmation-page";
import { IntakeFrame, PropertyStep } from "@/components/intake-property";
import { parseWorkAreas, WorkAreaDraft, WorkAreas } from "@/components/work-areas";
import ServiceBoard from "@/components/service-board";
import {
  clearDiscoveryDraft,
  readDiscoveryDraft,
  writeDiscoveryDraft,
  type DiscoveryStep,
} from "@/lib/discovery-draft";

const customerSteps: DiscoveryStep[] = ["property", "services", "details"];

function stepFromParam(value: string | null): DiscoveryStep {
  if (value === "services") return "services";
  if (value === "questions" || value === "details") return "details";
  return "property";
}

function stepHref(step: DiscoveryStep) {
  const params = new URLSearchParams(window.location.search);
  if (step === "property") params.delete("step");
  else params.set("step", step === "details" ? "questions" : step);
  const query = params.toString();
  return query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
}

const serviceIcons: Record<string, LucideIcon> = {
  Demo: Shovel,
  [grassService]: Sprout,
  "Putting Green": Flag,
  Underground: Waves,
  "Low Voltage Lighting": Lightbulb,
};

const grassWorkMeta: Record<
  (typeof grassWorks)[number],
  { detail: string; icon: LucideIcon }
> = {
  Installation: { detail: "New artificial grass installation.", icon: Sprout },
  Replacement: { detail: "Replace existing artificial grass.", icon: RefreshCw },
  Repair: { detail: "Repair existing artificial grass.", icon: Wrench },
};

const turfPackageMeta: Record<string, { detail: string; icon: LucideIcon }> = {
  "Budget Friendly": { detail: "Great value and durability.", icon: Leaf },
  Standard: { detail: "Our most popular option.", icon: Star },
  Deluxe: { detail: "Same grasses, a separate package.", icon: Gem },
  "Basic Pet": { detail: "Turf made for pets.", icon: PawPrint },
  "Premium Pet": { detail: "The premium pet package.", icon: PawPrint },
  Playground: { detail: "Kids Play turf for a play area.", icon: Sprout },
  "Glue Down Over Concrete": { detail: "Installed over concrete.", icon: Layers },
  "Turf Stip": { detail: "A strip of turf along an edge.", icon: Ruler },
};

const productPhotos: Record<string, string> = {
  "Players Choice": "https://qualityfirstturf.com/wp-content/uploads/2023/09/emerald-shot-1-1-300x300.jpg",
  "Olive Natural": "https://qualityfirstturf.com/wp-content/uploads/2023/09/sequoia-ultra-light-shot-1-300x300.jpg",
  "Cali's Finest Light": "https://qualityfirstturf.com/wp-content/uploads/2023/10/venice-fescue-light-shot-1-300x300.jpg",
  Hollywood: "https://qualityfirstturf.com/wp-content/uploads/2023/10/cascade-spring-shot-1-300x300.jpg",
  "Spring Natural": "https://qualityfirstturf.com/wp-content/uploads/2023/10/diamond-light-spring-shot-1-300x300.jpg",
  "La Jolla Lush": "https://qualityfirstturf.com/wp-content/uploads/2023/09/sequoia-light-shot-2-300x300.jpg",
  Pasadena: "https://qualityfirstturf.com/wp-content/uploads/2023/10/natures-best-shot-1-300x300.jpg",
  "Cali's Finest": "https://qualityfirstturf.com/wp-content/uploads/2023/09/cascade-fescue-light-shot-2-1-300x300.jpg",
  "Hollywood Lush": "https://qualityfirstturf.com/wp-content/uploads/2023/09/riviera-pro-shot-1-300x300.jpg",
  "Central Park": "https://qualityfirstturf.com/wp-content/uploads/2023/10/everglade-fescue-pro-shot-1-300x300.jpg",
  Wimbledon: "https://qualityfirstturf.com/wp-content/uploads/2023/10/Playscape-Pro-Corner_2-300x300.png",
  Malibu: "https://qualityfirstturf.com/wp-content/uploads/2023/10/malibu-fescue-light-shot-1-300x300.jpg",
  "Big Sur": "https://qualityfirstturf.com/wp-content/uploads/2023/10/venice-fescue-pro-shot-1-300x300.jpg",
  Monterey: "https://qualityfirstturf.com/wp-content/uploads/2023/10/everglade-fescue-pro-shot-1-1-300x300.jpg",
  "Sol Natural": "https://qualityfirstturf.com/wp-content/uploads/2023/10/Playscape-Corner-300x300.png",
  Brentwood: "https://qualityfirstturf.com/wp-content/uploads/2023/09/38315-default_2-1-300x300.jpg",
  Newport: "https://qualityfirstturf.com/wp-content/uploads/2023/09/Poa-Annua-Pro-corner-1030x687-1-300x200.png",
  "Pets Choice": "https://qualityfirstturf.com/wp-content/uploads/2023/10/PET-PRIDE-BASIC-300x169.jpg",
  "Kennels Best": "https://qualityfirstturf.com/wp-content/uploads/2023/10/tiger-pet-shot-1-300x300.jpg",
  Fringe: "https://qualityfirstturf.com/wp-content/uploads/2023/10/everlast-pet-shot-1-300x300.jpg",
  "Kids Play": "https://qualityfirstturf.com/wp-content/uploads/2023/10/playground-fescue-shot-1-300x300.jpg",
  "Champions Choice": "https://qualityfirstturf.com/wp-content/uploads/2023/10/Playscape-Corner-300x300.png",
  "Pro Putter": "https://qualityfirstturf.com/wp-content/uploads/2023/09/riviera-pro-shot-1-300x300.jpg",
  "Poa Annua Natural": "https://qualityfirstturf.com/wp-content/uploads/2023/09/38315-default_2-1-300x300.jpg",
  "Poa Annua Max": "https://qualityfirstturf.com/wp-content/uploads/2023/09/Poa-Annua-Pro-corner-1030x687-1-300x200.png",
};

const servicePhotos: Record<string, string> = {
  Demo: "/images/services/demo.jpg",
  [grassService]: "/images/services/grass.jpg",
  "Putting Green": "/images/services/putting.jpg",
  Underground: "/images/services/underground.jpg",
  "Low Voltage Lighting": "/images/services/lighting.jpg",
  SOD: "/images/services/sod.jpg",
  "Patio Covers": "/images/services/patio.jpg",
  Concrete: "/images/services/concrete.jpg",
  "Retaining Walls": "/images/services/retaining.jpg",
  "Planter Walls": "/images/services/planter.jpg",
  Pavers: "/images/services/pavers.jpg",
  "Bar & Bbq": "/images/services/bbq.jpg",
  "Fire Pits": "/images/services/fire.jpg",
  "Decomposite Granite": "/images/services/granite.jpg",
  "Decorative Rock": "/images/services/rock.jpg",
  Irrigation: "/images/services/irrigation.jpg",
  Planting: "/images/services/planting.jpg",
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStep = stepFromParam(searchParams.get("step"));
  const [step, setStep] = useState<DiscoveryStep>("property");
  const customer = visit === undefined;
  const [hydrated, setHydrated] = useState(!customer);
  const stepRef = useRef(step);
  const trail = useRef<DiscoveryStep[]>(["property"]);
  const pendingStep = useRef<DiscoveryStep | null>(null);
  const restoredDraft = useRef(false);
  stepRef.current = step;

  useEffect(() => {
    if (!customer) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, [customer]);

  useEffect(() => {
    if (!customer || restoredDraft.current) return;
    restoredDraft.current = true;
    const saved = readDiscoveryDraft();
    const next = searchParams.has("step") ? urlStep : (saved?.step ?? "property");
    if (saved !== null) setForm(saved.form);
    trail.current = [next];
    setStep(next);
    if ((!searchParams.has("step") && next !== "property") || searchParams.get("step") === "details") {
      pendingStep.current = next;
      router.replace(stepHref(next), { scroll: false });
    }
    setHydrated(true);
  }, [customer, router, searchParams, urlStep]);

  useEffect(() => {
    if (!customer || !hydrated) return;
    if (pendingStep.current !== null) {
      if (urlStep !== pendingStep.current) return;
      pendingStep.current = null;
      return;
    }
    if (stepRef.current === urlStep) return;
    const trailNow = trail.current;
    if (trailNow[trailNow.length - 1] !== urlStep) {
      const found = trailNow.lastIndexOf(urlStep);
      trail.current = found >= 0 ? trailNow.slice(0, found + 1) : [...trailNow, urlStep];
    }
    setError(null);
    setStep(urlStep);
    if (!focusFirstError.current) window.scrollTo(0, 0);
  }, [customer, hydrated, urlStep]);

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

  function clearProblem(id: string) {
    const message = fieldErrors[id];
    if (message === undefined) return;
    const next = { ...fieldErrors };
    delete next[id];
    setFieldErrors(next);
    if (Object.keys(next).length === 0 || error === message) {
      setError(Object.values(next)[0] ?? null);
    }
  }

  function showProblems(problems: Record<string, string>, message: string | null) {
    setFieldErrors(problems);
    setError(message);
    if (message !== null) focusFirstError.current = true;
  }

  async function addPhoto(index: number, file: File) {
    setError(null);
    try {
      const postUrl = await generateUploadUrl({ sessionToken: readSalesSession() ?? "" });
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
      services: orderServices(
        current.services.includes(service)
          ? current.services.filter((item) => item !== service)
          : [...current.services, service],
      ),
    }));
    clearProblem("services");
    setError((current) => (current === "Choose at least one service." ? null : current));
  }

  function pushCustomerStep(next: DiscoveryStep) {
    if (trail.current[trail.current.length - 1] !== next) {
      pendingStep.current = next;
      trail.current = [...trail.current, next];
      router.push(stepHref(next), { scroll: true });
    }
    setError(null);
    setStep(next);
    window.scrollTo(0, 0);
  }

  function retreatTo(next: DiscoveryStep) {
    if (next === step) return;
    const trailNow = trail.current;
    let found = -1;
    for (let index = trailNow.length - 2; index >= 0; index -= 1) {
      if (trailNow[index] === next) {
        found = index;
        break;
      }
    }
    setError(null);
    if (found >= 0) {
      pendingStep.current = next;
      trail.current = trailNow.slice(0, found + 1);
      setStep(next);
      window.history.go(-(trailNow.length - 1 - found));
    } else {
      pendingStep.current = next;
      trail.current = [...trailNow, next];
      setStep(next);
      router.push(stepHref(next), { scroll: true });
    }
    if (!focusFirstError.current) window.scrollTo(0, 0);
  }

  function selectStep(next: DiscoveryStep) {
    if (customerSteps.indexOf(next) === -1 || customerSteps.indexOf(next) >= customerSteps.indexOf(step)) return;
    retreatTo(next);
  }

  function continueFromProperty() {
    const problems = contactProblems(form);
    const message = Object.values(problems)[0] ?? null;
    if (message === null) {
      setFieldErrors({});
      pushCustomerStep("services");
      return;
    }
    showProblems(problems, message);
  }

  useEffect(() => {
    if (focusFirstError.current) {
      focusFirstError.current = false;
      const firstId = Object.keys(fieldErrors)[0];
      const field = firstId ? document.getElementById(firstId) : null;
      if (field) {
        const focusable =
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement;
        const target = focusable ? field : (field.querySelector(".field-error") ?? field);
        target.scrollIntoView({ block: "center" });
        if (focusable) field.focus({ preventScroll: true });
        return;
      }
    }
    if (error === null || Object.keys(fieldErrors).length > 0) return;
    document.querySelector(".form-alert")?.scrollIntoView({ block: "center" });
  }, [error, fieldErrors]);

  function continueFromServices() {
    if (form.services.length === 0) {
      showProblems({ services: "Choose at least one service." }, "Choose at least one service.");
      return;
    }
    setFieldErrors({});
    if (form.services.some((service) => hasFollowUp(service))) {
      pushCustomerStep("details");
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
    const problems = contactProblems(form);
    const contactMessage = Object.values(problems)[0] ?? null;
    if (contactMessage !== null) {
      showProblems(problems, contactMessage);
      if (visit === undefined) retreatTo("property");
      return;
    }
    const built = buildDiscovery(form);
    if (built.error !== null || built.payload === null) {
      showProblems(
        built.fieldId !== null && built.error !== null ? { [built.fieldId]: built.error } : {},
        built.error,
      );
      return;
    }
    const parsedAreas = visit === undefined ? null : parseWorkAreas(areas);
    if (parsedAreas?.error !== null && parsedAreas !== null) {
      showProblems(
        parsedAreas.fieldId !== null && parsedAreas.error !== null
          ? { [parsedAreas.fieldId]: parsedAreas.error }
          : {},
        parsedAreas.error,
      );
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
          sessionToken: readSalesSession() ?? "",
          projectId: visit.projectId,
          ...built.payload,
          notes: note,
          status: "on-site saved",
          workAreas: parsedAreas.workAreas,
        });
        const drafted = await draftVisit({
          sessionToken: readSalesSession() ?? "",
          projectId: visit.projectId,
        });
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
    return (
      <IntakeFrame step="property">
        <p className="intake-loading">Loading your request.</p>
      </IntakeFrame>
    );
  }

  if (projectId !== null) {
    if (visit === undefined) {
      return (
        <IntakeFrame step="confirmation">
          <ConfirmationPage />
        </IntakeFrame>
      );
    }
    return (
      <FormShell>
        <div className="form-intro">
          <h1>Visit saved</h1>
          <p>The measurements and photos are saved on this project. Your reference is {projectId}.</p>
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
      <IntakeFrame step={step} onStep={selectStep}>
        {step === "property" ? (
          <PropertyStep
            form={form}
            problems={fieldErrors}
            pending={pending}
            onPatch={patch}
            onSubmit={onSubmit}
          />
        ) : step === "services" ? (
          <form className="services-page" onSubmit={onSubmit} noValidate>
            <div className="services-copy">
              <h1>
                Which services are
                <span className="services-copy__break">you considering?</span>
              </h1>
              <p className="services-copy__sub">Choose one or more.</p>
            </div>
            <div id="services">
              {fieldErrors.services ? (
                <p id="services-error" className="field-error" role="alert">
                  {fieldErrors.services}
                </p>
              ) : null}
              <ServiceBoard
                invalid={Boolean(fieldErrors.services)}
                describedBy="services-error"
                  cards={services.map((service) => ({
                  imgUrl: servicePhotos[service],
                  label: serviceLabel(service),
                  selected: form.services.includes(service),
                }))}
                onToggle={(index) => toggleService(services[index])}
              />
            </div>
            <p className="services-status" aria-live="polite">
              {form.services.length === 0
                ? "Nothing selected yet."
                : orderServices(form.services).map(serviceLabel).join(", ")}
            </p>
            <div className="services-actions">
              {error !== null && error !== fieldErrors.services ? (
                <p className="form-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="button" className="services-back" onClick={() => retreatTo("property")}>
                Back
              </button>
              <button type="submit" className="services-continue" disabled={pending}>
                {pending ? "Saving" : form.services.length > 0 && !needsDetails ? "Submit" : "Continue"}
                {pending || (form.services.length > 0 && !needsDetails) ? null : (
                  <ArrowRight strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        ) : (
        <form className="review-page" onSubmit={onSubmit} noValidate>
          <div className="review-page__bg" aria-hidden="true" />
          {step === "details" ? (
            <div className="review-stage">
              <div className="review-intro">
                <h1>A few questions</h1>
                <p>
                  You chose <ServiceNames names={orderServices(form.services)} />.
                  <QuietServices names={orderServices(form.services)} /> If you do not know a measurement, you can still send this in.
                </p>
              </div>
              <div className="review-cards">
                {orderServices(form.services)
                  .filter((service) => hasFollowUp(service))
                  .map((service) => {
                  if (service === "Demo") {
                    return (
                      <DemoSection
                        key={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
                    );
                  }
                  if (service === "Underground") {
                    return (
                      <UndergroundSection
                        key={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
                    );
                  }
                  if (service === "Putting Green") {
                    return (
                      <PuttingGreenSection
                        key={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
                    );
                  }
                  if (service === "Low Voltage Lighting") {
                    return (
                      <LightingSection
                        key={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
                    );
                  }
                  const Icon = serviceIcons[service] ?? Sprout;
                  const cardClass =
                    service === grassService ? "review-card review-card--grass" : "review-card";
                  return (
                    <section
                      key={service}
                      className={cardClass}
                    >
                      <h2>
                        <span className="review-card__icon">
                          <Icon strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        {serviceLabel(service)}
                      </h2>
                      <FollowUp
                        service={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
                    </section>
                  );
                })}
              </div>
              <div className="review-actions">
                {error !== null ? (
                  <p className="form-alert" role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="button" className="review-back" onClick={() => retreatTo("services")}>
                  Back
                </button>
                <button type="submit" className="review-submit" disabled={pending}>
                  {pending ? "Saving" : "Submit"}
                  {pending ? null : <ArrowRight strokeWidth={2} aria-hidden="true" />}
                </button>
              </div>
            </div>
          ) : null}
        </form>
        )}
      </IntakeFrame>
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
            <Field id="firstName" label="First name" value={form.firstName} error={fieldErrors.firstName} onChange={(value) => patch({ firstName: value })} />
            <Field id="lastName" label="Last name" value={form.lastName} error={fieldErrors.lastName} onChange={(value) => patch({ lastName: value })} />
            <Field id="phone" label="Phone" value={form.phone} error={fieldErrors.phone} type="tel" inputMode="numeric" maxLength={10} onChange={(value) => patch({ phone: phoneInput(value) })} />
            <Field id="email" label="Email" value={form.email} error={fieldErrors.email} type="email" inputMode="email" maxLength={254} onChange={(value) => patch({ email: emailInput(value) })} />
            <Field id="street1" label="Street 1" value={form.street1} error={fieldErrors.street1} onChange={(value) => patch({ street1: value })} />
            <Field id="street2" label="Street 2" value={form.street2} onChange={(value) => patch({ street2: value })} />
            <Field id="city" label="City" value={form.city} error={fieldErrors.city} onChange={(value) => patch({ city: value })} />
            <VisitStateField value={form.state} error={fieldErrors.state} onChange={(value) => patch({ state: value })} />
            <Field id="zip" label="ZIP code" value={form.zip} error={fieldErrors.zip} inputMode="numeric" maxLength={10} onChange={(value) => patch({ zip: zipInput(value) })} />
          </div>
        </section>

        <section className="form-panel">
          <div id="services">
            <h2 id="services-heading">Services</h2>
            {fieldErrors.services ? (
              <p id="services-error" className="field-error" role="alert">
                {fieldErrors.services}
              </p>
            ) : null}
          </div>
          <div
            className="service-list"
            role="group"
            aria-labelledby="services-heading"
            aria-invalid={fieldErrors.services ? true : undefined}
            aria-describedby={fieldErrors.services ? "services-error" : undefined}
          >
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
                    <span>{serviceLabel(service)}</span>
                  </label>
                  {checked && hasFollowUp(service) ? (
                    <div className="service-expand">
                      <FollowUp
                        service={service}
                        form={form}
                        setForm={setForm}
                        problems={fieldErrors}
                        clearProblem={clearProblem}
                      />
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
            <WorkAreas
              areas={areas}
              problems={fieldErrors}
              onChange={setAreas}
              onPhoto={addPhoto}
              onClear={clearProblem}
            />
          </>
        ) : null}

        {error !== null ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Saving" : visit === undefined ? "Submit" : "Save visit"}
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
          <span className="site-logo">
            <Image
              src="/brand/logo-mark.png"
              alt="Quality First Turf"
              width={771}
              height={605}
              priority
            />
          </span>
        </div>
      </header>
      <main className={fit ? "section section--soft form-page form-page--fit" : "section section--soft form-page"}>
        <div className={wide ? "container" : "container container--narrow"}>{children}</div>
      </main>
    </>
  );
}

function ServiceNames({ names }: { names: string[] }) {
  return names.map((name, index) => (
    <span key={name}>
      {index > 0 ? ", " : null}
      <strong className="review-service">{serviceLabel(name)}</strong>
    </span>
  ));
}

function QuietServices({ names }: { names: string[] }) {
  const quiet = names.filter((service) => !hasFollowUp(service));
  if (quiet.length === 0) return null;
  const verb = quiet.length === 1 ? "needs" : "need";
  return (
    <>
      {" "}
      <ServiceNames names={quiet} /> {verb} nothing else here.
    </>
  );
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
  inputMode,
  maxLength,
  placeholder,
  suffix,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "numeric" | "decimal";
  maxLength?: number;
  placeholder?: string;
  suffix?: string;
}) {
  const fieldId = id ?? label.toLowerCase().replaceAll(" ", "-");
  const errorId = `${fieldId}-error`;
  const numeric = type === "number";
  const input = (
    <input
      id={fieldId}
      type={numeric ? "text" : type}
      value={value}
      required={required}
      autoComplete={autoComplete}
      inputMode={numeric ? "decimal" : inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={(event) =>
        onChange(numeric ? decimalInput(event.target.value) : event.target.value)
      }
    />
  );
  return (
    <div className={error ? "form-field is-invalid" : "form-field"}>
      <label htmlFor={fieldId}>
        {label}
        {suffix ? (
          <span className="visually-hidden">
            {suffix === "sq ft" ? " in square feet" : " in feet"}
          </span>
        ) : null}
        {required ? <span className="field-required"> Required</span> : null}
      </label>
      {suffix ? (
        <div className="field-affix">
          {input}
          <span className="field-affix__unit" aria-hidden="true">
            {suffix}
          </span>
        </div>
      ) : (
        input
      )}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DemoSection({
  form,
  setForm,
  problems,
  clearProblem,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const service = "Demo";
  const selected = form.installTypes[service] ?? [];
  const addOns = addOnsForSelected(service, selected);
  const installId = fieldIdFor("install", service);
  const needsAreaName = selected.length > 1;
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  function toggleInstallType(value: string) {
    clearProblem(installId);
    setFolded((current) => ({ ...current, [value]: false }));
    setForm((current) => {
      const currentTypes = current.installTypes[service] ?? [];
      const next = currentTypes.includes(value)
        ? currentTypes.filter((item) => item !== value)
        : [...currentTypes, value];
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: next },
      };
    });
  }

  return (
    <section className={addOns.length > 0 ? "review-card demo-layout" : "review-card demo-layout demo-layout--solo"}>
      <div className="demo-panel">
        <h2 id="demo-heading">
          <span className="review-card__icon">
            <Leaf strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="demo-panel__title">
            {serviceLabel(service)}
            <span className="demo-panel__kind">Installation type</span>
          </span>
        </h2>
        <div className="demo-types" id={installId}>
          {needsAreaName ? (
            <p className="muted">
              Name the area for each installation type, such as front yard or back yard.
            </p>
          ) : null}
          {problems[installId] ? (
            <p className="field-error" role="alert">
              {problems[installId]}
            </p>
          ) : null}
          {(installTypes[service] ?? []).map((type) => {
            const checked = selected.includes(type);
            const expanded = checked && !folded[type];
            const areaKey = selectionKey(service, type);
            const panelId = `${fieldIdFor("install", service, type)}-panel`;
            return (
              <div key={type} className={checked ? "demo-type is-on" : "demo-type"}>
                <div className="demo-type__head">
                  <label className="demo-type__choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInstallType(type)}
                    />
                    <span className="demo-mark" aria-hidden="true" />
                    <span className="demo-type__copy">
                      <span className="demo-type__name">{choiceLabel(type)}</span>
                      {installTypeDetail[type] ? (
                        <span className="demo-type__detail">{installTypeDetail[type]}</span>
                      ) : null}
                    </span>
                  </label>
                  {checked ? (
                    <button
                      type="button"
                      className="demo-type__toggle"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setFolded((current) => ({ ...current, [type]: !current[type] }))
                      }
                    >
                      {expanded ? (
                        <ChevronUp strokeWidth={2.25} aria-hidden="true" />
                      ) : (
                        <ChevronDown strokeWidth={2.25} aria-hidden="true" />
                      )}
                      <span className="visually-hidden">
                        {expanded ? `Hide ${type} details` : `Show ${type} details`}
                      </span>
                    </button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="demo-type__body" id={panelId}>
                    <div className={needsAreaName ? "demo-type__fields" : "demo-type__fields demo-type__fields--single"}>
                      {needsAreaName ? (
                        <Field
                          id={fieldIdFor("area", areaKey)}
                          label="Which area is this?"
                          placeholder="front yard"
                          value={form.areaNames[areaKey] ?? ""}
                          error={problems[fieldIdFor("area", areaKey)]}
                          onChange={(value) => {
                            clearProblem(fieldIdFor("area", areaKey));
                            setForm((current) => ({
                              ...current,
                              areaNames: { ...current.areaNames, [areaKey]: value },
                            }));
                          }}
                        />
                      ) : null}
                      <SquareFeetField
                        id={fieldIdFor("square-feet", service, type)}
                        value={form.squareFeet[type] ?? ""}
                        error={problems[fieldIdFor("square-feet", service, type)]}
                        onChange={(value) => {
                          clearProblem(fieldIdFor("square-feet", service, type));
                          setForm((current) => ({
                            ...current,
                            squareFeet: { ...current.squareFeet, [type]: value },
                          }));
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <AddOnAside
        service={service}
        addOns={addOns}
        form={form}
        setForm={setForm}
        problems={problems}
        clearProblem={clearProblem}
      />
    </section>
  );
}

const puttingOptions = [
  {
    value: "Entertaintment Putting Green",
    label: "Entertainment Putting Green",
    detail: "Perfect for home use and recreation.",
    icon: "flag" as const,
  },
  {
    value: "PGA Putting Green",
    label: "PGA Putting Green",
    detail: "Professional-grade turf for the ultimate putting experience.",
    icon: "golfer" as const,
  },
];

function GolferIcon() {
  return (
    <svg
      className="golfer-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="15.2" cy="4.6" r="1.85" />
      <path d="M14.3 6.7 11.4 12.2" />
      <path d="M11.4 12.2 8.2 18" />
      <path d="M11.4 12.2 14.6 18" />
      <path d="M13.7 8.2 9.2 10.8" />
      <path d="M9.2 10.8 5.2 15.4" />
      <circle cx="4.3" cy="16.7" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PuttingGreenSection({
  form,
  setForm,
  problems,
  clearProblem,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const service = "Putting Green";
  const selected = form.installTypes[service] ?? [];
  const installType = selected[0] ?? "";
  const products = productsFor(service, installType);
  const addOns = addOnsForSelected(service, selected);
  const installId = fieldIdFor("install", service);
  const feetId = installType
    ? fieldIdFor("square-feet", service, installType)
    : fieldIdFor("square-feet", service);
  const feetValue = installType
    ? (form.squareFeet[installType] ?? "")
    : (form.squareFeet["Entertaintment Putting Green"] ??
      form.squareFeet["PGA Putting Green"] ??
      "");

  function chooseType(value: string) {
    clearProblem(installId);
    setForm((current) => {
      const previous = (current.installTypes[service] ?? [])[0] ?? "";
      const carried =
        (previous !== "" ? current.squareFeet[previous] : "") ||
        current.squareFeet[value] ||
        current.squareFeet["Entertaintment Putting Green"] ||
        current.squareFeet["PGA Putting Green"] ||
        "";
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: [value] },
        squareFeet:
          carried === "" ? current.squareFeet : { ...current.squareFeet, [value]: carried },
      };
    });
  }

  function setFeet(value: string) {
    clearProblem(feetId);
    setForm((current) => ({
      ...current,
      squareFeet:
        installType === ""
          ? {
              ...current.squareFeet,
              "Entertaintment Putting Green": value,
              "PGA Putting Green": value,
            }
          : { ...current.squareFeet, [installType]: value },
    }));
  }

  return (
    <section className={addOns.length > 0 ? "review-card putting-card demo-layout" : "review-card putting-card demo-layout demo-layout--solo"}>
      <div className="demo-panel">
      <h2 id="putting-green-heading">
        <span className="review-card__icon">
          <Flag strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="demo-panel__title">
          Putting Green
          <span className="demo-panel__kind">Installation type</span>
        </span>
      </h2>
      <div className="putting-options" id={installId} role="radiogroup" aria-labelledby="putting-green-heading">
        <p className="putting-lead">Select the type of putting green you&apos;re interested in.</p>
        {problems[installId] ? (
          <p className="field-error" role="alert">
            {problems[installId]}
          </p>
        ) : null}
        {puttingOptions.map((option) => {
          const checked = installType === option.value;
          return (
            <label key={option.value} className={checked ? "putting-option is-on" : "putting-option"}>
              <input
                type="radio"
                name="putting-green-install"
                checked={checked}
                onChange={() => chooseType(option.value)}
              />
              <span className="putting-option__mark" aria-hidden="true" />
              <span className="putting-option__icon" aria-hidden="true">
                {option.icon === "flag" ? <Flag strokeWidth={1.75} /> : <GolferIcon />}
              </span>
              <span className="putting-option__copy">
                <span className="putting-option__name">{option.label}</span>
                <span className="putting-option__detail">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
      <SquareFeetField
        id={feetId}
        value={feetValue}
        error={problems[feetId]}
        stepped
        unitChoice
        onChange={setFeet}
      />
      {products.length > 0 ? (
        <ChoiceGroup
          id={fieldIdFor("product", service)}
          legend="Product"
          name={`${service}-product`}
          look="photos"
          images={productPhotos}
          error={problems[fieldIdFor("product", service)]}
          options={products.map((product) =>
            product.mark === null ? product.name : `${product.name} (${product.mark})`,
          )}
          values={products.map((product) => product.name)}
          value={form.product[service] ?? ""}
          onChange={(value) => {
            clearProblem(fieldIdFor("product", service));
            setForm((current) => ({
              ...current,
              product: { ...current.product, [service]: value },
            }));
          }}
        />
      ) : null}
      </div>
      <AddOnAside
        service={service}
        addOns={addOns}
        form={form}
        setForm={setForm}
        problems={problems}
        clearProblem={clearProblem}
      />
    </section>
  );
}

function UndergroundSection({
  form,
  setForm,
  problems,
  clearProblem,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const service = "Underground";
  const selected = form.installTypes[service] ?? [];
  const installId = fieldIdFor("install", service);
  const needsAreaName = selected.length > 1;
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const types = installTypes[service] ?? [];
  const soilError = problems["underground-soil"];
  const feetError = problems["underground-feet"];
  const forceDetails = Boolean(soilError || feetError);
  const detailHost =
    types.find((type) => selected.includes(type) && (forceDetails || !folded[type])) ??
    (forceDetails ? types.find((type) => selected.includes(type)) : undefined);

  function toggleInstallType(value: string) {
    clearProblem(installId);
    setFolded((current) => ({ ...current, [value]: false }));
    setForm((current) => {
      const currentTypes = current.installTypes[service] ?? [];
      const next = currentTypes.includes(value)
        ? currentTypes.filter((item) => item !== value)
        : [...currentTypes, value];
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: next },
      };
    });
  }

  return (
    <section className="review-card ug-layout">
      <div className="demo-panel">
        <h2 id="underground-heading">
          <span className="review-card__icon">
            <Waves strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="demo-panel__title">
            Underground
            <span className="demo-panel__kind">Installation type</span>
          </span>
        </h2>
        <div className="demo-types" id={installId}>
          {needsAreaName ? (
            <p className="muted">
              Name the area for each installation type, such as front yard or back yard.
            </p>
          ) : null}
          {problems[installId] ? (
            <p className="field-error" role="alert">
              {problems[installId]}
            </p>
          ) : null}
          {types.map((type) => {
            const checked = selected.includes(type);
            const expanded = checked && ((forceDetails && type === detailHost) || !folded[type]);
            const areaKey = selectionKey(service, type);
            const panelId = `${fieldIdFor("install", service, type)}-panel`;
            return (
              <div key={type} className={checked ? "demo-type is-on" : "demo-type"}>
                <div className="demo-type__head">
                  <label className="demo-type__choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInstallType(type)}
                    />
                    <span className="demo-mark" aria-hidden="true" />
                    <span className="demo-type__copy">
                      <span className="demo-type__name">{type}</span>
                      {installTypeDetail[type] ? (
                        <span className="demo-type__detail">{installTypeDetail[type]}</span>
                      ) : null}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="demo-type__toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => {
                      if (!checked) {
                        toggleInstallType(type);
                        return;
                      }
                      setFolded((current) => ({ ...current, [type]: !current[type] }));
                    }}
                  >
                    {expanded ? (
                      <ChevronUp strokeWidth={2.25} aria-hidden="true" />
                    ) : (
                      <ChevronDown strokeWidth={2.25} aria-hidden="true" />
                    )}
                    <span className="visually-hidden">
                      {expanded ? `Hide ${type} details` : `Show ${type} details`}
                    </span>
                  </button>
                </div>
                {expanded ? (
                  <div className="ug-type__body" id={panelId}>
                    {needsAreaName ? (
                      <Field
                        id={fieldIdFor("area", areaKey)}
                        label="Which area is this?"
                        placeholder="front yard"
                        value={form.areaNames[areaKey] ?? ""}
                        error={problems[fieldIdFor("area", areaKey)]}
                        onChange={(value) => {
                          clearProblem(fieldIdFor("area", areaKey));
                          setForm((current) => ({
                            ...current,
                            areaNames: { ...current.areaNames, [areaKey]: value },
                          }));
                        }}
                      />
                    ) : null}
                    {type === detailHost ? (
                      <div className="ug-panel">
                        <fieldset
                          id="underground-soil"
                          className={soilError ? "ug-soil is-invalid" : "ug-soil"}
                          aria-invalid={soilError ? true : undefined}
                          aria-describedby={soilError ? "underground-soil-error" : undefined}
                        >
                          <legend>What is the soil like?</legend>
                          {soilError ? (
                            <p id="underground-soil-error" className="field-error" role="alert">
                              {soilError}
                            </p>
                          ) : null}
                          {soilConditions.map((soil) => (
                            <label key={soil} className="ug-soil__option">
                              <input
                                type="radio"
                                name="underground-soil"
                                checked={form.soil === soil}
                                onChange={() => {
                                  clearProblem("underground-soil");
                                  setForm((current) => ({ ...current, soil }));
                                }}
                              />
                              <span className="ug-soil__mark" aria-hidden="true" />
                              <span className="ug-soil__name">{soil}</span>
                              <span className="ug-soil__detail">{soilDetail[soil]}</span>
                            </label>
                          ))}
                        </fieldset>
                        <SquareFeetField
                          id="underground-feet"
                          unit="lin ft"
                          value={form.linearFeet}
                          error={feetError}
                          onChange={(value) => {
                            clearProblem("underground-feet");
                            setForm((current) => ({ ...current, linearFeet: value }));
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LightingSection({
  form,
  setForm,
  problems,
  clearProblem,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const service = "Low Voltage Lighting";
  const selected = form.installTypes[service] ?? [];
  const installId = fieldIdFor("install", service);
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  function toggleInstallType(value: string) {
    clearProblem(installId);
    setFolded((current) => ({ ...current, [value]: false }));
    setForm((current) => {
      const currentTypes = current.installTypes[service] ?? [];
      const next = currentTypes.includes(value)
        ? currentTypes.filter((item) => item !== value)
        : [...currentTypes, value];
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: next },
      };
    });
  }

  return (
    <section className="review-card lighting-card">
      <h2 id="lighting-heading">
        <span className="review-card__icon">
          <Lightbulb strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="demo-panel__title">
          Low Voltage Lighting
          <span className="demo-panel__kind">Installation options</span>
        </span>
      </h2>
      <div className="demo-types" id={installId}>
        <p className="lighting-lead">
          Name the area for each installation type, such as front yard or back yard.
        </p>
        {problems[installId] ? (
          <p className="field-error" role="alert">
            {problems[installId]}
          </p>
        ) : null}
        {(installTypes[service] ?? []).map((type) => {
          const checked = selected.includes(type);
          const expanded = checked && !folded[type];
          const areaKey = selectionKey(service, type);
          const panelId = `${fieldIdFor("install", service, type)}-panel`;
          return (
            <div key={type} className={checked ? "demo-type is-on" : "demo-type"}>
              <div className="demo-type__head">
                <label className="demo-type__choice">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleInstallType(type)}
                  />
                  <span className="demo-mark" aria-hidden="true" />
                  <span className="demo-type__copy">
                    <span className="demo-type__name">{choiceLabel(type)}</span>
                    {installTypeDetail[type] ? (
                      <span className="demo-type__detail">{installTypeDetail[type]}</span>
                    ) : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="demo-type__toggle"
                  aria-expanded={expanded}
                  aria-controls={expanded ? panelId : undefined}
                  onClick={() => {
                    if (!checked) {
                      toggleInstallType(type);
                      return;
                    }
                    setFolded((current) => ({ ...current, [type]: !current[type] }));
                  }}
                >
                  {expanded ? (
                    <ChevronUp strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <ChevronDown strokeWidth={2.25} aria-hidden="true" />
                  )}
                  <span className="visually-hidden">
                    {expanded ? `Hide ${type} details` : `Show ${type} details`}
                  </span>
                </button>
              </div>
              {expanded ? (
                <div className="demo-type__body" id={panelId}>
                  <Field
                    id={fieldIdFor("area", areaKey)}
                    label="Which area is this?"
                    placeholder="front yard"
                    value={form.areaNames[areaKey] ?? ""}
                    error={problems[fieldIdFor("area", areaKey)]}
                    onChange={(value) => {
                      clearProblem(fieldIdFor("area", areaKey));
                      setForm((current) => ({
                        ...current,
                        areaNames: { ...current.areaNames, [areaKey]: value },
                      }));
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FollowUp({
  service,
  form,
  setForm,
  problems,
  clearProblem,
}: {
  service: string;
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const selected = form.installTypes[service] ?? [];
  const installType = selected[0] ?? "";
  const products = productsFor(service, installType);
  const addOns = addOnsForSelected(service, selected);
  const installId = fieldIdFor("install", service);

  function toggleInstallType(value: string) {
    clearProblem(installId);
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

  const hasSharedFollowUp =
    products.length > 0 || asksForNotes(installType) || service === "Underground";

  const details = (
    <>
          {products.length > 0 ? (
            <ChoiceGroup
              id={fieldIdFor("product", service)}
              legend="Product"
              name={`${service}-product`}
              look="photos"
              images={productPhotos}
              error={problems[fieldIdFor("product", service)]}
              options={products.map((product) =>
                product.mark === null ? product.name : `${product.name} (${product.mark})`,
              )}
              values={products.map((product) => product.name)}
              value={form.product[service] ?? ""}
              onChange={(value) => {
                clearProblem(fieldIdFor("product", service));
                setForm((current) => ({
                  ...current,
                  product: { ...current.product, [service]: value },
                }));
              }}
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
          {service === "Underground" && selected.length > 0 ? (
            <div className="stack">
              <ChoiceGroup
                id="underground-soil"
                legend="What is the soil like?"
                name="underground-soil"
                options={[...soilConditions]}
                values={[...soilConditions]}
                value={form.soil}
                error={problems["underground-soil"]}
                onChange={(value) => {
                  clearProblem("underground-soil");
                  setForm((current) => ({
                    ...current,
                    soil: value as DiscoveryState["soil"],
                  }));
                }}
              />
              <SquareFeetField
                id="underground-feet"
                unit="lin ft"
                value={form.linearFeet}
                error={problems["underground-feet"]}
                onChange={(value) => {
                  clearProblem("underground-feet");
                  setForm((current) => ({ ...current, linearFeet: value }));
                }}
              />
            </div>
          ) : null}
    </>
  );

  if (service === grassService) {
    return (
      <GrassFollowUp form={form} setForm={setForm} problems={problems} clearProblem={clearProblem} />
    );
  }

  const needsAreaName = selected.length > 1;

  return (
    <>
    <div className="service-list" id={installId}>
      <span className="expand-label">Installation type</span>
      {problems[installId] ? (
        <p className="field-error" role="alert">
          {problems[installId]}
        </p>
      ) : null}
      {needsAreaName ? (
        <p className="muted">Name the area for each installation type if you know it, such as front yard or back yard.</p>
      ) : null}
      {(installTypes[service] ?? []).map((type) => {
        const checked = selected.includes(type);
        const areaKey = selectionKey(service, type);
        const showExpand =
          checked &&
          (needsAreaName || asksForArea(service, type) || (selected.length === 1 && hasSharedFollowUp));
        return (
          <div key={type} className="install-block">
            <label className="choice-card">
              <input
                type={allowsMultipleInstallTypes(service) ? "checkbox" : "radio"}
                name={allowsMultipleInstallTypes(service) ? undefined : `${service}-install-type`}
                checked={checked}
                onChange={() => toggleInstallType(type)}
              />
              <span className="choice-card__copy">
                <span>{choiceLabel(type)}</span>
                {installTypeDetail[type] ? (
                  <span className="choice-card__detail">{installTypeDetail[type]}</span>
                ) : null}
              </span>
            </label>
            {showExpand ? (
              <div className="service-expand">
                {needsAreaName ? (
                  <Field
                    id={fieldIdFor("area", areaKey)}
                    label="Which area is this, if you know it?"
                    placeholder="e.g. Front yard, backyard, side yard"
                    value={form.areaNames[areaKey] ?? ""}
                    error={problems[fieldIdFor("area", areaKey)]}
                    onChange={(value) => {
                      clearProblem(fieldIdFor("area", areaKey));
                      setForm((current) => ({
                        ...current,
                        areaNames: { ...current.areaNames, [areaKey]: value },
                      }));
                    }}
                  />
                ) : null}
                {asksForArea(service, type) ? (
                  <SquareFeetField
                    id={fieldIdFor("square-feet", service, type)}
                    value={form.squareFeet[type] ?? ""}
                    error={problems[fieldIdFor("square-feet", service, type)]}
                    onChange={(value) => {
                      clearProblem(fieldIdFor("square-feet", service, type));
                      setForm((current) => ({
                        ...current,
                        squareFeet: { ...current.squareFeet, [type]: value },
                      }));
                    }}
                  />
                ) : null}
                {selected.length === 1 && hasSharedFollowUp ? details : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {selected.length > 1 && hasSharedFollowUp ? <div className="service-expand">{details}</div> : null}
    </div>
    <AddOnAside
      service={service}
      addOns={addOns}
      form={form}
      setForm={setForm}
      problems={problems}
      clearProblem={clearProblem}
    />
    </>
  );
}

function GrassOption({
  name,
  checked,
  multiple = false,
  title,
  detail,
  icon: Icon,
  onChange,
}: {
  name?: string;
  checked: boolean;
  multiple?: boolean;
  title: string;
  detail: string;
  icon: LucideIcon;
  onChange: () => void;
}) {
  return (
    <label className={checked ? "grass-option is-on" : "grass-option"}>
      <input
        type={multiple ? "checkbox" : "radio"}
        name={multiple ? undefined : name}
        checked={checked}
        onChange={onChange}
      />
      <span
        className={multiple ? "grass-option__mark grass-option__mark--check" : "grass-option__mark"}
        aria-hidden="true"
      />
      <span className="grass-option__icon" aria-hidden="true">
        <Icon strokeWidth={1.75} />
      </span>
      <span className="grass-option__copy">
        <span className="grass-option__title">{title}</span>
        {detail !== "" ? <span className="grass-option__detail">{detail}</span> : null}
      </span>
    </label>
  );
}

function GrassFollowUp({
  form,
  setForm,
  problems,
  clearProblem,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  const service = grassService;
  const selected = (form.installTypes[service] ?? []).filter((type) => turfInstallTypes.includes(type));
  const installId = fieldIdFor("install", service);
  const workId = fieldIdFor("grass-work", service);
  const work = form.grassWork;

  function chooseWork(nextWork: DiscoveryState["grassWork"]) {
    clearProblem(workId);
    clearProblem(installId);
    setForm((current) => {
      const packages = (current.installTypes[service] ?? []).filter((type) =>
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
        installTypes: { ...current.installTypes, [service]: next },
      };
    });
  }

  function toggleInstallType(value: string) {
    clearProblem(installId);
    setForm((current) => {
      const currentTypes = (current.installTypes[service] ?? []).filter((type) =>
        turfInstallTypes.includes(type),
      );
      const next = currentTypes.includes(value)
        ? currentTypes.filter((item) => item !== value)
        : [...currentTypes, value];
      return { ...current, installTypes: { ...current.installTypes, [service]: next } };
    });
  }

  const replacementKey = selectionKey(service, "Artificial Grass Replacement");
  const replacementInstall = form.replacementInstall[replacementKey] ?? "";

  function jobAreaField(installType: string) {
    const jobKey =
      installType === "Artificial Grass Repair" ? selectionKey(service, installType) : grassJobAreaKey(installType);
    const id = fieldIdFor("square-feet", jobKey);
    return (
      <SquareFeetField
        id={id}
        value={form.squareFeet[jobKey] ?? ""}
        error={problems[id]}
        onChange={(value) => {
          clearProblem(id);
          setForm((current) => ({
            ...current,
            squareFeet: { ...current.squareFeet, [jobKey]: value },
          }));
        }}
      />
    );
  }

  const replacementId = fieldIdFor("replacement", replacementKey);

  return (
    <>
    <div className="grass-follow" id={workId}>
      <p className="grass-label" id={`${workId}-label`}>
        What do you need?
      </p>
      {problems[workId] ? (
        <p className="field-error" role="alert">
          {problems[workId]}
        </p>
      ) : null}
      <div
        className="grass-works"
        role="radiogroup"
        aria-labelledby={`${workId}-label`}
        aria-invalid={problems[workId] ? true : undefined}
      >
        {grassWorks.map((option) => {
          const meta = grassWorkMeta[option];
          return (
            <GrassOption
              key={option}
              name="artificial-grass-work"
              checked={work === option}
              title={option}
              detail={meta.detail}
              icon={meta.icon}
              onChange={() => chooseWork(option)}
            />
          );
        })}
      </div>
      {work === "Repair" ? (
        <div className="grass-body">
          {jobAreaField("Artificial Grass Repair")}
          <Notes
            id={`${service}-repair-notes`}
            value={form.notes["Artificial Grass Repair"] ?? ""}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                notes: { ...current.notes, "Artificial Grass Repair": value },
              }))
            }
          />
        </div>
      ) : null}
      {work === "Replacement" ? (
        <div className="grass-body">
          {jobAreaField("Artificial Grass Replacement")}
          <div className="grass-packages" id={replacementId}>
            <p className="grass-heading">New turf installation</p>
            {problems[replacementId] ? (
              <p className="field-error" role="alert">
                {problems[replacementId]}
              </p>
            ) : null}
            {turfInstallTypes.map((type) => {
              const meta = turfPackageMeta[type];
              return (
                <GrassOption
                  key={type}
                  name={`${replacementKey}-replacement-install`}
                  checked={replacementInstall === type}
                  title={choiceLabel(type)}
                  detail={meta?.detail ?? ""}
                  icon={meta?.icon ?? Sprout}
                  onChange={() => {
                    clearProblem(replacementId);
                    setForm((current) => ({
                      ...current,
                      replacementInstall: {
                        ...current.replacementInstall,
                        [replacementKey]: type,
                      },
                    }));
                  }}
                />
              );
            })}
          </div>
          {replacementInstall !== "" ? (
            <GrassScope
              form={form}
              setForm={setForm}
              scopeKey={replacementKey}
              productInstall={replacementInstall}
              problems={problems}
              clearProblem={clearProblem}
              sizeFirst
            />
          ) : null}
        </div>
      ) : null}
      {work === "Installation" ? (
        <div className="grass-body" id={installId}>
          <div className="grass-packages">
            <p className="grass-heading">Installation type</p>
            {problems[installId] ? (
              <p className="field-error" role="alert">
                {problems[installId]}
              </p>
            ) : null}
            {selected.length > 1 ? (
              <p className="muted grass-packages__note">
                Name the area for each installation type if you know it, such as front yard or back yard.
              </p>
            ) : null}
            {turfInstallTypes.map((installType) => {
              const meta = turfPackageMeta[installType];
              return (
                <GrassOption
                  key={installType}
                  multiple
                  checked={selected.includes(installType)}
                  title={choiceLabel(installType)}
                  detail={meta?.detail ?? ""}
                  icon={meta?.icon ?? Sprout}
                  onChange={() => toggleInstallType(installType)}
                />
              );
            })}
          </div>
          {selected.map((installType) => {
            const key = selectionKey(service, installType);
            return (
              <div key={installType} className="grass-scope">
                {selected.length > 1 ? <p className="grass-heading">{choiceLabel(installType)}</p> : null}
                {selected.length > 1 ? (
                  <Field
                    id={fieldIdFor("area", key)}
                    label="Which area is this, if you know it?"
                    placeholder="e.g. Front yard, backyard, side yard"
                    value={form.areaNames[key] ?? ""}
                    error={problems[fieldIdFor("area", key)]}
                    onChange={(value) => {
                      clearProblem(fieldIdFor("area", key));
                      setForm((current) => ({
                        ...current,
                        areaNames: { ...current.areaNames, [key]: value },
                      }));
                    }}
                  />
                ) : null}
                <GrassScope
                  form={form}
                  setForm={setForm}
                  scopeKey={key}
                  productInstall={installType}
                  problems={problems}
                  clearProblem={clearProblem}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
    <AddOnAside
      service={service}
      addOns={grassAddOnsFor(form)}
      form={form}
      setForm={setForm}
      problems={problems}
      clearProblem={clearProblem}
    />
    </>
  );
}

function grassAddOnsFor(form: DiscoveryState): string[] {
  if (form.grassWork === "Repair") return [];
  if (form.grassWork === "Replacement") {
    const type = form.replacementInstall[selectionKey(grassService, "Artificial Grass Replacement")] ?? "";
    return type === "" ? [] : addOnsFor(grassService, type);
  }
  if (form.grassWork !== "Installation") return [];
  return addOnsForSelected(
    grassService,
    (form.installTypes[grassService] ?? []).filter((type) => turfInstallTypes.includes(type)),
  );
}

function GrassScope({
  form,
  setForm,
  scopeKey,
  productInstall,
  problems,
  clearProblem,
  sizeFirst = false,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  scopeKey: string;
  productInstall: string;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
  sizeFirst?: boolean;
}) {
  const service = grassService;
  const products = productsFor(service, productInstall);
  const productId = fieldIdFor("product", scopeKey);
  const squareFeetId = fieldIdFor("square-feet", scopeKey);
  const linear = grassUsesLinearFeet(productInstall, form.product[scopeKey] ?? "");
  const size = (
    <SquareFeetField
      id={squareFeetId}
      unit={linear ? "lin ft" : "sq ft"}
      value={form.squareFeet[scopeKey] ?? ""}
      error={problems[squareFeetId]}
      onChange={(value) => {
        clearProblem(squareFeetId);
        setForm((current) => ({
          ...current,
          squareFeet: { ...current.squareFeet, [scopeKey]: value },
        }));
      }}
    />
  );
  return (
    <>
      {sizeFirst ? size : null}
      {products.length > 0 ? (
        <fieldset
          id={productId}
          className="grass-products"
          aria-invalid={problems[productId] ? true : undefined}
          aria-describedby={problems[productId] ? `${productId}-error` : undefined}
        >
          <legend>Turf product</legend>
          <p className="grass-products__hint">Select the turf product you&apos;re interested in.</p>
          {problems[productId] ? (
            <p id={`${productId}-error`} className="field-error" role="alert">
              {problems[productId]}
            </p>
          ) : null}
          <div className="grass-products__grid">
            {products.map((product) => {
              const checked = (form.product[scopeKey] ?? "") === product.name;
              return (
                <label key={product.name} className="grass-tile">
                  <input
                    type="radio"
                    name={`${scopeKey}-product`}
                    checked={checked}
                    onChange={() => {
                      clearProblem(productId);
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, [scopeKey]: product.name },
                      }));
                    }}
                  />
                  {productPhotos[product.name] ? (
                    <img src={productPhotos[product.name]} alt="" width={300} height={180} />
                  ) : (
                    <span className="grass-tile__fallback" aria-hidden="true" />
                  )}
                  <span className="grass-tile__check" aria-hidden="true">
                    <Check strokeWidth={2.5} />
                  </span>
                  <span className="grass-tile__caption">
                    {product.name}
                    {product.mark ? <span className="grass-tile__mark"> ({product.mark})</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {sizeFirst ? null : size}
    </>
  );
}

function AddOnAside({
  service,
  addOns,
  form,
  setForm,
  problems,
  clearProblem,
}: {
  service: string;
  addOns: string[];
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  if (addOns.length === 0) return null;
  return (
    <aside className="demo-addons" aria-label="Add-on">
      <div className="demo-addons__head">
        <span className="review-card__icon demo-addons__icon">
          <Box strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2>Add-on</h2>
          <p>Select any additional options for this installation type.</p>
        </div>
      </div>
      <AddOnList
        legend="Add-on"
        look="cards"
        addOns={addOns}
        selected={chosenAddOns(form, service)}
        quantities={form.addOnQuantity}
        problems={problems}
        quantityKey={(addOn) => `${service}::${addOn}`}
        onToggle={(addOn) =>
          setForm((current) => withAddOn(current, service, addOn, !chosenAddOns(current, service).includes(addOn)))
        }
        onQuantity={(addOn, value) => {
          clearProblem(fieldIdFor("qty", `${service}::${addOn}`));
          if (value.trim() !== "" && Number(value) === 0) {
            setForm((current) => withAddOn(current, service, addOn, false));
            return;
          }
          setForm((current) => ({
            ...current,
            addOnQuantity: { ...current.addOnQuantity, [`${service}::${addOn}`]: value },
          }));
        }}
      />
    </aside>
  );
}

function chosenAddOns(form: DiscoveryState, service: string): string[] {
  const chosen = [...(form.addOns[service] ?? [])];
  if (service !== grassService) return chosen;
  for (const [key, values] of Object.entries(form.addOns)) {
    if (!key.startsWith(`${grassService}::`)) continue;
    for (const addOn of values) {
      if (!chosen.includes(addOn)) chosen.push(addOn);
    }
  }
  return chosen;
}

function SquareFeetField({
  id,
  value,
  error,
  onChange,
  unit = "sq ft",
  stepped = false,
  unitChoice = false,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  unit?: "sq ft" | "lin ft";
  stepped?: boolean;
  unitChoice?: boolean;
}) {
  const linear = unit === "lin ft";
  const spoken = linear ? "linear feet" : "square feet";
  function step(direction: 1 | -1) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const next = base + direction * 50;
    onChange(next < 1 ? "" : String(next));
  }

  const errorId = `${id}-error`;
  return (
    <div
      className={
        error
          ? `form-field sqft-field${stepped ? " sqft-field--stepped" : ""} is-invalid`
          : `form-field sqft-field${stepped ? " sqft-field--stepped" : ""}`
      }
    >
      <label htmlFor={id}>
        {linear ? "Linear feet, if you know it" : "Square footage, if you know it"}
        <span className="visually-hidden"> in {spoken}</span>
      </label>
      <div className="sqft-field__row">
        <div className="sqft-field__control">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
          />
          <span className="sqft-field__spin">
            <button type="button" aria-label={`Add 50 ${spoken}`} onClick={() => step(1)}>
              <ChevronUp strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Subtract 50 ${spoken}`} onClick={() => step(-1)}>
              <ChevronDown strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        </div>
        {unitChoice ? (
          <select
            className="sqft-field__unit-select"
            aria-label="Measurement unit"
            value={unit}
            onChange={() => undefined}
          >
            <option value={unit}>{unit}</option>
          </select>
        ) : (
          <span className="sqft-field__unit">{unit}</span>
        )}
      </div>
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddOnList({
  legend = "Add-on",
  look = "rows",
  addOns,
  selected,
  quantities,
  problems,
  quantityKey,
  onToggle,
  onQuantity,
}: {
  legend?: string;
  look?: "rows" | "cards";
  addOns: string[];
  selected: string[];
  quantities: Record<string, string>;
  problems: Record<string, string>;
  quantityKey: (addOn: string) => string;
  onToggle: (addOn: string) => void;
  onQuantity: (addOn: string, value: string) => void;
}) {
  if (addOns.length === 0) return null;

  function toggle(addOn: string, key: string, on: boolean) {
    onToggle(addOn);
    if (!on && (quantities[key] ?? "") === "") onQuantity(addOn, "1");
  }

  if (look === "cards") {
    return (
      <div className="addon-cards" role="group" aria-label={legend}>
        {addOns.map((addOn) => {
          const on = selected.includes(addOn);
          const key = quantityKey(addOn);
          const quantityId = fieldIdFor("qty", key);
          const quantityError = problems[quantityId];
          const unit = unitForAddOn(addOn);
          return (
            <div key={addOn} className={on ? "addon-card is-on" : "addon-card"}>
              <label className="addon-card__choice">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(addOn, key, on)}
                />
                <span className="demo-mark" aria-hidden="true" />
                <span>{addOn}</span>
              </label>
              {on ? (
                <div className="addon-step">
                  <button
                    type="button"
                    aria-label={`Less ${addOn}`}
                    onClick={() => onQuantity(addOn, stepAddOnQuantity(quantities[key] ?? "", -1))}
                  >
                    −
                  </button>
                  <input
                    id={quantityId}
                    inputMode="decimal"
                    aria-label={`${addOn} quantity in ${unit}`}
                    aria-invalid={quantityError ? true : undefined}
                    aria-describedby={quantityError ? `${quantityId}-error` : undefined}
                    value={quantities[key] ?? ""}
                    onChange={(event) => onQuantity(addOn, decimalInput(event.target.value))}
                  />
                  <button
                    type="button"
                    aria-label={`More ${addOn}`}
                    onClick={() => onQuantity(addOn, stepAddOnQuantity(quantities[key] ?? "", 1))}
                  >
                    +
                  </button>
                  <span className="addon-step__unit">{unit}</span>
                </div>
              ) : null}
              {quantityError ? (
                <p id={`${quantityId}-error`} className="field-error">
                  {quantityError}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="addon-group">
      <p className="addon-group__title">{legend}</p>
      <div className="addon-list" role="group" aria-label={legend}>
        {addOns.map((addOn) => {
              const on = selected.includes(addOn);
              const key = quantityKey(addOn);
              const quantityId = fieldIdFor("qty", key);
              const quantityError = problems[quantityId];
              const unit = unitForAddOn(addOn);
              return (
                <div key={addOn} className={on ? "addon-row is-on" : "addon-row"}>
                  <label className="addon-row__choice">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(addOn, key, on)}
                    />
                    <span>{addOn}</span>
                  </label>
                  {on ? (
                    <div className="addon-qty">
                      <button
                        type="button"
                        aria-label={`Less ${addOn}`}
                        onClick={() => onQuantity(addOn, stepAddOnQuantity(quantities[key] ?? "", -1))}
                      >
                        −
                      </button>
                      <input
                        id={quantityId}
                        inputMode="decimal"
                        aria-label={`${addOn} quantity in ${unit}`}
                        aria-invalid={quantityError ? true : undefined}
                        aria-describedby={quantityError ? `${quantityId}-error` : undefined}
                        value={quantities[key] ?? ""}
                        onChange={(event) => onQuantity(addOn, decimalInput(event.target.value))}
                      />
                      <button
                        type="button"
                        aria-label={`More ${addOn}`}
                        onClick={() => onQuantity(addOn, stepAddOnQuantity(quantities[key] ?? "", 1))}
                      >
                        +
                      </button>
                      <span className="addon-qty__unit">{unit}</span>
                    </div>
                  ) : null}
                  {quantityError ? (
                    <p id={`${quantityId}-error`} className="field-error">
                      {quantityError}
                    </p>
                  ) : null}
                </div>
              );
        })}
      </div>
    </div>
  );
}

function stepAddOnQuantity(current: string, direction: 1 | -1): string {
  const parsed = Number(current);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const next = Math.round((base + direction) * 100) / 100;
  return next <= 0 ? "0" : String(next);
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
  id,
  legend,
  name,
  options,
  values,
  value = "",
  valuesSelected = [],
  multiple = false,
  look = "rows",
  images,
  error,
  onChange,
}: {
  id?: string;
  legend: string;
  name: string;
  options: string[];
  values?: string[];
  value?: string;
  valuesSelected?: string[];
  multiple?: boolean;
  look?: "rows" | "cards" | "segment" | "photos";
  images?: Record<string, string>;
  error?: string;
  onChange: (value: string) => void;
}) {
  const choices = options.map((option, index) => {
    const stored = values?.[index] ?? option;
    const checked = multiple ? valuesSelected.includes(stored) : value === stored;
    if (look === "photos") {
      return (
        <label key={stored} className={checked ? "product-photo is-selected" : "product-photo"}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={multiple ? undefined : name}
            checked={checked}
            onChange={() => onChange(stored)}
          />
          {images?.[stored] ? <img src={images[stored]} alt="" width={300} height={300} /> : null}
          <span>{option}</span>
        </label>
      );
    }
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

  const errorId = id ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className={look === "photos" ? "choice-list product-photos" : look === "cards" ? "choice-list product-choices" : "choice-list"}
    >
      <legend>{legend}</legend>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {look === "segment" ? <div className="segment">{choices}</div> : choices}
    </fieldset>
  );
}

function VisitStateField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const selected = canonicalState(value);
  return (
    <div className={error ? "form-field is-invalid" : "form-field"}>
      <label htmlFor="state">State</label>
      <select
        id="state"
        value={selected}
        autoComplete="address-level1"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "state-error" : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a state</option>
        {US_STATES.map((state) => (
          <option key={state.abbr} value={state.name}>
            {state.name}
          </option>
        ))}
      </select>
      {error ? (
        <p id="state-error" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
