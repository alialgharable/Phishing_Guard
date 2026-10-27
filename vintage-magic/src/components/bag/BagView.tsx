"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useBag } from "@/components/bag/BagProvider";
import { PlateDiagram } from "@/components/graphic/PlateDiagram";
import { Rule, Ticket } from "@/components/graphic/Ticket";
import { readCatalog } from "@/components/checkout/catalog-client";
import type { CartLine } from "@/lib/cart";
import { formatUsd } from "@/lib/money";
import { buildQuote } from "@/lib/quote";
import { useFulfilmentChoice } from "@/lib/fulfilment-choice";
import type { FulfilmentOption, PublicProduct } from "@/lib/types";

/**
 * The bag.
 *
 * The server hands over the product rows it just read, so the first paint already carries true prices
 * and stock; the client only re-fetches when somebody presses "Check the archive again". Quantities
 * are never silently rewritten: when the archive has moved, the difference is shown and applied by
 * the visitor. Either way the order endpoint re-reads everything again inside a transaction.
 */

export interface BagViewProps {
  initialProducts: PublicProduct[];
  fulfilment: FulfilmentOption[];
}

export function BagView({ initialProducts, fulfilment: options }: BagViewProps) {
  const bag = useBag();
  const [products, setProducts] = useState<PublicProduct[]>(initialProducts);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState<"idle" | "busy" | "failed">("idle");
  const [selected, setFulfilment] = useFulfilmentChoice(options[0]?.id ?? null);
  const fulfilmentId = selected ?? options[0]?.id ?? "";

  const bagLines = bag.lines;
  const quote = useMemo(() => buildQuote(products, bagLines, fulfilmentId), [products, bagLines, fulfilmentId]);

  const correction = useMemo(() => {
    const next: CartLine[] = [];
    const notes: string[] = [];
    for (const line of bagLines) {
      const product = products.find((candidate) => candidate.id === line.productId);
      if (!product || product.archived || product.quantity <= 0) {
        notes.push(`“${product?.name ?? "A removed piece"}” is no longer for sale`);
        continue;
      }
      if (line.quantity > product.quantity) {
        notes.push(`“${product.name}” comes down to ${product.quantity}`);
        next.push({ ...line, quantity: product.quantity });
        continue;
      }
      next.push(line);
    }
    if (next.length === bagLines.length && next.every((line, index) => line.quantity === bagLines[index]?.quantity)) return null;
    return { lines: next, text: `${notes.join("; ")}.` };
  }, [products, bagLines]);

  const recheck = async () => {
    setRefresh("busy");
    try {
      const catalog = await readCatalog();
      setProducts(catalog.products);
      setCheckedAt(new Date());
      setRefresh("idle");
    } catch {
      setRefresh("failed");
    }
  };

  if (bag.lines.length === 0) {
    return (
      <Panel title="Your bag is empty">
        <p>Nothing is being held back from the archive yet. A bag only reserves a piece once an order is placed — until then it stays here for anybody.</p>
        <Link href="/archive" className="btn btn--solid mt-5">
          <span>Explore the archive</span>
          <span aria-hidden>→</span>
        </Link>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-8">
      <div className="col-span-12 lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
          <p className="label text-ink/55">
            {quote.itemCount} {quote.itemCount === 1 ? "piece" : "pieces"} held in this browser
            {checkedAt ? <span className="ml-2 text-ink/40">· re-checked {new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(checkedAt)}</span> : null}
          </p>
          <button type="button" onClick={() => void recheck()} disabled={refresh === "busy"} className="label underline underline-offset-4 disabled:opacity-50">
            {refresh === "busy" ? "Checking…" : "Check the archive again"}
          </button>
        </div>
        {refresh === "failed" ? <p role="alert" className="mt-2 text-[0.92rem] text-burgundy">The shop did not answer, so the figures above are the last ones it gave us.</p> : null}

        {correction ? (
          <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-olive/50 bg-olive/10 px-3 py-2 text-[0.95rem]">
            <span>The archive changed while this bag was open: {correction.text}</span>
            <button type="button" className="label underline underline-offset-4" onClick={() => bag.replace(correction.lines)}>
              Update my bag
            </button>
          </div>
        ) : null}

        <ul className="mt-2 flex flex-col">
          {quote.lines.map((line) => {
            const product = products.find((candidate) => candidate.id === line.productId);
            const image = product?.images[0] ?? null;
            return (
              <li key={line.productId} className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-4 border-b border-rule py-4">
                <div className="photo-plate grid aspect-[4/5] place-items-center overflow-hidden p-1">
                  {image ? (
                    <img src={image.src} alt={image.alt} className="photo-multiply h-full w-full object-cover" />
                  ) : product?.diagram ? (
                    <PlateDiagram diagram={product.diagram} caption={false} />
                  ) : null}
                </div>

                <div className="min-w-0">
                  <p className="label text-ink/50">{product?.era ?? "Undated"}</p>
                  <h3 className="font-editorial text-[1.5rem] leading-tight">
                    {product ? (
                      <Link href={`/archive/${product.slug}`} className="link-sweep">
                        {line.name || product.name}
                      </Link>
                    ) : (
                      line.name
                    )}
                  </h3>
                  <p className="mt-1 text-[0.92rem] text-ink/60">
                    {line.sizeLabel ? `Size ${line.sizeLabel}` : "One size"} · {formatUsd(line.unitPriceCents)} each
                  </p>

                  {line.status !== "ok" ? <p className="mt-2 inline-block border-l-2 border-burgundy pl-2 text-[0.92rem] text-burgundy">{line.message}</p> : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 border border-ink/20">
                      <button
                        type="button"
                        className="label px-2 py-1 hover:bg-chalk disabled:opacity-30"
                        onClick={() => bag.setQuantity(line.productId, Math.max(0, line.quantity - 1), line.availableQuantity)}
                        disabled={line.quantity <= 1}
                        aria-label={`Reduce ${line.name || "this piece"} to ${Math.max(1, line.quantity - 1)}`}
                      >
                        −
                      </button>
                      <span className="label w-6 text-center tabular-nums" aria-live="polite">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className="label px-2 py-1 hover:bg-chalk disabled:opacity-30"
                        onClick={() => bag.setQuantity(line.productId, line.quantity + 1, line.availableQuantity)}
                        disabled={line.quantity >= line.availableQuantity}
                        aria-label={`Add another ${line.name || "piece"} — ${Math.max(0, line.availableQuantity - line.quantity)} left`}
                      >
                        +
                      </button>
                    </div>
                    <button type="button" className="label underline underline-offset-4 hover:text-burgundy" onClick={() => bag.remove(line.productId)}>
                      Take it out
                    </button>
                    {line.isOneOfAKind ? <Ticket tone="one">one of one</Ticket> : null}
                  </div>
                </div>

                <p className="label text-right tabular-nums">{formatUsd(line.lineTotalCents)}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link href="/archive" className="btn btn--ghost">
            <span>Keep looking</span>
            <span aria-hidden>←</span>
          </Link>
          <button type="button" className="label text-ink/55 underline underline-offset-4 hover:text-burgundy" onClick={() => bag.clear()}>
            Empty the bag
          </button>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <div className="border border-ink/20 bg-chalk/50 p-5 lg:sticky lg:top-24">
          <h2 className="font-editorial text-[1.7rem] leading-none">Summary</h2>
          <div className="mt-3">
            <Rule count={2} />
          </div>

          <fieldset className="mt-4">
            <legend className="field-label">How it reaches you</legend>
            <div className="mt-2 flex flex-col gap-2">
              {options.map((option) => (
                <label
                  key={option.id}
                  className={["flex cursor-pointer items-start gap-3 border px-3 py-2 transition-colors", fulfilmentId === option.id ? "border-ink bg-ivory" : "border-ink/20 hover:border-ink/60"].join(" ")}
                >
                  <input type="radio" name="fulfilment" className="mt-1 accent-[var(--color-ink)]" checked={fulfilmentId === option.id} onChange={() => setFulfilment(option.id)} />
                  <span className="min-w-0">
                    <span className="label flex items-baseline justify-between gap-3">
                      {option.label}
                      <span className="text-ink">{option.feeCents === 0 ? "free" : formatUsd(option.feeCents)}</span>
                    </span>
                    <span className="mt-0.5 block text-[0.88rem] leading-snug text-ink/60">{option.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="mt-5 flex flex-col gap-2 text-[0.97rem]">
            <div className="flex justify-between">
              <dt className="text-ink/65">
                {quote.itemCount} {quote.itemCount === 1 ? "piece" : "pieces"}
              </dt>
              <dd className="tabular-nums">{formatUsd(quote.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/65">{quote.fulfilmentLabel}</dt>
              <dd className="tabular-nums">{quote.deliveryCents === 0 ? "no fee" : formatUsd(quote.deliveryCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule pt-2">
              <dt className="label">Total</dt>
              <dd className="font-editorial text-[1.6rem] leading-none tabular-nums">{formatUsd(quote.totalCents)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-[0.9rem] leading-snug text-ink/65">{quote.paymentLabel}. Nothing is charged here.</p>

          {quote.needsAttention ? <p className="mt-3 border-l-2 border-burgundy pl-2 text-[0.92rem] text-burgundy">Some quantities are not what we can currently supply — read the notes on the left before ordering.</p> : null}

          <Link href="/checkout" className={["btn btn--solid mt-5 w-full justify-between", quote.needsAttention ? "opacity-60" : ""].filter(Boolean).join(" ")}>
            <span>Go to checkout</span>
            <span aria-hidden>→</span>
          </Link>
          <p className="mt-2 text-[0.85rem] leading-snug text-ink/50">A piece is only taken out of the archive when the order is placed, not while it sits in the bag.</p>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-ink/25 px-6 py-12">
      <h2 className="display text-[clamp(1.8rem,3.6vw,2.6rem)]">{title}</h2>
      <div className="mt-3 max-w-[46ch] text-[0.98rem] leading-snug text-ink/70">{children}</div>
    </div>
  );
}
