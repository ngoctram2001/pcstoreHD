-- ============================================================
-- JohnnyPC — Mỗi sản phẩm chỉ được review 1 lần (server-side)
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================
--
-- Vấn đề: dropdown ở shop.js/specials.js đã lọc bỏ sản phẩm đã được
-- review, nhưng đó chỉ là kiểm tra phía trình duyệt (JS) — vẫn có thể
-- bị bypass nếu ai đó gọi thẳng vào Supabase API bằng anon key (public).
--
-- Giải pháp: thêm ràng buộc UNIQUE ngay trong database cho cột
-- product_name — Postgres sẽ tự động từ chối insert nếu product_name
-- đã tồn tại trong 1 review khác, dù gọi từ đâu tới cũng không bypass được.
-- (Lưu ý: UNIQUE trong Postgres cho phép nhiều dòng NULL cùng lúc, nên các
-- review cũ không gắn sản phẩm — product_name NULL — vẫn không bị ảnh hưởng.)

alter table public.reviews
  add constraint reviews_product_name_unique unique (product_name);

-- ── Kiểm tra sau khi chạy: ──────────────────────────────────────────────
-- Nếu lệnh trên báo lỗi "could not create unique index... duplicate key",
-- nghĩa là hiện đang có ít nhất 2 review trùng product_name trong dữ liệu
-- cũ — cần xử lý (xóa/gộp review trùng) trước khi chạy lại lệnh ALTER TABLE
-- này. Chạy câu dưới đây để tìm các product_name bị trùng:
--
-- select product_name, count(*)
-- from public.reviews
-- where product_name is not null
-- group by product_name
-- having count(*) > 1;
