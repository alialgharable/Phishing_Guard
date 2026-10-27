# Vintage Magic Beirut

An archive of one-of-a-kind vintage clothing in Beirut, built as an editorial object rather than a
storefront template: oversized type, garment cutouts that overlap the headline, drawn pattern
plates, rotating archival seals, and a real shop behind it (browse → bag → checkout → admin).

This app lives in `vintage-magic/` inside the `Phishing_Guard` repository and is fully independent of
the root Next.js app: separate `package.json`, separate lockfile, separate port (3005), and the root
`tsconfig.json` / `eslint.config.mjs` / `vitest.config.mjs` all exclude this directory.

## Run it

```bash
cd vintage-magic
npm install
npm run dev        # http://localhost:3005
```

No environment variables are required to run it. Without Supabase credentials the app serves the
archive from a JSON file store and says so on screen.

```bash
npm run test        # vitest run         (98 tests, no network, no browser)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run build       # next build
```

## Where the data comes from

`src/lib/data/index.ts` chooses one repository implementation at request time:

| Condition                                                    | Backing store                                    |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL` **and** `SUPABASE_SERVICE_ROLE_KEY` set | Supabase Postgres (`supabase/schema.sql`)         |
| otherwise, or `VINTAGE_FORCE_LOCAL_DATA=1`                    | `data/db.json` next to this README                |

The file store is a real store, not a mock: it persists products, orders and enquiries to
`data/db.json` (gitignored), applies stock atomically, and refuses to oversell. `data/db.json` is
seeded on first read from `src/lib/data/sample-products.ts` — those entries are **sample stock,
marked replaceable**, and no order or enquiry is ever invented by the seed. Delete the file to reset;
set `VINTAGE_SAMPLE_MODE=off` after loading your own catalogue to hide the sample banner.

Because both repositories implement the same `CatalogRepository` interface, ordering, stock and
filtering behave identically on either side. `src/lib/data/local.ts` is covered by the test suite;
`src/lib/data/supabase.ts` is type-checked and built but **has not been run against a live project** —
no credentials exist in this environment. Apply `supabase/schema.sql`, then walk its `-- verify it`
checklist before trusting it in production.

### Ordering rules (the part that must not be faked)

* Prices are integer cents. The browser sends product ids and quantities **only**; every line is
  priced from the stored row. A stale `expectedUnitPriceCents` refuses the order rather than
  silently charging a different amount.
* `placeOrder` is the single atomic write path. It locks the product row, refuses if quantity is
  short, and creates nothing unless every line can be supplied.
* A one-of-one piece becomes `COLLECTED` (quantity 0) the moment an order is created, stays visible in
  the archive as a record, and can never be bought again — enforced in code *and* by
  `check (quantity >= 0)` in Postgres.
* An `Idempotency-Key` on `POST /api/orders` replays the original order instead of double-charging
  stock.
* Cancelling an order is the only status change that returns stock, and the `stock_released` flag
  (plus a trigger in Postgres) makes it happen exactly once.
* **No payment provider is integrated.** The configured settlement method is cash on collection or
  on delivery, and the confirmation page says so plainly. Nothing in this app claims a payment was
  taken. To accept cards you must add a provider, its server secrets and its webhook — start in
  `src/app/api/orders/route.ts` and `src/lib/quote.ts`.

## Admin

`/admin` is gated server-side on every page, every server action and every read — hiding the
interface is not treated as protection.

1. Set `ADMIN_PASSWORD` **and** `ADMIN_SESSION_SECRET` (a long random string).
2. Sign in at `/admin/login`.
3. Without `ADMIN_PASSWORD` the panel refuses to open and explains what is missing. It never falls
   back to a default password. Outside production a per-process session secret is generated so the
   panel is usable in development; in production a missing `ADMIN_SESSION_SECRET` means no session
   can be minted at all.
4. Failed sign-ins are throttled per client address in memory (6 per 5 minutes). That is a floor, not
   a durable rate limiter; put a real one in front if the app is exposed.

Inside: product CRUD with multiple images per piece (uploads are size- and type-checked, then sent
to Supabase Storage when configured or written to `public/media/uploads/` otherwise - a local dev
convenience, not a production file store), categories, prices, sizes and measurements,
stock, order status changes, and store content (contact channels, house note, atelier teaser).

## Environment

Copy `.env.example` to `.env.local`. Nothing is required; each key turns something on.
The service-role key is read **only** on the server — it is never referenced from a client component,
and `next.config.ts` does not prefix it with `NEXT_PUBLIC_`.

## Design system

`src/app/globals.css` + `src/app/kit.css` hold the tokens; do not re-declare them inline.

```
ivory   #F1EFE9   page
ink     #1E1D1A   type
espresso #49362E  secondary
burgundy #713B43  accent (used sparingly)
olive   #77765C   secondary accent
```

Three type roles: an expressive serif for display, a condensed sans for labels and catalogue
numbers, a legible sans for product data and forms. Scale is deliberately dramatic and alignment
deliberately uneven; readability still wins every argument.

Graphic primitives (seals, cutout masks, plate diagrams, annotation rules) live in
`src/components/graphic/`. Motion primitives (reveal, parallax, hover states) live in
`src/components/motion/`. Animation rules that the whole app obeys:

* transform/opacity only, so nothing reflows;
* `prefers-reduced-motion` is respected by a single hook, and pointer-coarse devices skip cursor
  parallax and hover choreography;
* every hover affordance has a non-hover equivalent;
* no animation delays a purchase, a link or a keyboard interaction;
* `IntersectionObserver` reveals disconnect in cleanup and reveal only once.

## Public API

| Route            | Method | Purpose                                                       |
| ---------------- | ------ | ------------------------------------------------------------- |
| `/api/catalog`   | GET    | The public archive (available + collected records)             |
| `/api/config`    | GET    | What this deployment supports (fulfilment, payment, sample mode) |
| `/api/messages`  | POST   | Contact enquiry → validated, stored, `201`                     |
| `/api/orders`    | POST   | Place an order → `201` with `redirectTo`, or `409/422/400`     |

`/api/orders` errors are machine-readable: `{ code: "out_of_stock" | "price_changed" | "empty_cart" | "unavailable" | "invalid" }`.

## Layout of the source

```
src/app/            routes: /, /archive, /archive/[slug], /bag, /checkout, /order/[id],
                    /about, /contact, /admin/*, /api/*
src/components/     graphic/ motion/ site/ piece/ bag/ checkout/ admin/
src/lib/            catalog.ts (filtering/sorting), cart.ts, quote.ts (re-pricing),
                    validation.ts, money.ts, config.ts (fulfilment + contact defaults),
                    fulfilment-choice.ts, media.ts (uploads), auth.ts, types.ts
src/lib/data/       repository interface + local.ts (file store) + supabase.ts + sample data
supabase/schema.sql Postgres tables, constraints, indexes, RLS, place_order(), stock trigger
```

## Known limits, stated plainly

* Supabase mode is unverified against a live project (no credentials here).
* No browser automation was run in this environment: interactions (magnifier, drag-free filtering,
  shared-element expansion, admin forms) were verified by build, unit tests and code reading, not by
  clicking.
* Sample photographs in `public/media/` are generated placeholders for the shop's own shoot. Replace
  them by overwriting the files or by uploading in `/admin/products`.
* `README`-level contact details are not invented: until `VINTAGE_CONTACT_*` / store content supplies
  them, the contact page says the channel is not configured instead of printing a fake number.
