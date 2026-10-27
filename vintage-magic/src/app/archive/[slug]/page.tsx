import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToBagButton } from "@/components/piece/AddToBagButton";
import { PieceGallery } from "@/components/piece/PieceGallery";
import { PieceGrid } from "@/components/piece/PieceGrid";
import { HandNote, Rule, Ticket } from "@/components/graphic/Ticket";
import { Reveal } from "@/components/motion/Reveal";
import { availabilityOf } from "@/lib/catalog";
import { BRAND, CURRENCY, fulfilmentOptions } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function load(slug: string) {
  const product = await getRepository().findProductBySlug(slug);
  if (!product || product.archived) return null;
  return product;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) return { title: "Piece not in the archive" };
  const availability = availabilityOf(product);
  return {
    title: product.name,
    description: `${product.name}${product.era ? ` — ${product.era}` : ""}. ${product.sizeLabel ? `Size ${product.sizeLabel}. ` : ""}${availability.label}. ${formatUsd(product.priceCents)} ${CURRENCY.code}, collected or delivered in ${BRAND.city}.`,
  };
}

export default async function PiecePage({ params }: PageProps) {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) notFound();

  const repository = getRepository();
  const all = (await repository.listProducts()).filter((item) => !item.archived && item.id !== product.id);
  const related = all.filter((item) => item.categories.some((category) => product.categories.includes(category)) && item.quantity > 0).slice(0, 3);
  const availability = availabilityOf(product);
  const fulfilment = fulfilmentOptions();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    category: product.categories.map((category) => CATEGORY_LABELS[category]),
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: CURRENCY.code,
      availability: availability.collected ? "https://schema.org/OutOfStock" : "https://schema.org/LimitedAvailability",
      itemCondition: "https://schema.org/UsedCondition",
    },
  };

  return (
    <div className="shell py-[clamp(22px,3vw,44px)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="label flex flex-wrap items-center gap-2 text-ink/55">
        <Link href="/archive" className="link-sweep">
          Archive
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/archive?category=${product.categories[0] ?? ""}`} className="link-sweep">
          {CATEGORY_LABELS[product.categories[0] ?? "accessories"]}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="mt-5 grid grid-cols-12 gap-x-6 gap-y-9 lg:mt-8">
        {/* ------------------------------------------------------------- visual */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-6">
          <div style={{ viewTransitionName: "piece" }}>
            <PieceGallery product={product} />
          </div>
          {product.provenance ? (
            <p className="mt-4 flex items-start gap-3 text-[0.95rem] leading-snug text-ink/70">
              <span className="label mt-0.5 shrink-0 text-ink/45">Provenance</span>
              {product.provenance}
            </p>
          ) : null}
        </div>

        {/* --------------------------------------------------------------- data */}
        <div className="col-span-12 lg:col-span-5 lg:col-start-8 xl:col-span-5 xl:col-start-8">
          <div className="lg:sticky lg:top-24">
            <p className="label flex flex-wrap items-center gap-2 text-ink/55">
              <span>{product.era ?? "Undated"}</span>
              <span aria-hidden className="h-px w-6 bg-rule" />
              <span>{product.categories.map((category) => CATEGORY_LABELS[category]).join(" · ")}</span>
            </p>

            <h1 className="mt-2 font-editorial text-[clamp(2.3rem,5.4vw,4rem)] leading-[0.95] tracking-[-0.025em]">{product.name}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="font-editorial text-[clamp(1.5rem,2.6vw,2.1rem)] leading-none">{formatUsd(product.priceCents)}</span>
              <Ticket tone={availability.collected ? "collected" : availability.isOneOfAKind ? "one" : "default"}>{availability.label}</Ticket>
              <span className="label text-ink/50">
                {product.genders.map((gender) => GENDER_LABELS[gender]).join(" / ")}
              </span>
            </div>

            <div className="mt-5">
              <Rule count={2} />
            </div>

            {availability.collected ? (
              <div className="mt-5 border border-ink/20 bg-parchment/70 p-4">
                <p className="label text-ink/70">This piece is collected</p>
                <p className="mt-2 text-[0.98rem] leading-snug">
                  It stays in the archive as a record of what passed through the shop, but it is no longer for sale and cannot be added to a bag.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/archive?category=${product.categories[0] ?? ""}`} className="btn btn--solid">
                    <span>See what is still open</span>
                    <span aria-hidden>→</span>
                  </Link>
                  <Link href="/contact?topic=general" className="btn btn--ghost">
                    <span>Ask for something similar</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4">
                <AddToBagButton product={product} />
                <p className="text-[0.93rem] leading-snug text-ink/65">
                  {availability.isOneOfAKind
                    ? "There is exactly one of this in the shop. Placing an order removes it from the archive — nothing else can be added to the bag for it."
                    : `The shop holds ${availability.quantity} of this style. Each order decrements what the archive can still sell.`}
                </p>
              </div>
            )}

            <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-rule pt-5 text-[0.97rem]">
              <div>
                <dt className="label text-ink/50">Size</dt>
                <dd className="mt-1">{product.sizeLabel ?? "One size"}</dd>
              </div>
              <div>
                <dt className="label text-ink/50">Condition</dt>
                <dd className="mt-1">{product.condition ?? "Worn, checked by the shop"}</dd>
              </div>
              {product.measurements.length > 0 ? (
                <div className="col-span-2">
                  <dt className="label text-ink/50">Measurements (flat, centimetres)</dt>
                  <dd className="mt-2">
                    <table className="w-full border-collapse text-left">
                      <tbody>
                        {product.measurements.map((measurement) => (
                          <tr key={measurement.label} className="border-b border-rule/70 last:border-0">
                            <th scope="row" className="py-1 pr-3 font-normal text-ink/70">
                              {measurement.label}
                            </th>
                            <td className="py-1 font-medium tabular-nums">{measurement.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </dd>
                </div>
              ) : null}
            </dl>

            {product.description ? <p className="prose-editorial mt-6">{product.description}</p> : null}

            <div className="mt-7 border-t border-rule pt-5">
              <h2 className="label text-ink/50">Getting it home</h2>
              <ul className="mt-3 flex flex-col gap-3 text-[0.95rem]">
                {fulfilment.map((option) => (
                  <li key={option.id} className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block">{option.label}</span>
                      <span className="block text-[0.88rem] leading-snug text-ink/60">{option.note}</span>
                    </span>
                    <span className="label shrink-0">{option.feeCents === 0 ? "free" : formatUsd(option.feeCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.88rem] leading-snug text-ink/55">
                No card details are taken on this site: payment is cash on {fulfilment[0]?.id === "pickup_beirut" ? "collection" : "collection or delivery"}.
              </p>
            </div>

            <HandNote className="mt-6 inline-block max-w-[22ch]" rotate={-2.4}>
              handled, measured and photographed by the shop
            </HandNote>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-[clamp(40px,6vw,86px)] border-t border-rule pt-8" aria-labelledby="related-heading">
          <Reveal as="div" variant="up" className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="related-heading" className="font-editorial text-[clamp(1.7rem,3vw,2.4rem)] leading-none">
              Cut the same <span className="italic">way</span>
            </h2>
            <Link href={`/archive?category=${product.categories[0] ?? ""}`} className="label underline underline-offset-4 hover:text-ink">
              All {CATEGORY_LABELS[product.categories[0] ?? "accessories"].toLowerCase()}
            </Link>
          </Reveal>
          <div className="mt-6">
            <PieceGrid products={related} rhythm="steady" priorityCount={0} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
