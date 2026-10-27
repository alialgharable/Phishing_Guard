import { useSyncExternalStore } from "react";

/**
 * Motion capability checks shared by the GSAP helpers and the components, so a device that asked
 * for less movement gets less movement everywhere - including the pointer parallax a touch device
 * should never run.
 *
 * The media query is an outside system, so it is subscribed to rather than copied into state in an
 * effect. The server snapshot is `false` for both queries: markup that only exists for a fine pointer
 * or appears only when motion is allowed renders the same on both sides of hydration.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

function useMediaFlag(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () => (typeof window === "undefined" || !window.matchMedia ? false : window.matchMedia(query).matches),
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaFlag("(prefers-reduced-motion: reduce)");
}

export function useHasFinePointer(): boolean {
  return useMediaFlag("(hover: hover) and (pointer: fine)");
}
