import { PlateDiagram } from "@/components/graphic/PlateDiagram";
import { Ticket } from "@/components/graphic/Ticket";
import type { Product } from "@/lib/types";

/**
 * The garment itself, framed the same way everywhere: photographs sit on the page ground with
 * multiply so they overlap type and rules instead of living in boxes, entries with no studio
 * day yet show their cut diagram and say so. Shared by the hero, the cards and the detail page,
 * so the "plate only" state can never drift out of sync.
 */

export interface PieceMediaProps {
  product: Pick<Product, "images" | "diagram" | "name" | "quantity">;
  /** Which photograph to show when there is more than one. */
  index?: number;
  /** Optional second frame revealed on hover by the card. */
  altIndex?: number;
  className?: string;
  imgClassName?: string;
  ratio?: "portrait" | "tall" | "square" | "wide";
  /** Rounded top, like the archive's arch frames. */
  arch?: boolean;
  showPlateFallback?: boolean;
  sizes?: string;
  priority?: boolean;
}

const RATIOS: Record<NonNullable<PieceMediaProps["ratio"]>, string> = {
  portrait: "aspect-[4/5]",
  tall: "aspect-[3/4.4]",
  square: "aspect-square",
  wide: "aspect-[4/3]",
};

export function PieceMedia({
  product,
  index = 0,
  altIndex,
  className,
  imgClassName,
  ratio = "portrait",
  arch = false,
  showPlateFallback = true,
  sizes,
  priority = false,
}: PieceMediaProps) {
  const primary = product.images[index] ?? product.images[0] ?? null;
  const alt = typeof altIndex === "number" ? (product.images[altIndex] ?? null) : null;
  const frameClass = ["piece__media", RATIOS[ratio], arch ? "arch" : "", className].filter(Boolean).join(" ");

  if (!primary) {
    return (
      <div className={[frameClass, "photo-plate grid place-items-center p-6"].filter(Boolean).join(" ")}>
        {product.diagram && showPlateFallback ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <PlateDiagram diagram={product.diagram} caption={false} />
            <Ticket tone="plate">Plate only · photography pending</Ticket>
          </div>
        ) : (
          <div className="grid place-items-center p-8 text-center">
            <span className="label muted">No photograph recorded</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      {/* Plain <img>: these are the shop's own static files (or an absolute bucket URL), and next.config.ts turns image optimisation off for exactly this reason. */}
      <img
        src={primary.src}
        alt={primary.alt || `${product.name}, archive photograph`}
        className={["piece__img photo-multiply", imgClassName].filter(Boolean).join(" ")}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(sizes ? { sizes } : {})}
      />
      {alt && alt.src !== primary.src ? (
        <img
          src={alt.src}
          alt=""
          aria-hidden
          className="piece__img piece__img--alt photo-multiply"
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </div>
  );
}
