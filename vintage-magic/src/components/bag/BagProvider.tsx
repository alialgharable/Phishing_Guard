"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { addToCart, cartCount, removeFromCart, setLineQuantity, type CartLine } from "@/lib/cart";
import { setLines, useBagLines, useHydrated } from "@/lib/bag-store";

/**
 * The bag in the DOM tree: everything reads and writes through the external store in
 * `@/lib/bag-store`, and this provider only adds the mutating helpers and the ephemeral "you just
 * added something" message. Ids and quantities only - never prices, never availability. The server
 * recomputes both when the bag is rendered, and again inside the order transaction, so a stale tab
 * cannot buy something that has already been collected.
 */

export interface BagApi {
  lines: CartLine[];
  ready: boolean;
  count: number;
  /** Increments on every accepted add so the header pill can react. */
  flash: number;
  lastMessage: string | null;
  contains: (productId: string) => boolean;
  add: (productId: string, available: number, requested?: number) => boolean;
  setQuantity: (productId: string, quantity: number, available: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  replace: (lines: CartLine[]) => void;
}

const BagContext = createContext<BagApi | null>(null);

export function BagProvider({ children }: { children: ReactNode }) {
  const lines = useBagLines();
  const ready = useHydrated();
  const [flash, setFlash] = useState(0);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const announce = useCallback((message: string) => {
    setLastMessage(message);
    window.setTimeout(() => setLastMessage((current) => (current === message ? null : current)), 4200);
  }, []);

  const add = useCallback(
    (productId: string, available: number, requested = 1) => {
      const result = addToCart(lines, productId, available, requested);
      setLines(result.lines);
      const accepted = result.status === "added" || result.status === "increased";
      announce(
        accepted
          ? available === 1
            ? "Added to your bag - the only one left."
            : "Added to your bag."
          : available <= 0
            ? "This piece has already been collected."
            : "You already have every piece we hold of this.",
      );
      if (accepted) setFlash((value) => value + 1);
      return accepted;
    },
    [announce, lines],
  );

  const value = useMemo<BagApi>(
    () => ({
      lines,
      ready,
      count: cartCount(lines),
      flash,
      lastMessage,
      contains: (productId: string) => lines.some((line) => line.productId === productId),
      add,
      setQuantity: (productId: string, quantity: number, available: number) => setLines(setLineQuantity(lines, productId, quantity, available)),
      remove: (productId: string) => setLines(removeFromCart(lines, productId)),
      clear: () => setLines([]),
      replace: (next: CartLine[]) => setLines(next),
    }),
    [lines, ready, flash, lastMessage, add],
  );

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagApi {
  const context = useContext(BagContext);
  if (!context) throw new Error("useBag must be used inside BagProvider");
  return context;
}
