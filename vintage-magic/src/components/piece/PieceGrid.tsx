"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Product } from "@/lib/types";
import { PieceCard, type PieceFrame, type PieceRatio } from "./PieceCard";

/**
 * The asymmetrical archive grid.
 *
 * Layout is a repeating editorial rhythm rather than a uniform column count: each slot carries its
 * own span, ratio and frame so the composition never reads as a template row. When a filter
 * changes, `layout` + shared keys let pieces travel to their new slots instead of blinking, and
 * `mode="popLayout"` takes removed pieces out of flow so the reflow stays smooth. With reduced
 * motion the wrapper stops animating entirely - same DOM, no springs.
 */

interface Slot {
  span: string;
  ratio: PieceRatio;
  frame: PieceFrame;
}

const EDITORIAL: Slot[] = [
  { span: "lg:col-span-7", ratio: "tall", frame: "arch" },
  { span: "lg:col-span-5", ratio: "portrait", frame: "plain" },
  { span: "sm:col-span-6 lg:col-span-4", ratio: "square", frame: "plain" },
  { span: "sm:col-span-6 lg:col-span-4", ratio: "portrait", frame: "arch" },
  { span: "lg:col-span-4", ratio: "wide", frame: "plain" },
  { span: "sm:col-span-6 lg:col-span-5", ratio: "portrait", frame: "plain" },
  { span: "sm:col-span-6 lg:col-span-7", ratio: "tall", frame: "plain" },
  { span: "lg:col-span-4", ratio: "square", frame: "arch" },
];

const STEADY: Slot[] = [
  { span: "sm:col-span-6 lg:col-span-4", ratio: "portrait", frame: "plain" },
  { span: "sm:col-span-6 lg:col-span-4", ratio: "tall", frame: "arch" },
  { span: "sm:col-span-6 lg:col-span-4", ratio: "portrait", frame: "plain" },
];

export interface PieceGridProps {
  products: Product[];
  /** Start numbering at this index, so a filtered page still shows true archive numbers. */
  startNumber?: number;
  rhythm?: "editorial" | "steady";
  priorityCount?: number;
  showAdd?: boolean;
}

export function PieceGrid({ products, startNumber = 1, rhythm = "editorial", priorityCount = 2, showAdd = true }: PieceGridProps) {
  const reduce = useReducedMotion();
  const slots = rhythm === "steady" ? STEADY : EDITORIAL;
  const transition = { type: "spring" as const, stiffness: 380, damping: 38, mass: 0.8 };

  return (
    <motion.div layout={!reduce} transition={transition} className="piece-grid">
      <AnimatePresence mode={reduce ? "sync" : "popLayout"} initial={false}>
        {products.map((product, index) => {
          const slot = slots[index % slots.length]!;
          return (
            <motion.div
              key={product.id}
              layout={!reduce}
              transition={transition}
              initial={reduce ? false : { opacity: 0, y: 22, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
              className={["col-span-12 min-w-0", slot.span].join(" ")}
              style={{ transitionDelay: reduce ? undefined : `${Math.min(index * 26, 180)}ms` }}
            >
              <PieceCard
                product={product}
                number={startNumber + index}
                ratio={slot.ratio}
                frame={slot.frame}
                priority={index < priorityCount}
                showAdd={showAdd}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
