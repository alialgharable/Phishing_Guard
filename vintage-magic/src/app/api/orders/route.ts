import { NextResponse } from "next/server";
import { describeOrderFailure, paymentMethodFor } from "@/lib/quote";
import { fulfilmentOptions } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { validateCheckout } from "@/lib/validation";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_LINES = 24;
const MAX_PER_LINE = 10;

interface LinePayload {
  productId: string;
  quantity: number;
}

/**
 * The only write path a customer has.
 *
 * Everything that decides money or stock is re-derived here: the browser sends product ids and
 * quantities, prices and availability are read from the repository, the fulfilment method is looked
 * up in shop config, and the decrement happens inside the repository's single atomic transaction -
 * so two people cannot take the same one-of-one piece. Nothing is reported as paid: the order is
 * recorded as placed with cash on collection or delivery, which is the only thing this shop does.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The order could not be read." }, { status: 400 });
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const customerInput = typeof payload === "object" && payload !== null && typeof (payload as Record<string, unknown>).customer === "object" ? ((payload as Record<string, unknown>).customer as Record<string, unknown>) : {};

  const fulfilmentId = typeof body.fulfilment === "string" ? body.fulfilment : "";
  const option = fulfilmentOptions().find((candidate) => candidate.id === fulfilmentId);
  if (!option) {
    return NextResponse.json({ errors: { fulfilment: "Choose how the piece should reach you." }, error: "Unknown fulfilment method." }, { status: 422 });
  }

  const { value: customer, errors } = validateCheckout(customerInput, { requiresAddress: option.requiresAddress });
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors, error: "Some details are missing or malformed." }, { status: 422 });
  }

  const lines = sanitiseLines(body.lines);
  if (lines.length === 0) {
    return NextResponse.json({ error: "There is nothing in the bag to order.", code: "empty_cart" }, { status: 400 });
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 64) : null;

  let result: Awaited<ReturnType<ReturnType<typeof getRepository>["placeOrder"]>>;
  try {
    result = await getRepository().placeOrder({
      lines,
      customer,
      fulfilment: option.id,
      paymentMethod: paymentMethodFor(option.id),
      idempotencyKey,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: "The archive could not be written to. Nothing was charged or reserved.", detail: reason }, { status: 500 });
  }

  if (!result.ok) {
    const status = result.error.code === "invalid" ? 422 : result.error.code === "empty_cart" ? 400 : 409;
    return NextResponse.json(
      {
        error: describeOrderFailure(result.error),
        code: result.error.code,
        productId: result.error.productId,
        availableQuantity: result.error.availableQuantity,
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, order: present(result.order), redirectTo: `/order/${result.order.id}` }, { status: 201 });
}

function sanitiseLines(input: unknown): LinePayload[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const entry of input.slice(0, MAX_LINES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const productId = typeof record.productId === "string" ? record.productId.trim() : "";
    const quantity = Math.trunc(Number(record.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(productId, Math.min((merged.get(productId) ?? 0) + quantity, MAX_PER_LINE));
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Only the fields the confirmation page needs - no internal ids beyond the order reference. */
function present(order: Order) {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    lines: order.lines,
    fulfilmentLabel: order.fulfilmentLabel,
    paymentMethod: order.paymentMethod,
    subtotalCents: order.subtotalCents,
    deliveryCents: order.deliveryCents,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    customer: { name: order.customer.name, phone: order.customer.phone, email: order.customer.email },
  };
}
