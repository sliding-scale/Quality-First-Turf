const storageKey = "qft-sales-session";

export function readSalesSession(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(storageKey);
  return value !== null && value.length >= 32 ? value : null;
}

export function writeSalesSession(token: string) {
  window.localStorage.setItem(storageKey, token);
}

export function clearSalesSession() {
  window.localStorage.removeItem(storageKey);
}
