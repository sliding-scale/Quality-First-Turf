"use client";

import { useAction, useMutation } from "convex/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Flag,
  Home,
  Lightbulb,
  Pencil,
  Plus,
  Shovel,
  Sprout,
  Trash2,
  TriangleAlert,
  UserRound,
  Waves,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import RetryImage from "@/components/ui/retry-image";
import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  addOnsForSelected,
  allowsMultipleInstallTypes,
  areaFromName,
  asksForNotes,
  buildDiscovery,
  contactProblems,
  type SavedProject,
  decimalInput,
  fieldIdFor,
  grassService,
  grassWorks,
  grassUsesLinearFeet,
  hasFollowUp,
  installTypeDetail,
  installTypes,
  lightingUnit,
  orderServices,
  productsFor,
  projectToForm,
  selectionKey,
  serviceLabel,
  services,
  soilConditions,
  turfInstallTypes,
  unitForAddOn,
  usesAreaList,
  withAddOn,
  type DiscoveryState,
} from "@/lib/discovery";
import { contactFields, CustomerSaid, RequiredStar, TextField, type TextFieldProps } from "@/components/ui/fields";
import { ConsultationButton, type Consultation } from "@/components/consultation-button";
import { formatShortCode, friendlyError } from "@/lib/errors";
import { scrollToStart } from "@/lib/step-transition";
import { parseWorkAreas } from "@/components/work-areas";
import {
  areasForService,
  asWorkAreaDrafts,
  emptyServiceArea,
  estimatesFor,
  formatEstimates,
  areaDisplayName,
  isDefaultAreaName,
  labelsForService,
  matchOriginalArea,
  measuredSquareFeet,
  seedVisitAreas,
  serviceNeedsAreas,
  sitePhotosArea,
  type CustomerMeasurement,
  type VisitArea,
  type VisitWorkArea,
} from "@/lib/visit-areas";
import { blockEnterSubmit, PhotoPicker, toggleRadio } from "@/components/ui/inputs";
import { compareSnapshots, storedChanges, type Snapshot } from "@/lib/project-changes";
import { checkVisit, lightingProblems } from "@/lib/visit-check";

const serviceIcons: Record<string, LucideIcon> = {
  Demo: Shovel,
  [grassService]: Sprout,
  "Putting Green": Flag,
  Underground: Waves,
  "Low Voltage Lighting": Lightbulb,
};

/** The name an area gets when nobody typed one: its installation type, so saved areas still match their service. */
function defaultAreaName(area: VisitArea, service: string) {
  return area.installType !== "" ? area.installType : `${serviceLabel(service)} area`;
}

/** The customer's submission, available to every field so it can show what they originally said. */
type OriginalState = { form: DiscoveryState; areas: VisitArea[] };
const OriginalContext = createContext<OriginalState | null>(null);
function useOriginal() {
  return useContext(OriginalContext);
}

function originalAreaFor(area: VisitArea, order: number, original: OriginalState | null): VisitArea | undefined {
  return original === null ? undefined : matchOriginalArea(area, order, original.areas);
}

/**
 * Length, width and the area they make. Typing both works the area out; with one missing
 * the area can be typed directly, so a known size never has to be measured twice.
 */
function SizeFields({
  id,
  length,
  width,
  area,
  areaLabel = "Area (sq ft)",
  error,
  customerValue,
  onRevert,
  onChange,
}: {
  id: string;
  length: string;
  width: string;
  area: string;
  areaLabel?: string;
  error?: string;
  customerValue?: string;
  onRevert?: () => void;
  onChange: (next: { length: string; width: string; area: string }) => void;
}) {
  const product = (l: string, w: string) => (Number(l) > 0 && Number(w) > 0 ? Number(l) * Number(w) : null);
  const worked = product(length, width);
  function setDims(nextLength: string, nextWidth: string) {
    const next = product(nextLength, nextWidth);
    onChange({
      length: nextLength,
      width: nextWidth,
      // Once the dimensions stop making an area, drop the figure they had produced.
      area: next !== null ? String(Math.round(next * 100) / 100) : worked !== null ? "" : area,
    });
  }
  return (
    <div className="visit-size">
      <VisitField
        id={`${id}-length`}
        label="Length (ft)"
        numeric
        stepper={1}
        placeholder="e.g. 20"
        value={length}
        onChange={(value) => setDims(decimalInput(value), width)}
      />
      <VisitField
        id={`${id}-width`}
        label="Width (ft)"
        numeric
        stepper={1}
        placeholder="e.g. 25"
        value={width}
        onChange={(value) => setDims(length, decimalInput(value))}
      />
      <VisitField
        id={id}
        label={areaLabel}
        required
        numeric
        readOnly={worked !== null}
        stepper={worked !== null ? undefined : 50}
        placeholder="or type the area"
        value={area}
        error={error}
        customerValue={customerValue}
        onRevert={onRevert}
        inputMode="decimal"
        onChange={(value) => onChange({ length, width, area: decimalInput(value) })}
      />
    </div>
  );
}

function choiceLabel(value: string) {
  return value;
}

export function OnSiteVisit({
  projectId,
  sessionToken,
  canSchedule,
  project,
  workAreas,
  revisions,
}: {
  projectId: Id<"projects">;
  sessionToken: string;
  canSchedule: boolean;
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
    shortCode?: string;
    submitted?: SavedProject;
    consultation?: Consultation;
  };
  workAreas: VisitWorkArea[];
  revisions: { savedAt: number; changes: { label: string; before: string; after: string }[] }[];
}) {
  const updateProject = useMutation(api.projects.mutations.update);
  const generateUploadUrl = useMutation(api.projects.mutations.generateUploadUrl);
  const draftVisit = useAction(api.projects.actions.draftVisit);
  const loaded = useMemo(() => projectToForm(project), [project]);
  // The customer's own submission, rebuilt in the same shape as the form so the two can be compared.
  const original = useMemo(() => {
    if (project.submitted === undefined) return null;
    const originalForm = projectToForm(project.submitted).form;
    return {
      form: originalForm,
      areas: seedVisitAreas([], project.submitted.measurements, originalForm),
    };
  }, [project.submitted]);
  // "Not sure" is only for customers; on site the salesperson has to look and choose.
  const [form, setForm] = useState<DiscoveryState>(() => ({
    ...loaded.form,
    soil: loaded.form.soil === "Not sure" ? "" : loaded.form.soil,
  }));
  const [initialAreas] = useState<VisitArea[]>(() => seedVisitAreas(workAreas, project.measurements, loaded.form));
  const [areas, setAreas] = useState<VisitArea[]>(initialAreas);
  const [visitNote, setVisitNote] = useState(loaded.visitNote);
  const baseline = useRef<Snapshot | null>(null);
  const [editingProperty, setEditingProperty] = useState(false);
  const [openServices, setOpenServices] = useState<string[]>([]);
  const [addingService, setAddingService] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const changes = useMemo(
    () => (original === null ? [] : compareSnapshots(original, { form, areas, visitNote })),
    [original, form, areas, visitNote],
  );
  const changeCount = (group: string) => changes.filter((change) => change.group === group).length;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const [done, setDone] = useState<{ message: string; ready: boolean } | null>(null);
  const focusFirstError = useRef(false);
  const estimates = project.measurements;

  function patch(partial: Partial<DiscoveryState>) {
    setDirty(true);
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
    // An error inside a collapsed service would be invisible, so open them all.
    if (Object.keys(problems).length > 0) setOpenServices([...form.services]);
  }

  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const firstId = Object.keys(fieldErrors)[0];
    const field = firstId
      ? (document.getElementById(firstId) ?? document.querySelector<HTMLElement>(`[data-field="${firstId}"]`))
      : null;
    if (field) {
      const control = field.matches("input, select, textarea, button")
        ? field
        : field.querySelector<HTMLElement>("input, select, textarea, button");
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      control?.focus({ preventScroll: true });
      return;
    }
    document.querySelector(".visit-alert")?.scrollIntoView({ block: "center" });
  }, [error, fieldErrors]);

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
    setAreas((current) => [...current, emptyServiceArea(service, current)]);
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
      return [...current, emptyServiceArea(service, current)];
    });
    setOpenServices((current) =>
      current.includes(service) ? current.filter((item) => item !== service) : [...current, service],
    );
    setAddingService(false);
    clearProblem("services");
  }

  function chooseGrassWork(nextWork: DiscoveryState["grassWork"] | "") {
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
            : nextWork === ""
              ? []
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
        if (nextWork === "") return { ...area, installType: "" };
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
      previews.current.push(preview);
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
      showProblems(problems, contactMessage);
      return false;
    }
    // Area names and types live on the area cards; copy them into the answers before checking.
    const synced = [...new Set(areas.filter((area) => area.installType !== "").map((area) => area.service))].reduce(
      (state, service) => syncServiceFromAreas(state, service, areas),
      form,
    );
    const built = buildDiscovery(synced);
    if (built.error !== null || built.payload === null) {
      showProblems(
        built.fieldId !== null && built.error !== null ? { [built.fieldId]: built.error } : {},
        built.error,
      );
      return false;
    }
    const parsedAreas = parseWorkAreas(asWorkAreaDrafts(areas));
    if (parsedAreas.error !== null || parsedAreas.workAreas === null) {
      showProblems(
        parsedAreas.fieldId !== null && parsedAreas.error !== null
          ? { [parsedAreas.fieldId]: parsedAreas.error }
          : {},
        parsedAreas.error,
      );
      return false;
    }
    // Lighting items need a quantity or length from the salesperson before anything is saved.
    const lighting = lightingProblems(synced);
    if (Object.keys(lighting).length > 0) {
      showProblems(lighting, "Fill in the highlighted fields, then save again.");
      return false;
    }
    // Stop here, with the problems marked on their fields, rather than saving an incomplete draft.
    const check = checkVisit({
      services: built.payload.services,
      products: built.payload.products,
      answers: built.payload.answers,
      measurements: project.measurements,
      workAreas: parsedAreas.workAreas,
      areas,
    });
    if (Object.keys(check.problems).length > 0 || check.general !== null) {
      if (check.problems.customerType !== undefined) setEditingProperty(true);
      showProblems(check.problems, check.general ?? "Fix the highlighted fields, then save again.");
      return false;
    }
    setForm(synced);
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      const { measurements: _customerArea, ...scope } = built.payload;
      const note = [scope.notes, visitNote.trim()].filter((line) => line !== "").join("\n");
      // Record only what changed since the last save, so the history reads as a timeline.
      const previous = baseline.current ?? { form: loaded.form, areas: initialAreas, visitNote: loaded.visitNote };
      const sinceLastSave = compareSnapshots(previous, { form, areas, visitNote });
      await updateProject({
        sessionToken,
        projectId,
        ...scope,
        notes: note,
        status: "on-site saved",
        workAreas: parsedAreas.workAreas,
        changes: storedChanges(sinceLastSave),
        requireComplete: true,
      });
      baseline.current = { form, areas, visitNote };
      setDirty(false);
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
        scrollToStart();
      } else {
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      }
      return true;
    } catch (submitError) {
      setError(
        friendlyError(submitError, "The visit could not be saved. Check your connection and try again."),
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist("quote");
  }

  if (done !== null) {
    return (
      <VisitFrame>
        <div className="visit-done">
          <span
            className={done.ready ? "confirmation-hero__mark visit-done__mark" : "visit-done__mark visit-done__mark--warn"}
            aria-hidden="true"
          >
            {done.ready ? <Check strokeWidth={2.4} /> : <TriangleAlert strokeWidth={2} />}
          </span>
          <h1>Visit saved</h1>
          <p>The measured areas and photos are on this project. The customer&apos;s original sizes are still there for the office to see.</p>
          <p className={done.ready ? "visit-done__ok" : "visit-alert"} role={done.ready ? undefined : "alert"}>
            {done.message}
          </p>
          <div className="visit-done__actions">
            <Link className="visit-primary" href="/visit">
              Back to projects
            </Link>
            <button type="button" className="visit-secondary" onClick={() => setDone(null)}>
              {done.ready ? "Edit this visit" : "Fix and try again"}
            </button>
          </div>
        </div>
      </VisitFrame>
    );
  }

  const fields = contactFields({
    variant: "visit",
    form,
    problems: fieldErrors,
    onPatch: patch,
    original: original?.form,
  });
  const unusedServices = services.filter((service) => !form.services.includes(service));
  const address = [form.street1, form.street2, form.city, form.state, form.zip]
    .filter((part) => part.trim() !== "")
    .join(", ");
  const site = sitePhotosArea(areas);
  const siteIndex = site === undefined ? -1 : areas.indexOf(site);
  const allOpen = form.services.every((service) => openServices.includes(service));

  return (
    <OriginalContext.Provider value={original}>
    <VisitFrame>
      <header className="visit-banner">
        <Link className="visit-back" href="/visit">
          <ChevronLeft size={18} aria-hidden="true" />
          Projects
        </Link>
        <h1>
          {`${form.firstName} ${form.lastName}`.trim() || "Verify & confirm details"}
          {project.shortCode ? (
            <small className="visit-banner__code">Project {formatShortCode(project.shortCode)}</small>
          ) : null}
        </h1>
        <ConsultationButton
          sessionToken={sessionToken}
          projectId={projectId}
          canSchedule={canSchedule}
          email={form.email}
          consultation={project.consultation}
        />
      </header>

      <div className="visit-main">
        <form className="visit-body" onSubmit={onSubmit} onKeyDown={blockEnterSubmit} noValidate>
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
                  {fields.firstName}
                  {fields.lastName}
                  {fields.phone}
                  {fields.email}
                  {fields.street1}
                  {fields.street2}
                  {fields.city}
                  {fields.state}
                  {fields.zip}
                  <fieldset className="visit-choice" id="customerType">
                    <legend>Customer type</legend>
                    {(["Homeowner", "Contractor"] as const).map((type) => (
                      <label key={type}>
                        <input
                          type="radio"
                          name="customer-type"
                          {...toggleRadio(
                            form.customerType === type,
                            () => patch({ customerType: type }),
                            () => patch({ customerType: "" }),
                          )}
                        />
                        {type}
                      </label>
                    ))}
                    {fieldErrors.customerType ? <p className="field-error">{fieldErrors.customerType}</p> : null}
                    {original !== null && original.form.customerType !== form.customerType ? (
                      <CustomerSaid
                        value={original.form.customerType}
                        onRevert={() => patch({ customerType: original.form.customerType })}
                      />
                    ) : null}
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
              {address !== "" ? (
                <div className="visit-property-map">
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
                </div>
              ) : null}
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
                const open = openServices.includes(service);
                const serviceEstimates = estimatesFor(estimates, service, labelsForService(service, form));
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
                      {original !== null && !original.form.services.includes(service) ? (
                        <span className="visit-service__changes">Added on site</span>
                      ) : changeCount(service) > 0 ? (
                        <span className="visit-service__changes">
                          {changeCount(service)} {changeCount(service) === 1 ? "change" : "changes"}
                        </span>
                      ) : null}
                      <ChevronDown size={18} aria-hidden="true" />
                    </button>

                    {open ? (
                      <div className="visit-service__body">
                        {serviceEstimates.length > 0 || serviceNeedsAreas(service) ? (
                          <p className="visit-estimate">{formatEstimates(serviceEstimates)}</p>
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
                            onQuantity={(type, value) => {
                              const key = selectionKey(service, type);
                              clearProblem(fieldIdFor("qty", key));
                              setForm((current) => ({
                                ...current,
                                lightingQuantity: { ...current.lightingQuantity, [key]: value },
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
                            <fieldset className="visit-soil" id="underground-soil">
                              <legend>
                                Soil
                                <RequiredStar />
                              </legend>
                              {soilConditions.filter((soil) => soil !== "Not sure").map((soil) => (
                                <label key={soil} className="choice-card">
                                  <input
                                    type="radio"
                                    name="visit-underground-soil"
                                    {...toggleRadio(
                                      form.soil === soil,
                                      () => setForm((current) => ({ ...current, soil })),
                                      () => setForm((current) => ({ ...current, soil: "" })),
                                    )}
                                  />
                                  <span>{soil}</span>
                                </label>
                              ))}
                              {fieldErrors["underground-soil"] ? (
                                <p className="field-error">{fieldErrors["underground-soil"]}</p>
                              ) : null}
                              {original !== null && original.form.soil !== form.soil ? (
                                original.form.soil === "Not sure" ? (
                                  // "Not sure" is not something a salesperson can pick, so there is nothing to revert to.
                                  <CustomerSaid
                                    text={
                                      form.soil === ""
                                        ? "The customer was not sure. Check the soil on site and choose one."
                                        : "The customer was not sure about the soil."
                                    }
                                  />
                                ) : (
                                  <CustomerSaid
                                    value={original.form.soil}
                                    onRevert={() => setForm((current) => ({ ...current, soil: original.form.soil }))}
                                  />
                                )
                              ) : null}
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
                            <legend>
                              What do you need?
                              <RequiredStar />
                            </legend>
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
                                    {...toggleRadio(
                                      form.grassWork === option,
                                      () => chooseGrassWork(option),
                                      () => chooseGrassWork(""),
                                    )}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            {original !== null && original.form.grassWork !== form.grassWork ? (
                              <CustomerSaid
                                value={original.form.grassWork}
                                onRevert={() => chooseGrassWork(original.form.grassWork)}
                              />
                            ) : null}
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
                            onDims={(quantityKey, length, width) =>
                              setForm((current) => ({
                                ...current,
                                length: { ...current.length, [quantityKey]: length },
                                width: { ...current.width, [quantityKey]: width },
                              }))
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

                      </div>
                    ) : null}
                  </article>
                );
              })}

              {original !== null
                ? original.form.services
                    .filter((service) => !form.services.includes(service))
                    .map((service) => (
                      <p key={service} className="field-original visit-removed">
                        Customer picked <strong>{serviceLabel(service)}</strong>. Not part of this visit.
                      </p>
                    ))
                : null}

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

            <section id="photos" className="visit-card">
              <PhotosPanel
                areas={areas}
                siteIndex={siteIndex}
                onPhoto={addPhoto}
                note={visitNote}
                onNote={setVisitNote}
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

              {original !== null ? (
                <div className="visit-changes" aria-labelledby="visit-changes-title">
                  <h3 id="visit-changes-title">
                    Changes from the customer&apos;s form
                    <span className="visit-service__changes">{changes.length}</span>
                  </h3>
                  {changes.length === 0 ? (
                    <p className="visit-quiet">Nothing changed. Everything matches what the customer submitted.</p>
                  ) : (
                    [...new Set(changes.map((change) => change.group))].map((group) => (
                      <section key={group} className="visit-changes__group">
                        <h4>
                          {(() => {
                            const GroupIcon = group === "Contact" ? UserRound : (serviceIcons[group] ?? Home);
                            return <GroupIcon size={16} aria-hidden="true" />;
                          })()}
                          {group === "Contact" ? "Customer & property" : serviceLabel(group)}
                          <span className="visit-service__changes">
                            {changes.filter((change) => change.group === group).length}
                          </span>
                        </h4>
                        <ul>
                          {changes
                            .filter((change) => change.group === group)
                            .map((change, index) => (
                              <li key={`${change.label}-${index}`}>
                                <span className="visit-changes__label">{change.label}</span>
                                {change.added !== undefined || change.removed !== undefined ? (
                                  <span className="visit-changes__list">
                                    {(change.removed ?? []).map((item) => (
                                      <em key={`-${item}`} className="is-removed">
                                        Removed: {item}
                                      </em>
                                    ))}
                                    {(change.added ?? []).map((item) => (
                                      <em key={`+${item}`} className="is-added">
                                        Added: {item}
                                      </em>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="visit-changes__values">
                                    <s>{change.before}</s>
                                    <ArrowRight size={14} aria-hidden="true" />
                                    <strong>{change.after}</strong>
                                  </span>
                                )}
                              </li>
                            ))}
                        </ul>
                      </section>
                    ))
                  )}
                </div>
              ) : null}
            </section>

            {revisions.length > 0 ? (
              <details className="visit-card visit-history">
                <summary>Saved visits ({revisions.length})</summary>
                {revisions.map((revision) => (
                  <div key={revision.savedAt} className="visit-history__entry">
                    <strong>
                      {new Date(revision.savedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </strong>
                    <ul>
                      {revision.changes.map((change, index) => (
                        <li key={index}>
                          {change.label}: <s>{change.before}</s> → {change.after}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            ) : null}

            {error !== null ? (
              <p className="visit-alert" role="alert">
                {error}
              </p>
            ) : null}

            <div className="visit-actions">
              <button type="submit" className="visit-primary" disabled={pending}>
                {pending ? "Saving" : "Save & draft quote"}
              </button>
              <p className="visit-save-hint">
                {savedAt !== null ? `Saved at ${savedAt}.` : "Saves the visit and drafts the quote in Jobber. Nothing is sent to the customer."}
              </p>
            </div>
          </div>
        </form>
      </div>
    </VisitFrame>
    </OriginalContext.Provider>
  );
}

export function VisitFrame({ children }: { children: ReactNode }) {
  return <div className="visit-app">{children}</div>;
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
    areaNames[selectionKey(service, area.installType)] = isDefaultAreaName(area) ? "" : area.label;
  }
  // Every area of an installation type is recorded, so the answers list them all.
  const yards = { ...form.areas };
  for (const type of types) {
    if (!usesAreaList(service, type)) continue;
    yards[selectionKey(service, type)] = areas
      .filter((area) => area.service === service && area.installType === type)
      .map((area, index) =>
        areaFromName(`a${index + 1}`, isDefaultAreaName(area) ? "" : area.label, area.quantity.trim()),
      );
  }
  return {
    ...form,
    installTypes: { ...form.installTypes, [service]: types },
    areaNames,
    areas: yards,
  };
}

/** A short line under the service name; it describes what is on the card, never whether it is "verified". */
function statusCopy(service: string, form: DiscoveryState, areas: VisitArea[]): string {
  if (service === "Low Voltage Lighting") {
    const selected = form.installTypes[service] ?? [];
    const measured = selected.filter(
      (type) => (form.lightingQuantity[selectionKey(service, type)] ?? "").trim() !== "",
    ).length;
    if (selected.length === 0) return "No items selected";
    return `${measured} of ${selected.length} quantities entered`;
  }
  const owned = areasForService(areas, service);
  if (serviceNeedsAreas(service) && service !== "Underground") {
    return `${owned.length} area${owned.length === 1 ? "" : "s"} on this visit`;
  }
  if (service === "Underground") return "Soil and length to measure";
  return "Selected by the customer";
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

function VisitField(props: Omit<TextFieldProps, "variant">) {
  return <TextField variant="visit" {...props} />;
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
  onQuantity,
}: {
  service: string;
  selected: string[];
  error?: string;
  form: DiscoveryState;
  problems: Record<string, string>;
  onToggle: (value: string) => void;
  onQuantity: (type: string, value: string) => void;
}) {
  const original = useOriginal();
  const originalTypes = original?.form.installTypes[service] ?? [];
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
            {original !== null && selected.includes(type) !== originalTypes.includes(type) ? (
              <span className="visit-installs__tag">
                {selected.includes(type) ? "Added on site" : "Customer chose this"}
              </span>
            ) : null}
            {selected.includes(type) ? <Check size={14} aria-hidden="true" /> : null}
          </label>
        ))}
      </div>
      {service === "Low Voltage Lighting" && selected.length > 0 ? (
        <div className="visit-area-names">
          {(installTypes[service] ?? []).filter((type) => selected.includes(type)).map((type) => {
            const key = selectionKey(service, type);
            const id = fieldIdFor("qty", key);
            const linear = lightingUnit(type) === "lin ft";
            return (
              <VisitField
                key={type}
                id={id}
                label={linear ? `${choiceLabel(type)} linear feet` : `${choiceLabel(type)} quantity`}
                required
                numeric
                stepper={linear ? 10 : 1}
                placeholder={linear ? "e.g. 120" : "e.g. 10"}
                customerValue={
                  original !== null && (original.form.lightingQuantity[key] ?? "") !== (form.lightingQuantity[key] ?? "")
                    ? (original.form.lightingQuantity[key] ?? "")
                    : undefined
                }
                onRevert={original !== null ? () => onQuantity(type, original.form.lightingQuantity[key] ?? "") : undefined}
                value={form.lightingQuantity[key] ?? ""}
                error={problems[id]}
                inputMode="decimal"
                onChange={(value) => onQuantity(type, decimalInput(value))}
              />
            );
          })}
        </div>
      ) : null}
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
  const original = useOriginal();
  const selected = form.installTypes[service] ?? [];
  if (selected.length < 1) return null;
  return (
    <div className="visit-area-names">
      {(installTypes[service] ?? []).filter((type) => selected.includes(type)).map((type) => {
        const key = selectionKey(service, type);
        const id = fieldIdFor("area", key);
        return (
          <VisitField
            key={type}
            id={id}
            label={`${choiceLabel(type)} area, if you know it`}
            customerValue={
              original !== null && (original.form.areaNames[key] ?? "") !== (form.areaNames[key] ?? "")
                ? (original.form.areaNames[key] ?? "")
                : undefined
            }
            onRevert={original !== null ? () => onChange(type, original.form.areaNames[key] ?? "") : undefined}
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
  const original = useOriginal();
  const index = areas.findIndex((area) => area.service === "Underground");
  const area = index >= 0 ? areas[index] : undefined;
  if (area === undefined) return null;
  const before = originalAreaFor(area, 0, original);
  return (
    <VisitField
      customerValue={before !== undefined && before.quantity !== area.quantity ? before.quantity : undefined}
      onRevert={before !== undefined ? () => onChange(index, before.quantity) : undefined}
      id={`area-${index}-quantity`}
      label="Measured linear feet"
      required
      numeric
      stepper={10}
      placeholder="e.g. 120"
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
  const original = useOriginal();
  const [needsInstall, setNeedsInstall] = useState<number | null>(null);
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
        const before = originalAreaFor(area, order, original);
        const originalProduct = original?.form.product[productKey] ?? original?.form.product[service] ?? "";
        const originalReplacement = original?.form.replacementInstall[productKey] ?? "";
        const linear =
          service === grassService &&
          grassUsesLinearFeet(measureInstall, form.product[productKey] ?? "");
        // The field stays in place from the start; it just asks for an installation type first.
        const replacing = service === grassService && form.grassWork === "Replacement";
        const showProduct =
          products.length > 0 ||
          replacing ||
          (types.length > 0 && types.some((type) => productsFor(service, type).length > 0));
        // Replacement picks the new turf type in "New installation"; everything else uses "Installation type".
        const waitingForInstall = replacing
          ? measureInstall === ""
          : types.length > 0 && area.installType === "";
        const productError = problems[fieldIdFor("product", productKey)];
        function askForInstall(at: number) {
          setNeedsInstall(at);
          const install = document.getElementById(replacing ? `area-${at}-replacement` : `area-${at}-install`);
          install?.scrollIntoView({ block: "center", behavior: "smooth" });
          install?.focus({ preventScroll: true });
        }
        return (
          <div key={index} className="visit-area">
            <div className="visit-area__head">
              <span>{order + 1}</span>
              <strong>{areaDisplayName({ ...area, label: area.shownLabel ?? area.label }, order)}</strong>
              <em>{original !== null && before === undefined ? "Added on site" : "Measured on site"}</em>
              <button type="button" className="visit-icon-btn" onClick={() => onRemove(index)}>
                <Trash2 size={15} aria-hidden="true" />
                Remove
              </button>
            </div>
            <div className="visit-area__grid">
              <VisitField
                id={`area-${index}-label`}
                label="Area name"
                placeholder="e.g. Front yard"
                onFocus={() => onArea(index, { shownLabel: area.label })}
                onBlur={() => onArea(index, { shownLabel: undefined })}
                customerValue={
                  before !== undefined &&
                  (isDefaultAreaName(before) ? "" : before.label) !== (isDefaultAreaName(area) ? "" : area.label)
                    ? (isDefaultAreaName(before) ? "" : before.label)
                    : undefined
                }
                onRevert={before !== undefined ? () => onName(index, before.label) : undefined}
                value={isDefaultAreaName(area) ? "" : area.label}
                error={problems[`area-${index}-label`]}
                onChange={(value) => onName(index, value.trim() === "" ? defaultAreaName(area, service) : value)}
              />
              {linear ? (
                <VisitField
                  id={`area-${index}-quantity`}
                  label="Linear feet"
                  required
                  numeric
                  stepper={10}
                  placeholder="e.g. 120"
                  customerValue={before !== undefined && before.quantity !== area.quantity ? before.quantity : undefined}
                  onRevert={before !== undefined ? () => onArea(index, { quantity: before.quantity }) : undefined}
                  value={area.quantity}
                  error={problems[`area-${index}-quantity`]}
                  inputMode="decimal"
                  onChange={(value) => onArea(index, { quantity: decimalInput(value) })}
                />
              ) : (
                <SizeFields
                  id={`area-${index}-quantity`}
                  length={area.length}
                  width={area.width}
                  area={area.quantity}
                  areaLabel="Area (sq ft)"
                  error={problems[`area-${index}-quantity`]}
                  customerValue={before !== undefined && before.quantity !== area.quantity ? before.quantity : undefined}
                  onRevert={
                    before !== undefined
                      ? () => onArea(index, { length: before.length, width: before.width, quantity: before.quantity })
                      : undefined
                  }
                  onChange={(next) => onArea(index, { length: next.length, width: next.width, quantity: next.area })}
                />
              )}
              <div className="visit-area__pair">
              {types.length > 0 ? (
                <div
                  className={problems[`area-${index}-install`] ? "visit-field is-invalid" : "visit-field"}
                  data-field={`area-${index}-install`}
                >
                  <label htmlFor={`area-${index}-install`}>
                    Installation type
                    <RequiredStar />
                  </label>
                  <select
                    id={`area-${index}-install`}
                    value={area.installType}
                    onChange={(event) => {
                      setNeedsInstall(null);
                      onInstall(index, service, event.target.value);
                    }}
                  >
                    <option value="">Select</option>
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {choiceLabel(type)}
                      </option>
                    ))}
                  </select>
                  {before !== undefined && before.installType !== area.installType ? (
                    <CustomerSaid
                      value={before.installType}
                      onRevert={() => {
                        setNeedsInstall(null);
                        onInstall(index, service, before.installType);
                      }}
                    />
                  ) : null}
                  {problems[`area-${index}-install`] ? (
                    <p className="field-error">{problems[`area-${index}-install`]}</p>
                  ) : null}
                </div>
              ) : null}
                {area.installType === "Artificial Grass Replacement" ? (
                  <div
                    className={
                      problems[fieldIdFor("replacement", productKey)] ? "visit-field is-invalid" : "visit-field"
                    }
                    data-field={fieldIdFor("replacement", productKey)}
                  >
                    <label htmlFor={`area-${index}-replacement`}>
                      New installation
                      <RequiredStar />
                    </label>
                    <select
                      id={`area-${index}-replacement`}
                      value={form.replacementInstall[productKey] ?? ""}
                      onChange={(event) => {
                        setNeedsInstall(null);
                        onReplace(productKey, event.target.value);
                      }}
                    >
                      <option value="">Select</option>
                      {turfInstallTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    {original !== null && originalReplacement !== (form.replacementInstall[productKey] ?? "") ? (
                      <CustomerSaid value={originalReplacement} onRevert={() => onReplace(productKey, originalReplacement)} />
                    ) : null}
                    {problems[fieldIdFor("replacement", productKey)] ? (
                      <p className="field-error">{problems[fieldIdFor("replacement", productKey)]}</p>
                    ) : null}
                  </div>
                ) : null}
                {showProduct ? (
                  <div
                    className={
                      productError || needsInstall === index ? "visit-field is-invalid" : "visit-field"
                    }
                    data-field={fieldIdFor("product", productKey)}
                  >
                    <label htmlFor={`area-${index}-product`}>
                      Turf product
                      <RequiredStar />
                    </label>
                    <select
                      id={`area-${index}-product`}
                      value={form.product[productKey] ?? form.product[service] ?? ""}
                      aria-disabled={waitingForInstall || undefined}
                      onMouseDown={(event) => {
                        if (!waitingForInstall) return;
                        event.preventDefault();
                        askForInstall(index);
                      }}
                      onFocus={() => {
                        if (waitingForInstall) setNeedsInstall(index);
                      }}
                      onKeyDown={(event) => {
                        if (!waitingForInstall || event.key === "Tab") return;
                        event.preventDefault();
                        askForInstall(index);
                      }}
                      onChange={(event) => onProduct(index, service, event.target.value)}
                    >
                      <option value="">Select</option>
                      {products.map((product) => (
                        <option key={product.name} value={product.name}>
                          {product.mark === null ? product.name : `${product.name} (${product.mark})`}
                        </option>
                      ))}
                    </select>
                    {original !== null && originalProduct !== (form.product[productKey] ?? form.product[service] ?? "") ? (
                      <CustomerSaid value={originalProduct} onRevert={() => onProduct(index, service, originalProduct)} />
                    ) : null}
                    {needsInstall === index ? (
                      <p className="field-error">
                        {replacing ? "Select the new installation first." : "Select an installation type first."}
                      </p>
                    ) : productError ? (
                      <p className="field-error">{productError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      {original !== null
        ? original.areas
            .filter(
              (item) =>
                item.service === service &&
                !owned.some(({ area, index: at }, order) => originalAreaFor(area, order, original) === item && at >= 0),
            )
            .map((item) => (
              <p key={item.label} className="field-original visit-removed">
                Customer listed <strong>{isDefaultAreaName(item) ? choiceLabel(item.label) : item.label}</strong>
                {item.quantity !== "" ? ` (${item.quantity})` : ""}. Removed on site.
              </p>
            ))
        : null}
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
  onDims,
}: {
  service: string;
  form: DiscoveryState;
  problems: Record<string, string>;
  onToggle: (key: string, addOn: string) => void;
  onQuantity: (quantityKey: string, value: string) => void;
  onDims: (quantityKey: string, length: string, width: string) => void;
}) {
  const selectedTypes =
    service === grassService
      ? form.grassWork === "Replacement"
        ? [form.replacementInstall[selectionKey(service, "Artificial Grass Replacement")] ?? ""]
        : form.grassWork === "Repair"
          ? []
          : (form.installTypes[service] ?? [])
      : (form.installTypes[service] ?? []);
  const original = useOriginal();
  const addOns = addOnsForSelected(service, selectedTypes);
  if (addOns.length === 0) return null;
  const selected = form.addOns[service] ?? [];
  const originalSelected = original?.form.addOns[service] ?? [];
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
              {original !== null && originalSelected.includes(addOn) !== checked ? (
                <CustomerSaid
                  text={
                    checked
                      ? "Added on site. The customer did not choose this."
                      : "Removed on site. The customer chose this."
                  }
                  actionLabel={checked ? "Remove" : "Restore"}
                  onRevert={() => onToggle(service, addOn)}
                />
              ) : null}
              {checked ? (
                unitForAddOn(addOn) === "sq ft" ? (
                  <SizeFields
                    id={fieldIdFor("qty", quantityKey)}
                    length={form.length[quantityKey] ?? ""}
                    width={form.width[quantityKey] ?? ""}
                    area={form.addOnQuantity[quantityKey] ?? ""}
                    areaLabel={`${addOn} (sq ft)`}
                    error={problems[fieldIdFor("qty", quantityKey)]}
                    customerValue={
                      original !== null &&
                      (original.form.addOnQuantity[quantityKey] ?? "") !== (form.addOnQuantity[quantityKey] ?? "")
                        ? (original.form.addOnQuantity[quantityKey] ?? "")
                        : undefined
                    }
                    onRevert={
                      original !== null
                        ? () => onQuantity(quantityKey, original.form.addOnQuantity[quantityKey] ?? "")
                        : undefined
                    }
                    onChange={(next) => {
                      onDims(quantityKey, next.length, next.width);
                      onQuantity(quantityKey, next.area);
                    }}
                  />
                ) : (
                  <VisitField
                    id={fieldIdFor("qty", quantityKey)}
                    label={`${addOn} (${unitForAddOn(addOn) === "linear ft" ? "linear ft" : unitForAddOn(addOn)})`}
                    numeric
                    stepper={unitForAddOn(addOn) === "linear ft" ? 10 : 1}
                    placeholder={unitForAddOn(addOn) === "linear ft" ? "e.g. 120" : "e.g. 1"}
                    customerValue={
                      original !== null &&
                      (original.form.addOnQuantity[quantityKey] ?? "") !== (form.addOnQuantity[quantityKey] ?? "")
                        ? (original.form.addOnQuantity[quantityKey] ?? "")
                        : undefined
                    }
                    onRevert={
                      original !== null
                        ? () => onQuantity(quantityKey, original.form.addOnQuantity[quantityKey] ?? "")
                        : undefined
                    }
                    value={form.addOnQuantity[quantityKey] ?? ""}
                    error={problems[fieldIdFor("qty", quantityKey)]}
                    onChange={(value) => onQuantity(quantityKey, value)}
                  />
                )
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
  note,
  onNote,
}: {
  areas: VisitArea[];
  siteIndex: number;
  onPhoto: (index: number, file: File) => void;
  note: string;
  onNote: (value: string) => void;
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
              <RetryImage src={photo.url} alt="" />
              <figcaption>{photo.label}</figcaption>
            </figure>
          ),
        )}
        {siteIndex >= 0 ? (
          <PhotoPicker className="visit-photo-add" onFile={(file) => onPhoto(siteIndex, file)}>
<Plus size={20} aria-hidden="true" />
            <span>Add photo</span>
</PhotoPicker>
        ) : null}
      </div>
      <div className="visit-field visit-note">
        <label htmlFor="visit-note">Notes</label>
        <textarea
          id="visit-note"
          value={note}
          placeholder="Add notes about the property, access, layout, or special considerations."
          onChange={(event) => onNote(event.target.value)}
        />
      </div>
    </>
  );
}
