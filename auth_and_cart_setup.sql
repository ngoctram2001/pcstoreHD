-- ============================================================
-- PCStore Perth — Đăng nhập Google + Giỏ hàng theo tài khoản
-- Chạy toàn bộ file này 1 lần trong Supabase SQL Editor
-- ============================================================

-- 1. Bảng profiles: lưu tên/SĐT của mỗi tài khoản đã đăng nhập
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- 2. Bảng cart_items: giỏ hàng lưu theo tài khoản (chỉ khi đã đăng nhập)
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_snapshot jsonb not null,
  created_at timestamptz default now(),
  unique (user_id, product_id)
);

-- Nếu bảng đã tồn tại từ trước (chưa có ràng buộc), dọn dẹp bản trùng rồi thêm ràng buộc
delete from cart_items a using cart_items b
  where a.id < b.id and a.user_id = b.user_id and a.product_id = b.product_id;

alter table cart_items drop constraint if exists cart_items_user_id_product_id_key;
alter table cart_items add constraint cart_items_user_id_product_id_key unique (user_id, product_id);

alter table cart_items enable row level security;

drop policy if exists "cart_select_own" on cart_items;
create policy "cart_select_own" on cart_items
  for select using (auth.uid() = user_id);

drop policy if exists "cart_insert_own" on cart_items;
create policy "cart_insert_own" on cart_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "cart_delete_own" on cart_items;
create policy "cart_delete_own" on cart_items
  for delete using (auth.uid() = user_id);

-- 3. Bảng orders: thêm cột user_id (nullable — khách vãng lai vẫn đặt hàng được bình thường)
alter table orders add column if not exists user_id uuid references auth.users(id);

-- Cho phép người dùng đã đăng nhập xem lại đơn hàng CỦA HỌ
-- (không đụng tới policy insert hiện có — khách vãng lai vẫn đặt hàng bình thường)
drop policy if exists "orders_select_own" on orders;
create policy "orders_select_own" on orders
  for select using (auth.uid() = user_id);
