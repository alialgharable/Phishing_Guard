import Link from "next/link";
import { Seal } from "@/components/graphic/Seal";
import { Rule } from "@/components/graphic/Ticket";
import { BRAND } from "@/lib/config";
import type { SiteContent } from "@/lib/types";
import { FooterWordmark } from "./FooterWordmark";

/**
 * The closing spread: an oversized wordmark that rises as it enters the viewport, a real index of
 * where the site actually goes, and contact lines that are only rendered when the shop has
 * supplied them. Nothing here invents an address, a handle or an opening hour.
 */

export function SiteFooter({ content }: { content: SiteContent }) {
  const instagram = content.instagram;
  const phone = content.phone;
  const email = content.email;
  const whatsapp = content.whatsapp;
  const configured = Boolean(phone || email || instagram || whatsapp || content.addressLine || content.hours);

  return (
    <footer className="relative mt-[clamp(40px,6vw,96px)] overflow-hidden border-t border-rule bg-espresso text-chalk">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] dot-field" />
      <div className="shell relative z-10 pt-[clamp(40px,5vw,72px)]">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <nav aria-label="Shop" className="col-span-6 sm:col-span-3">
            <h2 className="label text-chalk/55">Shop</h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {[
                { href: "/archive", label: "All pieces" },
                { href: "/archive?category=jackets", label: "Jackets & coats" },
                { href: "/archive?category=dresses", label: "Dresses" },
                { href: "/archive?category=accessories", label: "Accessories" },
                { href: "/archive?includeCollected=1", label: "Collected archive" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="link-sweep text-[0.98rem] text-chalk/90">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="House" className="col-span-6 sm:col-span-3">
            <h2 className="label text-chalk/55">House</h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {[
                { href: "/about", label: "Some things deserve another life" },
                { href: "/contact", label: "Contact & viewing" },
                { href: "/bag", label: "Your bag" },
                { href: "/checkout", label: "Checkout" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="link-sweep text-[0.98rem] text-chalk/90">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="col-span-6 sm:col-span-3">
            <h2 className="label text-chalk/55">Reach the shop</h2>
            <dl className="mt-3 flex flex-col gap-2 text-[0.98rem]">
              {email ? (
                <div>
                  <dt className="sr-only">Email</dt>
                  <dd>
                    <a href={`mailto:${email}`} className="link-sweep">
                      {email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {phone ? (
                <div>
                  <dt className="sr-only">Phone</dt>
                  <dd>
                    <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="link-sweep">
                      {phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {whatsapp ? (
                <div>
                  <dt className="sr-only">WhatsApp</dt>
                  <dd>
                    <a href={`https://wa.me/${whatsapp.replace(/[^+\d]/g, "").replace(/^\+/, "")}`} className="link-sweep" rel="noopener noreferrer" target="_blank">
                      WhatsApp {whatsapp}
                    </a>
                  </dd>
                </div>
              ) : null}
              {instagram ? (
                <div>
                  <dt className="sr-only">Instagram</dt>
                  <dd>
                    <a href={`https://www.instagram.com/${instagram.replace(/^@/, "").replace(/^\/|\/$/g, "")}/`} className="link-sweep" rel="me noopener noreferrer" target="_blank">
                      @{instagram.replace(/^@/, "")}
                    </a>
                  </dd>
                </div>
              ) : null}
              {content.addressLine ? (
                <div>
                  <dt className="sr-only">Address</dt>
                  <dd className="text-chalk/80">{content.addressLine}</dd>
                </div>
              ) : (
                <div>
                  <dt className="sr-only">Address</dt>
                  <dd className="text-chalk/70">Collection point in {BRAND.city} is agreed per order — the shop has not published a street address.</dd>
                </div>
              )}
              {content.hours ? (
                <div>
                  <dt className="sr-only">Hours</dt>
                  <dd className="text-chalk/80">{content.hours}</dd>
                </div>
              ) : null}
              {!configured ? (
                <dd className="text-chalk/70">
                  No contact channels published yet. Add them in <Link href="/admin/content" className="link-sweep text-chalk">admin → store content</Link> and they appear here and on the contact page.
                </dd>
              ) : null}
            </dl>
            <Link href="/contact" className="btn btn--ghost mt-4 border-chalk/40 text-chalk hover:text-chalk [--btn-bg:transparent] [--btn-fg:var(--color-chalk)]">
              <span>Write to the archive</span>
            </Link>
          </div>

          <div className="col-span-6 flex flex-col items-start justify-between gap-6 sm:col-span-3">
            <span className="text-chalk/70">
              <Seal size={116} reverse />
            </span>
            <p className="label text-chalk/55">Since the first piece arrived</p>
          </div>
        </div>

        <div className="mt-10">
          <Rule count={3} className="opacity-30" />
        </div>

        <FooterWordmark />

        <div className="flex flex-col gap-2 pb-8 pt-2 text-[0.78rem] text-chalk/55 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[54ch]">
            Every piece is second-hand and sold as photographed. Payment is cash on collection or on delivery — this site never takes card details.
          </p>
          <p className="label">
            © {new Date().getFullYear()} {BRAND.name} {BRAND.city}
            <span className="mx-2 opacity-40">/</span>
            <Link href="/admin" className="link-sweep text-chalk/80">
              Shop admin
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
