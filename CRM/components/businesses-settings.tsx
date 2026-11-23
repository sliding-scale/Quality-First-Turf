"use client";

/* Settings → Businesses (D-112): the selected business's logo and its phone, email and website. An Admin changes them; everyone else
   sees them as plain text. The name is shown but not edited here: it is tied to code (lib/businessNames.ts). The backend checks every
   field again with the same rules (checkCompanyDetails), so the screen is never the only guard. */

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { checkCompanyDetails, MAX_EMAIL, MAX_WEBSITE } from "@/convex/crm/lib/companyDetails";
import { brandLogo } from "@/lib/brand";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { cleanEmail, formatPhone } from "@/lib/fields";
import { BusinessesSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function BusinessesSettings() {
  const ws = useWorkspace();
  if (ws.state === "loading") return <BusinessesSkeleton />;
  if (ws.state === "empty") return <div className="empty-state"><h2>No businesses yet</h2></div>;
  // Keyed by business, so switching business in the top bar starts the form again from that business's saved values.
  return <DetailsForm key={ws.business._id} business={ws.business} />;
}

function DetailsForm({ business }: { business: BusinessDoc }) {
  const staff = useStaff();
  const { toast } = useUI();
  const save = useMutation(api.crm.businesses.saveDetails);
  const [phone, setPhone] = useState(business.phone ?? "");
  const [email, setEmail] = useState(business.email ?? "");
  const [website, setWebsite] = useState(business.website ?? "");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const logo = brandLogo(business.slug);

  const checked = checkCompanyDetails({ phone, email, website });
  const problems = checked.ok ? {} : checked.problems;
  const changed = phone !== (business.phone ?? "") || email !== (business.email ?? "") || website !== (business.website ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!checked.ok) {
      (problems.phone ? phoneRef : problems.email ? emailRef : websiteRef).current?.focus();
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      await save({ businessId: business._id, ...checked.value });
      // Show what was stored (the phone formatted, https:// added) rather than what was typed.
      setPhone(checked.value.phone);
      setWebsite(checked.value.website);
      setAttempted(false);
      toast("Business details saved");
    } catch (err) {
      setServerError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "The details could not be saved. Try again.");
    }
    setSaving(false);
  }

  const brand = (
    <div className="card bz-head">
      <Image className="bz-logo" src={logo.src} alt="" width={logo.width * 2} height={logo.height * 2} />
      <div>
        <div className="bz-label">Business name</div>
        <div className="bz-name">{business.name}</div>
      </div>
    </div>
  );

  if (!staff.isAdmin) {
    return (
      <div className="fade-in bz">
        <div className="page-head"><h1>Businesses</h1></div>
        {brand}
        <dl className="card bz-read">
          <div><dt>Phone</dt><dd>{business.phone || "Not set"}</dd></div>
          <div><dt>Email</dt><dd>{business.email || "Not set"}</dd></div>
          <div><dt>Website</dt><dd>{business.website || "Not set"}</dd></div>
        </dl>
        <p className="au-lead">Only an Admin can change these details.</p>
      </div>
    );
  }

  const bad = { phone: attempted && !!problems.phone, email: attempted && !!problems.email, website: attempted && !!problems.website };
  return (
    <form className="fade-in bz" onSubmit={submit} noValidate>
      <div className="page-head">
        <h1>Businesses</h1>
        <button type="submit" className="btn primary" disabled={saving || !changed}>{saving ? "Saving…" : "Save"}</button>
      </div>
      <p className="au-lead">Contact details for {business.name}. Switch business in the top bar to change another. They are for the team and for documents that show them; nothing already sent changes.</p>
      {brand}
      <div className="card bz-fields">
        <div className={`jwrap${bad.phone ? " bad" : ""}`}>
          <div className="jgroup">
            <label className="fl">
              <input id="bz-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={14} placeholder=" " ref={phoneRef} aria-invalid={bad.phone} aria-describedby="bz-phone-err" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              <span>Phone number</span>
            </label>
          </div>
          <div className="err" id="bz-phone-err" role={bad.phone ? "alert" : undefined}>{problems.phone}</div>
        </div>
        <div className={`jwrap${bad.email ? " bad" : ""}`}>
          <div className="jgroup">
            <label className="fl">
              <input id="bz-email" type="email" autoComplete="off" maxLength={MAX_EMAIL} placeholder=" " ref={emailRef} aria-invalid={bad.email} aria-describedby="bz-email-err" value={email} onChange={(e) => setEmail(cleanEmail(e.target.value))} />
              <span>Email</span>
            </label>
          </div>
          <div className="err" id="bz-email-err" role={bad.email ? "alert" : undefined}>{problems.email}</div>
        </div>
        <div className={`jwrap${bad.website ? " bad" : ""}`}>
          <div className="jgroup">
            <label className="fl">
              <input id="bz-website" autoComplete="off" maxLength={MAX_WEBSITE} placeholder=" " ref={websiteRef} aria-invalid={bad.website} aria-describedby="bz-website-err" value={website} onChange={(e) => setWebsite(e.target.value.replace(/\s/g, ""))} />
              <span>Website</span>
            </label>
          </div>
          <div className="err" id="bz-website-err" role={bad.website ? "alert" : undefined}>{problems.website}</div>
        </div>
      </div>
      {serverError && <div className="form-error" role="alert">{serverError}</div>}
    </form>
  );
}
