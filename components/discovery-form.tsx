"use client";

import { useAction, useMutation } from "convex/react";
import { ArrowRight, Box, Check, ChevronDown, ChevronUp, Flag, Gem, Layers, Leaf, Lightbulb, type LucideIcon, PawPrint, RefreshCw, Ruler, Shovel, Sprout, Star, Waves, Wrench } from "lucide-react";
import RetryImage, { RetryNextImage } from "@/components/ui/retry-image";
import { useRouter, useSearchParams } from "next/navigation";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
  emptyDiscovery,
  fieldIdFor,
  grassJobAreaKey,
  grassService,
  grassWorks,
  hasFollowUp,
  installTypeDetail,
  lightingUnit,
  orderServices,
  installTypes,
  productsFor,
  selectionKey,
  serviceLabel,
  services,
  soilConditions,
  soilDetail,
  turfInstallTypes,
  withAddOn,
} from "@/lib/discovery";
import { ConfirmationPage } from "@/components/confirmation-page";
import { IntakeFrame, PropertyStep } from "@/components/intake-property";
import { AreaPlanner } from "@/components/area-planner";
import ServiceBoard from "@/components/service-board";
import { InstallCard } from "@/components/ui/install-card";
import { RequiredStar } from "@/components/ui/fields";
import { TextField, type TextFieldProps } from "@/components/ui/fields";
import {
  clearDiscoveryDraft,
  readDiscoveryDraft,
  writeDiscoveryDraft,
  type DiscoveryStep,
} from "@/lib/discovery-draft";
import { friendlyError } from "@/lib/errors";
import { scrollToStart, transitionStep } from "@/lib/step-transition";
import { blockEnterSubmit, toggleRadio } from "@/components/ui/inputs";

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
  "Turf Strip": { detail: "A strip of turf along an edge.", icon: Ruler },
};

function productSrc(file: string) {
  return `/images/products/${encodeURIComponent(file)}`;
}

const productPhotos: Record<string, string> = {
  "Players Choice": productSrc("Players Choice.webp"),
  "Olive Natural": productSrc("Olive Natural.webp"),
  "Cali's Finest Light": productSrc("Cali_s Finest Light.webp"),
  Hollywood: productSrc("Hollywood.webp"),
  "Spring Natural": productSrc("Spring Natural.webp"),
  "La Jolla Lush": productSrc("La Jolla Lush.webp"),
  Pasadena: productSrc("Pasadena.webp"),
  "Cali's Finest": productSrc("Calis Finest.webp"),
  "Hollywood Lush": productSrc("Hollywood Lush.webp"),
  "Central Park": productSrc("Central Park.webp"),
  Wimbledon: productSrc("Wimbledon.webp"),
  Malibu: productSrc("Malibu.webp"),
  "Big Sur": productSrc("Big Sur.webp"),
  Monterey: productSrc("Monterey.webp"),
  "Sol Natural": productSrc("Sol Natural.webp"),
  Brentwood: productSrc("Brentwood.webp"),
  Newport: productSrc("Newport.webp"),
  "Pets Choice": productSrc("Pets Choice.webp"),
  "Kennels Best": productSrc("Kennels Best.webp"),
  Fringe: productSrc("Fringe.webp"),
  "Kids Play": productSrc("Kids Play.webp"),
  "Champions Choice": productSrc("Champions Choice.webp"),
  "Pro Putter": productSrc("Pro Putter.webp"),
  "Poa Annua Natural": productSrc("POA Annua Natural.webp"),
  "Poa Annua Max": productSrc("POA Annua Max.webp"),
};

export function DiscoveryForm() {
  const createProject = useMutation(api.projects.mutations.create);
  const publishVisit = useAction(api.projects.actions.publishVisit);
  const [form, setForm] = useState<DiscoveryState>(emptyDiscovery);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const focusFirstError = useRef(false);
  const [pending, setPending] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStep = stepFromParam(searchParams.get("step"));
  const [step, setStep] = useState<DiscoveryStep>("property");
  const [hydrated, setHydrated] = useState(false);
  const stepRef = useRef(step);
  const trail = useRef<DiscoveryStep[]>(["property"]);
  const pendingStep = useRef<DiscoveryStep | null>(null);
  const restoredDraft = useRef(false);
  const createdId = useRef<Id<"projects"> | null>(null);
  useLayoutEffect(() => {
    stepRef.current = step;
  });

  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (restoredDraft.current) return;
    restoredDraft.current = true;
    const saved = readDiscoveryDraft();
    const next = searchParams.has("step") ? urlStep : (saved?.step ?? "property");
    // Restoring the saved draft can only happen after mount (localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setForm(saved.form);
    trail.current = [next];
    setStep(next);
    if ((!searchParams.has("step") && next !== "property") || searchParams.get("step") === "details") {
      pendingStep.current = next;
      router.replace(stepHref(next), { scroll: false });
    }
    setHydrated(true);
  }, [router, searchParams, urlStep]);

  useEffect(() => {
    if (!hydrated) return;
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
    transitionStep(stepRef.current, urlStep, () => {
      setError(null);
      setStep(urlStep);
      if (!focusFirstError.current) scrollToStart();
    });
  }, [hydrated, urlStep]);

  useEffect(() => {
    if (!hydrated) return;
    if (projectId !== null) {
      clearDiscoveryDraft();
      return;
    }
    const timer = window.setTimeout(() => writeDiscoveryDraft({ step, form }), 300);
    return () => window.clearTimeout(timer);
  }, [hydrated, projectId, step, form]);

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
      router.push(stepHref(next), { scroll: false });
    }
    transitionStep(step, next, () => {
      setError(null);
      setStep(next);
      scrollToStart();
    });
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
    if (found >= 0) {
      pendingStep.current = next;
      trail.current = trailNow.slice(0, found + 1);
      window.history.go(-(trailNow.length - 1 - found));
    } else {
      pendingStep.current = next;
      trail.current = [...trailNow, next];
      router.push(stepHref(next), { scroll: false });
    }
    transitionStep(step, next, () => {
      setError(null);
      setStep(next);
      if (!focusFirstError.current) scrollToStart();
    });
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
        // Option groups (cards, radios) aren't focusable themselves: move to their first control.
        const control = focusable
          ? field
          : field.querySelector<HTMLElement>("input, select, textarea, button");
        control?.focus({ preventScroll: true });
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
    if (pending) return;
    if (step === "property") {
      continueFromProperty();
      return;
    }
    if (step === "services") {
      if (form.services.length === 0 || form.services.some((service) => hasFollowUp(service))) {
        continueFromServices();
        return;
      }
    }
    const problems = contactProblems(form);
    const contactMessage = Object.values(problems)[0] ?? null;
    if (contactMessage !== null) {
      showProblems(problems, contactMessage);
      retreatTo("property");
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
    setError(null);
    setPending(true);
    try {
      // A retry after a failed publish reuses the project instead of saving a second copy.
      const id = createdId.current ?? (await createProject(built.payload));
      createdId.current = id;
      await publishVisit({ projectId: id });
      transitionStep(stepRef.current, "confirmation", () => {
        setProjectId(id);
        scrollToStart();
      });
    
    } catch (submitError) {
      setError(
        friendlyError(submitError, "The request could not be saved. Check your connection and try again."),
      );
    } finally {
      setPending(false);
    }
  }

  if (!hydrated) {
    return (
      <IntakeFrame step="property">
        <p className="intake-loading">Loading your request.</p>
      </IntakeFrame>
    );
  }

  if (projectId !== null) {
    return (
      <IntakeFrame step="confirmation">
        <ConfirmationPage />
      </IntakeFrame>
    );
  }

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
            <p className="services-copy__sub">Choose one or more.<RequiredStar /></p>
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
                label: serviceLabel(service),
                selected: form.services.includes(service),
                includes: installTypes[service],
              }))}
              onToggle={(index) => toggleService(services[index])}
            />
          </div>
          <div className="services-dock">
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
          </div>
        </form>
      ) : (
      <form className="review-page" onSubmit={onSubmit} onKeyDown={blockEnterSubmit} noValidate>
        {step === "details" ? (
          <div className="review-stage">
            <div className="review-intro">
              <h1>A few questions</h1>
              <p>
                You chose <ServiceNames names={orderServices(form.services)} />.
                <br />
                If you do not know a measurement, you can still send this in.
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
            <RetryNextImage
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

function choiceLabel(value: string) {
  return value;
}

function Field(props: Omit<TextFieldProps, "variant">) {
  return <TextField variant="form" {...props} />;
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
            <span className="demo-panel__kind">Installation type<RequiredStar /></span>
          </span>
        </h2>
        <div className="demo-types" id={installId}>
          {problems[installId] ? (
            <p className="field-error" role="alert">
              {problems[installId]}
            </p>
          ) : null}
          {(installTypes[service] ?? []).map((type) => {
            const checked = selected.includes(type);
            const areaKey = selectionKey(service, type);
            const panelId = `${fieldIdFor("install", service, type)}-panel`;
            return (
              <InstallCard
                key={type}
                title={choiceLabel(type)}
                detail={installTypeDetail[type]}
                checked={checked}
                expanded={!folded[type]}
                panelId={panelId}
                onSelect={() => toggleInstallType(type)}
                onFold={() => setFolded((current) => ({ ...current, [type]: !current[type] }))}
              >
                <AreaPlanner
                  areaKey={areaKey}
                  areas={form.areas[areaKey] ?? []}
                  problems={problems}
                  clearProblem={clearProblem}
                  onChange={(next) => setForm((current) => ({ ...current, areas: { ...current.areas, [areaKey]: next } }))}
                />
              </InstallCard>
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
    value: "Entertainment Putting Green",
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
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const selected = form.installTypes[service] ?? [];
  const installType = selected[0] ?? "";
  const products = productsFor(service, installType);
  const addOns = addOnsForSelected(service, selected);
  const installId = fieldIdFor("install", service);
  function chooseType(value: string) {
    clearProblem(installId);
    if (value === "") {
      setForm((current) => ({
        ...current,
        installTypes: { ...current.installTypes, [service]: [] },
      }));
      return;
    }
    setForm((current) => {
      const previous = (current.installTypes[service] ?? [])[0] ?? "";
      const carried =
        (previous !== "" ? current.squareFeet[previous] : "") ||
        current.squareFeet[value] ||
        current.squareFeet["Entertainment Putting Green"] ||
        current.squareFeet["PGA Putting Green"] ||
        "";
      const newKey = selectionKey(service, value);
      const carriedAreas =
        (current.areas[newKey] ?? []).length === 0 && previous !== ""
          ? (current.areas[selectionKey(service, previous)] ?? [])
          : [];
      return {
        ...current,
        installTypes: { ...current.installTypes, [service]: [value] },
        areas: carriedAreas.length > 0 ? { ...current.areas, [newKey]: carriedAreas } : current.areas,
        squareFeet:
          carried === "" ? current.squareFeet : { ...current.squareFeet, [value]: carried },
      };
    });
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
          <span className="demo-panel__kind">Installation type<RequiredStar /></span>
        </span>
      </h2>
      <div className="demo-types" id={installId} role="radiogroup" aria-labelledby="putting-green-heading">
        <p className="putting-lead">Select the type of putting green you&apos;re interested in.</p>
        {problems[installId] ? (
          <p className="field-error" role="alert">
            {problems[installId]}
          </p>
        ) : null}
        {puttingOptions.map((option) => {
          const checked = installType === option.value;
          const areaKey = selectionKey(service, option.value);
          return (
            <InstallCard
              key={option.value}
              single
              name="putting-green-install"
              title={option.label}
              detail={option.detail}
              checked={checked}
              expanded={!folded[option.value]}
              panelId={`${fieldIdFor("install", service, option.value)}-panel`}
              onSelect={() => {
                setFolded((current) => ({ ...current, [option.value]: false }));
                chooseType(checked ? "" : option.value);
              }}
              onFold={() => setFolded((current) => ({ ...current, [option.value]: !current[option.value] }))}
            >
              {products.length > 0 ? (
                <ChoiceGroup
                  id={fieldIdFor("product", service)}
                  legend="Product"
                  required
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
              <AreaPlanner
                  areaKey={areaKey}
                  areas={form.areas[areaKey] ?? []}
                  problems={problems}
                  clearProblem={clearProblem}
                  onChange={(next) => setForm((current) => ({ ...current, areas: { ...current.areas, [areaKey]: next } }))}
                />
            </InstallCard>
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
  const needsAreaName = selected.length > 0;
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
            <span className="demo-panel__kind">Installation type<RequiredStar /></span>
          </span>
        </h2>
        <div className="demo-types" id={installId}>
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
                          <legend>What is the soil like?<RequiredStar /></legend>
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
                                onClick={() => {
                                  if (form.soil !== soil) return;
                                  clearProblem("underground-soil");
                                  setForm((current) => ({ ...current, soil: "" }));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== " " || form.soil !== soil) return;
                                  event.preventDefault();
                                  clearProblem("underground-soil");
                                  setForm((current) => ({ ...current, soil: "" }));
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
          Name the area for each installation type, and enter a quantity if you know it.
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
                  <div className="demo-type__fields">
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
                    <SquareFeetField
                      id={fieldIdFor("qty", areaKey)}
                      unit={lightingUnit(type)}
                      value={form.lightingQuantity[areaKey] ?? ""}
                      error={problems[fieldIdFor("qty", areaKey)]}
                      onChange={(value) => {
                        clearProblem(fieldIdFor("qty", areaKey));
                        setForm((current) => ({
                          ...current,
                          lightingQuantity: { ...current.lightingQuantity, [areaKey]: value },
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
              required
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
                required
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

  const needsAreaName = selected.length > 0;

  return (
    <>
    <div className="service-list" id={installId}>
      <span className="expand-label">Installation type<RequiredStar /></span>
      {problems[installId] ? (
        <p className="field-error" role="alert">
          {problems[installId]}
        </p>
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
                    placeholder="e.g. Front yard"
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
                    dims={sizeDims(form, setForm, type)}
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
        {...(multiple ? { checked, onChange } : toggleRadio(checked, onChange, onChange))}
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
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  function chooseWork(nextWork: DiscoveryState["grassWork"] | "") {
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
            : nextWork === ""
              ? []
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
    setFolded((current) => ({ ...current, [value]: false }));
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
        dims={sizeDims(form, setForm, jobKey)}
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
        What do you need?<RequiredStar />
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
              onChange={() => chooseWork(work === option ? "" : option)}
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
          <div className="demo-types" id={replacementId}>
            <p className="grass-heading">New turf installation<RequiredStar /></p>
            {problems[replacementId] ? (
              <p className="field-error" role="alert">
                {problems[replacementId]}
              </p>
            ) : null}
            {turfInstallTypes.map((type) => {
              const meta = turfPackageMeta[type];
              const chosen = replacementInstall === type;
              return (
                <InstallCard
                  key={type}
                  single
                  name={`${replacementKey}-replacement-install`}
                  title={choiceLabel(type)}
                  detail={meta?.detail}
                  checked={chosen}
                  expanded={!folded[`replacement-${type}`]}
                  panelId={`${fieldIdFor("replacement", type)}-panel`}
                  onSelect={() => {
                    clearProblem(replacementId);
                    setFolded((current) => ({ ...current, [`replacement-${type}`]: false }));
                    setForm((current) => ({
                      ...current,
                      replacementInstall: {
                        ...current.replacementInstall,
                        [replacementKey]: chosen ? "" : type,
                      },
                    }));
                  }}
                  onFold={() =>
                    setFolded((current) => ({
                      ...current,
                      [`replacement-${type}`]: !current[`replacement-${type}`],
                    }))
                  }
                >
                  <GrassScope
                    form={form}
                    setForm={setForm}
                    scopeKey={replacementKey}
                    productInstall={type}
                    problems={problems}
                    clearProblem={clearProblem}
                    sizeFirst
                  />
                </InstallCard>
              );
            })}
          </div>
        </div>
      ) : null}
      {work === "Installation" ? (
        <div className="grass-body" id={installId}>
          <div className="demo-types">
            <p className="grass-heading">Installation type<RequiredStar /></p>
            {problems[installId] ? (
              <p className="field-error" role="alert">
                {problems[installId]}
              </p>
            ) : null}
            {turfInstallTypes.map((installType) => {
              const meta = turfPackageMeta[installType];
              const key = selectionKey(service, installType);
              return (
                <InstallCard
                  key={installType}
                  title={choiceLabel(installType)}
                  detail={meta?.detail}
                  checked={selected.includes(installType)}
                  expanded={!folded[installType]}
                  panelId={`${fieldIdFor("install", service, installType)}-panel`}
                  onSelect={() => toggleInstallType(installType)}
                  onFold={() => setFolded((current) => ({ ...current, [installType]: !current[installType] }))}
                >
                  <GrassScope
                    form={form}
                    setForm={setForm}
                    scopeKey={key}
                    productInstall={installType}
                    problems={problems}
                    clearProblem={clearProblem}
                    listAreas
                  />
                </InstallCard>
              );
            })}
          </div>
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
  listAreas = false,
}: {
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  scopeKey: string;
  productInstall: string;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
  sizeFirst?: boolean;
  /** List the yards (each with sections) instead of a single size. */
  listAreas?: boolean;
}) {
  const service = grassService;
  const products = productsFor(service, productInstall);
  const productId = fieldIdFor("product", scopeKey);
  const squareFeetId = fieldIdFor("square-feet", scopeKey);
  const linear = grassUsesLinearFeet(productInstall, form.product[scopeKey] ?? "");
  const size = (
    <SquareFeetField
      dims={linear ? undefined : sizeDims(form, setForm, scopeKey)}
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
      {sizeFirst && !listAreas ? size : null}
      {products.length > 0 ? (
        <fieldset
          id={productId}
          className="grass-products"
          aria-invalid={problems[productId] ? true : undefined}
          aria-describedby={problems[productId] ? `${productId}-error` : undefined}
        >
          <legend>Turf product<RequiredStar /></legend>
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
                        product: { ...current.product, [scopeKey]: checked ? "" : product.name },
                      }));
                    }}
                    onClick={() => {
                      if (!checked) return;
                      clearProblem(productId);
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, [scopeKey]: "" },
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== " " || !checked) return;
                      event.preventDefault();
                      clearProblem(productId);
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, [scopeKey]: "" },
                      }));
                    }}
                  />
                  {productPhotos[product.name] ? (
                    <RetryImage src={productPhotos[product.name]} alt="" width={300} height={180} />
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
      {listAreas ? (
        <AreaPlanner
          areaKey={scopeKey}
          areas={form.areas[scopeKey] ?? []}
          linear={linear}
          problems={problems}
          clearProblem={clearProblem}
          onChange={(next) =>
            setForm((current) => ({ ...current, areas: { ...current.areas, [scopeKey]: next } }))
          }
        />
      ) : sizeFirst ? null : (
        size
      )}
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
    <aside className="demo-addons" aria-label={`Add-ons for ${serviceLabel(service)}`}>
      <div className="demo-addons__drawer">
      <div className="demo-addons__head">
        <span className="review-card__icon demo-addons__icon">
          <Box strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2>Add-ons</h2>
          <p>Optional extras you can add to this installation.</p>
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
      </div>
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

type SizeDims = {
  length: string;
  width: string;
  onChange: (length: string, width: string) => void;
};

/** Length and width for a size field, kept in the form under the same key as its area. */
function sizeDims(
  form: DiscoveryState,
  setForm: Dispatch<SetStateAction<DiscoveryState>>,
  key: string,
): SizeDims {
  return {
    length: form.length[key] ?? "",
    width: form.width[key] ?? "",
    onChange: (length, width) =>
      setForm((current) => ({
        ...current,
        length: { ...current.length, [key]: length },
        width: { ...current.width, [key]: width },
      })),
  };
}

function decimalText(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  return (dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replaceAll(".", "")).slice(0, 8);
}

function SquareFeetField({
  id,
  value,
  error,
  onChange,
  unit = "sq ft",
  stepped = false,
  dims,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  unit?: "sq ft" | "lin ft" | "each";
  stepped?: boolean;
  /** Lets the customer type length and width; the area is worked out from them. */
  dims?: SizeDims;
}) {
  const linear = unit === "lin ft";
  const each = unit === "each";
  const area = (length: string, width: string) =>
    Number(length) > 0 && Number(width) > 0 ? Math.round(Number(length) * Number(width)) : null;
  const worked = dims === undefined || linear || each ? null : area(dims.length, dims.width);
  function setDims(length: string, width: string) {
    if (dims === undefined) return;
    dims.onChange(length, width);
    const next = area(length, width);
    // Once the dimensions stop making an area, drop the figure they had produced.
    onChange(next !== null ? String(next) : worked !== null ? "" : value);
  }
  const spoken = linear ? "linear feet" : each ? "each" : "square feet";
  const stepAmount = each ? 1 : 50;
  function step(direction: 1 | -1) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const next = base + direction * stepAmount;
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
      {dims !== undefined && !linear && !each ? (
        <div className="sqft-dims">
          <label htmlFor={`${id}-length`}>
            <span>Length (ft)</span>
            <input
              id={`${id}-length`}
              inputMode="decimal"
              placeholder="e.g. 20"
              autoComplete="off"
              value={dims.length}
              onChange={(event) => setDims(decimalText(event.target.value), dims.width)}
            />
          </label>
          <label htmlFor={`${id}-width`}>
            <span>Width (ft)</span>
            <input
              id={`${id}-width`}
              inputMode="decimal"
              placeholder="e.g. 25"
              autoComplete="off"
              value={dims.width}
              onChange={(event) => setDims(dims.length, decimalText(event.target.value))}
            />
          </label>
        </div>
      ) : null}
      <label htmlFor={id}>
        {each ? "Quantity, if you know it" : linear ? "Linear feet, if you know it" : "Square footage, if you know it"}
        <span className="visually-hidden"> in {spoken}</span>
      </label>
      <div className="sqft-field__row">
        <div className="sqft-field__control">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            placeholder={each ? "e.g. 10" : linear ? "e.g. 120" : worked !== null ? "" : "e.g. 500"}
            autoComplete="off"
            readOnly={worked !== null}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
          />
          <span className="sqft-field__spin" hidden={worked !== null}>
            <button type="button" aria-label={`Add ${stepAmount} ${spoken}`} onClick={() => step(1)}>
              <ChevronUp strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Subtract ${stepAmount} ${spoken}`} onClick={() => step(-1)}>
              <ChevronDown strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        </div>
        <span className="sqft-field__unit">{unit}</span>
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
        placeholder="Anything we should know, like access, slope, drainage or damage"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ChoiceGroup({
  id,
  legend,
  required = false,
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
  required?: boolean;
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
            {...(multiple
              ? { checked, onChange: () => onChange(stored) }
              : toggleRadio(checked, () => onChange(stored), () => onChange("")))}
          />
          {images?.[stored] ? (
            <RetryImage src={images[stored]} alt="" width={300} height={300} />
          ) : (
            <span className="product-photo__fallback" aria-hidden="true" />
          )}
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
          {...(multiple
            ? { checked, onChange: () => onChange(stored) }
            : toggleRadio(checked, () => onChange(stored), () => onChange("")))}
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
      <legend>
        {legend}
        {required ? <RequiredStar /> : null}
      </legend>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {look === "segment" ? <div className="segment">{choices}</div> : choices}
    </fieldset>
  );
}
