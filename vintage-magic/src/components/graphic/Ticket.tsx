import type { ReactNode } from "react";
import { availabilityOf } from "@/lib/catalog";
import type { Product } from "@/lib/types";

/**
 * The perforated archive ticket. One component so a "COLLECTED" label is never styled
 * differently in two places.
 */

export interface TicketProps {
  children: ReactNode;
  tone?: "default" | "collected" | "one" | "plate";
  className?: string;
}

export function Ticket({ children, tone = "default", className }: TicketProps) {
  const toneClass = tone === "collected" ? "ticket--collected" : tone === "one" ? "ticket--one" : tone === "plate" ? "ticket--plate" : "";
  return <span className={["ticket", toneClass, className].filter(Boolean).join(" ")}>{children}</span>;
}

/** Availability ticket derived from quantity, so the store never shows a status it cannot honour. */
export function AvailabilityTicket({ product, className }: { product: Pick<Product, "quantity">; className?: string }) {
  const availability = availabilityOf(product);
  if (availability.collected) {
    return (
      <Ticket tone="collected" className={className}>
        Collected
      </Ticket>
    );
  }
  if (availability.isOneOfAKind) {
    return (
      <Ticket tone="one" className={className}>
        One of one
      </Ticket>
    );
  }
  return (
    <Ticket className={className}>
      {availability.quantity} available
    </Ticket>
  );
}

/** Fine hairline used between editorial blocks. */
export function Rule({ className, count = 1 }: { className?: string; count?: 1 | 2 | 3 }) {
  if (count > 1) {
    return (
      <div className={["rule-stack", className].filter(Boolean).join(" ")} aria-hidden>
        {Array.from({ length: count }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
    );
  }
  return <hr className={["rule-hair", className].filter(Boolean).join(" ")} aria-hidden />;
}

/** Oversized catalogue number, outline treatment so it never fights the headline for weight. */
export function CatalogNumber({ value, className, outline = true }: { value: string | number; className?: string; outline?: boolean }) {
  const display = String(value).padStart(2, "0");
  return (
    <span aria-hidden className={["numeral select-none", outline ? "numeral--outline" : "", className].filter(Boolean).join(" ")}>
      {display}
    </span>
  );
}

/** Small handwritten annotation, kept as real text so it can be read and edited. */
export function HandNote({ children, className, rotate = -1.6 }: { children: ReactNode; className?: string; rotate?: number }) {
  return (
    <span className={["hand inline-block max-w-[16rem]", className].filter(Boolean).join(" ")} style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  );
}
