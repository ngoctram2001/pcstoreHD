// ============================================================
// JohnnyPC — login.html logic
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

const tabSignIn = document.getElementById('tab-signin');
const tabSignUp = document.getElementById('tab-signup');
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const confirmField = document.getElementById('confirm-password-field');
const confirmInput = document.getElementById('auth-password-confirm');
const errorEl = document.getElementById('auth-error');
const submitBtn = document.getElementById('auth-submit-btn');
const forgotLinkWrap = document.getElementById('forgot-link-wrap');
const forgotLink = document.getElementById('forgot-link');
const signupConsent = document.getElementById('signup-consent');
const formArea = document.getElementById('login-form-area');
const successBox = document.getElementById('login-success-box');
const successMsg = document.getElementById('login-success-msg');

let mode = 'signin'; // 'signin' | 'signup' | 'forgot'
let pendingSignupEmail = '';

function redirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || 'index.html';
}

function cleanUrl(path) {
  return window.location.origin + '/' + path;
}

function showError(msg, showResend = false, email = '') {
  errorEl.innerHTML = msg + (showResend
    ? ` <a href="#" id="resend-confirm-link" style="color:var(--accent);font-weight:600">Resend confirmation email</a>`
    : '');
  errorEl.style.display = 'block';
  if (showResend) {
    document.getElementById('resend-confirm-link').addEventListener('click', async (e) => {
      e.preventDefault();
      const link = e.target;
      link.textContent = 'Sending...';
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      link.textContent = error ? error.message : 'Sent! Check your inbox';
    });
  }
}
function clearError() {
  errorEl.style.display = 'none';
  errorEl.innerHTML = '';
}

function setMode(newMode) {
  mode = newMode;
  clearError();
  tabSignIn.classList.toggle('active', mode === 'signin');
  tabSignUp.classList.toggle('active', mode === 'signup' || mode === 'forgot');

  if (mode === 'signin') {
    confirmField.style.display = 'none';
    signupConsent.style.display = 'none';
    forgotLinkWrap.style.display = 'block';
    passwordInput.parentElement.style.display = 'block';
    submitBtn.textContent = 'Sign in';
    forgotLink.textContent = 'Forgot password?';
  } else if (mode === 'signup') {
    confirmField.style.display = 'block';
    signupConsent.style.display = 'block';
    forgotLinkWrap.style.display = 'none';
    passwordInput.parentElement.style.display = 'block';
    submitBtn.textContent = 'Create account';
  } else if (mode === 'forgot') {
    confirmField.style.display = 'none';
    signupConsent.style.display = 'none';
    passwordInput.parentElement.style.display = 'none';
    forgotLinkWrap.style.display = 'block';
    submitBtn.textContent = 'Send reset link';
    forgotLink.textContent = 'Back to sign in';
  }
}

tabSignIn.addEventListener('click', () => setMode('signin'));
tabSignUp.addEventListener('click', () => setMode('signup'));
forgotLink.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(mode === 'forgot' ? 'signin' : 'forgot');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) { showError('Please enter your email.'); return; }

  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Please wait...';

  try {
    if (mode === 'signin') {
      if (!password) { showError('Please enter your password.'); return; }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const notConfirmed = /email not confirmed/i.test(error.message);
        showError(notConfirmed ? 'Please confirm your email before signing in.' : error.message, notConfirmed, email);
        return;
      }
      window.location.href = redirectTarget();

    } else if (mode === 'signup') {
      if (!password || password.length < 6) { showError('Password must be at least 6 characters.'); return; }
      if (password !== confirmInput.value) { showError('Passwords do not match.'); return; }
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: cleanUrl('login.html') }
      });
      if (error) { showError(error.message); return; }
      formArea.classList.add('hidden');
      successBox.classList.remove('hidden');
      successMsg.textContent = "We've sent a confirmation link to " + email + ". Click it to activate your account, then come back and sign in.";
      document.getElementById('resend-signup-wrap').classList.remove('hidden');
      pendingSignupEmail = email;

    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: cleanUrl('reset-password.html')
      });
      if (error) { showError(error.message); return; }
      formArea.classList.add('hidden');
      successBox.classList.remove('hidden');
      successMsg.textContent = "We've sent a password reset link to " + email + ". Click it to set a new password.";
      document.getElementById('resend-signup-wrap').classList.add('hidden');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

document.querySelectorAll('.password-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
  });
});

document.getElementById('resend-signup-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const link = e.target;
  link.textContent = 'Sending...';
  const { error } = await supabase.auth.resend({ type: 'signup', email: pendingSignupEmail });
  link.textContent = error ? error.message : 'Sent!';
});

document.getElementById('already-confirmed-btn').addEventListener('click', () => {
  const email = emailInput.value.trim();
  successBox.classList.add('hidden');
  formArea.classList.remove('hidden');
  setMode('signin');
  emailInput.value = email;
  passwordInput.value = '';
  passwordInput.focus();
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

setMode('signin');
