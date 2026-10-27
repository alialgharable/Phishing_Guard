import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Rule } from "@/components/graphic/Ticket";
import { DELIVERY_FEES_NOTE, fulfilmentOptions } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { publicProducts } from "@/lib/data/project";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm an order with the shop. No card details: payment is cash on collection or on delivery.",
};

export default async function CheckoutPage() {
  const options = fulfilmentOptions();
  const products = publicProducts(await getRepository().listProducts());
  return (
    <div className="shell py-[clamp(26px,4vw,54px)]">
      <header className="grid grid-cols-12 items-end gap-x-6 gap-y-4">
        <div className="col-span-12 lg:col-span-8">
          <p className="label text-ink/55">Last step — a person reads this, not a payment gateway</p>
          <h1 className="display mt-2">
            Confirm the <span className="italic">order</span>
          </h1>
        </div>
        <p className="col-span-12 max-w-[42ch] text-[0.95rem] leading-snug text-ink/65 lg:col-span-4">
          {options.length === 1
            ? "This shop currently offers one way to receive a piece, settled in cash."
            : "Choose how the piece reaches you. Every method this shop offers is settled in cash, in person."}
        </p>
      </header>
      <div className="mt-5">
        <Rule count={3} />
      </div>

      <div className="mt-7">
        <CheckoutForm initialProducts={products} fulfilment={options} note={DELIVERY_FEES_NOTE} />
      </div>
    </div>
  );
}
