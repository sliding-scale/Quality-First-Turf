const storageKey = "qft-sales-session";
const changeEvent = "qft-sales-session-change";

function readable(value: string | null) {
  return value !== null && value.length >= 32 ? value : null;
}

export function readSalesSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      readable(window.sessionStorage.getItem(storageKey)) ??
      readable(window.localStorage.getItem(storageKey))
    );
  } catch {
    return null;
  }
}

/** `remember` keeps the token across browser restarts; otherwise it ends with the tab. */
export function writeSalesSession(token: string, remember = false) {
  try {
    const keep = remember ? window.localStorage : window.sessionStorage;
    const drop = remember ? window.sessionStorage : window.localStorage;
    keep.setItem(storageKey, token);
    drop.removeItem(storageKey);
  } catch {
    // Storage blocked: the session lasts until the page is closed.
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function clearSalesSession() {
  try {
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing stored.
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeSalesSession(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}
