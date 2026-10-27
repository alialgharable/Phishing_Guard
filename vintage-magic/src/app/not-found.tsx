import Link from "next/link";

/**
 * A 404 that belongs to the same object as the rest of the site: an oversized numeral, the cut
 * diagram of the thing you were probably looking for, and three ways back in.
 */
export default function NotFound() {
  return (
    <div className="shell flex min-h-[70dvh] flex-col justify-center py-16">
      <p className="label text-ink/55">Not in the ledger</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <span className="numeral text-[clamp(5rem,18vw,15rem)] leading-[0.72] text-ink/20">404</span>
        <h1 className="display">
          This page was <span className="italic text-burgundy">never catalogued</span>
        </h1>
      </div>
      <p className="mt-5 max-w-[52ch] text-[1.02rem] leading-snug text-ink/70">
        A collected piece keeps its record but loses its public page, and a mistyped link lands here too. Nothing was deleted from the archive — only the address you used does not
        exist.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/archive" className="btn btn--solid">
          <span>Open the archive</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/" className="btn btn--ghost">
          <span>Back to the cover</span>
        </Link>
        <Link href="/contact?topic=general" className="btn btn--ghost">
          <span>Ask the shop to find it</span>
        </Link>
      </div>
    </div>
  );
}
