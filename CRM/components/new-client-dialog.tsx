"use client";

/* "New client" from inside another form (a request or a quote), like Jobber's "+ New Client" in its client picker. The full form is
   still at Clients → New Client; this one asks only for what is needed to pick the client straight away: the type, a name, how to
   reach them and the service address. It saves through the same crm/clients:create, so the backend applies the same checks.
   Invalid fields turn red on Save, not while typing (D-035). */

import { useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_TYPES, CLIENT_TYPE_LABEL, type ClientType } from "@/convex/crm/lib/stages";
import { US_STATES } from "@/convex/shared/usStates";
import { cleanEmail, cleanName, cleanZip, formatPhone, phoneDigits } from "@/lib/fields";
import { failure } from "@/lib/pipeline";
import { PipelineModal } from "./pipeline-dialogs";

/** What was typed in the search box, as a first and last name to start from (one word is a first name). */
function splitName(typed: string): { first: string; last: string } {
  const words = cleanName(typed).trim().split(/\s+/).filter(Boolean);
  return { first: words[0] ?? "", last: words.slice(1).join(" ") };
}

export function NewClientDialog({ businessId, typed, onCreated, onClose }: {
  businessId: Id<"businesses">;
  typed: string;
  onCreated: (client: { id: Id<"clients">; name: string }) => void;
  onClose: () => void;
}) {
  const create = useMutation(api.crm.clients.create);
  const start = splitName(typed);
  const [type, setType] = useState<ClientType>("homeowner");
  const [first, setFirst] = useState(start.first);
  const [last, setLast] = useState(start.last);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street1, setStreet1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const problems = {
    name: !first.trim() && !last.trim() && !company.trim(),
    phone: phone.trim() !== "" && phoneDigits(phone) < 10,
    email: email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    zip: zip !== "" && zip.length < 5,
  };
  const bad = (k: keyof typeof problems) => attempted && problems[k];

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setAttempted(true);
    if (problems.name || problems.phone || problems.email || problems.zip) {
      (problems.name ? firstRef : problems.phone ? phoneRef : problems.email ? emailRef : zipRef).current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await create({ businessId, type, first, last, company, phone, email, street1, street2: "", city, state, zip, notes: "" });
      const person = [first.trim(), last.trim()].filter(Boolean).join(" ") || company.trim();
      onCreated({ id, name: type === "contractor" && company.trim() ? company.trim() : person });
      close();
    } catch (err) {
      setError(failure(err, "The client could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title="New client" onClose={onClose} busy={busy} className="nc-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <div className="seg-radio" role="radiogroup" aria-label="Client type">
            {CLIENT_TYPES.map((t) => (
              <label key={t}>
                <input type="radio" name="nc-type" value={t} checked={type === t} onChange={() => setType(t)} />
                <span>{CLIENT_TYPE_LABEL[t]}</span>
              </label>
            ))}
          </div>
          <div className="nc-grid">
            <div className={`field${bad("name") ? " bad" : ""}`}>
              <label htmlFor="nc-first">First name</label>
              <input id="nc-first" ref={firstRef} autoComplete="off" aria-invalid={bad("name")} value={first} onChange={(e) => setFirst(cleanName(e.target.value))} />
            </div>
            <div className={`field${bad("name") ? " bad" : ""}`}>
              <label htmlFor="nc-last">Last name</label>
              <input id="nc-last" autoComplete="off" aria-invalid={bad("name")} value={last} onChange={(e) => setLast(cleanName(e.target.value))} />
            </div>
            <div className={`field nc-wide${bad("name") ? " bad" : ""}`}>
              <label htmlFor="nc-company">Company name</label>
              <input id="nc-company" autoComplete="off" aria-invalid={bad("name")} value={company} onChange={(e) => setCompany(e.target.value)} />
              <span className="err">Enter a first name, last name or company name.</span>
            </div>
            <div className={`field${bad("phone") ? " bad" : ""}`}>
              <label htmlFor="nc-phone">Phone number</label>
              <input id="nc-phone" ref={phoneRef} type="tel" inputMode="tel" maxLength={14} aria-invalid={bad("phone")} value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              <span className="err">Enter a 10-digit phone number.</span>
            </div>
            <div className={`field${bad("email") ? " bad" : ""}`}>
              <label htmlFor="nc-email">Email</label>
              <input id="nc-email" ref={emailRef} type="email" aria-invalid={bad("email")} value={email} onChange={(e) => setEmail(cleanEmail(e.target.value))} />
              <span className="err">Enter a valid email address.</span>
            </div>
            <div className="field nc-wide">
              <label htmlFor="nc-street">Street address</label>
              <input id="nc-street" autoComplete="off" value={street1} onChange={(e) => setStreet1(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nc-city">City</label>
              <input id="nc-city" autoComplete="off" value={city} onChange={(e) => setCity(cleanName(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="nc-state">State</label>
              <select id="nc-state" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Select a state</option>
                {US_STATES.map((st) => <option key={st.abbr} value={st.abbr}>{st.name}</option>)}
              </select>
            </div>
            <div className={`field${bad("zip") ? " bad" : ""}`}>
              <label htmlFor="nc-zip">ZIP code</label>
              <input id="nc-zip" ref={zipRef} inputMode="numeric" maxLength={5} aria-invalid={bad("zip")} value={zip} onChange={(e) => setZip(cleanZip(e.target.value))} />
              <span className="err">Enter a 5-digit ZIP code.</span>
            </div>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save client"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}
