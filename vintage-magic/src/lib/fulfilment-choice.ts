import { useCallback, useSyncExternalStore } from "react";
import type { FulfilmentId } from "./types";

/**
 * Which fulfilment method the visitor picked, remembered between the bag and the checkout.
 *
 * Convenience state only: the order endpoint re-reads the id from shop config and refuses anything it
 * does not recognise, so a stale or tampered value cannot invent a delivery fee. It is stored as an
 * external store so the value can be read from `localStorage` without an effect copying it into
 * state, and the server snapshot is the shop's first option - which is exactly what the server-rendered
 * markup shows, so hydration matches.
 */

const KEY = "vm.fulfilment";

let cached: string | null | undefined;
const listeners = new Set<() => void>();

function read(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = () => {
    cached = undefined;
    listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }
  return () => listeners.delete(listener);
}

export function writeFulfilment(id: FulfilmentId): void {
  cached = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Ignored: the choice simply does not survive the tab.
  }
  for (const listener of listeners) listener();
}

export function readFulfilment(fallback: FulfilmentId): FulfilmentId {
  const stored = read();
  return stored && stored.length > 0 ? (stored as FulfilmentId) : fallback;
}

export function useFulfilmentChoice(fallback: FulfilmentId | null): [FulfilmentId | null, (id: FulfilmentId) => void] {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((id: FulfilmentId) => writeFulfilment(id), []);
  const resolved = stored && stored.length > 0 ? (stored as FulfilmentId) : fallback;
  return [resolved, set];
}
