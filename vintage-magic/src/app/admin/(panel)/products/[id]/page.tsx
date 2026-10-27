import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { getRepository } from "@/lib/data";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit piece" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getRepository().findProductById(id);
  if (!product) notFound();

  const initial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    era: product.era ?? "",
    categories: product.categories.slice(),
    genders: product.genders.slice(),
    sizeLabel: product.sizeLabel ?? "",
    price: (product.priceCents / 100).toFixed(2),
    quantity: product.quantity,
    condition: product.condition ?? "",
    description: product.description ?? "",
    provenance: product.provenance ?? "",
    diagram: product.diagram ?? ("" as const),
    featured: product.featured,
    archived: product.archived,
    measurements: product.measurements.map((measurement) => ({ label: measurement.label, value: measurement.value })),
    images: product.images.map((image) => ({ src: image.src, alt: image.alt })),
  };

  const orders = await getRepository().listOrders();
  const sold = orders.reduce((total, order) => total + order.lines.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink/55">
            <Link href="/admin/products" className="underline underline-offset-4">
              Products
            </Link>{" "}
            / {product.slug}
          </p>
          <h1 className="font-editorial text-[clamp(1.8rem,3.6vw,2.6rem)] leading-none">{product.name}</h1>
          <p className="mt-1 text-[0.92rem] text-ink/60">
            Listed at {formatUsd(product.priceCents)} · {product.quantity} in stock · {sold} sold through {orders.filter((order) => order.lines.some((line) => line.productId === product.id)).length} order(s)
          </p>
        </div>
        <Link href={`/archive/${product.slug}`} className="label rounded-sm border border-ink/25 px-3 py-1.5 hover:border-ink" target="_blank">
          Open public page
        </Link>
      </header>

      <ProductForm initial={initial} />

      <p className="text-[0.88rem] leading-snug text-ink/55">
        Editing price or stock here changes what the next customer is charged — the bag is a list of ids, so nobody keeps an old price by refreshing later. Order history keeps
        the price each order was placed at.
      </p>
    </div>
  );
}
