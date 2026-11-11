-- Run once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Other',
  price numeric(10,2) not null check (price > 0),
  image_url text,
  description text,
  sizes text not null default 'S,M,L,XL,XXL',
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  min_order numeric(10,2) not null default 0 check (min_order >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.promotional_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  link_url text,
  is_active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer jsonb not null,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  currency text not null default 'INR',
  coupon_code text,
  razorpay_order_id text unique not null,
  razorpay_payment_id text unique,
  status text not null default 'payment_pending' check (status in ('payment_pending','paid','processing','shipped','delivered','cancelled','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists products_active_created_idx on public.products (is_active, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists coupons_code_active_idx on public.coupons (code, is_active);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.coupons enable row level security;
alter table public.promotional_banners enable row level security;
alter table public.orders enable row level security;

-- Storefront can read only active catalogue, coupon rules and currently active banners.
drop policy if exists "Public read active categories" on public.categories;
create policy "Public read active categories" on public.categories for select to anon, authenticated using (is_active = true);
drop policy if exists "Public read active products" on public.products;
create policy "Public read active products" on public.products for select to anon, authenticated using (is_active = true);
drop policy if exists "Public read active coupons" on public.coupons;
create policy "Public read active coupons" on public.coupons for select to anon, authenticated using (is_active = true);
drop policy if exists "Public read active banners" on public.promotional_banners;
create policy "Public read active banners" on public.promotional_banners for select to anon, authenticated using (is_active = true);
-- No public policies on orders. All order writes/reads are server-side using service-role key.

insert into public.categories (name, slug) values
 ('Oversized','oversized'), ('Classic','classic'), ('Graphic','graphic')
on conflict (slug) do nothing;

-- After creating the administrator in Supabase Authentication, run this once,
-- replacing the email with the admin's actual sign-in email:
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';
