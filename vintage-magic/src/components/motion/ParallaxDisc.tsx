"use client";

import { useEffect } from "react";
import { gsap, registerMotion, useMotionScope } from "@/lib/motion/gsap";
import { prefersReducedMotion } from "@/lib/motion/capabilities";

/**
 * A decorative disc that drifts at its own rate while its section passes.
 *
 * ScrollTrigger with `scrub` rather than a scroll listener: one ticker for the page, no layout
 * thrash (transform only), and `context.revert()` removes the trigger and the tween together.
 * Reduced-motion visitors get the static shape and no trigger at all.
 */

export interface ParallaxDiscProps {
  className?: string;
  /** Fraction of the section's travel to shift by, e.g. 0.12 = 12%. */
  speed?: number;
  rotate?: number;
  as?: "disc" | "ring" | "blob" | "hatch";
  id?: string;
}

export function ParallaxDisc({ className, speed = 0.1, rotate = 0, as = "disc", id }: ParallaxDiscProps) {
  const { scope, run } = useMotionScope<HTMLDivElement>();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    run((root) => {
      registerMotion();
      gsap.to(root, {
        yPercent: speed * 100,
        rotate: rotate || undefined,
        ease: "none",
        scrollTrigger: { trigger: root.parentElement ?? root, start: "top bottom", end: "bottom top", scrub: 1.1 },
      });
    });
  }, [run, speed, rotate]);

  const shape = as === "ring" ? "rounded-full border border-ink/18" : as === "blob" ? "blob dot-field opacity-45" : as === "hatch" ? "hatch rounded-full opacity-35" : "disc-fill rounded-full";

  return <div ref={scope} id={id} aria-hidden className={`pointer-events-none absolute ${shape} ${className ?? ""}`} />;
}
