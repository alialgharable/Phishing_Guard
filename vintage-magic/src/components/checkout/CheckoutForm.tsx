"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBag } from "@/components/bag/BagProvider";
import { readCatalog } from "./catalog-client";
import { Rule, Ticket } from "@/components/graphic/Ticket";
import { formatUsd } from "@/lib/money";
import { buildQuote } from "@/lib/quote";
import { useFulfilmentChoice } from "@/lib/fulfilment-choice";
import { validateCheckout } from "@/lib/validation";
import type { FulfilmentOption, PublicProduct } from "@/lib/types";

/**
 * Guest checkout.
 *
 * The visitor supplies ids and contact details only. Prices, stock, the fulfilment fee and the payment
 * method are re-derived on the server from the stored rows, so nothing typed here can move a total. If
 * the archive no longer matches the bag, the order is refused with a reason, the bag is corrected in
 * front of the visitor, and the same idempotency key is reused for the retry so a double submit cannot
 * reserve a piece twice.
 */

interface FieldValues {
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  notes: string;
}

const EMPTY: FieldValues = { name: "", phone: "", email: "", addressLine: "", city: "", notes: "" };

export interface CheckoutFormProps {
  initialProducts: PublicProduct[];
  fulfilment: FulfilmentOption[];
  note: string;
}

function newKey(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `vm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CheckoutForm({ initialProducts, fulfilment: options, note }: CheckoutFormProps) {
  const bag = useBag();
  const router = useRouter();
  const [products, setProducts] = useState<PublicProduct[]>(initialProducts);
  const [selected, setFulfilment] = useFulfilmentChoice(options[0]?.id ?? null);
  const [values, setValues] = useState<FieldValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const idempotencyKey = useRef<string>(newKey());
  const firstField = useRef<HTMLInputElement | null>(null);
  const fulfilment = selected ?? options[0]?.id ?? "";

  const quote = useMemo(() => buildQuote(products, bag.lines, fulfilment), [products, bag.lines, fulfilment]);
  const option = options.find((candidate) => candidate.id === fulfilment) ?? options[0] ?? null;

  useEffect(() => {
    if (bag.lines.length > 0) firstField.current?.focus({ preventScroll: true });
    // Focus is a one-off on mount, not a synchronisation of outside state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (field: keyof FieldValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const recheck = async () => {
    try {
      const catalog = await readCatalog();
      setProducts(catalog.products);
      setCheckedAt(new Date());
      setNotice(null);
    } catch {
      setNotice("The archive did not answer, so the figures below are the ones this page loaded with.");
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (bag.lines.length === 0) {
      setFormError("There is nothing in the bag to order.");
      return;
    }
    if (quote.needsAttention) {
      setFormError("At least one piece in the bag is no longer available in that quantity. Adjust it first.");
      return;
    }

    const checked = validateCheckout({ ...values }, { requiresAddress: option?.requiresAddress ?? false });
    if (Object.keys(checked.errors).length > 0) {
      setErrors(checked.errors);
      focusFirst(checked.errors);
      return;
    }

    setSubmitting(true);
    void (async () => {
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lines: bag.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
            customer: { name: values.name, phone: values.phone, email: values.email, addressLine: values.addressLine, city: values.city, notes: values.notes },
            fulfilment,
            idempotencyKey: idempotencyKey.current,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; redirectTo?: string; error?: string; errors?: Record<string, string>; code?: string; productId?: string; availableQuantity?: number }
          | null;

        if (response.ok && payload?.ok && payload.redirectTo) {
          bag.clear();
          router.push(payload.redirectTo);
          return;
        }

        setSubmitting(false);
        setErrors(payload?.errors ?? {});
        setFormError(payload?.error ?? "The order could not be placed.");

        // Stock moved underneath the bag: bring it in line with what the archive still holds.
        if (payload?.productId && (payload.code === "out_of_stock" || payload.code === "unavailable")) {
          const available = Math.max(0, payload.availableQuantity ?? 0);
          if (available === 0) bag.remove(payload.productId);
          else bag.setQuantity(payload.productId, available, available);
          setNotice("Your bag now shows what the archive can still supply. Confirm and place the order again if that still reads right.");
          idempotencyKey.current = newKey();
          void recheck();
        }
        if (payload?.errors) focusFirst(payload.errors);
      } catch {
        setSubmitting(false);
        setFormError("The shop’s server did not answer, so nothing was reserved or charged. Your details are still in the form — try again.");
      }
    })();
  };

  if (bag.lines.length === 0) {
    return (
      <div className="border border-dashed border-ink/25 px-6 py-12">
        <h2 className="display text-[clamp(1.8rem,3.6vw,2.6rem)]">Nothing to confirm</h2>
        <p className="mt-3 max-w-[46ch] text-[0.98rem] leading-snug text-ink/70">Checkout needs a bag. Pick a piece and it will be waiting here.</p>
        <Link href="/archive" className="btn btn--solid mt-5">
          <span>Open the archive</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-12 gap-x-6 gap-y-8">
      <div className="col-span-12 lg:col-span-7">
        <h2 className="font-editorial text-[clamp(1.6rem,2.6vw,2.1rem)] leading-none">Who to call</h2>
        <p className="mt-2 text-[0.93rem] text-ink/60">Only what the shop needs to hand the piece over. No account, no password, no card.</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="checkout-name" label="Full name" error={errors.name} required>
            <input
              ref={firstField}
              id="checkout-name"
              name="name"
              className="field"
              value={values.name}
              onChange={set("name")}
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "checkout-name-error" : undefined}
            />
          </Field>
          <Field id="checkout-phone" label="Phone" error={errors.phone} required hint="the shop calls or messages to arrange it">
            <input
              id="checkout-phone"
              name="phone"
              className="field"
              value={values.phone}
              onChange={set("phone")}
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
            />
          </Field>
          <Field id="checkout-email" label="Email" error={errors.email}>
            <input
              id="checkout-email"
              name="email"
              type="email"
              className="field"
              value={values.email}
              onChange={set("email")}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "checkout-email-error" : undefined}
            />
          </Field>
          {option?.requiresAddress ? (
            <Field id="checkout-address" label="Collection address" error={errors.addressLine} required>
              <input
                id="checkout-address"
                name="addressLine"
                className="field"
                value={values.addressLine}
                onChange={set("addressLine")}
                autoComplete="street-address"
                aria-invalid={Boolean(errors.addressLine)}
                aria-describedby={errors.addressLine ? "checkout-address-error" : undefined}
              />
            </Field>
          ) : null}
          {option?.requiresAddress ? (
            <Field id="checkout-city" label="Area" error={errors.city} required>
              <input
                id="checkout-city"
                name="city"
                className="field"
                value={values.city}
                onChange={set("city")}
                autoComplete="address-level2"
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? "checkout-city-error" : undefined}
              />
            </Field>
          ) : (
            <Field id="checkout-area" label="Area you are coming from" hint="optional">
              <input id="checkout-area" name="city" className="field" value={values.city} onChange={set("city")} />
            </Field>
          )}
        </div>

        <div className="mt-5">
          <Field id="checkout-notes" label="Anything the shop should know" hint="timing, a second measurement, a preferred colour of thread — optional">
            <textarea id="checkout-notes" name="notes" rows={4} className="field resize-y" value={values.notes} onChange={set("notes")} />
          </Field>
        </div>

        <fieldset className="mt-7 border-t border-rule pt-5">
          <legend className="label text-ink/55">How it reaches you</legend>
          <div className="mt-3 flex flex-col gap-2">
            {options.map((candidate) => (
              <label
                key={candidate.id}
                className={["flex cursor-pointer items-start justify-between gap-4 border px-3.5 py-3 transition-colors", fulfilment === candidate.id ? "border-ink bg-chalk/70" : "border-ink/20 hover:border-ink/60"].join(" ")}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="fulfilment"
                    className="mt-1 accent-[var(--color-ink)]"
                    checked={fulfilment === candidate.id}
                    onChange={() => setFulfilment(candidate.id)}
                    disabled={submitting}
                  />
                  <span>
                    <span className="label block">{candidate.label}</span>
                    <span className="mt-0.5 block max-w-[46ch] text-[0.9rem] leading-snug text-ink/60">{candidate.note}</span>
                  </span>
                </span>
                <span className="label shrink-0">{candidate.feeCents === 0 ? "no fee" : formatUsd(candidate.feeCents)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {formError ? (
          <p role="alert" className="mt-5 border border-burgundy/45 bg-burgundy/8 px-3 py-2 text-[0.95rem] text-burgundy">
            {formError}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3 border-l-2 border-olive px-3 py-2 text-[0.94rem]">
            {notice}
          </p>
        ) : null}

        <button type="submit" className="btn btn--solid mt-6 w-full justify-between sm:w-auto" disabled={submitting}>
          <span>{submitting ? "Placing the order…" : `Place the order — ${formatUsd(quote.totalCents)}`}</span>
          <span aria-hidden>{submitting ? "" : "→"}</span>
        </button>
        <p className="mt-2 text-[0.88rem] leading-snug text-ink/55">
          Placing the order takes the piece out of the archive and records it against your name. Payment happens in person — nothing is charged now.
        </p>
      </div>

      {/* ------------------------------------------------------------- summary */}
      <div className="col-span-12 lg:col-span-5">
        <div className="border border-ink/20 bg-chalk/50 p-5 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-editorial text-[1.6rem] leading-none">The order</h2>
            {quote.itemCount === 1 && quote.lines[0]?.isOneOfAKind ? <Ticket tone="one">one of one</Ticket> : null}
          </div>
          <div className="mt-3">
            <Rule count={2} />
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {quote.lines.map((line) => {
              const product = products.find((candidate) => candidate.id === line.productId);
              const image = product?.images[0] ?? null;
              return (
                <li key={line.productId} className="flex items-center gap-3">
                  <span className="photo-plate grid h-14 w-12 shrink-0 place-items-center overflow-hidden">
                    {image ? <img src={image.src} alt="" className="photo-multiply h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.98rem]">{line.name}</span>
                    <span className="label block text-ink/55">
                      {line.sizeLabel ? `Size ${line.sizeLabel}` : "One size"} · ×{line.quantity}
                    </span>
                  </span>
                  <span className="label shrink-0 tabular-nums">{formatUsd(line.lineTotalCents)}</span>
                </li>
              );
            })}
          </ul>

          <dl className="mt-5 flex flex-col gap-1.5 border-t border-rule pt-3 text-[0.95rem]">
            <div className="flex justify-between">
              <dt className="text-ink/65">Pieces</dt>
              <dd className="tabular-nums">{formatUsd(quote.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/65">{quote.fulfilmentLabel}</dt>
              <dd className="tabular-nums">{quote.deliveryCents === 0 ? "no fee" : formatUsd(quote.deliveryCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule pt-2">
              <dt className="label">Payable in person</dt>
              <dd className="font-editorial text-[1.7rem] leading-none tabular-nums">{formatUsd(quote.totalCents)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-[0.9rem] leading-snug text-ink/60">
            {quote.paymentLabel}. {note}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
            <button type="button" onClick={() => void recheck()} className="label underline underline-offset-4 disabled:opacity-50">
              Re-check prices and stock
            </button>
            {checkedAt ? <span className="label text-ink/45">{new Intl.DateTimeFormat("en-GB", { timeStyle: "medium" }).format(checkedAt)}</span> : null}
            <Link href="/bag" className="label ml-auto underline underline-offset-4 hover:text-ink">
              Change the bag
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label flex flex-wrap items-baseline gap-2">
        <span>
          {label}
          {required ? <span className="text-burgundy"> *</span> : null}
        </span>
        {hint ? <span className="normal-case tracking-normal text-ink/45">{hint}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span className="mt-1.5 block text-[0.9rem] text-burgundy" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** `validateCheckout` reports by data key; the inputs are numbered by id, so map the two. */
const FIELD_ID: Record<string, string> = {
  name: "checkout-name",
  phone: "checkout-phone",
  email: "checkout-email",
  addressLine: "checkout-address",
  city: "checkout-city",
  notes: "checkout-notes",
};

function focusFirst(errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  document.getElementById(FIELD_ID[first] ?? `checkout-${first}`)?.focus();
}
