"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Seal } from "@/components/graphic/Seal";
import { AvailabilityTicket, HandNote } from "@/components/graphic/Ticket";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { formatUsd } from "@/lib/money";
import { hasFinePointer, prefersReducedMotion } from "@/lib/motion/capabilities";
import { gsap, registerMotion } from "@/lib/motion/gsap";
import type { Product } from "@/lib/types";

/**
 * The cover: an oversized masthead assembling itself around one garment.
 *
 * Division of labour is deliberate. CSS owns the one-shot states (plate drop-in, chip stagger,
 * contour stroke draw, seal loop) because they are free and already honour prefers-reduced-motion
 * through media queries. GSAP owns the choreography that needs sequencing and continuous input:
 * the per-line headline stagger, pointer parallax on the garment, and the scroll-linked drift of
 * the background discs. Everything it creates lives inside a gsap.context that is reverted on
 * unmount, and the pointer effects only exist on devices that report a fine pointer.
 */

export interface HeroCompositionProps {
  garment: Product | null;
  archiveCount: number;
  collectedCount: number;
}

const HEADLINE = ["PAST", "LIVES.", "NEVER", "ORDINARY."];

export function HeroComposition({ garment, archiveCount, collectedCount }: HeroCompositionProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    // Let the CSS one-shot states begin; they are keyed on this class.
    const readyFrame = requestAnimationFrame(() => element.classList.add("is-ready"));

    registerMotion();
    const reduced = prefersReducedMotion();
    const context = gsap.context(() => {
      if (reduced) {
        gsap.set([".hero-eyebrow", ".hero-cta", ".hero-index li", ".hero-seal"], { clearProps: "all" });
        return;
      }

      // The headline rows are a CSS staggered mask reveal (see .mask-line--css); the timeline
      // owns everything that needs sequencing, so the two never touch the same property.
      const timeline = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.12 });
      timeline
        .fromTo(".hero-eyebrow", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" })
        .fromTo(".hero-cta", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, 0.5)
        .fromTo(".hero-index li", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07 }, 0.66)
        .fromTo(".hero-seal", { scale: 0.72, opacity: 0, rotate: -26 }, { scale: 1, opacity: 1, rotate: 0, duration: 1.1, ease: "back.out(1.5)" }, 0.44)
        .fromTo(".hero-contour", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.3);

      const discs = gsap.utils.toArray<HTMLElement>("[data-hero-disc]");
      for (const disc of discs) {
        const speed = Number.parseFloat(disc.dataset.speed ?? "0.08");
        gsap.to(disc, {
          yPercent: speed * 100,
          ease: "none",
          scrollTrigger: { trigger: element, start: "top top", end: "bottom top", scrub: true },
        });
      }

      if (hasFinePointer() && stage.current && !reduced) {
        const moveToX = gsap.quickTo(stage.current, "x", { duration: 1.1, ease: "power3.out" });
        const moveToY = gsap.quickTo(stage.current, "y", { duration: 1.1, ease: "power3.out" });
        const onMove = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          const rect = element.getBoundingClientRect();
          const nx = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
          const ny = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
          moveToX(gsap.utils.clamp(-26, 26, nx * -34));
          moveToY(gsap.utils.clamp(-20, 20, ny * -22));
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        context.add(() => window.removeEventListener("pointermove", onMove));
      }
    }, root);

    return () => {
      cancelAnimationFrame(readyFrame);
      context.revert();
    };
  }, []);

  return (
    <div ref={root} className="hero relative overflow-hidden pt-[clamp(28px,4vw,64px)] pb-[clamp(48px,7vw,110px)]">
      {/* Background geometry: three different scales of the same circular motif, at three speeds. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div data-hero-disc data-speed="0.05" className="hero-disc absolute -top-[18%] right-[6%] h-[46vw] max-h-[620px] w-[46vw] max-w-[620px] rounded-full border border-ink/15" />
        <div data-hero-disc data-speed="0.12" className="hero-disc absolute top-[22%] -left-[14vw] h-[30vw] max-h-[420px] w-[30vw] max-w-[420px] rounded-full disc-fill opacity-70" />
        <div data-hero-disc data-speed="0.2" className="hero-disc absolute -bottom-[22%] right-[-6%] h-[38vw] max-h-[520px] w-[38vw] max-w-[520px] rounded-full blob dot-field opacity-40" />
        <svg viewBox="0 0 1200 700" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-ink/10">
          <path d="M0 520 C 240 470 380 610 640 556 S 1010 470 1200 528" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="shell relative z-10">
        <div className="grid grid-cols-12 items-end gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7 xl:col-span-7">
            <div className="hero-eyebrow flex flex-wrap items-center gap-x-6 gap-y-2 opacity-0">
              <span className="label">Archive no. 01</span>
              <span className="h-px w-10 bg-ink/30" aria-hidden />
              <span className="label label-light muted">Beirut · second-hand &amp; vintage</span>
              <span className="label label-light muted">MMXXV</span>
            </div>

            <h1 className="display mt-[clamp(14px,2.2vw,30px)] text-[clamp(3.6rem,15.2vw,13.4rem)]">
              {HEADLINE.map((line, index) => (
                <span key={line} className={["hero-line mask-line mask-line--css block", index === 2 ? "ml-[8%] lg:ml-[16%]" : "", index === 3 ? "lg:-mr-[6%]" : ""].filter(Boolean).join(" ")}>
                  <span className="block" style={{ "--line-delay": `${140 + index * 110}ms` } as React.CSSProperties}>
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            <div className="hero-cta mt-[clamp(18px,2.6vw,34px)] flex flex-wrap items-end justify-between gap-6 opacity-0">
              <p className="max-w-[34ch] text-[clamp(1rem,1.25vw,1.28rem)] leading-[1.5] text-ink/75">
                One-of-a-kind vintage pieces, waiting for their next story.
              </p>
              <Link href="/archive" className="btn" aria-label="Explore the archive of vintage pieces">
                <span>Explore the archive</span>
                <svg width="17" height="11" viewBox="0 0 17 11" fill="none" aria-hidden>
                  <path d="M0 5.5h15M11 1l4 4.5-4 4.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </Link>
            </div>

            <ul className="hero-index mt-[clamp(26px,3.6vw,52px)] grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-4 sm:grid-cols-3">
              <li className="opacity-0">
                <Link href="/archive" className="group flex items-baseline gap-2">
                  <span className="label">01</span>
                  <span className="label label-light group-hover:underline underline-offset-4 decoration-1">New arrivals</span>
                </Link>
              </li>
              <li className="opacity-0">
                <Link href="/archive?sort=newest&amp;includeCollected=1" className="group flex items-baseline gap-2">
                  <span className="label">02</span>
                  <span className="label label-light group-hover:underline underline-offset-4 decoration-1">
                    {collectedCount} collected
                  </span>
                </Link>
              </li>
              <li className="opacity-0">
                <Link href="/about" className="group flex items-baseline gap-2">
                  <span className="label">03</span>
                  <span className="label label-light group-hover:underline underline-offset-4 decoration-1">Why vintage</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* The garment, sitting on top of and under the type at the same time. */}
          <div className="relative col-span-12 lg:col-span-5 xl:col-span-5">
            <div ref={stage} className="garment-stage relative mx-auto w-[min(100%,520px)] lg:translate-x-[-6%] xl:translate-x-[-10%]">
              <div className="hero-plate relative">
                <div className="garment-bob">
                <div aria-hidden className="absolute -inset-x-4 bottom-2 top-8 arch-outline border-ink/20 bg-chalk/40" />
                <div className="relative arch overflow-hidden">
                  {garment ? (
                    <PieceMedia product={garment} ratio="tall" priority sizes="(max-width: 1024px) 88vw, 44vw" />
                  ) : (
                    <div className="photo-plate aspect-[3/4.4] w-full" />
                  )}
                </div>

                {/* A contour sketched around the silhouette, drawn by CSS once the hero is ready. */}
                <svg className="hero-contour pointer-events-none absolute -inset-x-6 -top-6 bottom-[-2%] h-[104%] w-[calc(100%+3rem)] text-burgundy" viewBox="0 0 400 560" fill="none" aria-hidden>
                  <path
                    d="M196 34 C 120 44 96 96 104 150 C 60 168 44 232 52 300 C 20 336 28 420 64 470 C 120 520 260 528 322 486 C 372 452 380 372 350 322 C 366 244 348 168 300 146 C 306 92 276 42 196 34 Z"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    pathLength={1}
                  />
                  <path d="M330 214 L 392 196" stroke="currentColor" strokeWidth="0.9" pathLength={1} opacity="0.7" />
                  <path d="M62 392 L 12 410" stroke="currentColor" strokeWidth="0.9" pathLength={1} opacity="0.7" />
                </svg>
                </div>
              </div>

              <div className="hero-chip absolute -left-2 top-4 sm:left-2" style={{ "--chip-delay": "1050ms" } as React.CSSProperties}>
                {garment ? <AvailabilityTicket product={garment} /> : null}
              </div>
              <div className="hero-chip absolute -right-1 bottom-[22%] sm:-right-6" style={{ "--chip-delay": "1250ms" } as React.CSSProperties}>
                <HandNote rotate={-4}>{garment?.era ? `${garment.era} · ` : ""}handled, not restored</HandNote>
              </div>
              {garment ? (
                <Link
                  href={`/archive/${garment.slug}`}
                  className="hero-chip group absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ink/25 bg-ivory/95 px-4 py-2 transition-colors hover:border-ink"
                  style={{ "--chip-delay": "1420ms" } as React.CSSProperties}
                >
                  <span className="label whitespace-nowrap">{garment.name}</span>
                  <span className="label">{garment.sizeLabel ? `size ${garment.sizeLabel}` : "one size"}</span>
                  <span className="label">{formatUsd(garment.priceCents)}</span>
                  <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden className="text-ink/60 transition-transform duration-500 group-hover:translate-x-1">
                    <path d="M0 5h23M19 1l4 4-4 4" stroke="currentColor" strokeWidth="1" />
                  </svg>
                </Link>
              ) : null}

              <div className="hero-seal absolute -left-6 -top-8 text-ink/70 sm:-left-14 sm:-top-12 opacity-0">
                <Seal size={124} srLabel="Vintage Magic, Beirut, one of a kind" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[clamp(30px,5vw,70px)] flex items-end justify-between gap-6 border-t border-rule pt-4">
          <p className="label label-light muted">
            {archiveCount} {archiveCount === 1 ? "piece" : "pieces"} currently on the shelf
          </p>
          <div className="hero-scroll-cue hidden items-center gap-3 sm:flex" aria-hidden>
            <span className="label label-light">Scroll</span>
            <span className="block h-12 w-px origin-top bg-ink/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
