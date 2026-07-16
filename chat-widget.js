// ============================================================
// JohnnyPC — Live chat widget (khách <-> shop)
// Dùng chung cho MỌI trang khách (giống nav-cart.js, floating messenger).
// Chỉ khách ĐÃ ĐĂNG NHẬP mới chat được — chưa đăng nhập sẽ được mời đăng nhập.
// Yêu cầu: window.pcAuth phải sẵn sàng (auth.js phải được load TRƯỚC file này).
// ============================================================

import { supabase } from './supabase-client.js';

const NTFY_TOPIC = 'https://ntfy.sh/pcstore-perth-duc-7k2m9x';

let panelOpen = false;
let currentUser = null;
let currentProfile = null;
let chatChannel = null;
let loadedForUserId = null;

function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// ── Build DOM (tiêm vào body, khỏi phải sửa từng file .html) ───────────────
const fab = document.createElement('button');
fab.className = 'chat-fab';
fab.id = 'chat-fab-btn';
fab.setAttribute('aria-label', 'Chat với JohnnyPC');
fab.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4h16v12H7l-3 3V4z" fill="#fff"/>
  </svg>
  <span class="chat-fab-badge" id="chat-fab-badge" style="display:none">0</span>
`;

const panel = document.createElement('div');
panel.className = 'chat-panel hidden';
panel.id = 'chat-panel';
panel.innerHTML = `
  <div class="chat-panel-header">
    <strong>💬 Chat với JohnnyPC</strong>
    <button class="chat-panel-close" id="chat-panel-close-btn" aria-label="Đóng">×</button>
  </div>
  <div id="chat-panel-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
`;

document.body.appendChild(fab);
document.body.appendChild(panel);

const contentEl = () => document.getElementById('chat-panel-content');

// ── Trạng thái: chưa đăng nhập ───────────────────────────────────────────
function renderLoggedOut() {
  contentEl().innerHTML = `
    <div class="chat-panel-login">
      <div style="font-size:32px">🔒</div>
      <p>Bạn cần đăng nhập để nhắn tin trực tiếp với shop.</p>
      <a class="primary-btn" style="width:auto;padding:12px 24px"
         href="login.html?redirect=${encodeURIComponent(location.pathname + location.search)}">
        Đăng nhập
      </a>
    </div>
  `;
}

// ── Trạng thái: đã đăng nhập — load lịch sử chat ─────────────────────────
async function renderLoggedIn() {
  contentEl().innerHTML = `
    <div class="chat-panel-body" id="chat-messages-list">
      <div class="chat-panel-empty">Đang tải...</div>
    </div>
    <div class="chat-panel-footer">
      <textarea id="chat-input" rows="1" placeholder="Nhập tin nhắn..."></textarea>
      <button class="chat-panel-send" id="chat-send-btn">Gửi</button>
    </div>
  `;

  document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  await loadHistory();
  await markAdminMessagesRead();
  subscribeRealtime();
}

function bubbleHtml(row) {
  const cls = row.sender === 'user' ? 'from-user' : 'from-admin';
  return `<div class="chat-bubble ${cls}">${escHtml(row.message)}<span class="chat-bubble-time">${formatTime(row.created_at)}</span></div>`;
}

async function loadHistory() {
  const list = document.getElementById('chat-messages-list');
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = `<div class="chat-panel-empty">Không tải được tin nhắn. Thử lại sau.</div>`;
    console.error('chat loadHistory error:', error);
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = `<div class="chat-panel-empty">Chưa có tin nhắn nào — gửi câu hỏi đầu tiên cho shop nhé!</div>`;
  } else {
    list.innerHTML = data.map(bubbleHtml).join('');
    list.scrollTop = list.scrollHeight;
  }
  loadedForUserId = currentUser.id;
}

async function markAdminMessagesRead() {
  await supabase
    .from('chat_messages')
    .update({ is_read: true })
    .eq('user_id', currentUser.id)
    .eq('sender', 'admin')
    .eq('is_read', false);
  updateBadge();
}

function subscribeRealtime() {
  if (chatChannel) supabase.removeChannel(chatChannel);
  chatChannel = supabase.channel('chat-user-' + currentUser.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages',
      filter: `user_id=eq.${currentUser.id}`
    }, (payload) => {
      const row = payload.new;
      const list = document.getElementById('chat-messages-list');
      if (list) {
        if (list.querySelector('.chat-panel-empty')) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', bubbleHtml(row));
        list.scrollTop = list.scrollHeight;
      }
      if (row.sender === 'admin') {
        if (panelOpen) {
          supabase.from('chat_messages').update({ is_read: true }).eq('id', row.id).then(() => {});
        } else {
          updateBadge();
        }
      }
    })
    .subscribe();
}

async function updateBadge() {
  if (!currentUser) return;
  const { count } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('sender', 'admin')
    .eq('is_read', false);
  const badge = document.getElementById('chat-fab-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  const message = input.value.trim();
  if (!message || !currentUser) return;

  btn.disabled = true;
  const { error } = await supabase.from('chat_messages').insert({
    user_id: currentUser.id,
    user_name: currentProfile?.full_name || currentUser.user_metadata?.full_name || null,
    user_email: currentUser.email || null,
    sender: 'user',
    message
  });
  btn.disabled = false;

  if (error) {
    console.error('chat sendMessage error:', error);
    alert('Không gửi được tin nhắn, vui lòng thử lại.');
    return;
  }

  input.value = '';

  // Báo cho admin qua ntfy (giống contact form)
  fetch(NTFY_TOPIC, {
    method: 'POST',
    headers: { 'Title': 'Tin nhan chat moi!', 'Priority': 'default', 'Tags': 'speech_balloon' },
    body: `Tu: ${currentProfile?.full_name || currentUser.email}\nNoi dung: ${message}`
  }).catch(() => {});
}

// ── Mở / đóng panel ───────────────────────────────────────────────────────
async function openPanel() {
  panelOpen = true;
  panel.classList.remove('hidden');
  if (!currentUser) {
    renderLoggedOut();
    return;
  }
  if (loadedForUserId !== currentUser.id) {
    await renderLoggedIn();
  } else {
    await markAdminMessagesRead();
  }
}

function closePanel() {
  panelOpen = false;
  panel.classList.add('hidden');
}

fab.addEventListener('click', () => {
  if (panel.classList.contains('hidden')) openPanel();
  else closePanel();
});
document.getElementById('chat-panel-close-btn').addEventListener('click', closePanel);

// ── Theo dõi trạng thái đăng nhập (dùng chung auth.js) ──────────────────────
async function init() {
  if (!window.pcAuth) {
    // auth.js chưa kịp load — thử lại sau 1 nhịp
    setTimeout(init, 200);
    return;
  }
  const { user, profile } = await window.pcAuth.ready;
  currentUser = user;
  currentProfile = profile;
  if (currentUser) updateBadge();

  document.addEventListener('pcauth:change', (e) => {
    currentUser = e.detail.user;
    currentProfile = e.detail.profile;
    loadedForUserId = null;
    if (chatChannel) { supabase.removeChannel(chatChannel); chatChannel = null; }
    if (currentUser) {
      updateBadge();
      if (panelOpen) renderLoggedIn();
    } else {
      const badge = document.getElementById('chat-fab-badge');
      if (badge) badge.style.display = 'none';
      if (panelOpen) renderLoggedOut();
    }
  });
}

init();
