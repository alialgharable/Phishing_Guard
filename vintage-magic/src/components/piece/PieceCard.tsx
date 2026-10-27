import Link from "next/link";
import { AvailabilityTicket } from "@/components/graphic/Ticket";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { formatUsd } from "@/lib/money";
import { CATEGORY_LABELS, type Product } from "@/lib/types";
import { AddToBagButton } from "./AddToBagButton";
import { PieceLink } from "./PieceLink";

/**
 * An archive entry. The information is always visible - hover only adds emphasis (image lift,
 * second frame, arch frame, arrow) so nothing a shopper needs is locked behind a pointer.
 */

export type PieceFrame = "plain" | "arch";
export type PieceRatio = "portrait" | "tall" | "square" | "wide";

export interface PieceCardProps {
  product: Product;
  number?: number;
  ratio?: PieceRatio;
  frame?: PieceFrame;
  priority?: boolean;
  className?: string;
  /** Compact cards in the home composition hide the quick-add control to stay typographic. */
  showAdd?: boolean;
}

export function PieceCard({ product, number, ratio = "portrait", frame = "plain", priority = false, className, showAdd = true }: PieceCardProps) {
  const collected = product.quantity <= 0;
  const altIndex = product.images.length > 1 ? (product.images.length === 2 ? 1 : Math.min(2, product.images.length - 1)) : undefined;
  const sizeText = product.sizeLabel ? `Size ${product.sizeLabel}` : "One size";
  const categoryText = product.categories.map((category) => CATEGORY_LABELS[category]).join(" · ");

  return (
    <article
      data-collected={collected ? "true" : undefined}
      className={["piece group flex h-full flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      <PieceLink
        href={`/archive/${product.slug}`}
        transitionTarget={number === undefined ? "[data-vt-target]" : undefined}
        ariaLabel={`${product.name}${product.era ? `, ${product.era}` : ""} - ${formatUsd(product.priceCents)}, ${collected ? "collected" : "available"}`}
        className="relative block"
      >
        <span data-vt-target className="block">
          <PieceMedia product={product} ratio={ratio} arch={frame === "arch"} altIndex={altIndex} priority={priority} />
        </span>
        <span className="piece__frame" aria-hidden />
        <span className="piece__arrow" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 13L13 2M13 2H5.4M13 2v7.6" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </span>
        <span className="piece__ticket absolute left-3 top-3 z-[4]">
          <AvailabilityTicket product={product} />
        </span>
      </PieceLink>

      <div className="piece__meta flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label flex items-center gap-2 text-ink/50">
            {typeof number === "number" ? <span className="font-editorial text-[1.05rem] leading-none text-ink/70">{String(number).padStart(2, "0")}</span> : null}
            <span className="truncate">{[product.era, categoryText].filter(Boolean).join(" · ")}</span>
          </p>
          <h3 className="mt-1 font-editorial text-[clamp(1.3rem,1.9vw,1.85rem)] leading-[1.02] tracking-[-0.015em]">
            <Link href={`/archive/${product.slug}`} className="link-sweep">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-[0.92rem] text-ink/60">
            {sizeText}
            {product.measurements.length > 0 ? <span className="text-ink/40"> · {product.measurements.length} measurements</span> : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <span className={["label", collected ? "text-ink/40 line-through" : ""].filter(Boolean).join(" ")}>{formatUsd(product.priceCents)}</span>
          {showAdd ? <AddToBagButton product={product} size="compact" /> : null}
        </div>
      </div>
    </article>
  );
}
