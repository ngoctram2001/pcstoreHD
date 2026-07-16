-- ============================================================
-- JohnnyPC — Sửa quyền Storage bucket "product-images"
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================
--
-- VẤN ĐỀ:
-- 1. Bucket đang có 2 policy INSERT cùng lúc, trong đó "Allow authenticated
--    uploads" cho phép BẤT KỲ tài khoản đã đăng nhập nào (kể cả khách hàng
--    bình thường tự đăng ký) tải file lên — không riêng gì admin.
-- 2. Policy SELECT hiện tại cho phép "liệt kê" toàn bộ danh sách file trong
--    bucket — không cần thiết vì bucket đã là Public (ai cũng xem được ảnh
--    qua URL trực tiếp mà không cần policy này).

-- ── Xóa các policy cũ ────────────────────────────────────────────────────
drop policy if exists "Admin can upload images 16wiy3a_0" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow public read" on storage.objects;

-- ── Chỉ admin mới được upload (INSERT) vào bucket product-images ─────────
create policy "admin_only_upload_product_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (auth.jwt() ->> 'email') = 'duchuynhtrang@gmail.com'
);

-- ── Không tạo policy SELECT nữa — bucket Public đã tự cho phép xem ảnh
--    qua URL trực tiếp (getPublicUrl), không cần policy nào để "đọc" cả.
--    (Nếu sau này bucket bị đổi thành Private, sẽ cần thêm lại policy SELECT.)

-- ── Kiểm tra sau khi chạy ────────────────────────────────────────────────
-- 1. Vào admin.html (đăng nhập bằng duchuynhtrang@gmail.com) → thử up 1 ảnh
--    sản phẩm mới → phải upload được bình thường.
-- 2. Trang chủ (index.html) → ảnh sản phẩm vẫn phải hiển thị bình thường
--    (không bị vỡ ảnh) — vì bucket vẫn Public, chỉ chặn quyền UPLOAD thôi.
