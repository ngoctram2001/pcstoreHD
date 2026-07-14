-- ============================================================
-- JohnnyPC — Thêm email (tùy chọn) cho khách vãng lai để nhận hóa đơn
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================

alter table public.orders add column if not exists customer_email text;

-- Không cần policy riêng — cột này nằm trong bảng orders, đã có sẵn
-- policy "Anyone insert orders" cho phép khách vãng lai insert (kèm cột mới
-- này), và policy "admin_full_access_orders" đã cho phép admin xem/sửa.
