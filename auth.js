// ============================================================
// JohnnyPC — shared auth logic (Google sign-in via Supabase)
// Dùng chung cho MỌI trang có nav-account-wrap trong nav
// ============================================================

import { supabase } from './supabase-client.js';

let currentUser = null;
let currentProfile = null;
let readyResolve;
export const authReady = new Promise(res => { readyResolve = res; });
let resolved = false;

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

async function loadProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

async function ensureProfile(user) {
  let profile = await loadProfile(user.id);
  if (!profile) {
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const { data } = await supabase.from('profiles')
      .insert({ id: user.id, full_name: fullName })
      .select()
      .maybeSingle();
    profile = data;
  }
  return profile;
}

async function signInWithGoogle() {
  // Không dùng window.location.href trực tiếp — nếu URL đang có sẵn dấu # trống (do lần trước để lại),
  // Supabase sẽ gắn thêm #access_token=... vào sau, tạo ra "##access_token=..." và không đọc được.
  const cleanUrl = window.location.origin + window.location.pathname + window.location.search;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: cleanUrl }
  });
  if (error) {
    console.error('Google sign-in error:', error);
    alert('Sign-in failed: ' + error.message);
  }
}

async function signOut() {
  await supabase.auth.signOut();
}

// ── Logout confirm modal ─────────────────────────────────────────────────
function ensureLogoutModal() {
  if (document.getElementById('logout-confirm-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'logout-confirm-overlay';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal">
      <button class="confirm-modal-close" id="logout-confirm-close" type="button" aria-label="Close">✕</button>
      <svg class="confirm-modal-icon" viewBox="0 0 130 92" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="65" cy="80" rx="50" ry="8" fill="var(--surface2)"/>
        <rect x="40" y="14" width="34" height="58" rx="4" fill="var(--accent2)" opacity="0.35"/>
        <rect x="46" y="10" width="34" height="58" rx="4" fill="var(--accent2)"/>
        <circle cx="72" cy="40" r="2.6" fill="#fff"/>
        <path d="M80 22 L104 39 L80 56" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <line x1="60" y1="39" x2="102" y2="39" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>
      </svg>
      <div class="confirm-modal-title">Log out?</div>
      <div class="confirm-modal-text">You'll need to sign in again to see your orders and account details.</div>
      <div class="confirm-modal-actions">
        <button class="confirm-btn-ghost" id="logout-confirm-yes" type="button">Log out</button>
        <button class="confirm-btn-primary" id="logout-confirm-no" type="button">Stay signed in</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.classList.remove('open');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('logout-confirm-close').onclick = close;
  document.getElementById('logout-confirm-no').onclick = close;
  document.getElementById('logout-confirm-yes').onclick = () => { close(); signOut(); };
}

function showLogoutConfirm() {
  ensureLogoutModal();
  document.getElementById('logout-confirm-overlay').classList.add('open');
}

function renderAccountUI() {
  const btn = document.getElementById('nav-account-btn');
  const dropdown = document.getElementById('account-dropdown');
  if (!btn || !dropdown) return;

  if (currentUser) {
    btn.classList.remove('nav-signin-btn');
    const name = currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email || 'Account';
    const avatarUrl = currentUser.user_metadata?.avatar_url;
    btn.innerHTML = avatarUrl
      ? `<img src="${avatarUrl}" alt="${escHtml(name)}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;display:block">`
      : `<span style="width:26px;height:26px;border-radius:50%;background:#fff;color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${escHtml(name.charAt(0).toUpperCase())}</span>`;
    dropdown.innerHTML = `
      <div class="account-dropdown-name">${escHtml(name)}</div>
      <a href="account.html" class="account-dropdown-link">📦 My Account &amp; Orders</a>
      <button class="account-dropdown-link" id="account-signout-btn" type="button">🚪 Sign out</button>
    `;
    document.getElementById('account-signout-btn').onclick = () => showLogoutConfirm();
  } else {
    btn.classList.add('nav-signin-btn');
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/></svg><span>Sign in</span>`;
    dropdown.innerHTML = '';
  }
}

async function handleAuthChange(session, event) {
  currentUser = session?.user || null;
  renderAccountUI(); // hiện avatar ngay bằng data Google, khỏi chờ query bảng profiles
  currentProfile = currentUser ? await ensureProfile(currentUser) : null;
  renderAccountUI(); // cập nhật lại nếu profile có tên/SĐT riêng đã lưu trước đó
  document.dispatchEvent(new CustomEvent('pcauth:change', {
    detail: { user: currentUser, profile: currentProfile, justLoggedIn: event === 'SIGNED_IN' }
  }));
  if (!resolved) { resolved = true; readyResolve({ user: currentUser, profile: currentProfile }); }

  // Dọn sạch URL sau khi xử lý xong đăng nhập — tránh để sót "#" hoặc "#access_token=..."
  // gây ra lỗi "##access_token=..." ở lần đăng nhập kế tiếp.
  if (event === 'SIGNED_IN' && window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  handleAuthChange(session, event);
});

// Mở/đóng dropdown tài khoản
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('account-dropdown');
  if (!dropdown) return;
  if (e.target.closest('#nav-account-btn')) {
    if (currentUser) dropdown.classList.toggle('open');
    else window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
  } else if (!e.target.closest('#account-dropdown')) {
    dropdown.classList.remove('open');
  }
});

window.pcAuth = {
  get user() { return currentUser; },
  get profile() { return currentProfile; },
  signInWithGoogle,
  signOut,
  ready: authReady
};
