-- ============================================================
-- JohnnyPC — Live chat trên web (khách nhắn tin trực tiếp cho shop)
-- Chạy 1 lần trong Supabase SQL Editor
-- Yêu cầu nghiệp vụ: chỉ khách ĐÃ ĐĂNG NHẬP (Google) mới chat được.
-- Mỗi tài khoản khách = 1 cuộc hội thoại duy nhất với shop (giống Shopee).
-- ============================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,           -- snapshot tên khách tại thời điểm gửi (để admin hiển thị, khỏi phải join bảng profiles)
  user_email text,          -- snapshot email khách
  sender text not null check (sender in ('user','admin')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_id_idx on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

-- Khách xem được tin nhắn CỦA CHÍNH MÌNH; admin xem được TẤT CẢ hội thoại
drop policy if exists "chat_select_own_or_admin" on public.chat_messages;
create policy "chat_select_own_or_admin" on public.chat_messages
  for select using (
    auth.uid() = user_id
    or (auth.jwt() ->> 'email') = 'duchuynhtrang@gmail.com'
  );

-- Khách chỉ được gửi tin nhắn với sender='user' và đúng user_id của mình
drop policy if exists "chat_insert_user" on public.chat_messages;
create policy "chat_insert_user" on public.chat_messages
  for insert with check (
    auth.uid() = user_id and sender = 'user'
  );

-- Admin được gửi trả lời (sender='admin') cho bất kỳ khách nào
drop policy if exists "chat_insert_admin" on public.chat_messages;
create policy "chat_insert_admin" on public.chat_messages
  for insert with check (
    (auth.jwt() ->> 'email') = 'duchuynhtrang@gmail.com' and sender = 'admin'
  );

-- Đánh dấu đã đọc: khách đánh dấu tin của admin, admin đánh dấu tin của khách
drop policy if exists "chat_update_read" on public.chat_messages;
create policy "chat_update_read" on public.chat_messages
  for update using (
    auth.uid() = user_id or (auth.jwt() ->> 'email') = 'duchuynhtrang@gmail.com'
  );

-- Bật Realtime cho bảng này — bắt buộc phải chạy dòng dưới thì tin nhắn
-- mới tự hiện ra ngay (không cần load lại trang) ở cả 2 phía khách & admin.
alter publication supabase_realtime add table public.chat_messages;

-- ── Kiểm tra sau khi chạy ────────────────────────────────────────────────
-- 1. Đăng nhập bằng 1 tài khoản Google bất kỳ (không phải admin) → gửi thử
--    1 tin nhắn qua khung chat trên web → phải insert được, không lỗi.
-- 2. Đăng nhập bằng tài khoản admin (duchuynhtrang@gmail.com) → vào trang
--    admin, tab Chat → phải thấy hội thoại vừa gửi ở bước 1 và trả lời được.
