-- =====================================================================
--  Vintage Magic Beirut - Supabase / Postgres schema
--
--  Apply with the Supabase SQL editor, or:
--      supabase db execute --file supabase/schema.sql
--  (or: psql "$DATABASE_URL" -f supabase/schema.sql)
--
--  This schema is what the app expects when NEXT_PUBLIC_SUPABASE_URL and
--  SUPABASE_SERVICE_ROLE_KEY are both set (see src/lib/data/supabase.ts).
--  It has NOT been run against a live project in this environment - there are
--  no credentials here - so the first deployment should apply it and then walk
--  the checks at the bottom of this file.
--
--  Design notes
--   * Prices are integer cents (CHECK price_cents > 0) so no float ever touches money.
--   * Quantity has CHECK quantity >= 0: overselling is refused by the database itself,
--     not only by application code.
--   * Stock is only ever decremented inside place_order(), which takes row locks
--     (SELECT ... FOR UPDATE) so two buyers cannot take the same one-of-one piece.
--   * No payment column of any kind: this shop settles in cash, in person.
--   * The service-role key is used server-side only. It bypasses RLS by design;
--     the policies below are what a browser-side anon key would be allowed to do.
-- =====================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------- products

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null check (length(trim(name)) between 1 and 120),
  era           text check (era is null or length(era) <= 24),
  categories    text[] not null default '{}',
  genders       text[] not null default '{unisex}',
  size_label    text check (size_label is null or length(size_label) <= 24),
  measurements  jsonb not null default '[]'::jsonb,
  condition     text check (condition is null or length(condition) <= 400),
  description   text check (description is null or length(description) <= 2000),
  price_cents   integer not null check (price_cents > 0 and price_cents <= 10000000),
  quantity      integer not null default 1 check (quantity >= 0 and quantity <= 999),
  images        jsonb not null default '[]'::jsonb,
  diagram       text,
  annotations   jsonb not null default '[]'::jsonb,
  featured      boolean not null default false,
  archived      boolean not null default false,
  provenance    text check (provenance is null or length(provenance) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint products_categories_known
    check (categories <@ array['jackets','shirts','trousers','dresses','accessories']),
  constraint products_categories_at_least_one
    check (cardinality(categories) >= 1),
  constraint products_genders_known
    check (genders <@ array['women','men','unisex'] and cardinality(genders) >= 1),
  constraint products_diagram_known
    check (diagram is null or diagram in ('coat','jacket','shirt','trousers','skirt','dress','scarf','purse')),
  -- images: [{ "src": "/media/... or https://...", "alt": "..." }]
  constraint products_images_shape
    check (jsonb_typeof(images) = 'array'),
  constraint products_measurements_shape
    check (jsonb_typeof(measurements) = 'array'),
  constraint products_annotations_shape
    check (jsonb_typeof(annotations) = 'array')
);

create index if not exists products_created_at_idx on products (created_at desc);
create index if not exists products_not_archived_idx on products (created_at desc) where archived = false;
create index if not exists products_available_idx on products (created_at desc) where archived = false and quantity > 0;
create index if not exists products_categories_idx on products using gin (categories);

-- ------------------------------------------------------------------------ orders

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  status              text not null default 'placed',
  lines               jsonb not null,
  customer            jsonb not null,
  fulfilment          text not null,
  fulfilment_label    text not null,
  payment_method      text not null,
  subtotal_cents      integer not null check (subtotal_cents >= 0),
  delivery_cents      integer not null default 0 check (delivery_cents >= 0),
  total_cents         integer not null check (total_cents >= 0),
  idempotency_key     text unique,
  stock_released      boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_status_known
    check (status in ('placed','reserved','confirmed','dispatched','collected','cancelled')),
  constraint orders_payment_known
    check (payment_method in ('cash_on_collection','cash_on_delivery')),
  constraint orders_fulfilment_known
    check (fulfilment in ('pickup_beirut','courier_beirut','courier_lebanon')),
  constraint orders_total_is_sum
    check (total_cents = subtotal_cents + delivery_cents),
  constraint orders_lines_shape
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) >= 1)
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

-- ------------------------------------------------------------------- enquiries

create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  email       text check (email is null or length(email) <= 160),
  phone       text check (phone is null or length(phone) <= 40),
  topic       text not null default 'general',
  body        text not null check (length(body) between 12 and 2000),
  handled     boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint contact_messages_topic_known
    check (topic in ('general','sizing','pickup','press','atelier')),
  -- at least one way to answer
  constraint contact_messages_reachable
    check (email is not null or phone is not null)
);

create index if not exists contact_messages_created_at_idx on contact_messages (created_at desc);
create index if not exists contact_messages_unhandled_idx on contact_messages (created_at desc) where handled = false;

-- ---------------------------------------------------------------- store content

create table if not exists store_content (
  id          integer primary key default 1,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint store_content_single_row check (id = 1)
);

-- One row, seeded with the code defaults. The admin page owns this payload; nothing
-- here invents a phone number, an address or an opening hour - absent keys mean unset.
insert into store_content (id, payload) values (
  1,
  '{
     "phone": null, "email": null, "instagram": null, "whatsapp": null,
     "addressLine": null, "hours": null,
     "aboutHeading": "SOME THINGS DESERVE ANOTHER LIFE.",
     "aboutParagraphs": [],
     "atelierTeaserEnabled": false,
     "atelierTeaserCopy": ""
   }'::jsonb
) on conflict (id) do nothing;

-- ------------------------------------------------------------------- triggers

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch on products;
create trigger products_touch before update on products
  for each row execute function touch_updated_at();

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- Cancelling an order is the only status change that moves stock, and it may only
-- ever happen once per order. The flag lives on the row so a retry cannot mint a
-- second copy of a garment.
create or replace function release_stock_on_cancel() returns trigger
language plpgsql as $$
declare
  v_item record;
begin
  if new.status = 'cancelled' and old.stock_released = false then
    for v_item in
      select * from jsonb_to_recordset(new.lines) as x(product_id uuid, quantity integer)
    loop
      update products
         set quantity = least(999, quantity + coalesce(v_item.quantity, 0))
       where id = v_item.product_id;
    end loop;
    new.stock_released := true;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_release_stock on orders;
create trigger orders_release_stock before update on orders
  for each row execute function release_stock_on_cancel();

-- ------------------------------------------------------------------ place_order
--
-- The single atomic path from "bag" to "order". Rules it enforces:
--   * prices and availability come from the stored rows, never from the caller;
--   * each piece is locked FOR UPDATE inside the transaction, so a one-of-one piece
--     cannot be sold twice, and the quantity CHECK refuses any negative remainder;
--   * the whole order is refused if any line cannot be supplied (no partial orders);
--   * the same idempotency key returns the order that was already created.

create or replace function order_json(o orders) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', o.id::text,
    'reference', o.reference,
    'status', o.status,
    'lines', o.lines,
    'customer', o.customer,
    'fulfilment', o.fulfilment,
    'fulfilmentLabel', o.fulfilment_label,
    'paymentMethod', o.payment_method,
    'subtotalCents', o.subtotal_cents,
    'deliveryCents', o.delivery_cents,
    'totalCents', o.total_cents,
    'idempotencyKey', o.idempotency_key,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at
  );
$$;

create or replace function place_order(
  p_lines jsonb,
  p_customer jsonb,
  p_fulfilment text,
  p_fulfilment_label text,
  p_fulfilment_fee_cents integer,
  p_payment_method text,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product products%rowtype;
  v_order orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_reference text := 'VM-' || upper(substr(translate(v_order_id::text, '-', ''), 1, 8));
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'empty_cart', 'message', 'The bag is empty.'));
  end if;

  if p_idempotency_key is not null then
    select * into v_order from orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'order', order_json(v_order));
    end if;
  end if;

  for v_item in
    select *
      from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
     order by product_id  -- a fixed lock order keeps concurrent orders from deadlocking
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 10 then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid', 'message', 'A quantity in the bag is not usable.', 'productId', v_item.product_id));
    end if;

    select * into v_product
      from products
     where id = v_item.product_id
       for update;

    if not found or v_product.archived then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'unavailable',
        'message', 'A piece in the bag is no longer in the archive.',
        'productId', v_item.product_id,
        'availableQuantity', 0
      ));
    end if;

    if v_product.quantity < v_item.quantity then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'out_of_stock',
        'message', case
          when v_product.quantity = 0 then '“' || v_product.name || '” has already been collected.'
          else 'Only ' || v_product.quantity || ' of “' || v_product.name || '” is left.'
        end,
        'productId', v_product.id,
        'availableQuantity', v_product.quantity
      ));
    end if;

    update products
       set quantity = quantity - v_item.quantity
     where id = v_product.id;

    v_subtotal := v_subtotal + v_product.price_cents * v_item.quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id::text,
      'slug', v_product.slug,
      'name', v_product.name,
      'sizeLabel', v_product.size_label,
      'unitPriceCents', v_product.price_cents,
      'quantity', v_item.quantity,
      'imageSrc', (select min(i ->> 'src') from jsonb_array_elements(v_product.images) as i)
    ));
  end loop;

  insert into orders (
    id, reference, status, lines, customer, fulfilment, fulfilment_label, payment_method,
    subtotal_cents, delivery_cents, total_cents, idempotency_key, stock_released
  ) values (
    v_order_id,
    v_reference,
    'placed',
    v_lines,
    p_customer,
    p_fulfilment,
    p_fulfilment_label,
    p_payment_method,
    v_subtotal,
    coalesce(p_fulfilment_fee_cents, 0),
    v_subtotal + coalesce(p_fulfilment_fee_cents, 0),
    nullif(p_idempotency_key, ''),
    false
  )
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order', order_json(v_order));
end;
$$;

revoke all on function place_order(jsonb, jsonb, text, text, integer, text, text) from public;
revoke all on function place_order(jsonb, jsonb, text, text, integer, text, text) from anon, authenticated;
grant execute on function place_order(jsonb, jsonb, text, text, integer, text, text) to service_role;

-- row-level security

alter table products enable row level security;
alter table orders enable row level security;
alter table contact_messages enable row level security;
alter table store_content enable row level security;

-- The public shop may read the live archive. Nothing else is readable without the
-- service role, so an order or an enquiry can never be enumerated from a browser key.
drop policy if exists "archive is public" on products;
create policy "archive is public" on products
  for select
  to anon, authenticated
  using (archived = false);

drop policy if exists "shop content is public" on store_content;
create policy "shop content is public" on store_content
  for select
  to anon, authenticated
  using (true);

-- Deliberately no insert/update/delete policies for any table: writes only happen
-- through the server, with the service-role key, which bypasses RLS.

-- First real enquiry is proof that writes are refused for a browser key:
--   insert into contact_messages (name, email, topic, body) values (...)  -- must fail as anon

-- ------------------------------------------------------------------------ grants

grant usage on schema public to anon, authenticated, service_role;
grant select on products to anon, authenticated;
grant select on store_content to anon, authenticated;
revoke all on orders from anon, authenticated;
revoke all on contact_messages from anon, authenticated;
revoke insert, update, delete on products from anon, authenticated;
revoke all on store_content from anon, authenticated;
grant all on all tables in schema public to service_role;

-- --------------------------------------------------------------------- storage
--
-- Product uploads go to a private-write, public-read bucket named
-- SUPABASE_IMAGE_BUCKET (default: product-images). Create the bucket in the
-- dashboard or with:
--
--   insert into storage.buckets (id, name, public)
--   values ('product-images', 'product-images', true)
--   on conflict (id) do nothing;
--
--   drop policy if exists "product images are public" on storage.objects;
--   create policy "product images are public" on storage.objects
--     for select to anon, authenticated using (bucket_id = 'product-images');
--
-- Uploads are performed by the server with the service-role key, so no policy is
-- needed for writes; do not add an insert policy for anon.

-- --------------------------------------------------------------------- verify it
--
-- After applying, run these in the SQL editor (they change nothing):
--
--   1. select count(*) from products;                     -- 0 until you add pieces
--   2. select proname from pg_proc where proname in ('place_order','order_json');
--   3. select relname, relrowsecurity from pg_class
--        where relname in ('products','orders','contact_messages','store_content');
--      -- all four must show relrowsecurity = true
--   4. select conname from pg_constraint where conrelid = 'products'::regclass
--        and conname like '%_shape' or conname like 'products_%';
--
-- Then exercise the real paths against the running app:
--   * add a product in /admin/products/new (photo, price, quantity 1)
--   * place that order twice from two tabs -> the second must be refused out_of_stock
--   * cancel the order in /admin/orders -> quantity returns to 1, once
--   * save store content in /admin/content -> it appears on /contact and in the footer
