/* A business's own contact details (Settings > Businesses, D-112). Pure TypeScript: the screen and the backend run the same check, so the
   UI is never the only guard (CRM/CLAUDE.md rule 3). All three fields are optional; an empty one is removed. */

import { formatPhone, isValidEmail, phoneDigits } from "./fields";

export type CompanyDetailsInput = { phone: string; email: string; website: string };
export type CompanyDetailsProblems = Partial<Record<keyof CompanyDetailsInput, string>>;

export const MAX_EMAIL = 120;
export const MAX_WEBSITE = 200;

/** `example.com` becomes `https://example.com`. Only http and https are kept; any other scheme (javascript:, ftp://) is refused. */
function cleanWebsite(raw: string): string | null {
  if (raw === "") return "";
  if (/\s/.test(raw)) return null;
  const hasScheme = /^https?:\/\//i.test(raw);
  // Another scheme: `ftp://x`, `javascript:alert(1)`. A bare `host:8080` is not one.
  if (!hasScheme && (raw.includes("://") || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw))) return null;
  const url = hasScheme ? raw : `https://${raw}`;
  if (url.length > MAX_WEBSITE) return null;
  try {
    return new URL(url).hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

export function checkCompanyDetails(i: CompanyDetailsInput): { ok: true; value: CompanyDetailsInput } | { ok: false; problems: CompanyDetailsProblems } {
  const problems: CompanyDetailsProblems = {};
  const phone = i.phone.trim();
  const email = i.email.trim();
  if (phone !== "" && phoneDigits(phone) !== 10 && !(phoneDigits(phone) === 11 && phone.replace(/\D/g, "")[0] === "1")) problems.phone = "Enter a 10-digit phone number.";
  if (email !== "" && (email.length > MAX_EMAIL || !isValidEmail(email))) problems.email = "Enter a valid email address.";
  const website = cleanWebsite(i.website.trim());
  if (website === null) problems.website = "Enter a website address such as example.com.";
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, value: { phone: formatPhone(phone), email, website: website ?? "" } };
}
