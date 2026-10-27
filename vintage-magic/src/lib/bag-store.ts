import { useSyncExternalStore } from "react";
import { type CartLine } from "./cart";

/**
 * The bag as an external store.
 *
 * `localStorage` is a system outside React, so it is read through `useSyncExternalStore` rather than
 * an effect that copies it into state: no extra render, no hydration mismatch (the server snapshot is
 * always the empty bag, the client swaps to the stored one after hydration), and every component that
 * shows a count subscribes to the same array.
 */

const STORAGE_KEY = "vm.bag.v1";

// Nothing ever mutates a snapshot in place; every write builds a new array before calling setLines().
const EMPTY: CartLine[] = [];

let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

function parseStored(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .map((entry) => ({ productId: typeof entry.productId === "string" ? entry.productId : "", quantity: Math.trunc(Number(entry.quantity)) }))
      .filter((entry) => entry.productId.length > 0 && Number.isFinite(entry.quantity) && entry.quantity > 0);
  } catch {
    return [];
  }
}

function read(): CartLine[] {
  if (lines) return lines;
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  lines = parseStored(stored);
  return lines;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): CartLine[] {
  return read();
}

export function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

export function setLines(next: CartLine[]): void {
  lines = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode or a full quota: the bag still works for this visit.
    }
  }
  emit();
}

export function useBagLines(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const NO_SUBSCRIBE = () => () => undefined;

/** True only after hydration - lets a count render a placeholder instead of guessing zero. */
export function useHydrated(): boolean {
  return useSyncExternalStore(NO_SUBSCRIBE, () => true, () => false);
}
