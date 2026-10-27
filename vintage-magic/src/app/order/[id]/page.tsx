import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Rule, Ticket } from "@/components/graphic/Ticket";
import { Seal } from "@/components/graphic/Seal";
import { getRepository } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const order = await getRepository().findOrderById(id);
  return order ? { title: `Order ${order.reference}`, robots: { index: false, follow: false } } : { title: "Order not found", robots: { index: false } };
}

/**
 * Confirmation, read straight from the store rather than from anything the browser remembered.
 * It states what actually happened — the pieces left the archive and payment is still to be made in
 * person — and never implies a payment was taken.
 */
export default async function OrderPage({ params }: PageProps) {
  const { id } = await params;
  const order = await getRepository().findOrderById(id);
  if (!order) notFound();

  return (
    <div className="shell py-[clamp(26px,4vw,60px)]">
      <div className="grid grid-cols-12 gap-x-6 gap-y-8">
        <div className="col-span-12 lg:col-span-7">
          <p className="label text-olive">Order {order.reference} — recorded</p>
          <h1 className="display mt-3">
            The pieces are <span className="italic text-burgundy">yours</span>
          </h1>
          <p className="mt-4 max-w-[52ch] text-[1.02rem] leading-snug text-ink/72">
            {order.lines.length === 1
              ? "The piece has been taken out of the archive against your name."
              : `All ${order.lines.length} pieces have been taken out of the archive against your name.`}{" "}
            Nothing has been charged: {order.paymentMethod === "cash_on_collection" ? "you pay in cash when you collect" : "you pay the courier in cash on delivery"}. The shop will use
            the contact details on the order to arrange the hand-over.
          </p>

          <div className="mt-6">
            <Rule count={3} />
          </div>

          <ul className="mt-6 flex flex-col">
            {order.lines.map((line) => (
              <li key={line.productId} className="flex items-start justify-between gap-5 border-b border-rule py-3.5 first:border-t">
                <span className="min-w-0">
                  <span className="label block text-ink/50">{line.sizeLabel ? `Size ${line.sizeLabel}` : "One size"}</span>
                  <Link href={`/archive/${line.slug}`} className="font-editorial block text-[1.35rem] leading-tight link-sweep">
                    {line.name}
                  </Link>
                </span>
                <span className="shrink-0 text-right">
                  <span className="label block tabular-nums">{formatUsd(line.unitPriceCents)} × {line.quantity}</span>
                  <span className="label block text-ink/55">{formatUsd(line.unitPriceCents * line.quantity)}</span>
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Row term="Subtotal" value={formatUsd(order.subtotalCents)} />
            <Row term={order.fulfilmentLabel} value={order.deliveryCents === 0 ? "no fee" : formatUsd(order.deliveryCents)} />
            <Row term="Payment" value={order.paymentMethod === "cash_on_collection" ? "Cash on collection" : "Cash to the courier"} />
            <Row term="Placed" value={new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))} />
          </dl>

          <div className="mt-6 flex items-baseline justify-between border-t border-ink/25 pt-4">
            <span className="label">Total payable in person</span>
            <span className="font-editorial text-[clamp(1.9rem,3.4vw,2.6rem)] leading-none tabular-nums">{formatUsd(order.totalCents)}</span>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:col-start-9">
          <aside className="border border-ink/20 bg-chalk/60 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label text-ink/55">Status</p>
                <p className="font-editorial text-[1.6rem] leading-none">{ORDER_STATUS_LABELS[order.status]}</p>
              </div>
              <span className="text-ink/45">
                <Seal size={78} centreMark="dot" />
              </span>
            </div>
            <div className="mt-4">
              <Ticket tone="collected">out of the archive</Ticket>
            </div>
            <h2 className="mt-5 font-editorial text-[1.35rem] leading-tight">What happens next</h2>
            <ol className="mt-2 flex flex-col gap-2 text-[0.95rem] leading-snug text-ink/72">
              <li>1. The shop reads the order in its own admin, under Orders.</li>
              <li>2. Somebody calls or messages {order.customer.phone ? `the number you gave, ${order.customer.phone}` : "you"} to fix a time{order.customer.email ? ` or writes to ${order.customer.email}` : ""}.</li>
              <li>3. {order.paymentMethod === "cash_on_collection" ? "You collect the piece and pay in cash." : "The courier brings the piece and you pay in cash at the door."}</li>
            </ol>
            {order.customer.notes ? (
              <p className="mt-4 border-t border-rule pt-3 text-[0.92rem] leading-snug text-ink/65">
                <span className="label block text-ink/45">Your note</span>
                {order.customer.notes}
              </p>
            ) : null}
            <p className="mt-4 text-[0.9rem] leading-snug text-ink/60">
              Need to change something? Quote {order.reference} when you write — the shop can cancel the order and put the piece back into the archive.
            </p>
            <Link href="/contact?topic=pickup" className="btn btn--ghost mt-4 w-full justify-between">
              <span>Contact the shop</span>
              <span aria-hidden>→</span>
            </Link>
          </aside>

          <div className="mt-5">
            <Link href="/archive" className="btn btn--solid w-full justify-between">
              <span>See what is still open</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-1.5">
      <dt className="label text-ink/55">{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
