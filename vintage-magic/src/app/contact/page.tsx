import type { Metadata } from "next";
import Link from "next/link";
import { HandNote, Rule, Ticket } from "@/components/graphic/Ticket";
import { ContactForm } from "@/components/site/ContactForm";
import { Reveal } from "@/components/motion/Reveal";
import { ParallaxDisc } from "@/components/motion/ParallaxDisc";
import { BRAND, fulfilmentOptions } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Write to Vintage Magic Beirut about sizing, a viewing, a collection or a piece you are looking for.",
};

const TOPIC_LABELS: Record<string, string> = {
  general: "anything else",
  sizing: "sizing and measurements",
  pickup: "collection and delivery",
  press: "press",
  atelier: "the reimagining notebook",
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const content = await getRepository().getSiteContent();
  const options = fulfilmentOptions();

  const channels = [
    { label: "Email", value: content.email, href: content.email ? `mailto:${content.email}` : null },
    { label: "Phone", value: content.phone, href: content.phone ? `tel:${content.phone.replace(/[^+\d]/g, "")}` : null },
    { label: "WhatsApp", value: content.whatsapp, href: content.whatsapp ? `https://wa.me/${content.whatsapp.replace(/[^+\d]/g, "").replace(/^\+/, "")}` : null },
    { label: "Instagram", value: content.instagram, href: content.instagram ? `https://www.instagram.com/${content.instagram.replace(/^@/, "").replace(/^\/|\/$/g, "")}/` : null },
  ].filter((channel) => channel.value !== null && channel.value !== undefined);

  return (
    <div>
      <section className="relative overflow-hidden pt-[clamp(30px,5vw,70px)]">
        <ParallaxDisc className="right-[-12%] top-[10%] h-[34vw] w-[34vw] opacity-40" speed={0.07} />
        <div className="shell relative">
          <p className="label text-ink/55">{BRAND.name} {BRAND.city} — the counter</p>
          <h1 className="mt-3 statement">
            <span className="mask-line mask-line--css block">
              <span>Ask about</span>
            </span>
            <span className="mask-line mask-line--css block" style={{ "--line-delay": "110ms" } as React.CSSProperties}>
              <span className="italic text-burgundy">a piece</span>
            </span>
          </h1>
          <p className="mt-5 max-w-[54ch] text-[1.05rem] leading-snug text-ink/72">
            A garment in this archive is usually tried on, measured again and discussed before it is sold. If you want a second measurement, a fabric question answered, or a
            viewing before committing, write here — {topic ? `about ${TOPIC_LABELS[topic] ?? "your question"}` : "whatever it is"}.
          </p>
          <div className="mt-7">
            <Rule count={3} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell grid grid-cols-12 gap-x-8 gap-y-12">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-editorial text-[clamp(1.7rem,3vw,2.3rem)] leading-none">Write it down</h2>
            <p className="mt-2 max-w-[50ch] text-[0.95rem] leading-snug text-ink/60">
              The form goes into the shop’s own order-and-enquiry record. There is no mailing list at the end of it.
            </p>
            <div className="mt-7">
              <ContactForm defaultTopic={topic} />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <Reveal as="div" variant="up" className="border border-ink/20 bg-chalk/50 p-5">
              <h2 className="font-editorial text-[1.55rem] leading-none">Straight to a person</h2>
              <div className="mt-3">
                <Rule count={2} />
              </div>
              {channels.length > 0 ? (
                <dl className="mt-4 flex flex-col gap-3">
                  {channels.map((channel) => (
                    <div key={channel.label} className="border-b border-rule pb-2 last:border-0">
                      <dt className="label text-ink/50">{channel.label}</dt>
                      <dd className="text-[1.02rem]">
                        {channel.href ? (
                          <a
                            href={channel.href}
                            className="link-sweep"
                            {...(channel.href.startsWith("http") ? { rel: "noopener noreferrer", target: "_blank" } : {})}
                          >
                            {channel.value}
                          </a>
                        ) : (
                          channel.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-4">
                  <Ticket tone="plate">No direct channels published</Ticket>
                  <p className="mt-3 text-[0.95rem] leading-snug text-ink/70">
                    The shop has not published a phone number, address or social account yet, so none are invented here. This form is the working route; a person can also add
                    direct channels in <Link href="/admin/content" className="label underline underline-offset-4">admin → store content</Link>.
                  </p>
                </div>
              )}

              <h3 className="mt-6 font-editorial text-[1.3rem] leading-tight">Where and when</h3>
              <p className="mt-2 text-[0.95rem] leading-snug text-ink/70">
                {content.addressLine ?? `Collection happens somewhere in ${BRAND.city}; the exact point is agreed per order.`}
                {content.hours ? ` ${content.hours}` : " No opening hours are published — a time is fixed for each visit."}
              </p>

              <h3 className="mt-6 font-editorial text-[1.3rem] leading-tight">Getting it home</h3>
              <ul className="mt-2 flex flex-col gap-2 text-[0.93rem] leading-snug text-ink/70">
                {options.map((option) => (
                  <li key={option.id} className="flex items-baseline justify-between gap-3">
                    <span>{option.label}</span>
                    <span className="label shrink-0 text-ink/55">{option.feeCents === 0 ? "no fee" : formatUsd(option.feeCents)}</span>
                  </li>
                ))}
              </ul>

              <HandNote className="mt-6 inline-block" rotate={-1.8}>
                answered by whoever is in the shop that day
              </HandNote>
            </Reveal>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/archive" className="btn btn--solid w-full justify-between sm:w-auto">
                <span>Browse the archive</span>
                <span aria-hidden>→</span>
              </Link>
              <Link href="/about" className="btn btn--ghost w-full justify-between sm:w-auto">
                <span>The house note</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
