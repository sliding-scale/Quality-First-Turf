import { env } from "../_generated/server";

export type SalesAccount = { email: string; password: string; name: string };

/** "jane.doe@x.com" becomes "Jane Doe" when no display name was configured. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.split(/[._\-+\s]+/).filter((word) => word !== "");
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || email;
}

/**
 * Every salesperson who can sign in. SALES_ACCOUNTS holds a JSON list such as
 * `[{"email":"jane@x.com","password":"…","name":"Jane Doe"}]`; the older shared login
 * (SALES_EMAIL / SALES_PASSWORD, optional SALES_NAME) still works and is listed first.
 */
export function configuredAccounts(): SalesAccount[] {
  const accounts: SalesAccount[] = [];
  const email = env.SALES_EMAIL?.trim() ?? "";
  const password = env.SALES_PASSWORD ?? "";
  if (email !== "" && password !== "") {
    accounts.push({ email, password, name: env.SALES_NAME?.trim() || nameFromEmail(email) });
  }
  const listed = env.SALES_ACCOUNTS?.trim() ?? "";
  if (listed !== "") {
    try {
      const parsed: unknown = JSON.parse(listed);
      for (const entry of Array.isArray(parsed) ? parsed : []) {
        const item = entry as { email?: unknown; password?: unknown; name?: unknown };
        if (typeof item.email !== "string" || typeof item.password !== "string") continue;
        const itemEmail = item.email.trim();
        if (itemEmail === "" || item.password === "") continue;
        if (accounts.some((account) => account.email.trim().toLowerCase() === itemEmail.toLowerCase())) continue;
        const name = typeof item.name === "string" && item.name.trim() !== "" ? item.name.trim() : nameFromEmail(itemEmail);
        accounts.push({ email: itemEmail, password: item.password, name });
      }
    } catch {
      console.error("SALES_ACCOUNTS is not valid JSON, so only the shared login is available.");
    }
  }
  return accounts;
}

/** The display name for a salesperson's email, or a tidied version of the email when unknown. */
export function salespersonName(email: string): string {
  const wanted = email.trim().toLowerCase();
  const account = configuredAccounts().find((item) => item.email.trim().toLowerCase() === wanted);
  return account?.name ?? nameFromEmail(email);
}
