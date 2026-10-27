import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOutAction } from "@/app/admin/actions";
import { adminBlockReason } from "@/lib/auth";
import { adminAccessForPage } from "@/app/admin/server";

export const metadata: Metadata = {
  title: { default: "Shop admin", template: `%s · Shop admin` },
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const access = await adminAccessForPage();
  if (!access.ok) redirect("/admin/login");

  // The panel is intentionally ordinary: tables, fields and messages, no experimental layout.
  const warning = adminBlockReason();

  return (
    <div className="min-h-dvh bg-ivory">
      <div className="sticky top-0 z-40 border-b border-rule bg-ivory/95 backdrop-blur-sm">
        <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <div className="flex items-baseline gap-4">
            <Link href="/admin" className="font-editorial text-[1.35rem] leading-none">
              Shop admin
            </Link>
            <span className="label text-ink/50">Vintage Magic Beirut</span>
          </div>
          <AdminNav />
          <div className="flex items-center gap-3">
            <Link href="/" className="label underline underline-offset-4 hover:text-ink">
              View shop
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="label rounded-sm border border-ink/25 px-2.5 py-1 hover:border-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      {warning ? (
        <div className="border-b border-burgundy/40 bg-burgundy/10">
          <p className="shell py-2 text-[0.92rem]">{warning} Every write below is refused until that is fixed.</p>
        </div>
      ) : null}

      <main className="shell py-7">{children}</main>
    </div>
  );
}
