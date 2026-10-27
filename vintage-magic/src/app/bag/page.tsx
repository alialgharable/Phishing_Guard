import type { Metadata } from "next";
import Link from "next/link";
import { BagView } from "@/components/bag/BagView";
import { Rule } from "@/components/graphic/Ticket";
import { fulfilmentOptions } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { publicProducts } from "@/lib/data/project";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your bag",
  description: "The pieces you are holding before an order is placed. Nothing here reserves stock yet.",
};

/**
 * Prices and stock are read on the server for the first paint — the same rows the order endpoint will
 * re-read — and the client keeps a copy only so the "check the archive again" button has something
 * to refresh.
 */
export default async function BagPage() {
  const products = publicProducts(await getRepository().listProducts());

  return (
    <div className="shell py-[clamp(26px,4vw,54px)]">
      <header className="grid grid-cols-12 items-end gap-x-6 gap-y-4">
        <div className="col-span-12 lg:col-span-8">
          <p className="label text-ink/55">Holding bay — nothing is reserved yet</p>
          <h1 className="display mt-2">
            Your <span className="italic">bag</span>
          </h1>
        </div>
        <p className="col-span-12 max-w-[40ch] text-[0.95rem] leading-snug text-ink/65 lg:col-span-4">
          This list lives in your browser. A piece leaves the archive only when an order is placed, so an item here may still be taken by somebody else.
        </p>
      </header>
      <div className="mt-5">
        <Rule count={3} />
      </div>

      <div className="mt-7">
        <BagView initialProducts={products} fulfilment={fulfilmentOptions()} />
      </div>

      <p className="mt-10 text-[0.92rem] text-ink/55">
        Trouble with a piece? <Link href="/contact?topic=pickup" className="link-sweep underline underline-offset-4">Write to the shop</Link> before ordering and it can be held out of the archive by hand.
      </p>
    </div>
  );
}
