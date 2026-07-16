// ============================================================
// JohnnyPC — Mẫu hóa đơn dùng chung (admin.js + account.js)
// ============================================================
// buildInvoiceHtml(order, product) trả về chuỗi HTML đầy đủ của 1 hóa đơn,
// dùng để mở tab mới xem/in/tải ảnh — y hệt nội dung admin xem trong
// admin.html, khách hàng cũng xem được đúng như vậy trong account.html.

export function buildInvoiceHtml(o, prod) {
  prod = prod || {};
  const warranty = prod.warranty || '';
  const specs    = prod.specs    || '';

  const invoiceNum = 'INV-' + String(o.id).slice(0, 8).toUpperCase();
  const today      = new Date().toLocaleDateString('en-AU');
  const pickupDate = o.pickup_date
    ? new Date(o.pickup_date).toLocaleDateString('en-AU') + (o.pickup_time ? ' · ' + o.pickup_time : '')
    : '___/___/______';

  const wList = ['3 month', '6 month', '12 month'];
  const wHtml = wList.map(w => {
    const checked = warranty.toLowerCase().includes(w.replace(' month', '')) ? '☑' : '☐';
    return `${checked} ${w}`;
  }).join('&nbsp;&nbsp;&nbsp;');

  const specsHtml = specs
    ? specs.split('\n').filter(s => s.trim()).map(s => `<div>${s.trim()}</div>`).join('')
    : '<div style="color:#888">—</div>';

  const price = prod.price ? prod.price : 0;
  const hasSale = prod.sale_price && prod.sale_price > 0 && prod.sale_price < price;
  const discount = hasSale ? (price - prod.sale_price) : 0;
  const total = hasSale ? prod.sale_price : price;
  const fmtMoney = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v);
  const priceFormatted    = price ? fmtMoney(price) : '';
  const discountFormatted = hasSale ? fmtMoney(discount) : '';
  const totalFormatted    = price ? fmtMoney(total) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${invoiceNum}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: 'Times New Roman', Times, serif; font-size:11px; color:#000; background:#fff; padding:30px; max-width:720px; margin:0 auto; }
  h1 { text-align:center; font-size:17px; letter-spacing:2px; text-decoration:underline; margin-bottom:18px; }
  .info-block { margin-bottom:4px; }
  .section { margin:12px 0 4px; font-weight:bold; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; }
  th { background:#555; color:#fff; padding:5px 8px; text-align:left; font-size:11px; }
  td { border:1px solid #999; padding:5px 8px; font-size:11px; vertical-align:top; }
  td.no-border { border:none; padding:3px 8px; }
  th:nth-child(1), td:nth-child(1) { width:70px; }
  th:nth-child(3), td:nth-child(3) { width:35px; text-align:center; }
  th:nth-child(4), td:nth-child(4) { width:95px; text-align:right; }
  th:nth-child(5), td:nth-child(5) { width:95px; text-align:right; }
  th:nth-child(6), td:nth-child(6) { width:60px; text-align:right; }
  th:nth-child(7), td:nth-child(7) { width:95px; text-align:right; }
  .total-row td { border-top:2px solid #000; border-left:none; border-right:none; border-bottom:none; font-weight:bold; font-size:11px; }
  .specs-block { border:1px solid #ccc; padding:8px 10px; margin:6px 0; line-height:1.7; font-size:11px; }
  .warranty-row { margin:8px 0; font-size:11px; }
  .terms { margin-top:14px; font-size:11px; line-height:1.7; }
  .terms ul { padding-left:14px; }
  .payment-block { margin:10px 0; font-size:11px; line-height:1.9; }
  .blank { display:inline-block; border-bottom:1px solid #000; min-width:140px; }
  .blank-sm { display:inline-block; border-bottom:1px solid #000; min-width:70px; }
  @media print { body { padding:16px; } .no-print { display:none; } }
</style>
</head>
<body>
<div class="no-print" style="position:fixed;top:12px;right:12px;display:flex;gap:8px">
  <button onclick="downloadImage()" style="padding:8px 16px;background:#2b6cb0;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:sans-serif">📥 Download image</button>
  <button onclick="window.print()" style="padding:8px 16px;background:#e05a2b;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:sans-serif">🖨️ Print</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script>
function downloadImage(){
  var btns=document.querySelector('.no-print');
  btns.style.display='none';
  html2canvas(document.body,{scale:2,useCORS:true,backgroundColor:'#ffffff'}).then(function(canvas){
    btns.style.display='flex';
    var a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download='invoice-${invoiceNum}.png';
    a.click();
  });
}
<\/script>

<h1>INVOICE</h1>

<div class="info-block"><strong>Business Name:</strong> Huynh Duc Trang</div>
<div class="info-block"><strong>Address:</strong> 46 Yosemite Loop, Ballajura WA 6066</div>
<div class="info-block"><strong>ABN:</strong> 14 758 276 393</div>

<br>
<div class="info-block"><strong>Invoice Number:</strong> ${invoiceNum}</div>
<div class="info-block"><strong>Invoice Date:</strong> ${today}</div>
<div class="info-block"><strong>Pickup:</strong> ${pickupDate}</div>

<br>
<div class="section">Bill To:</div>
<div class="info-block"><strong>Customer Name:</strong> ${o.customer_name || ''}</div>
<div class="info-block"><strong>Phone:</strong> ${o.customer_phone || ''}</div>

<table>
  <thead>
    <tr>
      <th>SKU</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Unit Price (AUD)</th>
      <th>Discount (AUD)</th>
      <th>Tax</th>
      <th>Total (AUD)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${prod.sku || '—'}</td>
      <td>Used Custom Built PC${prod.name ? ' — ' + prod.name : ''}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:right">${priceFormatted}</td>
      <td style="text-align:right">${discountFormatted}</td>
      <td style="text-align:right"></td>
      <td style="text-align:right">${totalFormatted}</td>
    </tr>
    <tr>
      <td colspan="6" class="no-border" style="border:none;text-align:right;font-weight:bold">Total Amount:</td>
      <td class="no-border" style="border-top:2px solid #000;text-align:right;font-weight:bold;font-size:11px">${totalFormatted}</td>
    </tr>
  </tbody>
</table>

<div class="section">Specifications:</div>
<div class="specs-block">${specsHtml}</div>

<div class="section">Payment Method (tick one):</div>
<div class="payment-block">
  ☐ Bank Transfer &nbsp;&nbsp; ☐ PayID &nbsp;&nbsp; ☐ Cash<br><br>
  <strong>Bank Name:</strong> <span class="blank"></span><br>
  <strong>Account Name:</strong> Huynh Duc Trang<br>
  <strong>BSB:</strong> <span class="blank-sm"></span><br>
  <strong>Account Number:</strong> <span class="blank"></span>
</div>

<div class="section">Warranty:</div>
<div class="warranty-row">${wHtml} &nbsp;&nbsp; (hardware only)</div>

<div class="terms">
  <strong>Terms &amp; Conditions</strong>
  <ul>
    <li>Used/refurbished computer, may show minor wear.</li>
    <li>Fully tested and working at time of sale.</li>
    <li>Warranty covers hardware faults only.</li>
    <li>No coverage for software issues, misuse, or physical damage.</li>
    <li>No refunds for change of mind.</li>
  </ul>
</div>

</body>
</html>`;
}
