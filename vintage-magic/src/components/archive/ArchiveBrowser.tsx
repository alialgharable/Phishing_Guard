"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Rule } from "@/components/graphic/Ticket";
import { PieceGrid } from "@/components/piece/PieceGrid";
import { applyCatalogQuery } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { activeFilterCount, DEFAULT_FILTERS, filtersToSearchParams, parseCatalogFilters } from "@/lib/query-params";
import { CATEGORIES, CATEGORY_LABELS, GENDERS, GENDER_LABELS, SORTS, SORT_LABELS, type CatalogFilters, type CategoryId, type GenderId, type Product, type SortId } from "@/lib/types";

/**
 * The archive browser.
 *
 * The server already rendered the filtered list from the same pure `applyCatalogQuery`; this
 * component takes ownership of the same object so changing a filter re-flows the grid on the spot —
 * no fetch, no reload, no second source of truth. The URL is kept in step through a router
 * transition, which is also what drives the "updating" pulse on the count: it reflects a real
 * navigation, not an invented delay.
 */

export interface ArchiveBrowserProps {
  products: Product[];
  searchParams: Record<string, string | string[] | undefined>;
}

export function ArchiveBrowser({ products, searchParams }: ArchiveBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [pending, startTransition] = useTransition();

  const initial = useMemo(() => parseCatalogFilters(searchParams), [searchParams]);
  const [filters, setFilters] = useState<CatalogFilters>(initial);
  const [searchDraft, setSearchDraft] = useState(initial.search);
  const firstSync = useRef(true);

  // Debounced so typing does not rewrite the history on every keystroke.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: searchDraft })), 170);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search]);

  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const query = filtersToSearchParams(filters);
    startTransition(() => {
      router.replace(`${pathname}${query}`, { scroll: false });
    });
  }, [filters, pathname, router]);

  const result = useMemo(() => applyCatalogQuery(products, filters), [products, filters]);
  const active = activeFilterCount(filters);

  const patch = useCallback((next: Partial<CatalogFilters>) => setFilters((current) => ({ ...current, ...next })), []);
  const clearAll = useCallback(() => {
    setSearchDraft("");
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  }, [filters.sort]);

  const categoryCounts = useMemo(() => {
    const map = new Map<CategoryId, { open: number; collected: number }>();
    for (const category of CATEGORIES) map.set(category, { open: 0, collected: 0 });
    for (const product of products) {
      for (const category of product.categories) {
        const entry = map.get(category);
        if (!entry) continue;
        if (product.quantity > 0) entry.open += 1;
        else entry.collected += 1;
      }
    }
    return map;
  }, [products]);

  const ceiling = result.maxAvailablePriceCents;

  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-8">
      {/* ---------------------------------------------------------------- filters */}
      <aside className="col-span-12 lg:col-span-3" aria-label="Filters">
        <div className="lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-editorial text-[1.75rem] leading-none">Refine</h2>
            <button
              type="button"
              onClick={clearAll}
              disabled={active === 0}
              className="label underline-offset-4 transition-opacity hover:underline disabled:cursor-not-allowed disabled:opacity-35"
            >
              Clear {active > 0 ? `(${active})` : "all"}
            </button>
          </div>
          <div className="mt-3">
            <Rule count={2} />
          </div>

          <div className="mt-5 flex flex-col gap-6">
            <div>
              <label htmlFor="archive-search" className="field-label">
                Search
              </label>
              <input
                id="archive-search"
                type="search"
                className="field mt-1"
                placeholder="leather, 1970s, linen…"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
            </div>

            <fieldset>
              <legend className="field-label">Category</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <FilterPill label="All pieces" count={products.length} active={filters.category === "all"} onClick={() => patch({ category: "all" })} groupId="filter-pill-category" reduce={reduce === true} />
                {CATEGORIES.map((category) => {
                  const entry = categoryCounts.get(category)!;
                  const shown = entry.open + (filters.includeCollected ? entry.collected : 0);
                  return (
                    <FilterPill
                      key={category}
                      label={CATEGORY_LABELS[category]}
                      count={shown}
                      active={filters.category === category}
                      onClick={() => patch({ category: filters.category === category ? "all" : category })}
                      groupId="filter-pill-category"
                      reduce={reduce === true}
                    />
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="field-label">Cut for</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <FilterPill label="Anyone" count={products.length} active={filters.gender === "all"} onClick={() => patch({ gender: "all" })} groupId="filter-pill-gender" reduce={reduce === true} />
                {GENDERS.map((gender) => (
                  <FilterPill
                    key={gender}
                    label={GENDER_LABELS[gender]}
                    count={products.filter((product) => product.genders.includes(gender as GenderId)).length}
                    active={filters.gender === gender}
                    onClick={() => patch({ gender: filters.gender === gender ? "all" : gender })}
                    groupId="filter-pill-gender"
                    reduce={reduce === true}
                  />
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label htmlFor="archive-size" className="field-label">
                  Size
                </label>
                <select id="archive-size" className="field mt-1" value={filters.size} onChange={(event) => patch({ size: event.target.value })}>
                  <option value="all">All sizes ({result.sizes.length} in view)</option>
                  {result.sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="archive-sort" className="field-label">
                  Order by
                </label>
                <select id="archive-sort" className="field mt-1" value={filters.sort} onChange={(event) => patch({ sort: event.target.value as SortId })}>
                  {SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {SORT_LABELS[sort]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="archive-max" className="field-label flex items-baseline justify-between gap-2">
                <span>Highest price</span>
                <span className="text-ink">{typeof filters.maxPriceCents === "number" ? formatUsd(filters.maxPriceCents) : "no ceiling"}</span>
              </label>
              <input
                id="archive-max"
                type="range"
                className="mt-2 w-full accent-[var(--color-burgundy)] disabled:opacity-40"
                min={0}
                max={Math.max(ceiling, 1000)}
                step={500}
                disabled={ceiling <= 0}
                value={filters.maxPriceCents ?? Math.max(ceiling, 1000)}
                onChange={(event) => {
                  const cents = Number(event.target.value) * 100;
                  patch({ maxPriceCents: cents >= Math.max(ceiling, 1000) ? null : cents });
                }}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 border-t border-rule pt-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
                checked={filters.includeCollected}
                onChange={(event) => patch({ includeCollected: event.target.checked })}
              />
              <span>
                <span className="label block">Include collected pieces</span>
                <span className="mt-0.5 block text-[0.9rem] leading-snug text-ink/65">Read-only records of garments that already found their person. Never buyable.</span>
              </span>
            </label>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- results */}
      <div className="col-span-12 lg:col-span-9">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule pb-3">
          <p className="text-[0.95rem] text-ink/70" aria-live="polite" aria-atomic>
            <span className="font-editorial text-[1.9rem] leading-none text-ink">{result.products.length}</span>{" "}
            {result.products.length === 1 ? "piece" : "pieces"} in view
            {result.collectedCount > 0 ? <span className="text-ink/50"> · {result.collectedCount} collected</span> : null}
            {pending ? <span className="ml-2 text-burgundy">updating…</span> : null}
          </p>
          {result.activeChips.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5">
              {result.activeChips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => clearChip(chip.key, setFilters, setSearchDraft)}
                    className="label flex items-center gap-1.5 rounded-full border border-ink/25 bg-chalk/80 py-1 pl-2 pr-1.5 transition-colors hover:border-ink"
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    {chip.label}
                    <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-ink/10 text-[9px]">
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="label text-ink/45">Whole archive</p>
          )}
        </div>

        <div className="mt-7">
          {result.products.length > 0 ? (
            <PieceGrid products={result.products} startNumber={1} rhythm="editorial" />
          ) : (
            <div className="grid place-items-center border border-dashed border-ink/25 px-6 py-20 text-center">
              <p className="numeral text-ink/25">000</p>
              <h3 className="display mt-2 text-[clamp(2rem,4.6vw,3rem)]">Nothing matches — yet</h3>
              <p className="mx-auto mt-3 max-w-[42ch] text-[0.98rem] leading-snug text-ink/70">
                No piece in the archive has that combination right now. Vintage stock is thin by nature: loosen one filter, or let the shop look for it.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={clearAll} className="btn btn--solid">
                  <span>Show everything</span>
                </button>
                <Link href="/contact?topic=general" className="btn btn--ghost">
                  <span>Ask the shop to look</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clearChip(key: string, setFilters: (updater: (current: CatalogFilters) => CatalogFilters) => void, setSearchDraft: (value: string) => void) {
  setFilters((current) => {
    switch (key) {
      case "search":
        setSearchDraft("");
        return { ...current, search: "" };
      case "category":
        return { ...current, category: "all" };
      case "gender":
        return { ...current, gender: "all" };
      case "size":
        return { ...current, size: "all" };
      case "maxPriceCents":
        return { ...current, maxPriceCents: null };
      case "includeCollected":
        return { ...current, includeCollected: false };
      default:
        return current;
    }
  });
}

function FilterPill({ label, count, active, onClick, groupId, reduce }: { label: string; count: number; active: boolean; onClick: () => void; groupId: string; reduce: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={["relative rounded-full border px-3 py-1.5 transition-colors", active ? "border-ink text-chalk" : "border-ink/22 text-ink/75 hover:border-ink/60"].join(" ")}>
      {active ? (
        <motion.span
          layoutId={reduce ? undefined : groupId}
          className="absolute inset-0 -z-10 rounded-full bg-ink"
          transition={{ type: "spring", stiffness: 460, damping: 40, mass: 0.6 }}
        />
      ) : null}
      <span className="label flex items-center gap-1.5">
        {label}
        <span className={active ? "text-chalk/70" : "text-ink/40"}>{count}</span>
      </span>
    </button>
  );
}
