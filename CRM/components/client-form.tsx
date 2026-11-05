"use client";

/* New / edit client form (PRD client fields). Saves to the backend (convex/crm/clients.ts).
   A new client starts in the business selected in the top bar (D-031).
   Validation (D-035): nothing is flagged until the user tries to submit. Then every invalid field turns red with its
   message, the first one is focused, and each clears as soon as it is corrected. */

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_TYPES, CLIENT_TYPE_LABEL, type ClientType } from "@/convex/crm/lib/stages";
import { US_STATES } from "@/convex/shared/usStates";
import { useClient, useWorkspace, type BusinessDoc, type ClientDoc } from "@/lib/clients";
import { cleanEmail, cleanName, cleanZip, formatPhone, phoneDigits } from "@/lib/fields";
import { EmptyBackend } from "./empty-backend";
import { FormSkeleton } from "./skeletons";

export function ClientForm({ editId }: { editId?: string }) {
  const workspace = useWorkspace();
  const client = useClient(editId);
  if (workspace.state === "loading" || (editId !== undefined && client === undefined)) return <FormSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  if (editId !== undefined && client === null) {
    return (
      <div className="empty-state">
        <h2>Client not found</h2>
        <p>This client does not exist, or it was removed.</p>
        <Link className="btn primary" href="/clients">Back to clients</Link>
      </div>
    );
  }
  return <FormBody key={client?._id ?? "new"} editing={client ?? undefined} businesses={workspace.businesses} defaultBusiness={workspace.business._id} />;
}

function FormBody({ editing, businesses, defaultBusiness }: { editing?: ClientDoc; businesses: BusinessDoc[]; defaultBusiness: Id<"businesses"> }) {
  const router = useRouter();
  const create = useMutation(api.crm.clients.create);
  const update = useMutation(api.crm.clients.update);
  const [firstDefault, ...restDefault] = editing ? editing.contactName.split(" ") : [""];
  const [type, setType] = useState<ClientType>(editing?.type ?? "homeowner");
  const [first, setFirst] = useState(editing ? firstDefault : "");
  const [last, setLast] = useState(editing ? restDefault.join(" ") : "");
  const [company, setCompany] = useState(editing?.company ?? "");
  const [phone, setPhone] = useState(formatPhone(editing?.phone ?? ""));
  const [email, setEmail] = useState(editing?.email ?? "");
  const [business, setBusinessField] = useState<Id<"businesses">>(editing?.businessId ?? defaultBusiness);
  const [street1, setStreet1] = useState(editing?.street1 ?? "");
  const [street2, setStreet2] = useState(editing?.street2 ?? "");
  const [city, setCity] = useState(editing?.city ?? "");
  const [state, setState] = useState(editing?.state ?? "");
  const [zip, setZip] = useState(editing?.zip ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const firstRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = (editing ? `Edit ${editing.name}` : "New client") + " · Quality First Turf CRM";
  }, [editing]);

  // What is wrong right now. Shown only after the first submit attempt.
  const problems = {
    name: !first.trim() && !last.trim() && !company.trim(),
    phone: phone.trim() !== "" && phoneDigits(phone) < 10,
    email: email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    zip: zip !== "" && zip.length < 5,
  };
  const bad = {
    name: attempted && problems.name,
    phone: attempted && problems.phone,
    email: attempted && problems.email,
    zip: attempted && problems.zip,
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (problems.name || problems.phone || problems.email || problems.zip) {
      (problems.name ? firstRef : problems.phone ? phoneRef : problems.email ? emailRef : zipRef).current?.focus();
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      // The backend checks every field again with the same rules, and works out the display name itself.
      const payload = { businessId: business, type, first, last, company, phone, email, street1, street2, city, state, zip, notes };
      if (editing) {
        await update({ id: editing._id, ...payload });
        router.push(`/clients/${editing._id}`);
      } else {
        const id = await create(payload);
        router.push(`/clients?saved=${id}`);
      }
    } catch (err) {
      setServerError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "The client could not be saved. Try again.");
      setSaving(false);
    }
  }

  return (
    <form className="form-wrap fade-in" noValidate onSubmit={submit}>
      <h1>{editing ? "Edit Client" : "New Client"}</h1>

      <section className="fsec">
        <div><h3>Contact details</h3><p>The main point of contact for this client.</p></div>
        <div className="fields-col">
          <div className="field">
            <label>Client type</label>
            <div className="seg-radio" role="radiogroup" aria-label="Client type">
              {CLIENT_TYPES.map((t) => (
                <label key={t}>
                  <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
                  <span>{CLIENT_TYPE_LABEL[t]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="frow">
            <div className={`field${bad.name ? " bad" : ""}`}>
              <label htmlFor="first">First name</label>
              <input id="first" name="first" autoComplete="off" ref={firstRef} aria-invalid={bad.name} value={first} onChange={(e) => setFirst(cleanName(e.target.value))} />
            </div>
            <div className={`field${bad.name ? " bad" : ""}`}>
              <label htmlFor="last">Last name</label>
              <input id="last" name="last" autoComplete="off" aria-invalid={bad.name} value={last} onChange={(e) => setLast(cleanName(e.target.value))} />
            </div>
          </div>
          <div className={`field${bad.name ? " bad" : ""}`}>
            <label htmlFor="company">Company name (where applicable)</label>
            <input id="company" name="company" autoComplete="off" aria-invalid={bad.name} aria-describedby="company-err" value={company} onChange={(e) => setCompany(e.target.value)} />
            <div className="err" id="company-err" role={bad.name ? "alert" : undefined}>Enter a first name, last name or company name.</div>
          </div>
          <div className={`field${bad.phone ? " bad" : ""}`}>
            <label htmlFor="phone">Phone number</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={14} placeholder="(555) 123-4567" ref={phoneRef} aria-invalid={bad.phone} aria-describedby="phone-err" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
            <div className="err" id="phone-err" role={bad.phone ? "alert" : undefined}>Enter a 10-digit phone number.</div>
          </div>
          <div className={`field${bad.email ? " bad" : ""}`}>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="jane@example.com" ref={emailRef} aria-invalid={bad.email} aria-describedby="email-err" value={email} onChange={(e) => setEmail(cleanEmail(e.target.value))} />
            <div className="err" id="email-err" role={bad.email ? "alert" : undefined}>Enter a valid email address.</div>
          </div>
          <div className="field">
            <label htmlFor="business">Business</label>
            <select id="business" name="business" value={business} onChange={(e) => setBusinessField(e.target.value as Id<"businesses">)}>
              {businesses.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="fsec">
        <div><h3>Address</h3><p>The property address for this client.</p></div>
        <div className="fields-col">
          <div className="field"><label htmlFor="street1">Street 1</label><input id="street1" name="street1" autoComplete="off" value={street1} onChange={(e) => setStreet1(e.target.value)} /></div>
          <div className="field"><label htmlFor="street2">Street 2</label><input id="street2" name="street2" autoComplete="off" value={street2} onChange={(e) => setStreet2(e.target.value)} /></div>
          <div className="frow">
            <div className="field"><label htmlFor="city">City</label><input id="city" name="city" autoComplete="off" value={city} onChange={(e) => setCity(cleanName(e.target.value))} /></div>
            <div className="field">
              <label htmlFor="state">State</label>
              <select id="state" name="state" autoComplete="address-level1" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Select a state</option>
                {US_STATES.map((st) => (
                  <option key={st.abbr} value={st.abbr}>{st.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={`field${bad.zip ? " bad" : ""}`} style={{ maxWidth: 240 }}>
            <label htmlFor="zip">ZIP code</label>
            <input id="zip" name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="92592" ref={zipRef} aria-invalid={bad.zip} aria-describedby="zip-err" value={zip} onChange={(e) => setZip(cleanZip(e.target.value))} />
            <div className="err" id="zip-err" role={bad.zip ? "alert" : undefined}>Enter a 5-digit ZIP code.</div>
          </div>
        </div>
      </section>

      <section className="fsec">
        <div><h3>Notes</h3><p>Internal notes about this client.</p></div>
        <div className="fields-col">
          <div className="field"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </section>

      {serverError && <div className="form-error" role="alert">{serverError}</div>}

      <div className="form-actions">
        <div className="inner">
          <Link className="btn plain" href={editing ? `/clients/${editing._id}` : "/clients"}>Cancel</Link>
          <div className="right"><button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save client"}</button></div>
        </div>
      </div>
    </form>
  );
}
