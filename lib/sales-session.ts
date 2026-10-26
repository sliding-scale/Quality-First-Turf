const storageKey = "qft-sales-session";

function readable(value: string | null) {
  return value !== null && value.length >= 32 ? value : null;
}

export function readSalesSession(): string | null {
  if (typeof window === "undefined") return null;
  return (
    readable(window.localStorage.getItem(storageKey)) ??
    readable(window.sessionStorage.getItem(storageKey))
  );
}

export function writeSalesSession(token: string, remember = true) {
  if (remember) {
    window.localStorage.setItem(storageKey, token);
    window.sessionStorage.removeItem(storageKey);
    return;
  }
  window.sessionStorage.setItem(storageKey, token);
  window.localStorage.removeItem(storageKey);
}

export function clearSalesSession() {
  window.localStorage.removeItem(storageKey);
  window.sessionStorage.removeItem(storageKey);
}
