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
  clearTimeout(refreshTimer);
  await supabase.auth.signOut();
}

// ── MANUAL TOKEN REFRESH ─────────────────────────────────────────────────
// Lý do tự làm thay vì để Supabase SDK tự động (autoRefreshToken) refresh:
// mặc định, hễ 1 lần gọi refresh thất bại (kể cả do Supabase quá tải/429,
// lỗi mạng tạm thời, lỗi 500...) SDK sẽ coi như phiên đăng nhập không còn
// hợp lệ và tự động đăng xuất người dùng — kể cả khi refresh token của họ
// vẫn còn hoàn toàn hợp lệ. Ở đây mình tự kiểm soát: CHỈ đăng xuất khi
// Supabase xác nhận rõ ràng refresh token đã hết hạn/không hợp lệ; các lỗi
// tạm thời khác sẽ tự thử lại (backoff) mà không đá người dùng ra ngoài.
let refreshTimer = null;

function scheduleRefresh(session) {
  clearTimeout(refreshTimer);
  if (!session?.expires_at) return;
  const msUntilExpiry = session.expires_at * 1000 - Date.now();
  // Refresh trước khi hết hạn 60s; nếu đã gần/hết hạn sẵn thì thử refresh gần như ngay
  const delay = Math.max(msUntilExpiry - 60_000, 3_000);
  refreshTimer = setTimeout(() => attemptRefresh(), delay);
}

async function attemptRefresh(retryCount = 0) {
  // Không còn ai đăng nhập (đã signOut chủ động) → khỏi refresh
  if (!currentUser) return;

  // Chốt chặn cứng: dù thế nào cũng không thử quá 6 lần liên tiếp (~5 phút)
  // — tránh mọi khả năng lặp vô hạn do lỗi logic chưa lường trước.
  if (retryCount >= 6) {
    console.warn('Refresh thất bại quá nhiều lần liên tiếp, dừng thử và đăng xuất.');
    await supabase.auth.signOut();
    return;
  }

  const tokenBeforeAttempt = (await supabase.auth.getSession()).data?.session?.access_token || null;
  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    // Lỗi rõ ràng là refresh token hết hạn/không hợp lệ → đăng xuất thật
    const status = error.status;
    const msg = (error.message || '').toLowerCase();
    const isDefinitiveAuthError =
      status === 400 ||
      status === 401 ||
      msg.includes('invalid') ||
      msg.includes('expired') ||
      msg.includes('not found');

    if (isDefinitiveAuthError) {
      // QUAN TRỌNG: trước khi kết luận "hết hạn thật", kiểm tra lại xem có
      // phải 1 tab KHÁC vừa refresh thành công và ghi token MỚI vào storage
      // hay không. Chỉ tính là "tab khác vừa refresh xong" khi access_token
      // hiện tại KHÁC với token lúc bắt đầu thử (tức thực sự có gì đó đổi),
      // VÀ token đó chưa hết hạn — nếu không sẽ dễ lặp vô hạn với chính
      // phiên cũ đã hỏng (đây là lỗi từng gặp phải, đã sửa ở đây).
      const { data: freshCheck } = await supabase.auth.getSession();
      const freshSession = freshCheck?.session;
      const isGenuinelyNewer =
        freshSession &&
        freshSession.access_token !== tokenBeforeAttempt &&
        freshSession.expires_at * 1000 > Date.now();

      if (isGenuinelyNewer) {
        console.warn('Tab khác đã refresh thành công — dùng lại phiên mới, không đăng xuất.');
        scheduleRefresh(freshSession);
        return;
      }
      console.warn('Phiên đăng nhập đã hết hạn thật sự, đăng xuất:', error.message);
      await supabase.auth.signOut();
      return;
    }

    // Lỗi tạm thời (429 quá tải, 500, mất mạng...) → thử lại với backoff, KHÔNG đăng xuất
    console.warn(`Refresh token lỗi tạm thời (sẽ thử lại, lần ${retryCount + 1}/6): ${error.message}`);
    const delay = Math.min(5000 * 2 ** retryCount, 60_000);
    refreshTimer = setTimeout(() => attemptRefresh(retryCount + 1), delay);
    return;
  }

  if (data?.session) scheduleRefresh(data.session);
}

// Khi tab quay lại foreground hoặc mạng có lại → kiểm tra/refresh ngay,
// vì setTimeout có thể bị trình duyệt "đóng băng" lúc tab ở nền.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser) attemptRefresh();
});
window.addEventListener('online', () => {
  if (currentUser) attemptRefresh();
});

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
  if (session) scheduleRefresh(session);
  else clearTimeout(refreshTimer);
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
