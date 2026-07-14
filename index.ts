// ============================================================
// Supabase Edge Function: send-invoice
// ------------------------------------------------------------
// Gửi email hóa đơn cho khách khi admin bấm nút "📧 Send invoice".
// Chạy trên server (Deno) — không lộ Brevo API key hay email khách
// ra ngoài trình duyệt.
//
// CÁCH DEPLOY (qua Supabase Dashboard, không cần cài CLI):
//   1. Vào Supabase Dashboard → chọn project → sidebar "Edge Functions"
//   2. Bấm "Deploy a new function" → đặt tên: send-invoice
//   3. Xóa hết code mẫu, dán TOÀN BỘ nội dung file này vào
//   4. Deploy
//   5. Vào "Manage secrets" (hoặc Edge Functions → Secrets) thêm 4 secrets:
//        BREVO_API_KEY   = <API key lấy từ Brevo>
//        ADMIN_EMAIL     = duchuynhtrang@gmail.com
//        SENDER_EMAIL    = duchuynhtrang@gmail.com
//        SENDER_NAME     = Johnny PC
//      (SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY đã có sẵn tự động,
//       không cần tự thêm)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmtMoney(v: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v);
}

function buildInvoiceHtml(opts: {
  invoiceNum: string; today: string; pickupDate: string;
  customerName: string; customerPhone: string;
  productName: string; specs: string; warranty: string;
  price: number; salePrice: number | null;
}) {
  const { invoiceNum, today, pickupDate, customerName, customerPhone, productName, specs, warranty, price, salePrice } = opts;
  const hasSale = salePrice && salePrice > 0 && salePrice < price;
  const total = hasSale ? salePrice! : price;
  const discount = hasSale ? price - salePrice! : 0;

  const specsHtml = specs
    ? specs.split('\n').filter(s => s.trim()).map(s => `<div>${s.trim()}</div>`).join('')
    : '<div style="color:#888">—</div>';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,Helvetica,sans-serif;color:#2b211a;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ff7043;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:1px;">JohnnyPC</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px 24px;">
      <h2 style="margin:0 0 4px;font-size:20px;">Invoice ${invoiceNum}</h2>
      <p style="margin:0 0 20px;color:#8a7a68;font-size:13px;">Date: ${today} · Pickup: ${pickupDate}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:4px 0;color:#8a7a68;font-size:13px;">Bill to</td><td style="padding:4px 0;text-align:right;font-size:13px;">${customerName} · ${customerPhone}</td></tr>
      </table>

      <div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${productName}</div>
        <div style="font-size:12px;color:#8a7a68;line-height:1.7;margin-bottom:10px;">${specsHtml}</div>
        <div style="font-size:12px;color:#8a7a68;">Warranty: ${warranty || '—'}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        ${hasSale ? `
        <tr><td style="padding:4px 0;font-size:13px;">Price</td><td style="padding:4px 0;text-align:right;font-size:13px;">${fmtMoney(price)}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;">Discount</td><td style="padding:4px 0;text-align:right;font-size:13px;color:#c0392b;">-${fmtMoney(discount)}</td></tr>
        ` : ''}
        <tr><td style="padding:10px 0 0;font-weight:700;font-size:16px;border-top:2px solid #2b211a;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;font-size:16px;border-top:2px solid #2b211a;">${fmtMoney(total)}</td></tr>
      </table>

      <div style="background:#f5f0e8;border-radius:8px;padding:14px 16px;font-size:12px;color:#6b5d4f;line-height:1.7;">
        Thanks for picking up your build with us! Please keep this invoice for your warranty records.
        If anything comes up, reach out any time via Messenger.
      </div>
    </div>
    <p style="text-align:center;color:#a8957f;font-size:12px;margin-top:16px;">© 2026 Johnny PC · Perth, WA</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Xác minh người gọi là chính admin (không phải khách hàng nào khác)
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    const adminEmailSecret = (Deno.env.get('ADMIN_EMAIL') || '').trim().toLowerCase();
    const callerEmail = (user?.email || '').trim().toLowerCase();

    if (userErr || !user || callerEmail !== adminEmailSecret) {
      return new Response(JSON.stringify({
        error: 'Not authorized',
        // debug tạm thời — xóa 2 dòng dưới sau khi hết lỗi
        debug_callerEmail: callerEmail || null,
        debug_adminEmailSecret: adminEmailSecret || '(chưa set secret ADMIN_EMAIL)',
        debug_userErr: userErr?.message || null,
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Lấy đơn hàng
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders').select('*').eq('id', orderId).single();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!order.user_id && !order.customer_email) {
      return new Response(JSON.stringify({ error: 'GUEST_ORDER_NO_EMAIL' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Lấy email khách: ưu tiên tài khoản đã đăng nhập, nếu không thì dùng
    //    email khách vãng lai tự nhập lúc đặt hàng.
    let customerEmail = order.customer_email || null;
    if (order.user_id) {
      const { data: customerAuth, error: custErr } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
      if (!custErr && customerAuth?.user?.email) {
        customerEmail = customerAuth.user.email;
      }
    }
    if (!customerEmail) {
      return new Response(JSON.stringify({ error: 'Customer email not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Lấy thông tin sản phẩm
    const { data: product } = await supabaseAdmin
      .from('products').select('*').eq('id', order.product_id).single();

    const invoiceNum = 'INV-' + String(order.id).slice(0, 8).toUpperCase();
    const today = new Date().toLocaleDateString('en-AU');
    const pickupDate = order.pickup_date
      ? new Date(order.pickup_date).toLocaleDateString('en-AU') + (order.pickup_time ? ' · ' + order.pickup_time : '')
      : '—';

    const html = buildInvoiceHtml({
      invoiceNum, today, pickupDate,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      productName: order.product_name || product?.name || '—',
      specs: product?.specs || '',
      warranty: product?.warranty || '',
      price: product?.price || 0,
      salePrice: product?.sale_price || null,
    });

    // 5. Gửi qua Brevo API
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': Deno.env.get('BREVO_API_KEY')!,
      },
      body: JSON.stringify({
        sender: { name: Deno.env.get('SENDER_NAME') || 'Johnny PC', email: Deno.env.get('SENDER_EMAIL') },
        to: [{ email: customerEmail, name: order.customer_name }],
        subject: `Your invoice ${invoiceNum} — Johnny PC`,
        htmlContent: html,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      return new Response(JSON.stringify({ error: 'Brevo send failed', detail: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, sentTo: customerEmail }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
