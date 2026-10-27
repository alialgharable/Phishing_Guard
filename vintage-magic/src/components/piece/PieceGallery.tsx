"use client";

import { useMemo, useRef, useState } from "react";
import { PlateDiagram } from "@/components/graphic/PlateDiagram";
import { Ticket } from "@/components/graphic/Ticket";
import { useHasFinePointer } from "@/lib/motion/capabilities";
import type { GarmentAnnotation, Product } from "@/lib/types";

/**
 * Detail-page gallery.
 *
 * Three real behaviours, no decoration: the frame list drives a keyed cross-fade (and keyboard
 * arrows when the strip has focus), magnification exists only on fine pointers and is a
 * transform-origin swap on the element the pointer is already over, and the annotation overlay is a
 * toggle because notes placed on a garment must never be forced on top of it. Reduced motion keeps
 * the cross-fade instant and drops the scale.
 */

export interface PieceGalleryProps {
  product: Pick<Product, "name" | "images" | "diagram" | "annotations" | "quantity">;
}

type Frame = { kind: "photo"; src: string; alt: string } | { kind: "plate"; diagram: NonNullable<Product["diagram"]> };

export function PieceGallery({ product }: PieceGalleryProps) {
  const frames = useMemo<Frame[]>(() => {
    const photos: Frame[] = product.images.map((image) => ({ kind: "photo", src: image.src, alt: image.alt }));
    const plates: Frame[] = product.diagram ? [{ kind: "plate", diagram: product.diagram }] : [];
    return [...photos, ...plates];
  }, [product.images, product.diagram]);

  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [magnify, setMagnify] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const plateRef = useRef<HTMLDivElement | null>(null);
  const fine = useHasFinePointer();

  const safeIndex = Math.min(index, Math.max(0, frames.length - 1));
  const annotations: GarmentAnnotation[] = safeIndex === 0 ? product.annotations : [];
  const current = frames[safeIndex] ?? null;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!fine || !magnify || !plateRef.current) return;
    const rect = plateRef.current.getBoundingClientRect();
    setZoom({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
  };

  if (!current) {
    return (
      <div className="photo-plate grid aspect-[3/4] place-items-center p-10 text-center">
        <div>
          <Ticket tone="plate">No plate yet</Ticket>
          <p className="mt-3 max-w-[30ch] text-[0.95rem] leading-snug text-ink/60">
            This piece is recorded in the ledger but has not been photographed. The shop can attach images from admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery">
      <div
        ref={plateRef}
        className="gallery__stage arch-clip relative overflow-hidden bg-chalk"
        data-magnify={magnify && fine && current.kind === "photo" ? "true" : "false"}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setZoom(null)}
      >
        {current.kind === "photo" ? (
          <img
            src={current.src}
            alt={current.alt}
            className="photo-multiply h-full w-full object-cover transition-transform duration-500"
            style={{
              transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : "50% 40%",
              transform: magnify && zoom ? "scale(1.9)" : "scale(1)",
            }}
            draggable={false}
          />
        ) : (
          <div className="photo-plate grid h-full w-full place-items-center p-8">
            <PlateDiagram diagram={current.diagram} caption={false} />
          </div>
        )}

        {annotations.length > 0 && showNotes ? (
          <div className="annotation-layer" aria-label="Shop notes on this garment">
            {annotations.map((annotation) => (
              <div
                key={annotation.label}
                className={`annotation annotation--${annotation.side}`}
                style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
              >
                <span className="annotation__dot" aria-hidden />
                <svg className="annotation__leader" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden>
                  <line x1="0" y1="0.5" x2="100" y2="0.5" pathLength={1} stroke="currentColor" strokeWidth="0.8" />
                </svg>
                <p className="annotation__body">
                  <span className="label block">{annotation.label}</span>
                  <span className="hand block text-[1.05rem] leading-tight text-ink/75">{annotation.note}</span>
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="gallery__hud absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <span className="label rounded-full border border-ink/20 bg-ivory/85 px-2.5 py-1 backdrop-blur-sm">
            {current.kind === "photo" ? `Frame ${String(safeIndex + 1).padStart(2, "0")} / ${String(frames.length).padStart(2, "0")}` : `Plate ${String(safeIndex + 1).padStart(2, "0")} — cut diagram`}
          </span>
          <div className="flex items-center gap-2">
            {annotations.length > 0 ? (
              <button type="button" onClick={() => setShowNotes((value) => !value)} aria-pressed={showNotes} className="label rounded-full border border-ink/20 bg-ivory/85 px-2.5 py-1 backdrop-blur-sm transition-colors hover:border-ink">
                {showNotes ? "Hide notes" : `Notes (${annotations.length})`}
              </button>
            ) : null}
            {fine && current.kind === "photo" ? (
              <button type="button" onClick={() => setMagnify((value) => !value)} aria-pressed={magnify} className="label rounded-full border border-ink/20 bg-ivory/85 px-2.5 py-1 backdrop-blur-sm transition-colors hover:border-ink">
                {magnify ? "Stop magnifying" : "Magnify"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {frames.length > 1 ? (
        <div
          className="gallery__thumbs"
          role="group"
          aria-label="Frames of this piece"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") setIndex((value) => (value + 1) % frames.length);
            if (event.key === "ArrowLeft") setIndex((value) => (value - 1 + frames.length) % frames.length);
          }}
        >
          {frames.map((frame, frameIndex) => (
            <button
              key={`${frame.kind}-${frameIndex}`}
              type="button"
              onClick={() => setIndex(frameIndex)}
              aria-current={frameIndex === safeIndex ? "true" : undefined}
              className="gallery__thumb"
              aria-label={frame.kind === "photo" ? `Show ${frame.alt}` : "Show the cut diagram"}
            >
              {frame.kind === "photo" ? (
                <img src={frame.src} alt="" className="photo-multiply h-full w-full object-cover" draggable={false} />
              ) : (
                <span className="grid h-full w-full place-items-center p-1">
                  <PlateDiagram diagram={frame.diagram} caption={false} strokeWidth={2} />
                </span>
              )}
              <span className="label absolute bottom-0.5 right-1 text-[9px] text-ink/50">{frameIndex === frames.length - 1 && frame.kind === "plate" ? "plate" : String(frameIndex + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
