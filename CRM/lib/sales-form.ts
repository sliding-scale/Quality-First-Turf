/* Where the CRM may send a person after the sales-form hand-off (D-053). A redirect to a page named in the address would let anyone
   build a link that sends a sign-in code to their own site, so only the sales form's own origins are accepted. The production one is
   built in; extra ones (a local copy of the forms app) are listed in NEXT_PUBLIC_SALES_FORM_ORIGINS, comma-separated. */

const ORIGINS = (process.env.NEXT_PUBLIC_SALES_FORM_ORIGINS ?? "https://forms.qualityfirstturf.com")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/** The origin to return to, or null when it is missing or not one of the allowed ones. */
export function salesFormOrigin(value: string | null): string | null {
  if (!value) return null;
  const origin = value.trim().replace(/\/+$/, "");
  return ORIGINS.includes(origin) ? origin : null;
}

/** A path inside the sales area (/visit...), or /visit when the value is missing or points anywhere else. */
export function salesFormPath(value: string | null): string {
  if (!value || !value.startsWith("/visit") || value.startsWith("//") || value.includes("\\")) return "/visit";
  return value;
}
