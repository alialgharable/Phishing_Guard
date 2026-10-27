"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

/**
 * A link that hands the garment image to the next page through the View Transition API.
 *
 * The transition name is applied to the clicked card only, moments before navigation, so a grid
 * never ends up with twelve elements sharing one name (which the spec treats as a conflict). If
 * the browser has no `startViewTransition`, or the transition is interrupted, this degrades to an
 * ordinary client-side navigation and the element is un-named again - no fallback markup, no
 * duplicated image, no waiting on animation before the page changes.
 */

type WithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

export interface PieceLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel: string;
  /** Selector inside this element for the image that should morph. */
  transitionTarget?: string;
}

export function PieceLink({ href, className, children, ariaLabel, transitionTarget = "[data-vt-target]" }: PieceLinkProps) {
  const router = useRouter();

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const doc = document as WithViewTransition;
      if (typeof doc.startViewTransition !== "function") return; // plain Next.js navigation

      event.preventDefault();
      const scope = event.currentTarget as HTMLElement;
      const target = transitionTarget ? scope.querySelector<HTMLElement>(transitionTarget) : null;
      if (target) target.style.viewTransitionName = "piece";

      const transition = doc.startViewTransition(() => router.push(href));
      void transition.finished.finally(() => {
        if (target) target.style.viewTransitionName = "";
      });
    },
    [href, router, transitionTarget],
  );

  return (
    <Link href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
