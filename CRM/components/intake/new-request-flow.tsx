"use client";

/* New Request for Quality First Turf Landscape, in the forms app's look (D-079): one full-screen flow over the CRM with the customer form's
   own steps and questions, then the staff-only part (salesperson, internal note, photos). Saving writes the forms' record and the CRM
   client and request together (crm/requestForm:create), then opens the request page. Everything inside the .nrf wrapper is styled by
   app/intake.css (the forms stylesheet, scoped) and app/intake-flow.css; nothing here uses the CRM's own classes. */

import { useAction, useMutation } from "convex/react";
import { ArrowRight, Check, HardHat, House, ImagePlus, Search, X } from "lucide-react";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildDiscovery,
  contactProblems,
  type DiscoveryState,
  emptyDiscovery,
  hasFollowUp,
  installTypes,
  orderServices,
  phoneInput,
  serviceLabel,
  services,
} from "@/convex/shared/discovery";
import { US_STATES } from "@/convex/shared/usStates";
import type { BusinessDoc } from "@/lib/clients";
import { useClientSearch } from "@/lib/quotes";
import { failure, usePeople } from "@/lib/requests";
import { type PendingFile, useUploadPending } from "../note-editor";
import { useStaff } from "../staff-context";
import { useUI } from "../ui-provider";
import { contactFields, RequiredStar } from "./fields";
import { blockEnterSubmit, toggleRadio } from "./inputs";
import ServiceBoard from "./service-board";
import { ServiceQuestions } from "./sections";
import "@/app/intake.css";
import "@/app/intake-flow.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

type Step = "property" | "services" | "details" | "finish";
const STEPS: { id: Step; label: string }[] = [
  { id: "property", label: "Client details" },
  { id: "services", label: "Services" },
  { id: "details", label: "Questions" },
  { id: "finish", label: "Notes and save" },
];

const audiences = [
  { value: "Homeowner" as const, title: "A homeowner", detail: "The person who lives there", icon: House },
  { value: "Contractor" as const, title: "A contractor", detail: "Installing for a client", icon: HardHat },
];

type Picked = { id: Id<"clients">; name: string };
type ClientRow = NonNullable<ReturnType<typeof useClientSearch>>["rows"][number];

/** A CRM client as the form's contact fields: the CRM keeps one name and a two-letter state, the form a first and last name and the state's name. */
function contactOf(c: ClientRow): Partial<DiscoveryState> {
  const [first, ...rest] = (c.contactName || c.name).trim().split(/\s+/);
  return {
    customerType: c.type === "contractor" ? "Contractor" : "Homeowner",
    firstName: first ?? "",
    lastName: rest.join(" "),
    phone: phoneInput(c.phone),
    email: c.email,
    street1: c.street1,
    street2: c.street2,
    city: c.city,
    state: US_STATES.find((s) => s.abbr === c.state)?.name ?? "",
    zip: c.zip,
  };
}

export function NewRequestFlow({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { toast } = useUI();
  const staff = useStaff();
  const people = usePeople(business._id);
  const create = useMutation(api.crm.requestForm.create);
  // The same action the customer form runs after it saves: it makes the client and request in Jobber (D-028 keeps Jobber working in full).
  const publishToJobber = useAction(api.projects.actions.publishVisit);
  const upload = useUploadPending();

  const [step, setStep] = useState<Step>("property");
  const [form, setForm] = useState<DiscoveryState>(emptyDiscovery);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [query, setQuery] = useState("");
  const [salesperson, setSalesperson] = useState<string | null>(null); // null until changed: then the signed-in person
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const focusFirstError = useRef(false);
  const found = useClientSearch(business._id, query);

  // The flow is drawn over the whole CRM, so the page behind it must not scroll.
  useEffect(() => {
    // The wrapper is put on document.body, which only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // After a failed check, bring the first field that is wrong into view and focus it (as the customer form does).
  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const firstId = Object.keys(fieldErrors)[0];
    const field = firstId ? document.getElementById(firstId) : null;
    if (field) {
      const focusable = field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement;
      (focusable ? field : (field.querySelector(".field-error") ?? field)).scrollIntoView({ block: "center" });
      (focusable ? field : field.querySelector<HTMLElement>("input, select, textarea, button"))?.focus({ preventScroll: true });
    } else {
      document.querySelector(".nrf .form-alert")?.scrollIntoView({ block: "center" });
    }
  }, [fieldErrors, error, step]);

  if (!mounted) return null;

  const needsDetails = form.services.some((s) => hasFollowUp(s));
  const shown = STEPS.filter((s) => s.id !== "details" || needsDetails || form.services.length === 0);
  const at = shown.findIndex((s) => s.id === step);
  const chosen = salesperson ?? (people?.some((p) => p.id === staff._id) ? staff._id : "");

  function go(next: Step) {
    setError(null);
    setStep(next);
    scroller.current?.scrollTo(0, 0);
  }

  function patch(partial: Partial<DiscoveryState>) {
    setDirty(true);
    setForm((current) => ({ ...current, ...partial }));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(partial)) delete next[key];
      return next;
    });
  }

  const setFormDirty: typeof setForm = (value) => { setDirty(true); setForm(value); };

  function clearProblem(id: string) {
    const message = fieldErrors[id];
    if (message === undefined) return;
    const next = { ...fieldErrors };
    delete next[id];
    setFieldErrors(next);
    if (Object.keys(next).length === 0 || error === message) setError(Object.values(next)[0] ?? null);
  }

  function showProblems(problems: Record<string, string>, message: string | null) {
    setFieldErrors(problems);
    setError(message);
    if (message !== null) focusFirstError.current = true;
  }

  function toggleService(service: string) {
    setFormDirty((current) => ({
      ...current,
      services: orderServices(current.services.includes(service) ? current.services.filter((s) => s !== service) : [...current.services, service]),
    }));
    clearProblem("services");
    setError((current) => (current === "Choose at least one service." ? null : current));
  }

  /** Checks everything the customer form checks and sends the person to the step that has the first problem. */
  function checked() {
    const contact = contactProblems(form);
    const contactMessage = Object.values(contact)[0];
    if (contactMessage !== undefined) {
      if (step !== "property") go("property");
      showProblems(contact, contactMessage);
      return null;
    }
    if (form.services.length === 0) {
      if (step !== "services") go("services");
      showProblems({ services: "Choose at least one service." }, "Choose at least one service.");
      return null;
    }
    const built = buildDiscovery(form);
    if (built.error !== null || built.payload === null) {
      if (step !== "details") go("details");
      showProblems(built.fieldId !== null && built.error !== null ? { [built.fieldId]: built.error } : {}, built.error);
      return null;
    }
    setFieldErrors({});
    return built.payload;
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (step === "property") {
      const problems = contactProblems(form);
      const message = Object.values(problems)[0];
      if (message !== undefined) return showProblems(problems, message);
      setFieldErrors({});
      return go("services");
    }
    if (step === "services") {
      if (form.services.length === 0) return showProblems({ services: "Choose at least one service." }, "Choose at least one service.");
      setFieldErrors({});
      return go(needsDetails ? "details" : "finish");
    }
    if (step === "details") {
      if (checked() !== null) go("finish");
      return;
    }
    void save();
  }

  async function save() {
    const payload = checked();
    if (payload === null) return;
    setPending(true);
    setError(null);
    try {
      const saved = await create({
        businessId: business._id,
        clientId: picked?.id,
        salespersonId: chosen ? (chosen as Id<"users">) : undefined,
        note,
        noteFiles: await upload(files),
        ...payload,
      });
      setDirty(false);
      // The request is already saved, so a Jobber problem is reported but never undoes it. The forms' record keeps the error (status
      // "needs attention"), as it does for a customer's submission.
      let jobber = "";
      try {
        const sent = await publishToJobber({ projectId: saved.projectId });
        if (sent.integrationError !== null) jobber = " It could not be sent to Jobber yet.";
      } catch {
        jobber = " It could not be sent to Jobber yet.";
      }
      toast(`${saved.createdClient ? "Request saved, and the client was added." : "Request saved."}${jobber}`);
      router.push(`/requests/${saved.opportunityId}`);
    } catch (e) {
      setError(failure(e, "The request could not be saved. Check your connection and try again."));
      setPending(false);
    }
  }

  function close() {
    if (dirty) setLeaving(true);
    else router.push("/requests");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const added = [...list].map((blob, i): PendingFile => ({
      id: `${Date.now()}-${i}`,
      kind: blob.type.startsWith("image/") ? "image" : "file",
      blob,
      name: blob.name,
      url: URL.createObjectURL(blob),
    }));
    setDirty(true);
    setFiles((current) => [...current, ...added].slice(0, 10));
  }

  const fields = contactFields({ variant: "intake", form, problems: fieldErrors, onPatch: patch, required: true });
  const back = (to: Step) => (
    <button type="button" className={step === "services" ? "services-back" : "review-back"} disabled={pending} onClick={() => go(to)}>Back</button>
  );

  return createPortal(
    <div ref={scroller} className={`nrf ${plex.variable} ${dmSans.variable}`} role="dialog" aria-modal="true" aria-label="New request">
      <div className={step === "property" || step === "finish" ? "intake intake--simple" : "intake"}>
        <header className="intake-header">
          <span className="brand-mark">
            <Image className="brand-mark__logo" src="/brand/logo-mark.png" alt="Quality First Turf" width={771} height={605} priority />
          </span>
          <nav className="nrf-steps" aria-label="New request progress">
            <ol>
              {shown.map((s, i) => {
                const state = i < at ? "done" : i === at ? "current" : "todo";
                const inner = (
                  <>
                    <span className="nrf-steps__bar" />
                    <span className="nrf-steps__label">{state === "done" && <span className="visually-hidden">Completed: </span>}{s.label}</span>
                  </>
                );
                return (
                  <li key={s.id} className={`is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                    {state === "done" ? <button type="button" disabled={pending} onClick={() => go(s.id)}>{inner}</button> : <span>{inner}</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
          <button type="button" className="nrf-close" onClick={close} aria-label="Close and go back to requests"><X size={20} aria-hidden="true" /> <span>Close</span></button>
        </header>

        {step === "property" && (
          <main className="simple-main">
            <form className="simple-card" onSubmit={next} noValidate>
              <div>
                <h1>Client details</h1>
                <p className="simple-card__lead">Find a client you already have, or type a new one. The services come next.</p>
              </div>
              <div className="intake-fields">
                <fieldset className="intake-group">
                  <legend>Client</legend>
                  {picked ? (
                    <div className="nrf-picked">
                      <span className="nrf-picked__mark"><Check size={16} strokeWidth={2.5} aria-hidden="true" /></span>
                      <span><strong>{picked.name}</strong><small>Existing client. This request goes on their record.</small></span>
                      <button type="button" onClick={() => setPicked(null)}>Change</button>
                    </div>
                  ) : (
                    <div className="intake-field nrf-search">
                      <label htmlFor="nrf-client"><span>Find an existing client</span><span className="intake-field__hint">Optional</span></label>
                      <div className="nrf-search__box">
                        <Search size={18} aria-hidden="true" />
                        <input id="nrf-client" value={query} placeholder="Name, phone, email or address" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
                      </div>
                      {query.trim() !== "" && found && (
                        <div className="nrf-results" role="listbox" aria-label="Matching clients">
                          {found.rows.length === 0 && <p>No client matches. Fill in the details below and a new client is made when you save.</p>}
                          {found.rows.map((c) => (
                            <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { setPicked({ id: c._id, name: c.name }); setQuery(""); patch(contactOf(c)); }}>
                              <strong>{c.name}</strong>
                              <span>{[c.street1, c.city].filter(Boolean).join(", ") || c.phone || c.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </fieldset>
                <fieldset className="intake-group">
                  <legend>The client is</legend>
                  <div className="simple-audiences">
                    {audiences.map((a) => {
                      const selected = form.customerType === a.value;
                      return (
                        <label key={a.value} className={selected ? "simple-audience is-selected" : "simple-audience"}>
                          <input className="visually-hidden" type="radio" name="customer-type" value={a.value} {...toggleRadio(selected, () => patch({ customerType: a.value }), () => patch({ customerType: "" }))} />
                          <span className="simple-audience__icon"><a.icon strokeWidth={1.75} aria-hidden="true" /></span>
                          <span className="simple-audience__text"><strong>{a.title}</strong><small>{a.detail}</small></span>
                          <span className="simple-audience__radio" aria-hidden="true"><span /></span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="intake-group">
                  <legend>Contact</legend>
                  <div className="intake-grid">{fields.firstName}{fields.lastName}</div>
                  <div className="intake-grid">{fields.phone}{fields.email}</div>
                </fieldset>
                <fieldset className="intake-group">
                  <legend>Property address</legend>
                  <div className="intake-grid">{fields.street1}{fields.street2}</div>
                  <div className="intake-grid intake-grid--address">{fields.city}{fields.state}{fields.zip}</div>
                </fieldset>
              </div>
              <div className="simple-card__footer">
                <button className="intake-continue" type="submit">Continue <ArrowRight strokeWidth={2} aria-hidden="true" /></button>
              </div>
            </form>
          </main>
        )}

        {step === "services" && (
          <form className="services-page" onSubmit={next} noValidate>
            <div className="services-copy">
              <h1>Which services does<span className="services-copy__break">the client want?</span></h1>
              <p className="services-copy__sub">Choose one or more.<RequiredStar /></p>
            </div>
            <div id="services">
              {fieldErrors.services ? <p id="services-error" className="field-error" role="alert">{fieldErrors.services}</p> : null}
              <ServiceBoard
                invalid={Boolean(fieldErrors.services)}
                describedBy="services-error"
                cards={services.map((s) => ({ label: serviceLabel(s), selected: form.services.includes(s), includes: installTypes[s] }))}
                onToggle={(i) => toggleService(services[i])}
              />
            </div>
            <div className="services-dock">
              <p className="services-status" aria-live="polite">
                {form.services.length === 0 ? "Nothing selected yet." : orderServices(form.services).map(serviceLabel).join(", ")}
              </p>
              <div className="services-actions">
                {error !== null && error !== fieldErrors.services ? <p className="form-alert" role="alert">{error}</p> : null}
                {back("property")}
                <button type="submit" className="services-continue">Continue <ArrowRight strokeWidth={2} aria-hidden="true" /></button>
              </div>
            </div>
          </form>
        )}

        {step === "details" && (
          <form className="review-page" onSubmit={next} onKeyDown={blockEnterSubmit} noValidate>
            <div className="review-stage">
              <div className="review-intro">
                <h1>A few questions</h1>
                <p>If a measurement is not known yet, leave it and carry on.</p>
              </div>
              <ServiceQuestions form={form} setForm={setFormDirty} problems={fieldErrors} clearProblem={clearProblem} />
              <div className="review-actions">
                {error !== null ? <p className="form-alert" role="alert">{error}</p> : null}
                {back("services")}
                <button type="submit" className="review-submit">Continue <ArrowRight strokeWidth={2} aria-hidden="true" /></button>
              </div>
            </div>
          </form>
        )}

        {step === "finish" && (
          <main className="simple-main">
            <form className="simple-card" onSubmit={next} noValidate>
              <div>
                <h1>Notes and save</h1>
                <p className="simple-card__lead">For the team only. The client never sees this part.</p>
              </div>
              <div className="intake-fields">
                <fieldset className="intake-group">
                  <legend>This request</legend>
                  <dl className="nrf-summary">
                    <div><dt>Client</dt><dd>{`${form.firstName} ${form.lastName}`.trim()}{picked ? "" : " (new, unless the email or phone matches a client)"}</dd></div>
                    <div><dt>Property</dt><dd>{[form.street1, form.city, form.state].filter(Boolean).join(", ")}</dd></div>
                    <div><dt>Services</dt><dd>{orderServices(form.services).map(serviceLabel).join(", ")}</dd></div>
                  </dl>
                </fieldset>
                <fieldset className="intake-group">
                  <legend>Team</legend>
                  <div className="intake-field">
                    <label htmlFor="nrf-salesperson"><span>Salesperson</span></label>
                    <select id="nrf-salesperson" value={chosen} disabled={people === undefined} onChange={(e) => { setDirty(true); setSalesperson(e.target.value); }}>
                      <option value="">Unassigned</option>
                      {people?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="intake-field">
                    <label htmlFor="nrf-note"><span>Internal note</span><span className="intake-field__hint">Optional</span></label>
                    <textarea id="nrf-note" rows={5} maxLength={5000} value={note} placeholder="Anything the team should know: access, how they found us, when to call" onChange={(e) => { setDirty(true); setNote(e.target.value); }} />
                  </div>
                  <div className="intake-field">
                    <label><span>Photos and files</span><span className="intake-field__hint">Optional, up to 10</span></label>
                    <div className="nrf-files">
                      {files.map((f) => (
                        <figure key={f.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a file that has not been uploaded yet */}
                          {f.kind === "image" ? <img src={f.url} alt={f.name} /> : <span>{f.name}</span>}
                          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((current) => current.filter((x) => x.id !== f.id))}><X size={14} aria-hidden="true" /></button>
                        </figure>
                      ))}
                      {files.length < 10 && (
                        <label className="nrf-files__add">
                          <ImagePlus size={22} aria-hidden="true" />
                          <span>Add</span>
                          <input className="visually-hidden" type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                        </label>
                      )}
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="simple-card__footer">
                {error !== null ? <p className="form-alert" role="alert">{error}</p> : null}
                <div className="nrf-finish">
                  {back(needsDetails ? "details" : "services")}
                  <button className="intake-continue" type="submit" disabled={pending}>{pending ? "Saving and sending to Jobber" : "Save request"}</button>
                </div>
              </div>
            </form>
          </main>
        )}
      </div>

      {leaving && (
        <div className="nrf-leave" role="alertdialog" aria-modal="true" aria-labelledby="nrf-leave-title">
          <div>
            <h2 id="nrf-leave-title">Leave without saving?</h2>
            <p>What you have filled in for this request will be lost.</p>
            <div>
              <button type="button" className="review-back" onClick={() => setLeaving(false)}>Keep editing</button>
              <button type="button" className="nrf-leave__go" onClick={() => { setDirty(false); router.push("/requests"); }}>Discard request</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
