import { Suspense } from "react";
import { HeroComposition } from "@/components/hero/HeroComposition";
import {
  AtelierTeaserSection,
  BrandStorySection,
  CollectionDiscoverySection,
  HowItWorksSection,
  NewArrivalsSection,
  SampleDataStrip,
} from "@/components/home/sections";
import { getRepository } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABELS, type CategoryId, type Product } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The cover.
 *
 * One read of the archive, then the same array feeds every block, so the hero count, the arrivals
 * rhythm and the category tallies cannot disagree with each other. Data access stays on the server.
 */
export default async function HomePage() {
  const repository = getRepository();
  const [products, content] = await Promise.all([repository.listProducts(), repository.getSiteContent()]);

  const open = products.filter((product) => !product.archived);
  const available = open.filter((product) => product.quantity > 0);
  const collected = open.length - available.length;

  const hero = pickHero(available.length > 0 ? available : open);
  const arrivals = [...available]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  const counts = CATEGORIES.map((id: CategoryId) => ({
    id,
    count: open.filter((product) => product.categories.includes(id) && product.quantity > 0).length,
    collected: open.filter((product) => product.categories.includes(id) && product.quantity <= 0).length,
  }));

  return (
    <>
      <SampleDataStrip />

      <HeroComposition garment={hero} archiveCount={available.length} collectedCount={collected} />

      <Suspense fallback={<ArrivalsSkeleton />}>
        {arrivals.length > 0 ? (
          <NewArrivalsSection products={arrivals} collectedCount={collected} />
        ) : (
          <EmptyArchiveSection />
        )}
      </Suspense>

      <BrandStorySection content={content} garment={pickSecond(open, hero)} />

      <CollectionDiscoverySection counts={counts} total={available.length} />

      <HowItWorksSection />

      <AtelierTeaserSection content={content} />
    </>
  );
}

/** The most photographable piece wins the cover: featured first, then the newest. */
function pickHero(products: Product[]): Product | null {
  if (products.length === 0) return null;
  const withPhoto = products.filter((product) => product.images.length > 0);
  const pool = withPhoto.length > 0 ? withPhoto : products;
  return pool.find((product) => product.featured) ?? [...pool].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? pool[0] ?? null;
}

function pickSecond(products: Product[], exclude: Product | null): Product | null {
  const candidates = products.filter((product) => product.id !== exclude?.id && product.images.length > 0);
  return candidates[0] ?? null;
}

function ArrivalsSkeleton() {
  return (
    <section className="section" aria-busy="true" aria-label="Loading new arrivals">
      <div className="shell">
        <p className="label text-ink/45">Assembling the archive…</p>
        <div className="mt-6 grid grid-cols-12 gap-6">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={index === 0 ? "col-span-12 lg:col-span-7" : "col-span-12 sm:col-span-6 lg:col-span-4"}
              style={{ aspectRatio: index === 0 ? "3 / 4" : "4 / 5" }}
            >
              <div className="h-full w-full animate-pulse rounded-[2px] bg-chalk" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyArchiveSection() {
  return (
    <section className="section">
      <div className="shell">
        <div className="border border-dashed border-ink/25 px-6 py-14 text-center">
          <p className="label text-ink/55">The archive is being dressed</p>
          <h2 className="display mt-3">
            Nothing to <span className="italic">show</span> yet
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-[1rem] leading-snug text-ink/70">
            No pieces are listed. {CATEGORY_LABELS.jackets.toLowerCase()}, shirts, trousers, dresses and accessories will appear here as soon as they are entered
            in <span className="label">admin → products</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
