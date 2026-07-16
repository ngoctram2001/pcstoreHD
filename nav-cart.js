// ============================================================
// JohnnyPC — shared nav + cart logic
// Dùng chung cho MỌI trang (index, specials, info, contact, product...)
// Khách vãng lai: giỏ hàng lưu ở localStorage.
// Khách đã đăng nhập Google: giỏ hàng đồng bộ lên Supabase (bảng cart_items),
// và giỏ hàng cũ trên máy (nếu có) sẽ được gộp vào tài khoản khi đăng nhập lần đầu.
// ============================================================

import { supabase } from './supabase-client.js';

function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(n) {
  if (n === null || n === undefined) return '';
  return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

// ── Cart storage: localStorage (guest) + Supabase (logged-in) ─────────────
let cartCache = [];
let currentUserId = null;

function loadGuestCart() {
  try { return JSON.parse(localStorage.getItem('pcstore_cart') || '[]'); } catch { return []; }
}
function saveGuestCart(list) {
  try { localStorage.setItem('pcstore_cart', JSON.stringify(list)); } catch {}
}

async function loadAccountCart(userId) {
  const { data, error } = await supabase
    .from('cart_items')
    .select('product_id, product_snapshot')
    .eq('user_id', userId);
  if (error) { console.error('loadAccountCart error:', error); return null; } // null = lỗi thật, khác với giỏ hàng rỗng []
  return dedupeCart((data || []).map(row => ({ ...row.product_snapshot, id: row.product_id })));
}

function dedupeCart(list) {
  const seen = new Set();
  return list.filter(p => {
    const key = String(p.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Ghi từng phần thay đổi (chỉ thêm/xóa đúng những gì thay đổi) thay vì xóa sạch rồi ghi lại toàn bộ —
// tránh trường hợp 1 lần đồng bộ lỗi giữa chừng làm mất sạch giỏ hàng đã lưu trước đó.
async function syncCartDiff(userId, previousList, newList) {
  const prevIds = new Set(previousList.map(p => String(p.id)));
  const newIds = new Set(newList.map(p => String(p.id)));
  const toAdd = newList.filter(p => !prevIds.has(String(p.id)));
  const toRemoveIds = [...prevIds].filter(id => !newIds.has(id));

  if (toRemoveIds.length) {
    const { error } = await supabase.from('cart_items').delete().eq('user_id', userId).in('product_id', toRemoveIds);
    if (error) console.error('Cart remove-sync error:', error);
  }
  if (toAdd.length) {
    const rows = toAdd.map(p => ({ user_id: userId, product_id: String(p.id), product_snapshot: p }));
    const { error } = await supabase.from('cart_items').upsert(rows, { onConflict: 'user_id,product_id' });
    if (error) console.error('Cart add-sync error:', error);
  }
}

let mergeInFlight = null;
async function mergeGuestCartIntoAccount(userId) {
  if (mergeInFlight) return mergeInFlight; // tránh chạy 2 lần cùng lúc nếu sự kiện đăng nhập bắn nhiều lần
  mergeInFlight = (async () => {
    const guestCart = loadGuestCart();
    if (!guestCart.length) return;
    const accountCart = await loadAccountCart(userId);
    if (accountCart === null) {
      console.error('Không gộp được giỏ hàng — lỗi kết nối, giữ nguyên giỏ hàng local để thử lại sau.');
      return; // KHÔNG xóa guest cart khi gộp thất bại — tránh mất dữ liệu
    }
    const merged = dedupeCart([...accountCart, ...guestCart]);
    const onlyNew = merged.filter(p => !accountCart.some(a => String(a.id) === String(p.id)));
    if (onlyNew.length) {
      const rows = onlyNew.map(p => ({ user_id: userId, product_id: String(p.id), product_snapshot: p }));
      const { error } = await supabase.from('cart_items').upsert(rows, { onConflict: 'user_id,product_id' });
      if (error) { console.error('Merge cart error:', error); return; } // giữ nguyên guest cart nếu lỗi
    }
    saveGuestCart([]); // chỉ xóa giỏ hàng local SAU KHI chắc chắn đã gộp thành công
  })();
  try { await mergeInFlight; } finally { mergeInFlight = null; }
}

async function refreshCartForUser(userId) {
  currentUserId = userId;
  if (userId) {
    const accountCart = await loadAccountCart(userId);
    cartCache = accountCart !== null ? accountCart : loadGuestCart(); // lỗi tải giỏ hàng tài khoản → tạm hiện giỏ hàng local, không xóa trắng
  } else {
    cartCache = loadGuestCart();
  }
  updateCartUI();
}

document.addEventListener('pcauth:change', async (e) => {
  const { user, justLoggedIn } = e.detail;
  if (user) {
    if (justLoggedIn) {
      try { await mergeGuestCartIntoAccount(user.id); }
      catch (err) { console.error('Merge cart failed:', err); } // lỗi gộp không được chặn bước refresh phía dưới
    }
    await refreshCartForUser(user.id);
  } else {
    await refreshCartForUser(null);
  }
});

// Khởi tạo trước: dùng giỏ hàng guest cho tới khi auth.js báo trạng thái đăng nhập (nếu có)
cartCache = loadGuestCart();

window.getCart = function() { return cartCache; };

window.saveCart = function(list) {
  const deduped = dedupeCart(list);
  const previous = cartCache;
  cartCache = deduped;
  saveGuestCart(cartCache); // luôn giữ bản backup local
  if (currentUserId) {
    syncCartDiff(currentUserId, previous, deduped).catch(err => console.error('Cart sync error:', err));
  }
};

function updateCartUI() {
  const list = window.getCart();
  const countEl = document.getElementById('nav-cart-count');
  if (countEl) {
    countEl.textContent = list.length;
    countEl.style.display = list.length > 0 ? 'flex' : 'none';
  }
  document.querySelectorAll('.cart-btn').forEach(btn => {
    const id = btn.getAttribute('data-id');
    const inList = list.some(p => String(p.id) === String(id));
    btn.textContent = inList ? '✅' : '🛒';
    btn.classList.toggle('active', inList);
  });
  renderCartList();
}

function renderCartList() {
  const wishListEl = document.getElementById('cart-list');
  if (!wishListEl) return;
  const list = window.getCart();
  if (!list.length) {
    wishListEl.innerHTML = '<div class="cart-empty">Your cart is empty<br><span style="font-size:28px;margin-top:12px;display:block">🛒</span></div>';
    return;
  }
  wishListEl.innerHTML = list.map(p => {
    const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
    const price = formatPrice(hasSale ? p.sale_price : p.price);
    const img = (p.images && p.images[0]) || p.image_url || '';
    return `<div class="cart-item">
      ${img
        ? `<img src="${img}" alt="${escHtml(p.name)}" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="cart-item-img-placeholder">🖥️</div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(p.name)}</div>
        <div class="cart-item-price">${price}${hasSale ? ' <span style="text-decoration:line-through;color:var(--muted);font-size:11px;font-weight:400">' + formatPrice(p.price) + '</span>' : ''}</div>
        <div class="cart-item-actions">
          <button class="cart-view-btn" onclick="window.location.href='product.html?id=${p.id}'">View</button>
          <button class="cart-remove-btn" onclick="removeCart('${p.id}')">✕ Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.removeCart = function(id) {
  const list = window.getCart().filter(p => String(p.id) !== String(id));
  window.saveCart(list);
  updateCartUI();
};

window.toggleCartDrawer = function() {
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  drawer.classList.toggle('open');
  if (overlay) overlay.style.display = isOpen ? 'none' : 'block';
  document.body.style.overflow = isOpen ? '' : 'hidden';
  if (!isOpen) renderCartList();
};

window.updateCartUI = updateCartUI;

// NAV toggle (mobile hamburger)
const navToggleBtn = document.getElementById('nav-toggle');
if (navToggleBtn) {
  navToggleBtn.addEventListener('click', () => {
    document.getElementById('nav-links').classList.toggle('open');
  });
}

// Đóng drawer khi bấm ra ngoài overlay
const cartOverlayEl = document.getElementById('cart-overlay');
if (cartOverlayEl) {
  cartOverlayEl.addEventListener('click', () => window.toggleCartDrawer());
}

// Cập nhật số giỏ hàng ngay khi trang load
updateCartUI();

// "Chính sách" nav dropdown: đóng khi bấm ra ngoài, hoặc khi bấm 1 mục bên trong
document.querySelectorAll('.nav-policy-dropdown').forEach((dd) => {
  dd.addEventListener('toggle', () => {
    if (dd.open) {
      document.querySelectorAll('.nav-policy-dropdown').forEach((other) => {
        if (other !== dd) other.open = false;
      });
    }
  });
});
document.addEventListener('click', (e) => {
  document.querySelectorAll('.nav-policy-dropdown[open]').forEach((dd) => {
    if (!dd.contains(e.target) || e.target.closest('.nav-policy-menu a')) dd.open = false;
  });
});
