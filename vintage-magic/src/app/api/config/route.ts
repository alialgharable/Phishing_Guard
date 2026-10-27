import { NextResponse } from "next/server";
import { BRAND, CURRENCY, DELIVERY_FEES_NOTE, fulfilmentOptions } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The operating settings the browser needs: how an order can be fulfilled and what each route
 * costs. Nothing secret is exposed - contact details stay on server-rendered pages, and payment
 * settings do not exist because no online payment is taken.
 */
export async function GET() {
  return NextResponse.json({
    brand: { name: BRAND.name, city: BRAND.city },
    currency: { code: CURRENCY.code, symbol: CURRENCY.symbol },
    fulfilment: fulfilmentOptions(),
    note: DELIVERY_FEES_NOTE,
  });
}
