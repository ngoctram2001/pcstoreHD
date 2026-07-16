// ============================================================
// JohnnyPC — account.html logic
// ============================================================

import { supabase } from './supabase-client.js';
import { buildInvoiceHtml } from './invoice-template.js';

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function formatPrice(n) {
  if (n === null || n === undefined) return '';
  return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', reserved: 'Pending', done: 'Completed', cancelled: 'Cancelled' };

function formatOrderRow(o, productsMap) {
  const status = o.status || 'pending';
  const label = STATUS_LABEL[status] || status;
  const dateStr = o.pickup_date ? `Pickup ${o.pickup_date}${o.pickup_time ? ' at ' + o.pickup_time : ''}` : '';
  const invoiceNum = 'INV-' + String(o.id).slice(0, 8).toUpperCase();
  const prod = productsMap[o.product_id];
  const price = prod ? (prod.sale_price && prod.sale_price > 0 && prod.sale_price < prod.price ? prod.sale_price : prod.price) : null;
  const priceStr = price ? formatPrice(price) : '';

  return `<div class="order-row">
    <div class="order-row-info">
      <div class="order-row-name">${escHtml(o.product_name || 'Custom PC build')}</div>
      <div class="order-row-meta">${escHtml(dateStr)}${priceStr ? ' · ' + escHtml(priceStr) : ''}</div>
      <div class="order-row-meta" style="opacity:.7">Invoice #: ${invoiceNum}</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
      <div class="order-row-status ${escHtml(status)}">${escHtml(label)}</div>
      ${status === 'done'
        ? `<button class="account-invoice-btn" data-id="${o.id}" type="button" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;font-family:inherit;font-weight:600;cursor:pointer;white-space:nowrap">🧾 View invoice</button>`
        : ''}
    </div>
  </div>`;
}

function ordersHtml(orders, productsMap) {
  if (!orders.length) {
    return '<div class="orders-empty">No orders yet — once you order a build, it\'ll show up here.</div>';
  }
  return orders.map(o => formatOrderRow(o, productsMap)).join('');
}

function renderSignedOut() {
  document.getElementById('account-page').innerHTML = `
    <div class="account-signedout">
      <h2>Sign in to view your account</h2>
      <p>Sign in to see your order history and keep your cart saved across devices.</p>
      <button class="account-google-btn" id="account-page-signin-btn" type="button">
        Sign in
      </button>
    </div>`;
  document.getElementById('account-page-signin-btn').onclick = () => {
    window.location.href = 'login.html?redirect=' + encodeURIComponent('account.html');
  };
}

async function loadOrders(userId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function loadProductsFor(orders) {
  const ids = [...new Set(orders.map(o => o.product_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase.from('products').select('*').in('id', ids);
  if (error) { console.error(error); return {}; }
  const map = {};
  (data || []).forEach(p => { map[p.id] = p; });
  return map;
}

async function renderSignedIn(user, profile) {
  const orders = await loadOrders(user.id);
  const productsMap = await loadProductsFor(orders);
  const name = profile?.full_name || user.user_metadata?.full_name || '';
  const avatarUrl = user.user_metadata?.avatar_url;

  document.getElementById('account-page').innerHTML = `
    <div class="account-card">
      <div class="account-profile-row">
        ${avatarUrl
          ? `<img class="account-avatar" src="${avatarUrl}" alt="${escHtml(name)}">`
          : `<div class="account-avatar-fallback">${escHtml((name || user.email || '?').charAt(0).toUpperCase())}</div>`}
        <div>
          <div style="font-weight:600;font-size:16px">${escHtml(name || 'Your account')}</div>
          <div class="account-email">${escHtml(user.email || '')}</div>
        </div>
      </div>
      <h3>Contact details</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">Saved here so you don't have to re-type them every time you order a build.</p>
      <div class="account-form-row">
        <div class="form-group"><label>Full name</label><input type="text" id="acc-name" value="${escHtml(name)}" placeholder="Your name"></div>
        <div class="form-group"><label>Phone number</label><input type="text" id="acc-phone" value="${escHtml(profile?.phone || '')}" placeholder="04XX XXX XXX"></div>
      </div>
      <button class="account-save-btn" id="acc-save-btn" type="button">Save changes</button>
      <span class="account-save-note" id="acc-save-note">✅ Saved!</span>
    </div>

    <div class="account-card">
      <h3>Order history</h3>
      <div id="orders-list">${ordersHtml(orders, productsMap)}</div>
    </div>

    <div style="text-align:center">
      <button class="account-signout-btn" id="acc-signout-btn" type="button">🚪 Sign out</button>
    </div>

    <div class="account-card" style="border-color:rgba(214,48,48,.3);margin-top:24px">
      <h3 style="color:var(--red)">Danger zone</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Permanently delete your account and all saved data (profile, cart, order links). This cannot be undone.
      </p>
      <button type="button" id="acc-delete-btn" style="padding:10px 18px;border-radius:10px;border:1px solid var(--red);background:none;color:var(--red);font-size:13px;font-family:inherit;font-weight:600;cursor:pointer">
        🗑️ Delete my account
      </button>
    </div>
  `;

  document.getElementById('acc-save-btn').onclick = async () => {
    const btn = document.getElementById('acc-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const full_name = document.getElementById('acc-name').value.trim();
    const phone = document.getElementById('acc-phone').value.trim();
    const { error } = await supabase.from('profiles').update({ full_name, phone, updated_at: new Date().toISOString() }).eq('id', user.id);
    btn.disabled = false;
    btn.textContent = 'Save changes';
    if (!error) {
      const note = document.getElementById('acc-save-note');
      note.style.display = 'inline';
      setTimeout(() => { note.style.display = 'none'; }, 2500);
    }
  };

  document.getElementById('acc-signout-btn').onclick = () => window.pcAuth.signOut();
  document.getElementById('acc-delete-btn').onclick = () => showDeleteAccountConfirm(user);

  document.querySelectorAll('.account-invoice-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const order = orders.find(o => String(o.id) === String(id));
      if (!order) return;
      const prod = productsMap[order.product_id] || {};
      const html = buildInvoiceHtml(order, prod);
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
    };
  });
}

// ── Delete account confirm modal ─────────────────────────────────────────
function ensureDeleteAccountModal(user) {
  if (document.getElementById('delete-account-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'delete-account-overlay';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal">
      <button class="confirm-modal-close" id="delete-account-close" type="button" aria-label="Close">✕</button>
      <div class="confirm-modal-title">Delete your account?</div>
      <div class="confirm-modal-text">
        This will permanently delete your profile, saved cart, and account access. Your order history stays in our records for our business purposes, but will no longer be linked to an account.<br><br>
        This action <strong>cannot be undone</strong>.
      </div>
      <div id="delete-account-error" style="display:none;margin-bottom:14px;font-size:12px;color:var(--red)"></div>
      <div class="confirm-modal-actions">
        <button class="confirm-btn-ghost" id="delete-account-yes" type="button" style="color:var(--red)">Delete my account</button>
        <button class="confirm-btn-primary" id="delete-account-no" type="button">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.classList.remove('open');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('delete-account-close').onclick = close;
  document.getElementById('delete-account-no').onclick = close;
  document.getElementById('delete-account-yes').onclick = async () => {
    const btn = document.getElementById('delete-account-yes');
    const errEl = document.getElementById('delete-account-error');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Delete my account';
      errEl.textContent = 'Something went wrong: ' + error.message;
      errEl.style.display = 'block';
      return;
    }
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  };
}

function showDeleteAccountConfirm(user) {
  ensureDeleteAccountModal(user);
  document.getElementById('delete-account-overlay').classList.add('open');
}

document.addEventListener('pcauth:change', (e) => {
  const { user, profile } = e.detail;
  if (user) renderSignedIn(user, profile);
  else renderSignedOut();
});

// Nếu auth.js đã xử lý xong trước khi trang này load xong, dùng ngay trạng thái đó
window.pcAuth?.ready?.then(({ user, profile }) => {
  if (user) renderSignedIn(user, profile);
  else renderSignedOut();
});
