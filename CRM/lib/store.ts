"use client";

/* A tiny localStorage-backed store for the sample-data stage (D-013). Values are strings so that
   useSyncExternalStore snapshots stay stable. Every read and write is wrapped: storage can be blocked,
   and the screens must still work for that page load. */

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// If storage is unavailable, writes still apply for this page load.
const memory = new Map<string, string>();

export function readItem(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* storage unavailable */
  }
  return memory.get(key) ?? null;
}

export function writeItem(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the in-memory copy still works for this page load */
  }
  emit();
}

/** The stored string for `key`, or `fallback` (also used on the server and during hydration). */
export function useStoredString(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readItem(key) ?? fallback,
    () => fallback,
  );
}

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards. Screens that depend on the browser render only when true. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
