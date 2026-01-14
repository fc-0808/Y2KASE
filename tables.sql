-- ==========================================
-- 1. CLEANUP (Reset everything)
-- ==========================================
drop policy if exists "Admin Bundles" on product_bundles;
drop table if exists reviews;
drop table if exists product_bundles;
drop table if exists product_media;
drop table if exists product_variants;
drop table if exists products;
drop table if exists collections;
drop table if exists categories;

-- Drop obsolete functions/triggers
drop function if exists update_updated_at_column cascade;

-- ==========================================
-- 2. UTILITIES (Auto-update timestamps)
-- ==========================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ==========================================
-- 3. CATEGORIES ("What is this?")
-- ==========================================
create table categories (
  id bigint primary key generated always as identity,
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

-- ==========================================
-- 4. COLLECTIONS ("Marketing Tags")
-- ==========================================
create table collections (
  id bigint primary key generated always as identity,
  name text not null,
  slug text unique not null,
  image_url text, 
  created_at timestamptz default now()
);

-- ==========================================
-- 5. PRODUCTS (The Parent)
-- ==========================================
create table products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  slug text unique not null, 
  
  -- Price (Display logic)
  base_price decimal(10,2) not null,
  compare_at_price decimal(10,2),
  
  -- Organization
  category_id bigint references categories(id),
  collection_ids bigint[] default '{}', 
  
  -- 2-Axis Logic (Shopify Style)
  option1_label text default 'Device',
  option2_label text default 'Style',                  
  
  -- Social Proof
  rating decimal(3,2) default 5.0,
  reviews_count int default 0,

  is_bundle boolean default false,
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger: Auto-update timestamp
create trigger update_products_modtime
before update on products
for each row execute procedure update_updated_at_column();

-- ==========================================
-- 6. VARIANTS (The Inventory)
-- ==========================================
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  
  -- The Choices
  option1_value text not null, 
  option2_value text,          
  
  -- Overrides
  price decimal(10,2),            
  compare_at_price decimal(10,2),
  stock int default 100,
  sku text,
  
  created_at timestamptz default now()
);

-- Constraint: Prevent duplicate variants
alter table product_variants 
add constraint unique_variant_options 
unique nulls not distinct (product_id, option1_value, option2_value);

-- ==========================================
-- 7. MEDIA (Images & Videos)
-- ==========================================
create table product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null, 
  
  url text not null,
  type text check (type in ('image', 'video')),
  display_order int default 0,
  
  created_at timestamptz default now()
);

-- ==========================================
-- 8. BUNDLES (The Recipe) - RESTORED
-- ==========================================
create table product_bundles (
  parent_product_id uuid references products(id) on delete cascade,
  child_product_id uuid references products(id) on delete cascade,
  quantity int default 1,
  primary key (parent_product_id, child_product_id)
);

-- ==========================================
-- 9. REVIEWS (Optional)
-- ==========================================
create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  user_name text not null, 
  rating int check (rating between 1 and 5),
  comment text,
  image_url text, 
  created_at timestamptz default now()
);

-- ==========================================
-- 10. PERFORMANCE INDEXES
-- ==========================================
create index idx_products_collections on products using gin (collection_ids);
create index idx_products_slug on products (slug);
create index idx_categories_slug on categories (slug);
create index idx_collections_slug on collections (slug);

-- ==========================================
-- 11. SECURITY (Row Level Security)
-- ==========================================
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_media enable row level security;
alter table categories enable row level security;
alter table collections enable row level security;
alter table reviews enable row level security;
alter table product_bundles enable row level security; -- Don't forget this!

-- A. PUBLIC ACCESS
create policy "Public Read Products" on products for select using (true);
create policy "Public Read Variants" on product_variants for select using (true);
create policy "Public Read Media" on product_media for select using (true);
create policy "Public Read Collections" on collections for select using (true);
create policy "Public Read Categories" on categories for select using (true);
create policy "Public Read Reviews" on reviews for select using (true);
create policy "Public Read Bundles" on product_bundles for select using (true);

-- B. ADMIN ACCESS (Write Access)
-- ⚠️ REPLACE 'YOUR_EMAIL@GMAIL.COM' BELOW WITH YOUR ACTUAL EMAIL ⚠️
create policy "Admin Products" on products for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Variants" on product_variants for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Media" on product_media for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Collections" on collections for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Categories" on categories for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Reviews" on reviews for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');

create policy "Admin Bundles" on product_bundles for all 
using (auth.jwt() ->> 'email' = 'YOUR_EMAIL@GMAIL.COM');