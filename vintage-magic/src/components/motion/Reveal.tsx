"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

/**
 * Scroll reveal wrapper.
 *
 * IntersectionObserver does the triggering and a CSS class does the animating (see
 * `src/styles/kit.css`), which keeps the effect on the compositor and costs nothing once an
 * element has been seen. The observer disconnects after firing, and reduced-motion users get the
 * final state immediately because the class is applied on the first frame.
 */

export type RevealVariant = "up" | "side" | "scale" | "open" | "rule";

export interface RevealProps {
  as?: ElementType;
  variant?: RevealVariant;
  delayMs?: number;
  /** 0-1: how much of the element must be visible before it starts. */
  threshold?: number;
  className?: string;
  children?: React.ReactNode;
  id?: string;
  /** Extra inline custom properties, e.g. --reveal-x for the side variant. */
  style?: React.CSSProperties;
  ariaHidden?: boolean;
}

export function useInView<T extends HTMLElement>(options: { threshold?: number; once?: boolean } = {}) {
  const ref = useRef<T | null>(null);
  // Where IntersectionObserver does not exist the content is simply already revealed - decided
  // while building state, so no effect has to write to it.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  const { threshold = 0.18, once = true } = options;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once]);

  return { ref, inView };
}

export function Reveal({ as: Tag = "div", variant = "up", delayMs = 0, threshold = 0.18, className, children, id, style, ariaHidden }: RevealProps) {
  const { ref, inView } = useInView<HTMLElement>({ threshold });

  return (
    <Tag
      id={id}
      ref={ref}
      data-reveal={variant}
      className={[className, inView ? "is-visible" : ""].filter(Boolean).join(" ") || undefined}
      style={{ ...style, "--reveal-delay": `${delayMs}ms` } as React.CSSProperties}
      {...(ariaHidden ? { "aria-hidden": true } : {})}
    >
      {children}
    </Tag>
  );
}
