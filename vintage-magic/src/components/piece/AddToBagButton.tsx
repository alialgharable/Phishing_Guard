"use client";

import { useState } from "react";
import { useBag } from "@/components/bag/BagProvider";
import { availabilityOf } from "@/lib/catalog";
import type { Product } from "@/lib/types";

/**
 * Adds a piece to the bag. The button is deliberately a plain control with no animation in front
 * of the action: the state change is instant, the feedback is a label swap plus the header pill.
 * A one-of-one piece already in the bag cannot be added twice, and a collected piece has no path
 * to this control at all.
 */

export interface AddToBagButtonProps {
  product: Pick<Product, "id" | "quantity" | "name">;
  size?: "compact" | "full";
  className?: string;
}

export function AddToBagButton({ product, size = "full", className }: AddToBagButtonProps) {
  const bag = useBag();
  const [pulse, setPulse] = useState(false);
  const availability = availabilityOf(product);
  const inBag = bag.contains(product.id);
  const bagged = bag.lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const remaining = availability.quantity - bagged;
  const disabled = remaining <= 0;

  const label = disabled
    ? availability.collected
      ? "Collected"
      : inBag
        ? "Already in your bag"
        : "No more in the archive"
    : inBag
      ? size === "compact"
        ? "Add another"
        : `Add another - ${remaining} left`
      : size === "compact"
        ? "Bag"
        : availability.isOneOfAKind
          ? "Take the only one"
          : "Add to bag";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        bag.add(product.id, remaining > 0 ? remaining : 0, 1);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 460);
      }}
      className={[
        size === "compact" ? "label rounded-full border px-3 py-1.5" : "btn w-full sm:w-auto justify-between",
        disabled ? "cursor-not-allowed border-ink/20 text-ink/35" : "border-ink/30 hover:border-ink",
        pulse ? "bag-flash" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={size === "compact" ? `${label}: ${product.name}` : undefined}
    >
      <span>{label}</span>
      {!disabled && size === "full" ? (
        <span aria-hidden className="label opacity-70">
          {availability.isOneOfAKind ? "01/01" : `${String(availability.quantity).padStart(2, "0")} left`}
        </span>
      ) : null}
    </button>
  );
}
