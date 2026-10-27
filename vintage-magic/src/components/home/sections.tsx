import Link from "next/link";
import { CatalogNumber, HandNote, Rule, Ticket } from "@/components/graphic/Ticket";
import { PlateDiagram } from "@/components/graphic/PlateDiagram";
import { Reveal } from "@/components/motion/Reveal";
import { ParallaxDisc } from "@/components/motion/ParallaxDisc";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { ATELIER_DISCLAIMER, BRAND, CURRENCY, fulfilmentOptions } from "@/lib/config";
import { SAMPLE_DATA_NOTICE, servingSampleData } from "@/lib/data";
import { availabilityOf } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { CATEGORY_LABELS, type CategoryId, type Product, type SiteContent } from "@/lib/types";

/**
 * Homepage editorial blocks.
 *
 * These are server components: the composition is layout and type, and the only motion is either
 * a CSS one-shot reveal keyed to an IntersectionObserver (Reveal) or a single ScrollTrigger scrub
 * (ParallaxDisc). Nothing here re-renders on scroll and nothing ships JavaScript unless a visitor
 * actually reaches the section.
 */

export function SampleDataStrip() {
  if (!servingSampleData()) return null;
  return (
    <div className="border-y border-rule bg-parchment/70">
      <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2">
        <p className="label text-ink/65">{SAMPLE_DATA_NOTICE}</p>
        <Link href="/admin" className="label underline underline-offset-4 hover:text-ink">
          Connect the real archive
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ new arrivals -- */

export function NewArrivalsSection({ products, collectedCount }: { products: Product[]; collectedCount: number }) {
  return (
    <section id="arrivals" className="section" aria-labelledby="arrivals-heading">
      <div className="shell">
        <div className="grid grid-cols-12 items-end gap-x-6 gap-y-4">
          <div className="col-span-12 lg:col-span-7">
            <Reveal variant="rule" className="mb-4">
              <Rule count={2} />
            </Reveal>
            <p className="label text-ink/55">01 — Recently entered the archive</p>
            <h2 id="arrivals-heading" className="display mt-2">
              New <span className="italic font-normal text-burgundy">arrivals</span>
            </h2>
          </div>
          <Reveal as="div" variant="side" delayMs={80} className="col-span-12 flex items-end justify-between gap-6 lg:col-span-5 lg:justify-end">
            <p className="max-w-[34ch] text-[0.98rem] leading-snug text-ink/70">
              {products.length} pieces open for collection{collectedCount > 0 ? `, ${collectedCount} already collected and kept on record` : ""}. Prices are in {CURRENCY.code}; payment happens in person.
            </p>
            <Link href="/archive" className="btn btn--solid shrink-0">
              <span>See the whole archive</span>
              <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>

        <div className="mt-8 grid grid-cols-12 gap-x-6 gap-y-10">
          {products.map((product, index) => (
            <article
              key={product.id}
              data-reveal={index % 2 === 0 ? "up" : "side"}
              className={
                index === 0
                  ? "lg:col-span-7 lg:col-start-1"
                  : index === 1
                    ? "lg:col-span-4 lg:col-start-9 lg:mt-16"
                    : index === 2
                      ? "lg:col-span-4 lg:col-start-2 lg:-mt-6"
                      : index === 3
                        ? "lg:col-span-5 lg:col-start-7"
                        : "lg:col-span-3 lg:col-start-1"
              }
            >
              <ArrivalCard product={product} number={index + 1} large={index === 0} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArrivalCard({ product, number, large = false }: { product: Product; number: number; large?: boolean }) {
  const availability = availabilityOf(product);
  return (
    <div className="piece group flex flex-col gap-3">
      <Link
        href={`/archive/${product.slug}`}
        className="relative block"
        aria-label={`${product.name} — ${formatUsd(product.priceCents)}, ${availability.label}`}
      >
        <span data-vt-target className="block">
          <PieceMedia product={product} ratio={large ? "tall" : "portrait"} arch={large} />
        </span>
        <span className="piece__frame" aria-hidden />
        <span className="piece__arrow" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 13L13 2M13 2H5.4M13 2v7.6" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </span>
        <span className="piece__ticket absolute left-3 top-3 z-[4]">
          <Ticket tone={availability.collected ? "collected" : availability.isOneOfAKind ? "one" : "default"}>{availability.label}</Ticket>
        </span>
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label text-ink/50">{product.era ?? "Undated"}</p>
          <h3 className={large ? "font-editorial text-[clamp(1.7rem,3vw,2.6rem)] leading-[1.02]" : "font-editorial text-[clamp(1.35rem,2vw,1.8rem)] leading-[1.05]"}>
            <Link href={`/archive/${product.slug}`} className="link-sweep">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-[0.92rem] text-ink/60">
            {product.sizeLabel ? `Size ${product.sizeLabel}` : "One size"} · {product.categories.map((c) => CATEGORY_LABELS[c]).join(" · ")}
          </p>
        </div>
        <CatalogNumber value={number} />
      </div>
      <p className="label">{formatUsd(product.priceCents)}</p>
    </div>
  );
}

/* ----------------------------------------------------------------------- story -- */

export function BrandStorySection({ content, garment }: { content: SiteContent; garment: Product | null }) {
  const [first, second] = content.aboutParagraphs;
  return (
    <section id="story" className="relative overflow-hidden py-[clamp(48px,7vw,110px)]" aria-labelledby="story-heading">
      <ParallaxDisc className="left-[-14%] top-[18%] h-[42vw] w-[42vw] opacity-45" speed={-0.08} />
      <div className="shell relative">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7">
            <p className="label text-ink/55">02 — Why this exists</p>
            <h2 id="story-heading" className="statement mt-3">
              We sell
              <br />
              what only
              <br />
              <span className="text-olive">exists once.</span>
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {first ? <p className="prose-editorial">{first}</p> : null}
              {second ? <p className="prose-editorial">{second}</p> : null}
            </div>
            <Reveal as="div" variant="up" delayMs={120} className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/about" className="btn btn--solid">
                <span>Read the house note</span>
                <span aria-hidden>→</span>
              </Link>
              <span className="hand text-[1.15rem] text-ink/60">— {BRAND.city}, since the first piece arrived</span>
            </Reveal>
          </div>

          <div className="relative col-span-12 lg:col-span-5">
            <div className="relative mx-auto w-[min(100%,30rem)]">
              <div className="ellipse-frame overflow-hidden">
                {garment ? (
                  <PieceMedia product={garment} ratio="tall" imgClassName="photo-multiply" sizes="(max-width: 1024px) 92vw, 30rem" />
                ) : (
                  <div className="photo-plate grid aspect-[3/4] place-items-center p-8">
                    <PlateDiagram diagram="coat" />
                  </div>
                )}
              </div>
              <div aria-hidden className="absolute -bottom-8 -left-10 h-32 w-32 rounded-full border border-burgundy/40" />
              <HandNote className="absolute -right-3 top-6 max-w-[10ch] text-right" rotate={4}>
                worn before, worn again
              </HandNote>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ categories -- */

export function CollectionDiscoverySection({ counts, total }: { counts: Array<{ id: CategoryId; count: number; collected: number }>; total: number }) {
  return (
    <section id="collections" className="section" aria-labelledby="collections-heading">
      <div className="shell">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label text-ink/55">03 — Find your shape</p>
            <h2 id="collections-heading" className="display mt-2">
              Browse by <span className="italic">cut</span>
            </h2>
          </div>
          <p className="max-w-[36ch] text-[0.95rem] text-ink/65">
            {total} entries in the ledger. Each category opens the archive already filtered — search, size and price come after.
          </p>
        </div>

        <ul className="mt-8 border-t border-rule">
          {counts.map((entry, index) => (
            <li key={entry.id} data-reveal="side" style={{ "--reveal-delay": `${index * 60}ms` } as React.CSSProperties} className="border-b border-rule">
              <Link href={`/archive?category=${entry.id}`} className="group grid grid-cols-12 items-center gap-x-4 py-[clamp(12px,2vw,26px)] transition-colors hover:bg-chalk/60">
                <span className="col-span-2 sm:col-span-1 lg:col-span-1">
                  <span className="numeral text-ink/35 transition-colors group-hover:text-burgundy">{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className="col-span-10 sm:col-span-6 lg:col-span-5">
                  <span className="block font-label text-[clamp(1.9rem,5.2vw,3.4rem)] font-semibold uppercase leading-[0.92] tracking-[0.01em]">{CATEGORY_LABELS[entry.id]}</span>
                </span>
                <span className="col-span-6 sm:col-span-3 lg:col-span-3">
                  <span className="label block text-ink/60">
                    {entry.count} open {entry.count === 1 ? "piece" : "pieces"}
                    {entry.collected > 0 ? ` · ${entry.collected} collected` : ""}
                  </span>
                </span>
                <span className="col-span-4 hidden items-center justify-end gap-4 sm:col-span-2 lg:col-span-2 lg:flex">
                  <span aria-hidden className="h-16 w-12 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <PlateDiagram diagram={CATEGORY_PLATE[entry.id]} caption={false} strokeWidth={1.3} />
                  </span>
                </span>
                <span className="col-span-2 flex justify-end lg:col-span-1">
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full border border-ink/25 transition-all duration-500 group-hover:border-ink group-hover:bg-ink group-hover:text-chalk">
                    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                      <path d="M2 13L13 2M13 2H5.4M13 2v7.6" stroke="currentColor" strokeWidth="1.1" />
                    </svg>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const CATEGORY_PLATE: Record<CategoryId, "coat" | "shirt" | "trousers" | "dress" | "scarf"> = {
  jackets: "coat",
  shirts: "shirt",
  trousers: "trousers",
  dresses: "dress",
  accessories: "scarf",
};

/* -------------------------------------------------------------- how it works ---- */

export function HowItWorksSection() {
  const options = fulfilmentOptions();
  return (
    <section id="how" className="relative overflow-hidden border-y border-rule bg-parchment/55 py-[clamp(40px,5vw,78px)]" aria-labelledby="how-heading">
      <div className="shell relative">
        <p className="label text-ink/55">04 — How a piece leaves</p>
        <h2 id="how-heading" className="display mt-2">
          Reserve, confirm, <span className="italic">collect</span>
        </h2>
        <ol className="mt-8 grid gap-x-6 gap-y-8 md:grid-cols-3">
          {[
            {
              title: "Put it in the bag",
              body: "Adding a piece takes it out of the public count the moment the order is placed — one-of-one pieces cannot be double-taken.",
            },
            {
              title: "We confirm with you",
              body: "No card is ever entered on this site. The shop agrees the time and place with you by phone or message.",
            },
            {
              title: "Pay in cash, in person",
              body: "Cash on collection in Beirut, or to the courier on delivery. The fee below is the only addition to the price.",
            },
          ].map((step, index) => (
            <li key={step.title} data-reveal="up" style={{ "--reveal-delay": `${index * 90}ms` } as React.CSSProperties} className="relative pl-10">
              <span className="absolute left-0 top-0 font-editorial text-[2.6rem] leading-[0.8] text-ink/25">{index + 1}</span>
              <h3 className="font-editorial text-[1.5rem] leading-tight">{step.title}</h3>
              <p className="mt-2 text-[0.97rem] leading-snug text-ink/72">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-5">
          {options.map((option) => (
            <p key={option.id} className="label flex items-baseline gap-2 text-ink/70">
              <span className="h-1.5 w-1.5 rounded-full bg-olive" />
              {option.label}
              <span className="text-ink">{option.feeCents === 0 ? "no fee" : formatUsd(option.feeCents)}</span>
              <span className="normal-case tracking-normal text-ink/50">{option.note}</span>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- atelier -- */

/**
 * Studio note, deliberately outside the shop's promises: it never claims a service the store
 * cannot perform, and it only renders when the owner turns it on.
 */
export function AtelierTeaserSection({ content }: { content: SiteContent }) {
  if (!content.atelierTeaserEnabled) return null;
  return (
    <section id="atelier" className="section" aria-labelledby="atelier-heading">
      <div className="shell">
        <div className="blob relative overflow-hidden border border-ink/20 px-[clamp(20px,4vw,54px)] py-[clamp(26px,4vw,54px)]">
          <div aria-hidden className="pointer-events-none absolute right-[-6%] top-[-30%] h-[70%] w-[38%] rounded-full bg-burgundy/10" />
          <div className="relative grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Ticket tone="plate">Separate from the archive</Ticket>
              <h2 id="atelier-heading" className="display mt-3">
                Sometimes a piece asks <span className="italic">to be continued</span>
              </h2>
              <p className="prose-editorial mt-4 max-w-[52ch]">{content.atelierTeaserCopy}</p>
            </div>
            <div className="flex flex-col justify-end gap-4 lg:col-span-5">
              <p className="hand text-[1.2rem] leading-snug text-ink/70">{ATELIER_DISCLAIMER}</p>
              <Link href="/contact?topic=atelier" className="btn btn--ghost self-start">
                <span>Ask the shop about it</span>
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
