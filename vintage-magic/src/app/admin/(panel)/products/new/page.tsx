import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New piece" };

const EMPTY = {
  name: "",
  slug: "",
  era: "",
  categories: ["jackets"],
  genders: ["unisex"],
  sizeLabel: "",
  price: "",
  quantity: 1,
  condition: "",
  description: "",
  provenance: "",
  diagram: "" as const,
  featured: false,
  archived: false,
  measurements: [
    { label: "Chest", value: "" },
    { label: "Shoulder", value: "" },
    { label: "Sleeve", value: "" },
    { label: "Length", value: "" },
  ],
  images: [],
};

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="label text-ink/55">
          <Link href="/admin/products" className="underline underline-offset-4">
            Products
          </Link>{" "}
          / new
        </p>
        <h1 className="font-editorial text-[clamp(1.8rem,3.6vw,2.6rem)] leading-none">Add a piece to the archive</h1>
        <p className="mt-2 max-w-[64ch] text-[0.94rem] leading-snug text-ink/65">
          Record only what the shop knows. Era, condition and provenance stay empty rather than guessed — an empty era is listed as “Undated”, and a piece with no photo is
          shown as a drawn plate instead of a stock image.
        </p>
      </header>
      <ProductForm initial={EMPTY} />
    </div>
  );
}
