import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminBlockReason } from "@/lib/auth";
import { adminAccessForPage } from "@/app/admin/server";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  // Someone with a live session should never see the door they came through.
  if ((await adminAccessForPage()).ok) redirect("/admin");

  const blocked = adminBlockReason();

  return (
    <div className="shell flex min-h-dvh flex-col justify-center py-16">
      <div className="mx-auto w-full max-w-[34rem]">
        <p className="label text-ink/55">{blocked ? "Admin is switched off" : "Vintage Magic Beirut — shop admin"}</p>
        <h1 className="display mt-2 text-[clamp(2.2rem,6vw,3.4rem)]">
          {blocked ? "Nothing to sign in to yet" : "Behind the counter"}
        </h1>

        {blocked ? (
          <div className="mt-6 border border-burgundy/40 bg-burgundy/8 p-5">
            <p className="text-[1rem] leading-snug">{blocked}</p>
            <p className="mt-3 text-[0.95rem] leading-snug text-ink/70">
              Two values are needed before this panel exists at all — there is no default password and no back door:
            </p>
            <pre className="mt-3 overflow-x-auto border border-ink/15 bg-chalk/70 p-3 text-[0.82rem] leading-relaxed">{`# .env.local (vintage-magic)
ADMIN_PASSWORD="a long phrase only the shop knows"
ADMIN_SESSION_SECRET="$(openssl rand -hex 32)"`}</pre>
            <p className="mt-3 text-[0.92rem] text-ink/65">Restart the dev server after adding them, then return to this page.</p>
          </div>
        ) : (
          <LoginForm />
        )}

        <p className="mt-8 text-[0.92rem] text-ink/60">
          <Link href="/" className="link-sweep underline underline-offset-4">
            Back to the archive
          </Link>{" "}
          — the shop front never requires a session.
        </p>
      </div>
    </div>
  );
}
