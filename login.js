// ============================================================
// JohnnyPC — login.html logic (đăng nhập bằng mã OTP qua email,
// không dùng mật khẩu — giống kiểu Claude)
// ============================================================

import { supabase } from './supabase-client.js';

// ── Privacy consent overlay — hiện 1 lần duy nhất cho mỗi trình duyệt ──────
const CONSENT_KEY = 'pcstore_privacy_ack';
const consentOverlay = document.getElementById('consent-overlay');
if (consentOverlay) {
  if (!localStorage.getItem(CONSENT_KEY)) {
    consentOverlay.classList.remove('hidden');
  }
  document.getElementById('consent-accept-btn').addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, '1');
    consentOverlay.classList.add('hidden');
  });
}

const stepEmail   = document.getElementById('step-email');
const stepCode    = document.getElementById('step-code');
const emailForm   = document.getElementById('email-form');
const codeForm    = document.getElementById('code-form');
const emailInput  = document.getElementById('auth-email');
const codeInput   = document.getElementById('auth-code');
const emailError  = document.getElementById('auth-error');
const codeError   = document.getElementById('code-error');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyBtn   = document.getElementById('verify-code-btn');
const codeSentEmailEl = document.getElementById('code-sent-email');
const resendLink   = document.getElementById('resend-code-link');
const changeEmailLink = document.getElementById('change-email-link');
const expiryNoteEl = document.getElementById('code-expiry-note');

const OTP_EXPIRY_SECONDS = 120; // khớp với "Email OTP expiration" cấu hình trong Supabase
let pendingEmail = '';
let resendCooldownUntil = 0;
let expiryTimerInterval = null;
let codeExpiresAt = 0;

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startExpiryCountdown() {
  clearInterval(expiryTimerInterval);
  codeExpiresAt = Date.now() + OTP_EXPIRY_SECONDS * 1000;

  const tick = () => {
    const remaining = Math.max(0, Math.round((codeExpiresAt - Date.now()) / 1000));
    if (remaining <= 0) {
      expiryNoteEl.textContent = 'This code has expired — please request a new one.';
      expiryNoteEl.style.color = 'var(--red)';
      clearInterval(expiryTimerInterval);
      return;
    }
    expiryNoteEl.style.color = 'var(--muted)';
    expiryNoteEl.textContent = `Code valid for ${formatCountdown(remaining)}`;
  };
  tick();
  expiryTimerInterval = setInterval(tick, 1000);
}

function redirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || 'index.html';
}

function showEmailError(msg) { emailError.textContent = msg; emailError.style.display = 'block'; }
function clearEmailError() { emailError.style.display = 'none'; emailError.textContent = ''; }
function showCodeError(msg) { codeError.textContent = msg; codeError.style.display = 'block'; }
function clearCodeError() { codeError.style.display = 'none'; codeError.textContent = ''; }

async function sendCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });
  return error;
}

// ── Bước 1: nhập email, gửi mã ──────────────────────────────────────────
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearEmailError();
  const email = emailInput.value.trim();
  if (!email) { showEmailError('Please enter your email.'); return; }

  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = 'Sending code...';

  const error = await sendCode(email);

  sendCodeBtn.disabled = false;
  sendCodeBtn.textContent = 'Continue with email';

  if (error) { showEmailError(error.message); return; }

  pendingEmail = email;
  codeSentEmailEl.textContent = email;
  codeInput.value = '';
  clearCodeError();
  stepEmail.classList.add('hidden');
  stepCode.classList.remove('hidden');
  codeInput.focus();
  resendCooldownUntil = Date.now() + 30_000;
  startExpiryCountdown();
});

// ── Bước 2: nhập mã, xác thực ────────────────────────────────────────────
codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearCodeError();
  const code = codeInput.value.trim();
  if (!/^\d{6,10}$/.test(code)) { showCodeError('Please enter the code from your email.'); return; }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  const { error } = await supabase.auth.verifyOtp({
    email: pendingEmail,
    token: code,
    type: 'email'
  });

  verifyBtn.disabled = false;
  verifyBtn.textContent = 'Verify & sign in';

  if (error) {
    showCodeError(/expired/i.test(error.message) ? 'This code has expired — please request a new one.' : error.message);
    return;
  }

  // Đăng nhập thành công — auth.js sẽ tự bắt sự kiện pcauth:change và chuyển trang
  window.location.href = redirectTarget();
});

// ── Gửi lại mã ────────────────────────────────────────────────────────────
resendLink.addEventListener('click', async (e) => {
  e.preventDefault();
  if (Date.now() < resendCooldownUntil) {
    const wait = Math.ceil((resendCooldownUntil - Date.now()) / 1000);
    showCodeError(`Please wait ${wait}s before requesting another code.`);
    return;
  }
  clearCodeError();
  const original = resendLink.textContent;
  resendLink.textContent = 'Sending...';
  const error = await sendCode(pendingEmail);
  resendLink.textContent = original;
  if (error) { showCodeError(error.message); return; }
  resendCooldownUntil = Date.now() + 30_000;
  startExpiryCountdown();
  codeError.style.color = 'var(--green)';
  showCodeError('✅ New code sent — check your email.');
  setTimeout(() => { codeError.style.color = 'var(--red)'; clearCodeError(); }, 4000);
});

// ── Dùng email khác ───────────────────────────────────────────────────────
changeEmailLink.addEventListener('click', (e) => {
  e.preventDefault();
  clearInterval(expiryTimerInterval);
  stepCode.classList.add('hidden');
  stepEmail.classList.remove('hidden');
  clearCodeError();
  emailInput.focus();
});

// Chỉ cho nhập số trong ô mã
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 10);
});

document.getElementById('login-close-btn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

document.getElementById('google-signin-btn').addEventListener('click', () => {
  window.pcAuth?.signInWithGoogle();
});

// Nếu đã đăng nhập sẵn (session còn hiệu lực), tự chuyển về trang trước đó
document.addEventListener('pcauth:change', (e) => {
  if (e.detail.user) window.location.href = redirectTarget();
});
