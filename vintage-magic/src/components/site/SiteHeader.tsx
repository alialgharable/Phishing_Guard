"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBag } from "@/components/bag/BagProvider";
import { Seal } from "@/components/graphic/Seal";

/**
 * Navigation.
 *
 * The active-page marker is a shared layout element: `layoutId` lets Motion animate the underline
 * from one link to the next instead of cross-fading two, which is why it reads as one object
 * travelling along the bar. Header density reacts to a sentinel rather than a scroll listener, so
 * there is no work per frame. The mobile menu is mounted only while open (AnimatePresence) and
 * restores focus to its trigger on close.
 */

const LINKS = [
  { href: "/archive", label: "Archive" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { count, ready } = useBag();
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCompact(entry ? entry.intersectionRatio < 1 : false), { threshold: [1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      <header className="site-header" data-compact={compact ? "true" : "false"}>
        <div className="shell flex items-center justify-between gap-4 py-[clamp(11px,1.5vw,20px)]">
          <Link href="/" className="group flex items-baseline gap-2.5" aria-label="Vintage Magic Beirut, home">
            <span className="font-editorial text-[clamp(1.32rem,2.1vw,1.9rem)] leading-none tracking-[-0.02em]">Vintage Magic</span>
            <span className="label hidden translate-y-[-1px] text-ink/55 transition-transform duration-500 group-hover:translate-x-0.5 sm:inline">Beirut</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link key={link.href} href={link.href} className="nav-item group" aria-current={active ? "page" : undefined}>
                  <span className="label relative z-10 block transition-colors duration-300 group-hover:text-ink" style={{ color: active ? undefined : "color-mix(in srgb, var(--color-ink) 62%, transparent)" }}>
                    {link.label}
                  </span>
                  {active ? (
                    <motion.span
                      layoutId={reduce ? undefined : "nav-active"}
                      className="absolute inset-x-[-6px] -bottom-1 z-0 h-[18px] rounded-full bg-olive/22"
                      transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.7 }}
                    />
                  ) : (
                    <span aria-hidden className="absolute inset-x-[-6px] -bottom-1 z-0 h-[18px] scale-x-0 rounded-full bg-olive/12 transition-transform duration-500 group-hover:scale-x-100" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/bag" className="label flex items-center gap-2 rounded-full border border-ink/25 bg-chalk/70 px-3 py-1.5 transition-colors hover:border-ink" aria-label={`Bag, ${count} ${count === 1 ? "piece" : "pieces"}`}>
              <span className="hidden sm:inline">Bag</span>
              <span
                key={ready ? `count-${count}` : "count"}
                className={["grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] leading-none text-chalk", count > 0 ? "bag-flash" : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{ animationDuration: "0.5s" }}
              >
                {ready ? count : "–"}
              </span>
            </Link>

            <button ref={trigger} type="button" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center md:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label="Open menu">
              <span className="flex w-6 flex-col gap-[5px]" aria-hidden>
                <span className="h-px w-full bg-ink" />
                <span className="h-px w-full bg-ink" />
                <span className="h-px w-4 bg-ink" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-menu"
            key="menu"
            className="fixed inset-0 z-[70] md:hidden"
            initial={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: "var(--color-ivory)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex h-full flex-col justify-between p-6">
              <div className="flex items-start justify-between">
                <span className="label">Menu · Beirut</span>
                <button type="button" onClick={close} className="label flex h-9 w-9 items-center justify-center rounded-full border border-ink/25" aria-label="Close menu">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </button>
              </div>

              <nav aria-label="Mobile" className="flex flex-col gap-1">
                {[{ href: "/", label: "Cover" }, ...LINKS, { href: "/bag", label: "Bag" }].map((link, index) => (
                  <motion.div
                    key={link.href}
                    initial={reduce ? { opacity: 1 } : { opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : 0.12 + index * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link href={link.href} onClick={close} className="group flex items-end justify-between gap-4 border-b border-rule py-2">
                      <span className="font-editorial text-[clamp(2.4rem,13vw,3.6rem)] leading-[0.9] tracking-[-0.02em]">{link.label}</span>
                      <span className="label pb-2 text-ink/45 transition-transform duration-500 group-hover:translate-x-1">0{index + 1}</span>
                    </Link>
                  </motion.div>
                ))}
              </nav>

              <div className="flex items-end justify-between gap-6">
                <p className="max-w-[22ch] text-[0.92rem] leading-snug text-ink/65">
                  One-of-a-kind pieces. When one goes, it goes for good.
                </p>
                <span className="text-ink/50">
                  <Seal size={92} text="VINTAGE MAGIC · BEIRUT · " centreMark="dot" />
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
