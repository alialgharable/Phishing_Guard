import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { publicProducts } from "@/lib/data/project";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Read-only list used by the bag and checkout screens so they can show live prices and stock
 * without a server round-trip per interaction. Public data only: archived pieces never appear, and
 * no totals are trusted from here - the order endpoint re-reads every row transactionally.
 */
export async function GET() {
  const products = await getRepository().listProducts();
  return NextResponse.json({
    products: publicProducts(products),
    categories: CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  });
}
