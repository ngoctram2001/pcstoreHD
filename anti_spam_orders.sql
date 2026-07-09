-- ============================================================
-- JohnnyPC — Chặn spam đơn hàng (server-side, không thể bị bypass)
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================
--
-- Vấn đề: hiện tại chỉ có "cooldown" phía trình duyệt (JS) — chỉ ngăn
-- được click nhầm 2 lần, KHÔNG ngăn được ai đó gọi thẳng vào Supabase API
-- (vì anon key là public, ai xem source cũng lấy được) để tạo hàng loạt
-- đơn hàng giả trong vài giây.
--
-- Giải pháp: thêm 1 trigger chạy ngay trong database, tự động chặn nếu
-- cùng 1 số điện thoại đặt hàng quá nhanh (dưới 2 phút/lần) — chặn được
-- dù người gửi có tắt JS hay gọi thẳng API cỡ nào.

create or replace function public.check_order_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.orders
  where customer_phone = new.customer_phone
    and created_at > now() - interval '2 minutes';

  if recent_count > 0 then
    raise exception 'RATE_LIMIT: Bạn vừa đặt đơn gần đây, vui lòng đợi vài phút rồi thử lại.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_rate_limit on public.orders;

create trigger trg_order_rate_limit
before insert on public.orders
for each row
execute function public.check_order_rate_limit();

-- ── Kiểm tra sau khi chạy: ──────────────────────────────────────────────
-- Đặt thử 2 đơn liên tiếp với cùng SĐT trong vòng 2 phút → đơn thứ 2 phải
-- bị lỗi "RATE_LIMIT: ...". Đổi SĐT khác hoặc đợi 2 phút thì đặt lại được
-- bình thường.
