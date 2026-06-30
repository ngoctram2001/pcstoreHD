// ============================================
// PCStore Perth — index.html product/booking logic
// ============================================

import { supabase, formatPrice, isValidPhone, getPickupTimeOptions, MESSENGER_LINK } from './supabase-client.js';

// Escape HTML để chống XSS
function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Spam protection ───────────────────────────────────────────────────────
const COOLDOWN_MS = 60 * 1000; // 60 giây giữa 2 lần submit
const lastSubmit = { review: 0, order: 0 };

function checkCooldown(type, label) {
  const now = Date.now();
  const diff = now - lastSubmit[type];
  if (diff < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - diff) / 1000);
    showToast(`⏳ Vui lòng chờ ${wait}s trước khi ${label} tiếp theo`, true);
    return false;
  }
  return true;
}
function setCooldown(type) { lastSubmit[type] = Date.now(); }

let products = [];
let currentStatusFilter = 'all';
let currentPriceFilter = 'all';
let currentProduct = null;

document.getElementById('floating-messenger-btn').href = MESSENGER_LINK;

const STATUS_LABELS = {
  available: { text: 'Available', class: 'status-available' },
  reserved: { text: 'Reserved', class: 'status-reserved' },
  sold: { text: 'Sold', class: 'status-sold' }
};

function statusPillHtml(status) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.available;
  return `<span class="status-pill ${s.class}"><span class="dot"></span>${s.text}</span>`;
}

function priceBlockHtml(p) {
  const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
  if (hasSale) {
    return `<div class="card-price-row">
      <span class="card-price-original">${formatPrice(p.price)}</span>
      <span class="card-price-sale">${formatPrice(p.sale_price)}</span>
    </div>`;
  }
  return `<div class="card-price">${formatPrice(p.price)}</div>`;
}

function renderCards(list) {
  const grid = document.getElementById('products-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No builds in this category right now</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
    return `
    <div class="card" onclick="openModal('${p.id}')">
      <div class="card-img-wrap">
        ${hasSale ? '<div class="sale-badge">Sale</div>' : ''}
        ${statusPillHtml(p.status || 'available')}
        ${p.image_url
          ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''}
        <div class="card-img-fallback" style="${p.image_url ? 'display:none' : ''}">🖥️</div>
      </div>
      <div class="card-body">
        <div class="card-category">${p.category || 'Custom PC'}</div>
        <div class="card-name">${p.name}</div>
        ${priceBlockHtml(p)}
        <div class="card-price-label">${hasSale ? 'Sale price' : 'Listed price'}</div>
      </div>
      <div class="card-footer">
        <button class="order-btn" ${p.status !== 'available' ? 'disabled' : ''} onclick="event.stopPropagation();${p.status === 'available' ? `openModal('${p.id}')` : ''}">
          ${p.status === 'available' ? 'View & order' : (p.status === 'reserved' ? 'Reserved' : 'Sold')}
        </button>
      </div>
    </div>
  `;
  }).join('');
}

function applyFilter() {
  let filtered = currentStatusFilter === 'all' ? products : products.filter(p => (p.status || 'available') === currentStatusFilter);
  if (currentPriceFilter !== 'all') {
    const [min, max] = currentPriceFilter.split('-').map(Number);
    filtered = filtered.filter(p => {
      const effectivePrice = (p.sale_price && p.sale_price > 0 && p.sale_price < p.price) ? p.sale_price : p.price;
      return effectivePrice >= min && effectivePrice <= max;
    });
  }
  renderCards(filtered);
}

document.getElementById('price-filter').addEventListener('change', e => {
  currentPriceFilter = e.target.value;
  applyFilter();
});

document.getElementById('filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentStatusFilter = btn.dataset.status;
  applyFilter();
});

async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  if (error) {
    document.getElementById('products-grid').innerHTML = '<div class="empty">❌ Couldn\'t load products</div>';
    return;
  }
  products = data || [];
  document.getElementById('hero-count').textContent = products.filter(p => (p.status || 'available') === 'available').length;
  applyFilter();

  // If URL has ?id=123, auto-open that product's modal (deep link support)
  const params = new URLSearchParams(window.location.search);
  const targetId = params.get('id');
  if (targetId) {
    const found = products.find(p => String(p.id) === targetId);
    if (found) openModal(found.id);
    else showNotFound();
  }
}

function showNotFound() {
  document.getElementById('products-grid').innerHTML = `
    <div class="not-found-box" style="grid-column:1/-1">
      <div class="nf-icon">🔍</div>
      <h2>Product not found</h2>
      <p>This build may have been sold or removed. Check out what's currently available below.</p>
    </div>`;
  setTimeout(() => applyFilter(), 10);
}

window.openModal = function(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;
  currentProduct = p;
  const status = p.status || 'available';

  document.getElementById('modal-status').innerHTML = statusPillHtml(status);
  document.getElementById('modal-cat').textContent = p.category || 'Custom PC';
  document.getElementById('modal-name').textContent = p.name;
  const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
  document.getElementById('modal-price').innerHTML = hasSale
    ? `<span style="text-decoration:line-through;color:var(--muted);font-size:.7em;margin-right:8px">${formatPrice(p.price)}</span><span style="color:#d63030">${formatPrice(p.sale_price)}</span>`
    : formatPrice(p.price);
  document.getElementById('modal-warranty').textContent = `🛡️ ${p.warranty || '3-12 month'} warranty included`;
  document.getElementById('modal-desc').textContent = p.description || 'Message us for more details.';
  document.getElementById('modal-specs').textContent = p.specs || 'Message us to ask about the full spec sheet.';

  const imgWrap = document.getElementById('modal-img-wrap');
  imgWrap.innerHTML = p.image_url
    ? `<img class="modal-img" src="${p.image_url}" alt="${p.name}"
         onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\'modal-img-fallback\'>🖥️</div>')">`
    : `<div class="modal-img-fallback">🖥️</div>`;

  const orderBtn = document.getElementById('modal-order-btn');
  const unavailable = document.getElementById('modal-unavailable');
  if (status === 'available') {
    orderBtn.classList.remove('hidden');
    unavailable.classList.add('hidden');
  } else {
    orderBtn.classList.add('hidden');
    unavailable.classList.remove('hidden');
  }

  document.getElementById('detail-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

document.getElementById('modal-share-btn').addEventListener('click', () => {
  const url = `${window.location.origin}/index.html?id=${currentProduct.id}`;
  if (navigator.share) {
    navigator.share({ title: currentProduct.name, url });
  } else {
    navigator.clipboard.writeText(url);
    showToast('🔗 Link copied to clipboard!');
  }
});

document.getElementById('modal-order-btn').addEventListener('click', () => {
  closeModal('detail-modal');
  openBookingModal();
});

function openBookingModal() {
  if (!currentProduct) return;
  const p = currentProduct;
  const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
  const effectivePrice = hasSale ? p.sale_price : p.price;
  document.getElementById('booking-form-view').classList.remove('hidden');
  document.getElementById('booking-success-view').classList.add('hidden');
  document.getElementById('booking-product-preview').innerHTML = `
    ${p.image_url
      ? `<img src="${p.image_url}" alt="${p.name}"
           onerror="this.style.display='none'"
           style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0">`
      : '<div style="width:56px;height:56px;background:var(--surface2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🖥️</div>'}
    <div>
      <div class="opp-name">${p.name}</div>
      <div class="opp-price">${hasSale ? `<span style="text-decoration:line-through;color:var(--muted);font-size:.8em;margin-right:6px">${formatPrice(p.price)}</span>` : ''}${formatPrice(effectivePrice)}</div>
    </div>
  `;
  document.getElementById('b-name').value = '';
  document.getElementById('b-phone').value = '';
  document.getElementById('phone-group').classList.remove('has-error');
  const dateInput = document.getElementById('b-date');
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  dateInput.value = '';
  document.getElementById('b-time').innerHTML = '<option value="">-- Select a date first --</option>';
  document.getElementById('booking-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

document.getElementById('b-date').addEventListener('change', e => {
  const select = document.getElementById('b-time');
  const options = getPickupTimeOptions(e.target.value);
  select.innerHTML = '<option value="">-- Select a time --</option>' + options.map(t => `<option value="${t}">${t}</option>`).join('');
});

document.getElementById('booking-submit-btn').addEventListener('click', async () => {
  const name = document.getElementById('b-name').value.trim();
  const phone = document.getElementById('b-phone').value.trim();
  const date = document.getElementById('b-date').value;
  const time = document.getElementById('b-time').value;
  const phoneGroup = document.getElementById('phone-group');

  if (!name || !phone || !date || !time) {
    showToast('Please fill in all fields', true);
    return;
  }

  if (!isValidPhone(phone)) {
    phoneGroup.classList.add('has-error');
    showToast('Please enter a valid phone number', true);
    return;
  }
  phoneGroup.classList.remove('has-error');

  const btn = document.getElementById('booking-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Checking availability...';

  // ── Spam protection ──
  if (!checkCooldown('order', 'đặt hàng')) {
    btn.disabled    = false;
    btn.textContent = 'Send order request';
    return;
  }

  // ── Race condition fix: kiểm tra lại status ngay trước khi insert ──
  const { data: freshProduct } = await supabase
    .from('products')
    .select('status')
    .eq('id', currentProduct.id)
    .single();

  if (!freshProduct || freshProduct.status !== 'available') {
    showToast('⚠️ Rất tiếc, sản phẩm này vừa được đặt bởi người khác!', true);
    btn.disabled = false;
    btn.textContent = 'Send order request';
    // Reload để cập nhật trạng thái mới nhất
    await loadProducts();
    closeModal();
    return;
  }

  btn.textContent = 'Sending...';

  const { error: orderError } = await supabase.from('orders').insert({
    customer_name: name,
    customer_phone: phone,
    product_id: currentProduct.id,
    product_name: currentProduct.name,
    pickup_date: date,
    pickup_time: time,
    status: 'pending'
  });

  if (orderError) {
    showToast('Error: ' + orderError.message, true);
    btn.disabled = false;
    btn.textContent = 'Send order request';
    return;
  }

  await supabase.from('products').update({ status: 'reserved' }).eq('id', currentProduct.id);

  // Gửi thông báo ntfy
  console.log('Sending ntfy...');
  fetch('https://ntfy.sh/pcstore-perth-duc-7k2m9x', {
    method: 'POST',
    headers: {
      'Title': 'Don hang moi!',
      'Priority': 'high',
      'Tags': 'shopping,bell'
    },
    body: `Khach: ${name}\nSDT: ${phone}\nSan pham: ${currentProduct.name}\nNgay lay: ${date} luc ${time}`
  }).then(r => console.log('ntfy status:', r.status))
    .catch(err => console.error('ntfy error:', err));

  btn.disabled = false;
  btn.textContent = 'Send order request';

  setCooldown('order');
  document.getElementById('booking-form-view').classList.add('hidden');
  document.getElementById('booking-success-view').classList.remove('hidden');

  const msg = encodeURIComponent(`Hi! My name is ${name}, phone ${phone}. I'd like to order: ${currentProduct.name} (${formatPrice(currentProduct.price)}). Pickup requested for ${date} at ${time}.`);
  document.getElementById('booking-messenger-btn').href = `${MESSENGER_LINK}?text=${msg}`;

  loadProducts();
});

window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
};

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal(overlay.id);
  });
});

// NAV
document.getElementById('nav-toggle').addEventListener('click', () => {
  document.getElementById('nav-links').classList.toggle('open');
});

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 3000);
}

// ============ REVIEWS ============
let selectedRating = 0;

function starsHtml(rating) {
  return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
}

async function loadReviews() {
  const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
  const reviews = data || [];
  const grid = document.getElementById('reviews-grid');

  if (!reviews.length) {
    grid.innerHTML = '<div class="reviews-empty">No reviews yet — be the first!</div>';
    document.getElementById('avg-rating').textContent = '—';
    document.getElementById('avg-stars').textContent = '☆☆☆☆☆';
    document.getElementById('avg-count').textContent = 'No reviews yet';
    return;
  }

  // Average rating
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  document.getElementById('avg-rating').textContent = avg.toFixed(1);
  document.getElementById('avg-stars').textContent = starsHtml(Math.round(avg));
  document.getElementById('avg-count').textContent = `${reviews.length} review${reviews.length > 1 ? 's' : ''}`;

  grid.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-top">
        <div class="review-name">${escHtml(r.name)}</div>
        <div class="review-date">${new Date(r.created_at).toLocaleDateString('en-AU')}</div>
      </div>

      <div class="review-stars">${starsHtml(r.rating)}</div>
      ${r.product_name ? `<div style="font-size:12px;color:var(--accent);margin-bottom:6px;font-weight:600">🖥️ ${escHtml(r.product_name)}</div>` : ''}
      <div class="review-comment">${escHtml(r.comment)}</div>

      ${r.admin_reply ? `
        <div class="review-reply">
          <div class="review-reply-label">💬 PCStore replied</div>
          ${escHtml(r.admin_reply)}
        </div>` : ''}
    </div>
  `).join('');
}

// Star picker
document.getElementById('star-picker').addEventListener('click', e => {
  const star = e.target.closest('[data-val]');
  if (!star) return;
  selectedRating = parseInt(star.dataset.val);
  document.querySelectorAll('#star-picker span').forEach((s, i) => {
    s.classList.toggle('active', i < selectedRating);
  });
  const hints = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  document.getElementById('star-hint').textContent = hints[selectedRating];
});

window.openReviewModal = function() {
  document.getElementById('rv-name').value = '';
  // Populate product dropdown
 document.getElementById('rv-product').value = '';
const soldProducts = products.filter(p => p.status === 'sold');
document.getElementById('rv-product').innerHTML =
  '<option value="">-- Chọn sản phẩm bạn đã mua --</option>' +
  soldProducts.map(p => `<option value="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join('');

  document.getElementById('rv-comment').value = '';
  selectedRating = 0;
  document.querySelectorAll('#star-picker span').forEach(s => s.classList.remove('active'));
  document.getElementById('star-hint').textContent = 'Tap a star to rate';
  document.getElementById('review-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

document.getElementById('rv-submit').addEventListener('click', async () => {
  const name    = document.getElementById('rv-name').value.trim();
  const comment = document.getElementById('rv-comment').value.trim();

  const product = document.getElementById('rv-product').value;

  if (!name || !comment || !selectedRating) {
    showToast('Please fill in all fields and select a rating', true);
    return;
  }
  if (!product) {
    showToast('⚠️ Vui lòng chọn sản phẩm bạn đã mua để đánh giá', true);
    return;
  }
  if (comment.length < 10) {
    showToast('⚠️ Review quá ngắn, hãy mô tả thêm nhé!', true);
    return;
  }
  if (!checkCooldown('review', 'gửi review')) return;

  const btn = document.getElementById('rv-submit');
  btn.disabled    = true;
  btn.textContent = 'Submitting...';

  const { error } = await supabase.from('reviews').insert({
    name, rating: selectedRating, comment,
    product_name: product
  });

  btn.disabled    = false;
  btn.textContent = 'Submit review';

  if (error) { showToast('Error: ' + error.message, true); return; }

  setCooldown('review');
  closeModal('review-modal');
  showToast('✅ Review submitted, thank you!');
  loadReviews();
});

loadProducts();
loadReviews();
