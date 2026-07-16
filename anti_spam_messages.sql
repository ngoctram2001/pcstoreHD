-- ============================================================
-- JohnnyPC — Chặn spam form Liên hệ (server-side, không thể bị bypass)
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================
--
-- Giống hệt cách đã chặn spam đơn hàng (anti_spam_orders.sql) — hiện form
-- Liên hệ chỉ có cooldown phía trình duyệt (JS), ai gọi thẳng API vẫn spam
-- tin nhắn rác không giới hạn. Thêm trigger chặn ngay trong database: cùng
-- 1 "contact" (email/SĐT) không gửi được 2 tin nhắn trong vòng 2 phút.

create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.messages
  where contact = new.contact
    and created_at > now() - interval '2 minutes';

  if recent_count > 0 then
    raise exception 'RATE_LIMIT: Bạn vừa gửi tin nhắn gần đây, vui lòng đợi vài phút rồi thử lại.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_rate_limit on public.messages;

create trigger trg_message_rate_limit
before insert on public.messages
for each row
execute function public.check_message_rate_limit();

-- ── Kiểm tra sau khi chạy ────────────────────────────────────────────────
-- Gửi thử 2 tin nhắn liên tiếp bằng cùng 1 email/SĐT trong vòng 2 phút →
-- tin nhắn thứ 2 phải bị lỗi "RATE_LIMIT: ...".
