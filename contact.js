// ============================================
// JohnnyPC — contact.html logic
// ============================================

import { supabase, MESSENGER_LINK } from './supabase-client.js';

// Spam protection — 60 giây giữa 2 lần gửi
let lastMessageSubmit = 0;
const MESSAGE_COOLDOWN = 60 * 1000;

// Messenger link
document.getElementById('contact-messenger-btn').href = MESSENGER_LINK;

// Nav toggle được xử lý bởi nav-cart.js (dùng chung cho mọi trang)

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  let t = document.getElementById('cf-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cf-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── Validation ─────────────────────────────────────────────────────────────
function setFieldError(inputId, hasError) {
  const el = document.getElementById(inputId);
  el.style.borderColor = hasError ? 'var(--red)' : '';
}

function isValidContact(val) {
  // chấp nhận email hoặc số điện thoại AU/VN
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^(\+?61|0|\+?84)[0-9\s\-]{7,12}$/;
  return emailRe.test(val) || phoneRe.test(val.replace(/[\s-]/g, ''));
}

// ── Submit ─────────────────────────────────────────────────────────────────
document.getElementById('contact-form-submit').addEventListener('click', async () => {
  const name    = document.getElementById('cf-name').value.trim();
  const contact = document.getElementById('cf-contact').value.trim();
  const message = document.getElementById('cf-message').value.trim();

  // Reset border
  ['cf-name', 'cf-contact', 'cf-message'].forEach(id => setFieldError(id, false));

  // Validate từng field
  let hasError = false;
  if (!name)    { setFieldError('cf-name', true);    hasError = true; }
  if (!contact) { setFieldError('cf-contact', true); hasError = true; }
  if (!message) { setFieldError('cf-message', true); hasError = true; }

  if (hasError) {
    showToast('⚠️ Please fill in all fields', true);
    return;
  }

  if (!isValidContact(contact)) {
    setFieldError('cf-contact', true);
    showToast('⚠️ Invalid email or phone number', true);
    return;
  }

  if (message.length < 10) {
    setFieldError('cf-message', true);
    showToast('⚠️ Your message is too short — please add a bit more detail!', true);
    return;
  }

  // Cooldown check
  const now = Date.now();
  if (now - lastMessageSubmit < MESSAGE_COOLDOWN) {
    const wait = Math.ceil((MESSAGE_COOLDOWN - (now - lastMessageSubmit)) / 1000);
    showToast(`⏳ Please wait ${wait}s before sending again`, true);
    return;
  }

  const btn = document.getElementById('contact-form-submit');
  btn.disabled    = true;
  btn.textContent = 'Sending...';

  const { error } = await supabase.from('messages').insert({ name, contact, message });

  if (!error) {
    // Gửi thông báo ntfy
    fetch('https://ntfy.sh/pcstore-perth-duc-7k2m9x', {
      method: 'POST',
      headers: {
        'Title': 'Tin nhan moi tu khach!',
        'Priority': 'default',
        'Tags': 'email,bell'
      },
      body: `Tu: ${name}\nLien he: ${contact}\nNoi dung: ${message}`
    }).catch(() => {});
  }

  btn.disabled    = false;
  btn.textContent = 'Send message';

  if (error) {
    showToast('❌ Error: ' + error.message, true);
    return;
  }

  // Thành công
  lastMessageSubmit = Date.now();
  document.getElementById('contact-form-view').classList.add('hidden');
  document.getElementById('contact-form-success').classList.remove('hidden');
  showToast('✅ Message sent!');
});

// Xoá border đỏ khi người dùng bắt đầu gõ lại
['cf-name', 'cf-contact', 'cf-message'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    setFieldError(id, false);
  });
});
