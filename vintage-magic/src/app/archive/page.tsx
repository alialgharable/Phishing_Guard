import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchiveBrowser } from "@/components/archive/ArchiveBrowser";
import { Rule } from "@/components/graphic/Ticket";
import { Reveal } from "@/components/motion/Reveal";
import { getRepository } from "@/lib/data";
import { parseCatalogFilters, filtersToSearchParams } from "@/lib/query-params";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const products = (await getRepository().listProducts()).filter((product) => !product.archived);
  const open = products.filter((product) => product.quantity > 0).length;
  return {
    title: "The archive",
    description: `${open} second-hand and vintage pieces currently open for collection in ${products.length ? "the Vintage Magic Beirut ledger" : "Beirut"} — searchable by era, cut, size and price.`,
  };
}

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const products = (await getRepository().listProducts()).filter((product) => !product.archived);
  const filters = parseCatalogFilters(params);
  const openCount = products.filter((product) => product.quantity > 0).length;

  return (
    <div className="shell py-[clamp(28px,4vw,58px)]">
      <header className="grid grid-cols-12 items-end gap-x-6 gap-y-5">
        <div className="col-span-12 lg:col-span-8">
          <p className="label text-ink/55">Vintage Magic Beirut — ledger</p>
          <h1 className="display mt-2">
            The <span className="italic text-burgundy">archive</span>
          </h1>
        </div>
        <Reveal as="div" variant="side" className="col-span-12 lg:col-span-4">
          <p className="text-[0.98rem] leading-snug text-ink/70">
            Everything the shop is currently wearing out of the wardrobe: {openCount} {openCount === 1 ? "piece" : "pieces"} open for collection. Collected pieces stay on record
            and are only shown when you ask for them.
          </p>
        </Reveal>
      </header>

      <div className="mt-6">
        <Rule count={3} />
      </div>

      <div className="mt-7" data-current-query={filtersToSearchParams(filters)}>
        <Suspense fallback={<BrowserSkeleton />}>
          <ArchiveBrowser products={products} searchParams={params} />
        </Suspense>
      </div>
    </div>
  );
}

function BrowserSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-6" aria-busy="true">
      <div className="col-span-12 lg:col-span-3">
        <div className="h-6 w-24 bg-chalk" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-14 bg-chalk/70" />
          ))}
        </div>
      </div>
      <div className="col-span-12 grid grid-cols-12 gap-6 lg:col-span-9">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className={row % 3 === 0 ? "col-span-12 aspect-[3/4] lg:col-span-7" : "col-span-12 aspect-[4/5] sm:col-span-6 lg:col-span-4"}>
            <div className="h-full w-full animate-pulse bg-chalk" />
          </div>
        ))}
      </div>
    </div>
  );
}
