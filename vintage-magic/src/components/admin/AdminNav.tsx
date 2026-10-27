"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The admin panel's navigation: plain, dense, and obvious about where you are. */
export function AdminNav() {
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/content", label: "Store content" },
  ];
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-1">
      {links.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-sm border px-2.5 py-1 text-[0.78rem] font-semibold uppercase tracking-[0.12em] transition-colors",
              active ? "border-ink bg-ink text-chalk" : "border-ink/20 text-ink/70 hover:border-ink hover:text-ink",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
