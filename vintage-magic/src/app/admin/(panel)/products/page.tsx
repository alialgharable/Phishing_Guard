import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/ActionForm";
import { deleteProductFormAction, setStockAction, toggleProductFlagAction } from "@/app/admin/actions";
import { getRepository } from "@/lib/data";
import { availabilityOf } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { CATEGORY_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const products = await getRepository().listProducts();
  const rows = (showArchived ? products.filter((product) => product.archived) : products.filter((product) => !product.archived)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink/55">{showArchived ? "Hidden from the public archive" : "Listed in the public archive"}</p>
          <h1 className="font-editorial text-[clamp(1.8rem,3.6vw,2.6rem)] leading-none">Products ({rows.length})</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={showArchived ? "/admin/products" : "/admin/products?archived=1"} className="label rounded-sm border border-ink/25 px-3 py-1.5 hover:border-ink">
            {showArchived ? "Back to listed" : `Archived (${products.filter((product) => product.archived).length})`}
          </Link>
          <Link href="/admin/products/new" className="label rounded-sm border border-ink bg-ink px-3 py-1.5 text-chalk">
            Add a piece
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="border border-dashed border-ink/25 p-6 text-[0.95rem] text-ink/65">
          {showArchived ? "Nothing is archived." : "The store has no products yet."}{" "}
          <Link href="/admin/products/new" className="label underline underline-offset-4">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((product) => {
            const availability = availabilityOf(product);
            return (
              <li key={product.id} className="grid gap-4 border border-ink/15 bg-chalk/40 p-3 lg:grid-cols-12 lg:items-center">
                <div className="flex items-center gap-3 lg:col-span-4">
                  <span className="photo-plate grid h-16 w-13 shrink-0 place-items-center overflow-hidden">
                    {product.images[0] ? (
                      <img src={product.images[0].src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="label text-ink/40">plate</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <Link href={`/admin/products/${product.id}`} className="font-editorial block truncate text-[1.25rem] leading-tight underline-offset-4 hover:underline">
                      {product.name}
                    </Link>
                    <span className="label block text-ink/55">
                      /{product.slug} · {product.categories.map((category) => CATEGORY_LABELS[category]).join(", ")}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.92rem] lg:col-span-3">
                  <span className="tabular-nums">{formatUsd(product.priceCents)}</span>
                  <span className={availability.collected ? "text-burgundy" : "text-olive"}>{availability.label}</span>
                  {product.featured ? <span className="label text-ink/55">featured</span> : null}
                  {product.archived ? <span className="label text-ink/55">archived</span> : null}
                </div>

                <div className="lg:col-span-2">
                  <ActionForm
                    action={setStockAction}
                    submitLabel="Set"
                    resetOnSuccess={false}
                    hidden={{ id: product.id }}
                    className="flex items-center gap-2"
                  >
                    <label className="sr-only" htmlFor={`stock-${product.id}`}>
                      Quantity for {product.name}
                    </label>
                    <input
                      id={`stock-${product.id}`}
                      name="quantity"
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={product.quantity}
                      className="w-20 rounded-sm border border-ink/25 bg-ivory px-2 py-1 text-[0.9rem]"
                    />
                  </ActionForm>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:col-span-3 lg:justify-end">
                  <ActionForm action={toggleProductFlagAction} submitLabel={product.featured ? "Unfeature" : "Feature"} hidden={{ id: product.id, flag: "featured" }} className="contents" />
                  <ActionForm action={toggleProductFlagAction} submitLabel={product.archived ? "Unarchive" : "Archive"} hidden={{ id: product.id, flag: "archived" }} className="contents" />
                  <Link href={`/archive/${product.slug}`} className="label rounded-sm border border-ink/25 px-2.5 py-1.5 hover:border-ink" target="_blank">
                    View
                  </Link>
                  <ActionForm
                    action={deleteProductFormAction}
                    submitLabel="Delete"
                    confirm={`Delete "${product.name}" from the store? This removes the record, including its place in past orders' history.`}
                    hidden={{ id: product.id }}
                    className="contents"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[0.88rem] leading-snug text-ink/55">
        Deleting is permanent and only for records that were entered by mistake — a piece that has been sold should keep its row with quantity 0, which is what shows it as
        collected in the archive.
      </p>
    </div>
  );
}
