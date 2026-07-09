// ============================================================
// JohnnyPC — reset-password.html logic
// ============================================================

import { supabase } from './supabase-client.js';

document.querySelectorAll('.password-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
  });
});

const errorEl = document.getElementById('reset-error');
const btn = document.getElementById('reset-submit-btn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

btn.addEventListener('click', async () => {
  errorEl.style.display = 'none';
  const pw = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (!pw || pw.length < 6) { showError('Password must be at least 6 characters.'); return; }
  if (pw !== confirm) { showError('Passwords do not match.'); return; }

  btn.disabled = true;
  btn.textContent = 'Updating...';

  const { error } = await supabase.auth.updateUser({ password: pw });

  btn.disabled = false;
  btn.textContent = 'Update password';

  if (error) { showError(error.message); return; }

  document.getElementById('reset-form-area').classList.add('hidden');
  document.getElementById('reset-success').classList.remove('hidden');

  // Dọn sạch URL (link reset password có chứa token trong hash)
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname);
  }
});
