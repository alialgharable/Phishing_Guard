import Link from "next/link";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { getRepository, repositoryKind, servingSampleData } from "@/lib/data";
import { adminBlockReason } from "@/lib/auth";
import { DELIVERY_FEES_NOTE, fulfilmentOptions } from "@/lib/config";
import { formatUsd } from "@/lib/money";
import { storageBackend } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Overview. What the store is running on, what it holds, and which environment values are still
 * missing - stated as facts about this process, never as a marketing dashboard.
 */
export default async function AdminDashboard() {
  const repository = getRepository();
  const [products, orders, messages, content] = await Promise.all([
    repository.listProducts(),
    repository.listOrders(),
    repository.listMessages(),
    repository.getSiteContent(),
  ]);

  const open = products.filter((product) => !product.archived);
  const available = open.filter((product) => product.quantity > 0);
  const oneOfOne = available.filter((product) => product.quantity === 1).length;
  const pendingOrders = orders.filter((order) => order.status !== "collected" && order.status !== "cancelled");
  const unread = messages.filter((message) => !message.handled);
  const stockValue = available.reduce((total, product) => total + product.priceCents * product.quantity, 0);

  const channels = [content.email, content.phone, content.whatsapp, content.instagram, content.addressLine, content.hours].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink/55">Overview</p>
          <h1 className="font-editorial text-[clamp(1.9rem,4vw,2.8rem)] leading-none">The shop today</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/products/new" className="label rounded-sm border border-ink bg-ink px-3 py-1.5 text-chalk">
            Add a piece
          </Link>
          <Link href="/admin/products" className="label rounded-sm border border-ink/25 px-3 py-1.5 hover:border-ink">
            Products
          </Link>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/15 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { term: "Listed pieces", value: String(open.length) },
          { term: "Available now", value: String(available.length) },
          { term: "One of one", value: String(oneOfOne) },
          { term: "Collected", value: String(open.length - available.length) },
          { term: "Open orders", value: String(pendingOrders.length) },
          { term: "Unread enquiries", value: String(unread.length) },
        ].map((metric) => (
          <div key={metric.term} className="bg-ivory px-3 py-3">
            <dt className="label text-ink/55">{metric.term}</dt>
            <dd className="font-editorial text-[2rem] leading-none">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-labelledby="recent-orders">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-orders" className="font-editorial text-[1.5rem] leading-none">
              Latest orders
            </h2>
            <Link href="/admin/orders" className="label underline underline-offset-4">
              All orders
            </Link>
          </div>
          {orders.length === 0 ? (
            <p className="mt-3 border border-dashed border-ink/25 p-5 text-[0.95rem] text-ink/65">
              No orders have been placed against this store yet. They appear here the moment a checkout is confirmed — none are invented for the demo.
            </p>
          ) : (
            <table className="mt-3 w-full border-collapse text-left text-[0.93rem]">
              <thead>
                <tr className="border-b border-ink/20">
                  <th className="py-1.5 font-normal">Reference</th>
                  <th className="py-1.5 font-normal">Pieces</th>
                  <th className="py-1.5 font-normal">Total</th>
                  <th className="py-1.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 6).map((order) => (
                  <tr key={order.id} className="border-b border-rule">
                    <td className="py-1.5">
                      <Link href={`/order/${order.id}`} className="label underline underline-offset-4">
                        {order.reference}
                      </Link>
                    </td>
                    <td className="py-1.5">{order.lines.reduce((total, line) => total + line.quantity, 0)}</td>
                    <td className="py-1.5 tabular-nums">{formatUsd(order.totalCents)}</td>
                    <td className="py-1.5">{ORDER_STATUS_LABELS[order.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="lg:col-span-5" aria-labelledby="wiring">
          <h2 id="wiring" className="font-editorial text-[1.5rem] leading-none">
            What this install is wired to
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.93rem]">
            <Line label="Data store" value={repositoryKind() === "supabase" ? "Supabase Postgres (service role, server-side)" : "Local JSON file at data/db.json"} />
            <Line label="Image storage" value={storageBackend() === "supabase" ? "Supabase Storage bucket" : "public/media/uploads on this disk"} />
            <Line
              label="Sample stock"
              value={servingSampleData() ? "Serving the shipped example archive — replaceable" : "Real store data"}
              tone={servingSampleData() ? "warn" : "ok"}
            />
            <Line
              label="Admin auth"
              value={adminBlockReason() ?? "ADMIN_PASSWORD and ADMIN_SESSION_SECRET present"}
              tone={adminBlockReason() ? "warn" : "ok"}
            />
            <Line label="Contact channels" value={channels > 0 ? `${channels} published` : "none published — pages say so rather than inventing any"} tone={channels > 0 ? "ok" : "warn"} />
            <Line label="Fulfilment" value={`${fulfilmentOptions().length} method(s) configured`} />
            <Line label="Payment" value="None online — cash on collection or delivery" />
          </ul>
          <p className="mt-3 text-[0.88rem] leading-snug text-ink/60">{DELIVERY_FEES_NOTE}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/content" className="label rounded-sm border border-ink/25 px-2.5 py-1.5 hover:border-ink">
              Store content
            </Link>
            <Link href="/admin/orders" className="label rounded-sm border border-ink/25 px-2.5 py-1.5 hover:border-ink">
              Orders ({pendingOrders.length} open)
            </Link>
            <Link href="/admin/products" className="label rounded-sm border border-ink/25 px-2.5 py-1.5 hover:border-ink">
              Stock worth {formatUsd(stockValue)}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Line({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "ok" | "warn" }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b border-rule pb-1.5">
      <span className="label text-ink/55">{label}</span>
      <span className={tone === "warn" ? "text-right text-burgundy" : tone === "ok" ? "text-right text-olive" : "text-right"}>{value}</span>
    </li>
  );
}
