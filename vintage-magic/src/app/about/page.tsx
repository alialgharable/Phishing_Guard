import type { Metadata } from "next";
import Link from "next/link";
import { PlateDiagram } from "@/components/graphic/PlateDiagram";
import { HandNote, Rule, Ticket } from "@/components/graphic/Ticket";
import { Seal } from "@/components/graphic/Seal";
import { ParallaxDisc } from "@/components/motion/ParallaxDisc";
import { PieceMedia } from "@/components/piece/PieceMedia";
import { Reveal } from "@/components/motion/Reveal";
import { BRAND } from "@/lib/config";
import { getRepository, servingSampleData } from "@/lib/data";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "House note",
  description: "How the Vintage Magic Beirut archive is chosen, checked and kept — and why most pieces can only be sold once.",
};

const PROCESS = [
  { title: "It arrives", body: "A garment comes to the shop through a private sale or a family wardrobe. The shop records what it was told and nothing more." },
  { title: "It is checked", body: "Lining, buttons, seams, odours and the repairs somebody already made. Whatever is wrong goes into the condition note, not into the bin of hidden details." },
  { title: "It is measured", body: "Flat measurements, taken the same way every time, because a label size from 1978 means nothing on its own." },
  { title: "It is photographed once", body: "One sitting, daylight, no retouching of wear. If a piece has no photograph yet it is listed as a plate and labelled as such." },
] as const;

export default async function AboutPage() {
  const repository = getRepository();
  const [content, products] = await Promise.all([repository.getSiteContent(), repository.listProducts()]);
  const visuals = products.filter((product) => !product.archived && product.images.length > 0).slice(0, 3);

  return (
    <div>
      {/* ----------------------------------------------------------------- cover */}
      <section className="relative overflow-hidden pt-[clamp(34px,6vw,86px)]">
        <ParallaxDisc className="left-[-10%] top-[6%] h-[38vw] w-[38vw] opacity-50 disc-fill" speed={-0.06} />
        <ParallaxDisc className="right-[-6%] bottom-[8%] h-[22vw] w-[22vw] rounded-full border border-burgundy/30" speed={0.09} as="ring" />
        <div className="shell relative">
          <p className="label text-ink/55">{BRAND.name} {BRAND.city} — house note</p>
          <h1 className="mt-3 statement">
            {content.aboutHeading.split("\n").map((line, index) => (
              <span key={line} className="mask-line mask-line--css block" style={{ "--line-delay": `${index * 110}ms` } as React.CSSProperties}>
                <span>{line}</span>
              </span>
            ))}
          </h1>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <p className="max-w-[46ch] text-[1.05rem] leading-snug text-ink/72">{BRAND.tagline}</p>
            <span className="text-ink/55">
              <Seal size={124} reverse />
            </span>
          </div>
          <div className="mt-8">
            <Rule count={3} />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- manifesto */}
      <section className="section" aria-labelledby="note-heading">
        <div className="shell grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7">
            <h2 id="note-heading" className="sr-only">
              The house note
            </h2>
            <ol className="flex flex-col gap-7">
              {content.aboutParagraphs.map((paragraph, index) => (
                <Reveal as="li" key={index} variant="up" delayMs={index * 70} className="grid grid-cols-[auto_1fr] gap-x-5">
                  <span className="numeral pt-1 text-ink/25">{String(index + 1).padStart(2, "0")}</span>
                  <p className="prose-editorial text-[clamp(1.05rem,1.5vw,1.28rem)]">{paragraph}</p>
                </Reveal>
              ))}
            </ol>
            {servingSampleData() ? (
              <p className="mt-8 max-w-[52ch] border-l-2 border-olive pl-4 text-[0.92rem] leading-snug text-ink/65">
                This note is written by the shop. The text above is the default shipped with the site and is replaced from <Link href="/admin/content" className="label underline underline-offset-4">admin → store content</Link>;
                nothing here states a founding year or a sourcing history the owner has not confirmed.
              </p>
            ) : null}
          </div>

          <div className="col-span-12 lg:col-span-5">
            <div className="grid grid-cols-2 gap-4">
              {visuals[0] ? (
                <Reveal as="figure" variant="scale" className="col-span-2">
                  <PieceMedia product={visuals[0]} ratio="wide" arch imgClassName="photo-multiply" sizes="(max-width: 1024px) 92vw, 42vw" />
                  <figcaption className="mt-2 flex items-baseline justify-between gap-3">
                    <Link href={`/archive/${visuals[0].slug}`} className="label underline underline-offset-4">
                      {visuals[0].name}
                    </Link>
                    <span className="label text-ink/55">{formatUsd(visuals[0].priceCents)}</span>
                  </figcaption>
                </Reveal>
              ) : null}

              {visuals[1] ? (
                <Reveal as="figure" variant="up" delayMs={80}>
                  <PieceMedia product={visuals[1]} ratio="portrait" imgClassName="photo-multiply" sizes="(max-width: 1024px) 46vw, 21vw" />
                  <figcaption className="mt-2">
                    <Link href={`/archive/${visuals[1].slug}`} className="label underline underline-offset-4">
                      {visuals[1].name}
                    </Link>
                  </figcaption>
                </Reveal>
              ) : null}

              <Reveal as="div" variant="open" delayMs={140} className="photo-plate grid place-items-center p-5">
                <PlateDiagram diagram={visuals[2]?.diagram ?? "coat"} />
              </Reveal>

              {visuals[2] ? (
                <Link href={`/archive/${visuals[2].slug}`} className="col-span-2 flex items-center justify-between gap-4 border border-ink/20 px-4 py-3 transition-colors hover:border-ink">
                  <span className="min-w-0">
                    <span className="label block text-ink/55">Currently open</span>
                    <span className="font-editorial block truncate text-[1.4rem] leading-tight">{visuals[2].name}</span>
                  </span>
                  <Ticket tone="one">01/01</Ticket>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- process */}
      <section className="relative overflow-hidden border-y border-rule bg-parchment/55 py-[clamp(40px,5vw,78px)]" aria-labelledby="process-heading">
        <div className="shell relative">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="label text-ink/55">How a piece gets in</p>
              <h2 id="process-heading" className="display mt-2">
                Four hands, <span className="italic">one record</span>
              </h2>
            </div>
            <HandNote className="max-w-[22ch]" rotate={-2}>
              nothing is listed that the shop has not held
            </HandNote>
          </div>
          <ol className="mt-8 grid gap-x-6 gap-y-7 md:grid-cols-2">
            {PROCESS.map((step, index) => (
              <Reveal as="li" key={step.title} variant="side" delayMs={index * 80} className="relative border-t border-rule pt-4">
                <span className="label text-ink/45">Step {String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-editorial text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">{step.title}</h3>
                <p className="mt-2 max-w-[46ch] text-[0.98rem] leading-snug text-ink/72">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ beirut */}
      <section className="section" aria-labelledby="city-heading">
        <div className="shell grid grid-cols-12 gap-x-6 gap-y-8">
          <div className="col-span-12 lg:col-span-6">
            <h2 id="city-heading" className="display">
              Beirut, <span className="italic text-burgundy">in person</span>
            </h2>
            <p className="prose-editorial mt-4 max-w-[50ch]">
              The archive is handled by hand in {BRAND.city}: a piece is tried on, measured again if asked for, and handed over with its flaws named. Orders are settled in
              cash on collection or on delivery, which is why this site never asks for a card.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/archive" className="btn btn--solid">
                <span>See the archive</span>
                <span aria-hidden>→</span>
              </Link>
              <Link href="/contact" className="btn btn--ghost">
                <span>Arrange a viewing</span>
              </Link>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-5 lg:col-start-8">
            <dl className="border-t border-rule">
              {[
                { term: "Collection", detail: content.addressLine ?? "A point in the city is agreed per order — no street address has been published." },
                { term: "Hours", detail: content.hours ?? "Not published. The shop confirms a time for each visit." },
                { term: "Reach", detail: content.email ?? content.phone ?? content.whatsapp ?? `Use the contact form — it is stored in the shop's own records.` },
              ].map((row) => (
                <div key={row.term} className="grid grid-cols-[8rem_1fr] gap-4 border-b border-rule py-3">
                  <dt className="label text-ink/50">{row.term}</dt>
                  <dd className="text-[0.98rem] leading-snug">{row.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
