"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/** Registered once, lazily, so the plugin never touches the server render. */
export function registerMotion(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Creates a GSAP context for a subtree, returns the scope ref, and reverts every tween and
 * ScrollTrigger created inside it on cleanup - including hot reloads in development.
 */
export function useMotionScope<T extends HTMLElement>() {
  const scope = useRef<T | null>(null);
  const context = useRef<gsap.Context | null>(null);

  useEffect(() => {
    return () => {
      context.current?.revert();
      context.current = null;
    };
  }, []);

  const run = (build: (root: T) => void): void => {
    if (!scope.current) return;
    registerMotion();
    context.current?.revert();
    context.current = gsap.context(() => build(scope.current as T), scope);
  };

  return { scope, run };
}

export { gsap, ScrollTrigger };
