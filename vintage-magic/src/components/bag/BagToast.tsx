"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useBag } from "./BagProvider";

/**
 * Confirmation of a bag change. Announced politely so screen readers pick it up without stealing
 * the current reading position, and it never blocks the next interaction.
 */
export function BagToast() {
  const { lastMessage } = useBag();
  const reduce = useReducedMotion();

  return (
    <div aria-live="polite" aria-atomic className="pointer-events-none fixed bottom-5 left-1/2 z-[80] w-[min(92vw,26rem)] -translate-x-1/2">
      <AnimatePresence initial={false}>
        {lastMessage ? (
          <motion.div
            key={lastMessage}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="toast pointer-events-auto flex items-center justify-between gap-4 rounded-sm border border-ink/25 bg-ivory/97 px-4 py-3 shadow-[0_22px_48px_-30px_rgba(30,29,26,0.45)] backdrop-blur-sm"
          >
            <span className="text-[0.95rem] leading-snug">{lastMessage}</span>
            <Link href="/bag" className="label whitespace-nowrap underline-offset-4 hover:underline">
              View bag
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
