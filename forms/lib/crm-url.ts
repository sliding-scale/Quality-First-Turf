/** An address on the CRM (where the Clerk sign-in lives), or null when this deployment has no NEXT_PUBLIC_CRM_URL. */
export function crmUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_CRM_URL?.trim().replace(/\/+$/, "");
  return base ? base + path : null;
}
