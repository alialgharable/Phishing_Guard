import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { getRepository } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

/**
 * Order ledger. Status is the shop's own record of what it has done — the only thing these writes
 * change is that label, plus what the public confirmation page reports back.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filter = typeof params.status === "string" ? (params.status as OrderStatus) : "all";
  const repository = getRepository();
  const [orders, products] = await Promise.all([repository.listOrders(), repository.listProducts()]);
  const rows = (filter === "all" ? orders : orders.filter((order) => order.status === filter)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totals = ORDER_STATUSES.map((status) => ({ status, count: orders.filter((order) => order.status === status).length }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink/55">Cash-settled, in person</p>
          <h1 className="font-editorial text-[clamp(1.8rem,3.6vw,2.6rem)] leading-none">Orders ({orders.length})</h1>
        </div>
        <p className="max-w-[42ch] text-[0.9rem] leading-snug text-ink/60">
          Nothing here marks money as received, because this shop is not told that online. Cancel an order to return its pieces to the archive.
        </p>
      </header>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        <Link href="/admin/orders" className={["label rounded-full border px-3 py-1", filter === "all" ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"].join(" ")}>
          All {orders.length}
        </Link>
        {totals.map((entry) => (
          <Link
            key={entry.status}
            href={`/admin/orders?status=${entry.status}`}
            className={["label rounded-full border px-3 py-1", filter === entry.status ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"].join(" ")}
          >
            {ORDER_STATUS_LABELS[entry.status]} {entry.count}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="border border-dashed border-ink/25 p-6 text-[0.95rem] text-ink/65">
          {orders.length === 0
            ? "No orders have been placed through this store yet. The archive is live, so this table fills itself as soon as a checkout is confirmed."
            : "No order carries that status right now."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((order) => (
            <li key={order.id} className="border border-ink/15 bg-chalk/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div>
                  <p className="label text-ink/55">
                    {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}
                  </p>
                  <h2 className="font-editorial text-[1.4rem] leading-none">
                    {order.reference}
                    <span className="ml-2 align-middle text-[0.85rem] text-ink/55">{ORDER_STATUS_LABELS[order.status]}</span>
                  </h2>
                </div>
                <div className="text-right">
                  <p className="font-editorial text-[1.5rem] leading-none tabular-nums">{formatUsd(order.totalCents)}</p>
                  <p className="label text-ink/55">
                    {order.fulfilmentLabel} · {order.paymentMethod === "cash_on_collection" ? "cash on collection" : "cash to courier"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <ul className="flex flex-col gap-1.5 text-[0.93rem]">
                    {order.lines.map((line) => {
                      const stock = products.find((product) => product.id === line.productId);
                      return (
                        <li key={line.productId} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule pb-1">
                          <span>
                            {line.name}
                            <span className="label ml-2 text-ink/50">
                              {line.sizeLabel ? `size ${line.sizeLabel}` : "one size"} · ×{line.quantity}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="tabular-nums text-ink/70">{formatUsd(line.unitPriceCents * line.quantity)}</span>
                            {stock ? (
                              <Link href={`/admin/products/${stock.id}`} className="label underline underline-offset-4">
                                stock {stock.quantity}
                              </Link>
                            ) : (
                              <span className="label text-ink/45">record removed</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[0.88rem] text-ink/55">
                    Delivery {order.deliveryCents === 0 ? "no fee" : formatUsd(order.deliveryCents)} · subtotal {formatUsd(order.subtotalCents)}
                  </p>
                </div>

                <div className="lg:col-span-5">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.92rem]">
                    <dt className="label text-ink/50">Name</dt>
                    <dd>{order.customer.name}</dd>
                    <dt className="label text-ink/50">Phone</dt>
                    <dd>
                      <a href={`tel:${order.customer.phone.replace(/[^+\d]/g, "")}`} className="underline underline-offset-2">
                        {order.customer.phone}
                      </a>
                    </dd>
                    <dt className="label text-ink/50">Email</dt>
                    <dd>{order.customer.email ?? "—"}</dd>
                    <dt className="label text-ink/50">Address</dt>
                    <dd>{order.customer.addressLine ? `${order.customer.addressLine}${order.customer.city ? `, ${order.customer.city}` : ""}` : "Collection in person"}</dd>
                    {order.customer.notes ? (
                      <>
                        <dt className="label text-ink/50">Note</dt>
                        <dd>{order.customer.notes}</dd>
                      </>
                    ) : null}
                  </dl>

                  <ActionForm action={updateOrderStatusAction} submitLabel="Update status" resetOnSuccess={false} hidden={{ id: order.id }} className="mt-4">
                    <label className="sr-only" htmlFor={`status-${order.id}`}>
                      Status for {order.reference}
                    </label>
                    <select id={`status-${order.id}`} name="status" defaultValue={order.status} className="w-full rounded-sm border border-ink/25 bg-ivory px-2 py-1.5 text-[0.9rem]">
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {ORDER_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                  <p className="mt-2 text-[0.85rem] leading-snug text-ink/55">
                    “Cancelled” is the only status that changes stock: the pieces return to the archive. Everything else is a note to the shop.
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
