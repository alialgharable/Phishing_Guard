"use client";

import { useInView } from "@/components/motion/Reveal";

/**
 * The oversized closing wordmark. Each half rises on its own delay as the footer enters the
 * viewport, then the component stops observing - there is no loop here, and reduced motion shows
 * it already in place.
 */
export function FooterWordmark() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <div ref={ref} className={["wordmark-mask select-none py-[clamp(10px,2vw,26px)]", inView ? "is-visible" : ""].filter(Boolean).join(" ")} aria-hidden>
      <div className="flex flex-col leading-[0.74] tracking-[-0.045em] font-editorial text-[clamp(3.5rem,17.6vw,17rem)]">
        <span style={{ "--i": 0 } as React.CSSProperties} className="block">
          Vintage
        </span>
        <span style={{ "--i": 1 } as React.CSSProperties} className="-mt-[0.06em] block pl-[6%] text-chalk/45">
          Magic
        </span>
      </div>
    </div>
  );
}
