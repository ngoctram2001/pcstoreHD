import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  const SUPABASE_URL = 'https://ahquyhbbnrtdlaydrrnm.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocXV5aGJibnJ0ZGxheWRycm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNzg1MTgsImV4cCI6MjA5Nzc1NDUxOH0.vf1pMfXU5b7gvnC9AiFChw96WQZQMHMEeTH8R5tcUj4';
  // SERVICE_KEY đã được xóa — dùng RLS policy "authenticated" thay thế

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

  // ─── STATE ───────────────────────────────────────────────────────────────
  let products = [];
  let orders   = [];
  let messages = [];
  let reviews  = [];
  let realtimeStarted = false; // flag chặn gọi nhiều lần

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) showAdmin();
    else { realtimeStarted = false; showLogin(); }
  });

  window.login = async function () {
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    const err   = document.getElementById('login-error');
    err.textContent = '';
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) err.textContent = '❌ ' + (error.message === 'Invalid login credentials' ? 'Incorrect email or password' : error.message);
  };

  window.logout = async function () {
    await supabase.auth.signOut();
  };

  function showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('admin-page').style.display = 'none';
  }
  function showAdmin() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('admin-page').style.display = 'block';
    loadAll();
    startRealtime();
  }

  // ─── REALTIME ─────────────────────────────────────────────────────────────
  function startRealtime() {
    if (realtimeStarted) return; // chặn gọi lại
    realtimeStarted = true;
    supabase.channel('realtime-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        await loadOrders();
        updateStats();
        showNotification('📦 Đơn hàng mới!', payload.new.customer_name + ' vừa đặt ' + (payload.new.product_name || 'một sản phẩm'));
      })
      .subscribe();

    supabase.channel('realtime-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        await loadMessages();
        updateStats();
        showNotification('💬 Tin nhắn mới!', payload.new.name + ': ' + payload.new.message.slice(0, 60) + '...');
      })
      .subscribe();
  }

  function showNotification(title, body) {
    // Đổi title tab để báo hiệu
    document.title = '🔴 ' + document.title.replace(/^🔴 /, '');
    setTimeout(() => { document.title = document.title.replace(/^🔴 /, ''); }, 5000);

    // Âm thanh ping
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch(e) {}

    // Popup thông báo góc phải
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:#221a14;border:1px solid #ff5722;border-radius:12px;padding:16px 20px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:Inter,sans-serif;';
    const tabTarget = title.includes('📦') ? 'orders' : 'messages';
    box.innerHTML = '<div style="font-weight:700;color:#ff5722;margin-bottom:4px;font-size:15px">' + title + '</div>'
      + '<div style="color:#f7f0e8;font-size:13px;line-height:1.5">' + body + '</div>'
      + '<div style="margin-top:10px;display:flex;gap:8px">'
      + '<button onclick="switchTab(\'' + tabTarget + '\');this.closest(\'div\').parentElement.remove()" style="background:#ff5722;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">Xem ngay</button>'
      + '<button onclick="this.closest(\'div\').parentElement.remove()" style="background:#2b211a;color:#a8957f;border:1px solid #3d3024;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer">Bỏ qua</button>'
      + '</div>';
    document.body.appendChild(box);
    setTimeout(() => { if (box.parentNode) box.remove(); }, 8000);
  }

  // ─── TABS ─────────────────────────────────────────────────────────────────
  const TAB_NAMES = ['dashboard', 'products', 'orders', 'messages', 'reviews'];
  window.switchTab = function (tab) {
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', TAB_NAMES[i] === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
  };

  // ─── LOAD ─────────────────────────────────────────────────────────────────
  async function loadAll() {
    await Promise.all([loadProducts(), loadOrders(), loadMessages(), loadReviews()]);
    updateStats();
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    products = data || [];
    renderProductsTable();
    populateProductSelect();
  }
  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    orders = data || [];
    applyOrderFilter();
  }
  async function loadMessages() {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
    messages = data || [];
    renderMessagesTable();
  }
  async function loadReviews() {
    const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    reviews = data || [];
    renderReviewsTable();
  }

  let ovFilter = 'all';

  window.setOvFilter = function(btn) {
    document.querySelectorAll('.ov-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ovFilter = btn.getAttribute('data-filter');
    renderOvGrid();
  };

  function renderOvGrid() {
    const statusLabel = { available: 'Còn hàng', reserved: 'Đã đặt', sold: 'Đã bán' };
    const grid = document.getElementById('ov-product-grid');
    if (!grid) return;

    // Cập nhật số đếm trên filter buttons
    ['all','available','reserved','sold'].forEach(s => {
      const el = document.getElementById('ov-count-' + s);
      if (el) el.textContent = s === 'all' ? products.length : products.filter(p => (p.status||'available') === s).length;
    });

    const list = ovFilter === 'all' ? products : products.filter(p => (p.status||'available') === ovFilter);

    if (!list.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);font-size:14px;padding:20px 0">Không có sản phẩm nào.</div>`;
      return;
    }

    grid.innerHTML = list.map(p => {
      const st = p.status || 'available';
      const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
      const imgHtml = p.image_url
        ? `<img class="ov-card-img" src="${p.image_url}" alt="${escHtml(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">\n<div class="ov-card-img-fallback" style="display:none">🖥️</div>`
        : `<div class="ov-card-img-fallback">🖥️</div>`;
      return `<div class="ov-card" style="position:relative">
        ${hasSale ? '<div style="position:absolute;top:8px;right:8px;background:#d63030;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;z-index:2">SALE</div>' : ''}
        ${imgHtml}
        <div class="ov-card-body">
          <div class="ov-card-name" title="${escHtml(p.name)}">${escHtml(p.name)}</div>
          <div class="ov-card-price">${salePriceHtml(p)}</div>
          <span class="ov-card-status ${st}">${statusLabel[st]||st}</span>
        </div>
      </div>`;
    }).join('');
  }

  function updateStats() {
    const pendingOrders  = orders.filter(o => o.status === 'pending').length;
    const doneOrders     = orders.filter(o => o.status === 'done').length;
    const newMessages    = messages.filter(m => m.status === 'new').length;
    const availProducts  = products.filter(p => p.status === 'available').length;

    document.getElementById('s-products').textContent = products.length;
    document.getElementById('s-pending').textContent  = pendingOrders;
    document.getElementById('s-done').textContent     = doneOrders;
    document.getElementById('s-newmsg').textContent   = newMessages;

    // Tab badges
    setBadge('badge-products', availProducts);
    setBadge('badge-orders',   pendingOrders);
    setBadge('badge-messages', newMessages);
    setBadge('badge-reviews',  reviews.filter(r => !r.admin_reply).length);

    // Overview grid
    renderOvGrid();
  }

  function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = 'inline-flex'; }
    else { el.style.display = 'none'; }
  }

  function formatPrice(p) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(p);
  }

  // ─── PRODUCTS TABLE ───────────────────────────────────────────────────────
  function salePriceHtml(p) {
    const hasSale = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;
    if (hasSale) {
      return `<span style="text-decoration:line-through;color:var(--muted);font-size:.85em;margin-right:6px">${formatPrice(p.price)}</span><span style="color:#d63030;font-weight:700">${formatPrice(p.sale_price)}</span>`;
    }
    return formatPrice(p.price);
  }

  function renderProductsTable() {
    // Gọi qua filter để giữ trạng thái filter nếu đang active
    if (document.getElementById('product-search')) {
      applyProductFilter();
    } else {
      const tb = document.getElementById('products-table');
      const statusLabel = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };
      if (!products.length) { tb.innerHTML = '<tr class="empty-row"><td colspan="6">No products yet — add your first one!</td></tr>'; return; }
      tb.innerHTML = products.map(p => {
        const status = p.status || 'available';
        return `<tr>
          <td class="td-sku">${escHtml(p.sku || '—')}</td>
          <td class="td-name">${escHtml(p.name)}</td>
          <td>${escHtml(p.category || '—')}</td>
          <td class="td-price">${salePriceHtml(p)}</td>
          <td><span class="status ${status}">${statusLabel[status]}</span></td>
          <td><div class="action-btns">
            <button class="edit-btn" data-id="${p.id}" onclick="editProductById(this)">✏️ Edit</button>
            <button class="del-btn"  data-id="${p.id}" onclick="deleteProductById(this)">🗑️ Delete</button>
          </div></td>
        </tr>`;
      }).join('');
    }
  }

  // FIX: read id from element attribute so type is always correct
  window.editProductById = function (btn) {
    const id = btn.getAttribute('data-id');
    // Supabase UUID → string; integer id → parse to number
    const p = products.find(x => String(x.id) === String(id));
    if (!p) { showToast('Product not found', true); return; }
    openProductModal(p);
  };

  window.deleteProductById = async function (btn) {
    const id = btn.getAttribute('data-id');
    const p  = products.find(x => String(x.id) === String(id));
    if (!p) { showToast('Product not found', true); return; }

    if (!confirm(`Xóa sản phẩm "${p.name}"?\nTất cả đơn hàng liên quan sẽ bị xóa luôn.`)) return;

    // Xóa toàn bộ đơn hàng liên quan
    const relatedOrders = orders.filter(o => String(o.product_id) === String(p.id));
    for (const o of relatedOrders) {
      await supabase.from('orders').delete().eq('id', o.id);
    }

    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      console.error('Delete product error:', error);
      showToast('❌ Lỗi xóa sản phẩm: ' + (error.message || error.code || JSON.stringify(error)), true);
      return;
    }

    showToast(relatedOrders.length > 0
      ? `🗑️ Đã xóa sản phẩm và ${relatedOrders.length} đơn hàng liên quan`
      : '🗑️ Đã xóa sản phẩm');
    await loadProducts();
    await loadOrders();
    updateStats();
  };

  // ─── PRODUCT MODAL ────────────────────────────────────────────────────────
  // ── MULTI-IMAGE STATE ─────────────────────────────────────────────────────
  let currentImages = []; // array of URLs

  function renderImagesGrid() {
    const grid = document.getElementById('images-grid');
    grid.innerHTML = currentImages.map((url, i) => `
      <div class="img-thumb-wrap">
        <img src="${url}" onerror="this.style.opacity='.3'">
        ${i === 0 ? '<span class="img-first-badge">Bìa</span>' : ''}
        <button class="img-remove-btn" onclick="removeImage(${i})">✕</button>
      </div>
    `).join('');
  }

  window.removeImage = function(idx) {
    currentImages.splice(idx, 1);
    renderImagesGrid();
  };

  document.getElementById('p-img-files').addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const status = document.getElementById('upload-status');
    status.textContent = `⏳ Đang upload ${files.length} ảnh...`;
    status.style.color = 'var(--muted)';
    e.target.value = '';

    let uploaded = 0;
    for (const file of files) {
      try {
        const ext      = file.name.split('.').pop().toLowerCase();
        const fileName = `product-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('product-images').upload(fileName, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
        currentImages.push(urlData.publicUrl);
        uploaded++;
        renderImagesGrid();
        status.textContent = `⏳ Đã upload ${uploaded}/${files.length}...`;
      } catch (err) {
        status.textContent = `❌ Lỗi upload: ${err.message}`;
        status.style.color = 'var(--red)';
      }
    }
    status.textContent = `✅ Upload xong ${uploaded} ảnh!`;
    status.style.color = 'var(--green)';
  });

  window.openProductModal = function (product) {
    const isEdit = !!product;
    document.getElementById('product-modal-title').textContent = isEdit ? 'Edit product' : 'Add product';
    document.getElementById('product-id').value = isEdit ? product.id : '';
    document.getElementById('upload-status').textContent = '';

    if (isEdit) {
      document.getElementById('p-sku').value        = product.sku || '';
      document.getElementById('p-name').value       = product.name || '';
      document.getElementById('p-price').value      = product.price || '';
      document.getElementById('p-sale-price').value = product.sale_price || '';
      document.getElementById('p-status').value     = product.status || 'available';
      document.getElementById('p-category').value   = product.category || '';
      document.getElementById('p-warranty').value   = product.warranty || '';
      document.getElementById('p-desc').value       = product.description || '';
      document.getElementById('p-specs').value      = product.specs || '';
      // Load images array, fallback về image_url cũ nếu chưa có
      currentImages = (product.images && product.images.length)
        ? [...product.images]
        : (product.image_url ? [product.image_url] : []);
    } else {
      ['p-sku','p-name','p-price','p-sale-price','p-category','p-warranty','p-desc','p-specs'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('p-status').value = 'available';
      currentImages = [];
    }
    renderImagesGrid();
    document.getElementById('product-modal').classList.add('open');
  };

  window.closeProductModal = () => document.getElementById('product-modal').classList.remove('open');

  window.saveProduct = async function () {
    const rawId = document.getElementById('product-id').value;
    const salePriceRaw = document.getElementById('p-sale-price').value.trim();
    const data = {
      sku:         document.getElementById('p-sku').value.trim(),
      name:        document.getElementById('p-name').value.trim(),
      price:       parseFloat(document.getElementById('p-price').value),
      sale_price:  salePriceRaw ? parseFloat(salePriceRaw) : null,
      status:      document.getElementById('p-status').value,
      category:    document.getElementById('p-category').value.trim(),
      warranty:    document.getElementById('p-warranty').value.trim(),
      image_url:   currentImages[0] || '',
      images:      currentImages,
      description: document.getElementById('p-desc').value.trim(),
      specs:       document.getElementById('p-specs').value.trim(),
    };
    if (!data.name)         { showToast('Please enter a product name', true); return; }
    if (isNaN(data.price))  { showToast('Please enter a valid price', true); return; }
    if (data.sale_price !== null && data.sale_price >= data.price) {
      showToast('⚠️ Giá sale phải nhỏ hơn giá gốc', true);
      return;
    }

    const btn = document.getElementById('save-product-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    let error;
    if (rawId) {
      ({ error } = await supabase.from('products').update(data).eq('id', rawId));
    } else {
      ({ error } = await supabase.from('products').insert(data));
    }
    btn.disabled = false;
    btn.textContent = '💾 Save product';

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast(rawId ? '✅ Product updated' : '✅ Product added');
    closeProductModal();
    await loadProducts();
    updateStats();
  };

  // ─── ORDERS TABLE ─────────────────────────────────────────────────────────
  function renderOrdersTable(list) {
    const tb = document.getElementById('orders-table');
    const statusLabel = { pending: 'Pending', confirmed: 'Confirmed', done: 'Completed', cancelled: 'Cancelled' };
    const data = list !== undefined ? list : orders;
    if (!data.length) {
      tb.innerHTML = '<tr class="empty-row"><td colspan="6">Không tìm thấy đơn hàng nào</td></tr>';
      return;
    }
    tb.innerHTML = data.map(o => `
      <tr>
        <td><strong>${escHtml(o.customer_name)}</strong></td>
        <td>${escHtml(o.customer_phone)} <button onclick="copyText('${escHtml(o.customer_phone)}')" title="Copy SĐT" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;opacity:.6" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">📋</button></td>
        <td>${escHtml(o.product_name || '—')}</td>
        <td style="color:var(--muted)">${o.pickup_date ? `${o.pickup_date} · ${o.pickup_time || ''}` : '—'}</td>
        <td><span class="status ${o.status}">${statusLabel[o.status] || o.status}</span></td>
        <td>
          <select data-id="${o.id}" onchange="updateOrderStatus(this)" style="padding:6px 10px;font-size:12px;width:auto">
            <option value="pending"    ${o.status==='pending'    ?'selected':''}>Pending</option>
            <option value="done"       ${o.status==='done'       ?'selected':''}>Completed</option>
            <option value="cancelled"  ${o.status==='cancelled'  ?'selected':''}>Cancelled</option>
          </select>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="edit-btn" data-id="${o.id}" onclick="printInvoice(this)" style="white-space:nowrap">🧾 Invoice</button>
            <button class="del-btn" data-id="${o.id}" onclick="deleteOrderById(this)" style="white-space:nowrap">🗑️ Xóa</button>
          </div>
        </td>
      </tr>`).join('');
  }

  window.applyProductFilter = function() {
    const keyword = (document.getElementById('product-search').value || '').toLowerCase().trim();
    const status  = document.getElementById('product-status-filter').value;
    const filtered = products.filter(p => {
      const matchSearch = !keyword || (p.name || '').toLowerCase().includes(keyword) || (p.category || '').toLowerCase().includes(keyword) || (p.sku || '').toLowerCase().includes(keyword);
      const matchStatus = status === 'all' || (p.status || 'available') === status;
      return matchSearch && matchStatus;
    });
    const tb = document.getElementById('products-table');
    const statusLabel = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };
    if (!filtered.length) { tb.innerHTML = '<tr class="empty-row"><td colspan="6">Không tìm thấy sản phẩm nào</td></tr>'; }
    else {
      tb.innerHTML = filtered.map(p => {
        const st = p.status || 'available';
        return `<tr>
          <td class="td-sku">${escHtml(p.sku || '—')}</td>
          <td class="td-name">${escHtml(p.name)}</td>
          <td>${escHtml(p.category || '—')}</td>
          <td class="td-price">${salePriceHtml(p)}</td>
          <td><span class="status ${st}">${statusLabel[st]}</span></td>
          <td><div class="action-btns">
            <button class="edit-btn" data-id="${p.id}" onclick="editProductById(this)">✏️ Edit</button>
            <button class="del-btn"  data-id="${p.id}" onclick="deleteProductById(this)">🗑️ Delete</button>
          </div></td>
        </tr>`;
      }).join('');
    }
    const countEl = document.getElementById('product-count');
    countEl.textContent = (keyword || status !== 'all') ? `Hiển thị ${filtered.length} / ${products.length} sản phẩm` : `Tổng: ${products.length} sản phẩm`;
  };

  window.applyMessageFilter = function() {
    const keyword = (document.getElementById('msg-search').value || '').toLowerCase().trim();
    const status  = document.getElementById('msg-status-filter').value;
    const filtered = messages.filter(m => {
      const matchSearch = !keyword || (m.name || '').toLowerCase().includes(keyword) || (m.message || '').toLowerCase().includes(keyword) || (m.contact || '').toLowerCase().includes(keyword);
      const matchStatus = status === 'all' || m.status === status;
      return matchSearch && matchStatus;
    });
    const tb = document.getElementById('messages-table');
    if (!filtered.length) { tb.innerHTML = '<tr class="empty-row"><td colspan="5">Không tìm thấy tin nhắn nào</td></tr>'; return; }
    tb.innerHTML = filtered.map(m => {
      const date = new Date(m.created_at);
      const dateStr = date.toLocaleDateString('en-AU') + ' ' + date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      return `<tr>
        <td><strong>${escHtml(m.name)}</strong></td>
        <td>${escHtml(m.contact)}</td>
        <td style="max-width:300px;white-space:normal">${escHtml(m.message)}</td>
        <td style="color:var(--muted);white-space:nowrap">${dateStr}</td>
        <td>
          <select data-id="${m.id}" onchange="updateMessageStatus(this)" style="padding:6px 10px;font-size:12px;width:auto">
            <option value="new"     ${m.status==='new'     ?'selected':''}>New</option>
            <option value="read"    ${m.status==='read'    ?'selected':''}>Read</option>
            <option value="replied" ${m.status==='replied' ?'selected':''}>Replied</option>
          </select>
        </td>
      </tr>`;
    }).join('');
    const countEl = document.getElementById('msg-count');
    countEl.textContent = (keyword || status !== 'all') ? `Hiển thị ${filtered.length} / ${messages.length} tin` : `Tổng: ${messages.length} tin`;
  };

  window.applyReviewFilter = function() {
    const keyword = (document.getElementById('review-search').value || '').toLowerCase().trim();
    const rating  = document.getElementById('review-rating-filter').value;
    const filtered = reviews.filter(r => {
      const matchSearch = !keyword || (r.name || '').toLowerCase().includes(keyword) || (r.comment || '').toLowerCase().includes(keyword);
      const matchRating = rating === 'all' || String(r.rating) === rating;
      return matchSearch && matchRating;
    });
    const tb = document.getElementById('reviews-table');
    if (!filtered.length) { tb.innerHTML = '<tr class="empty-row"><td colspan="6">Không tìm thấy review nào</td></tr>'; return; }
    tb.innerHTML = filtered.map(r => {
      const stars = '⭐'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const date  = new Date(r.created_at).toLocaleDateString('en-AU');
      const replyHtml = r.admin_reply ? `<div style="margin-top:6px;font-size:12px;color:var(--accent);font-style:italic">↩ ${escHtml(r.admin_reply)}</div>` : '';
      return `<tr>
        <td><strong>${escHtml(r.name)}</strong></td>
        <td style="color:var(--muted)">${escHtml(r.product_name || '—')}</td>
        <td>${stars}</td>
        <td style="max-width:200px;white-space:normal">${escHtml(r.comment)}${replyHtml}</td>
        <td style="color:var(--muted);white-space:nowrap">${date}</td>
        <td><div class="action-btns">
          <button class="edit-btn" data-id="${r.id}" onclick="openReplyModalById(this)">💬 Reply</button>
          <button class="del-btn"  data-id="${r.id}" onclick="deleteReviewById(this)">🗑️ Delete</button>
        </div></td>
      </tr>`;
    }).join('');
    const countEl = document.getElementById('review-count');
    countEl.textContent = (keyword || rating !== 'all') ? `Hiển thị ${filtered.length} / ${reviews.length} review` : `Tổng: ${reviews.length} review`;
  };

  window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ Đã copy: ' + text));
  };

  window.recalcTotal = function(basePrice) {
    const d = parseFloat(document.getElementById('discount-input').value) || 0;
    const t = Math.max(0, basePrice - d);
    const f = new Intl.NumberFormat('en-AU', { style:'currency', currency:'AUD' });
    document.getElementById('cell-total').textContent = f.format(t);
  };

  window.printInvoice = function(btn) {
    const id = btn.getAttribute('data-id');
    const o  = orders.find(x => String(x.id) === String(id));
    if (!o) return;

    // Tìm thông tin sản phẩm để lấy warranty và specs
    const prod = products.find(x => String(x.id) === String(o.product_id)) || {};
    const warranty = prod.warranty || '';
    const specs    = prod.specs    || '';

    const invoiceNum = 'INV-' + String(o.id).slice(0,8).toUpperCase();
    const today      = new Date().toLocaleDateString('en-AU');
    const pickupDate = o.pickup_date
      ? new Date(o.pickup_date).toLocaleDateString('en-AU') + (o.pickup_time ? ' · ' + o.pickup_time : '')
      : '___/___/______';

    // Warranty checkbox HTML
    const wList = ['3 month', '6 month', '12 month'];
    const wHtml = wList.map(w => {
      const checked = warranty.toLowerCase().includes(w.replace(' month','')) ? '☑' : '☐';
      return `${checked} ${w}`;
    }).join('&nbsp;&nbsp;&nbsp;');

    // Specs list
    const specsHtml = specs
      ? specs.split('\n').filter(s => s.trim()).map(s => `<div>${s.trim()}</div>`).join('')
      : '<div style="color:#888">—</div>';

    const price = prod.price ? prod.price : 0;
    const hasSale = prod.sale_price && prod.sale_price > 0 && prod.sale_price < price;
    const discount = hasSale ? (price - prod.sale_price) : 0;
    const total = hasSale ? prod.sale_price : price;
    const fmtMoney = v => new Intl.NumberFormat('en-AU', { style:'currency', currency:'AUD' }).format(v);
    const priceFormatted    = price ? fmtMoney(price) : '';
    const discountFormatted = hasSale ? fmtMoney(discount) : '';
    const totalFormatted    = price ? fmtMoney(total) : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${invoiceNum}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: 'Times New Roman', Times, serif; font-size:11px; color:#000; background:#fff; padding:30px; max-width:720px; margin:0 auto; }
  h1 { text-align:center; font-size:17px; letter-spacing:2px; text-decoration:underline; margin-bottom:18px; }
  .info-block { margin-bottom:4px; }
  .section { margin:12px 0 4px; font-weight:bold; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; }
  th { background:#555; color:#fff; padding:5px 8px; text-align:left; font-size:11px; }
  td { border:1px solid #999; padding:5px 8px; font-size:11px; vertical-align:top; }
  td.no-border { border:none; padding:3px 8px; }
  th:nth-child(1), td:nth-child(1) { width:70px; }
  th:nth-child(3), td:nth-child(3) { width:35px; text-align:center; }
  th:nth-child(4), td:nth-child(4) { width:95px; text-align:right; }
  th:nth-child(5), td:nth-child(5) { width:95px; text-align:right; }
  th:nth-child(6), td:nth-child(6) { width:60px; text-align:right; }
  th:nth-child(7), td:nth-child(7) { width:95px; text-align:right; }
  .subtotal-row td { border-top:1px solid #555; border-left:none; border-right:none; border-bottom:none; }
  .total-row td { border-top:2px solid #000; border-left:none; border-right:none; border-bottom:none; font-weight:bold; font-size:11px; }
  .label-cell { text-align:right; color:#444; padding-right:12px; }
  .specs-block { border:1px solid #ccc; padding:8px 10px; margin:6px 0; line-height:1.7; font-size:11px; }
  .warranty-row { margin:8px 0; font-size:11px; }
  .terms { margin-top:14px; font-size:11px; line-height:1.7; }
  .terms ul { padding-left:14px; }
  .payment-block { margin:10px 0; font-size:11px; line-height:1.9; }
  .blank { display:inline-block; border-bottom:1px solid #000; min-width:140px; }
  .blank-sm { display:inline-block; border-bottom:1px solid #000; min-width:70px; }
  input.discount-in { width:80px; border:none; border-bottom:1px solid #000; text-align:right; font-size:11px; font-family:inherit; background:transparent; outline:none; }
  @media print { body { padding:16px; } .no-print { display:none; } }
</style>
</head>
<body>
<div class="no-print" style="position:fixed;top:12px;right:12px;display:flex;gap:8px">
  <button onclick="downloadImage()" style="padding:8px 16px;background:#2b6cb0;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:sans-serif">📥 Tải ảnh</button>
  <button onclick="window.print()" style="padding:8px 16px;background:#e05a2b;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:sans-serif">🖨️ In hóa đơn</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script>
function downloadImage(){
  var btns=document.querySelector('.no-print');
  btns.style.display='none';
  html2canvas(document.body,{scale:2,useCORS:true,backgroundColor:'#ffffff'}).then(function(canvas){
    btns.style.display='flex';
    var a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download='invoice-${invoiceNum}.png';
    a.click();
  });
}
<\/script>

<h1>INVOICE</h1>

<div class="info-block"><strong>Business Name:</strong> Huynh Duc Trang</div>
<div class="info-block"><strong>Address:</strong> 46 Yosemite Loop, Ballajura WA 6066</div>
<div class="info-block"><strong>ABN:</strong> 14 758 276 393</div>

<br>
<div class="info-block"><strong>Invoice Number:</strong> ${invoiceNum}</div>
<div class="info-block"><strong>Invoice Date:</strong> ${today}</div>
<div class="info-block"><strong>Pickup:</strong> ${pickupDate}</div>

<br>
<div class="section">Bill To:</div>
<div class="info-block"><strong>Customer Name:</strong> ${o.customer_name || ''}</div>
<div class="info-block"><strong>Phone:</strong> ${o.customer_phone || ''}</div>

<table>
  <thead>
    <tr>
      <th>SKU</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Unit Price (AUD)</th>
      <th>Discount (AUD)</th>
      <th>Tax</th>
      <th>Total (AUD)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${prod.sku || '—'}</td>
      <td>Used Custom Built PC${prod.name ? ' — ' + prod.name : ''}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:right">${priceFormatted}</td>
      <td style="text-align:right">${discountFormatted}</td>
      <td style="text-align:right"></td>
      <td style="text-align:right">${totalFormatted}</td>
    </tr>
    <tr>
      <td colspan="6" class="no-border" style="border:none;text-align:right;font-weight:bold">Total Amount:</td>
      <td class="no-border" style="border-top:2px solid #000;text-align:right;font-weight:bold;font-size:11px">${totalFormatted}</td>
    </tr>
  </tbody>
</table>

<div class="section">Specifications:</div>
<div class="specs-block">${specsHtml}</div>

<div class="section">Payment Method (tick one):</div>
<div class="payment-block">
  ☐ Bank Transfer &nbsp;&nbsp; ☐ PayID &nbsp;&nbsp; ☐ Cash<br><br>
  <strong>Bank Name:</strong> <span class="blank"></span><br>
  <strong>Account Name:</strong> Huynh Duc Trang<br>
  <strong>BSB:</strong> <span class="blank-sm"></span><br>
  <strong>Account Number:</strong> <span class="blank"></span>
</div>

<div class="section">Warranty:</div>
<div class="warranty-row">${wHtml} &nbsp;&nbsp; (hardware only)</div>

<div class="terms">
  <strong>Terms &amp; Conditions</strong>
  <ul>
    <li>Used/refurbished computer, may show minor wear.</li>
    <li>Fully tested and working at time of sale.</li>
    <li>Warranty covers hardware faults only.</li>
    <li>No coverage for software issues, misuse, or physical damage.</li>
    <li>No refunds for change of mind.</li>
  </ul>
</div>

</body>
</html>`;

    const recalcFn = `function recalcTotal(basePrice){
  var d=parseFloat(document.getElementById('discount-input').value)||0;
  var t=Math.max(0,basePrice-d);
  var f=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'});
  document.getElementById('cell-total').textContent=f.format(t);
}`;

    const win = window.open('', '_blank');
    win.document.write(html);
    const s = win.document.createElement('script');
    s.textContent = recalcFn;
    win.document.head.appendChild(s);
    win.document.close();
  };

  window.exportOrdersCSV = function() {
    if (!orders.length) { showToast('Không có đơn hàng nào để export', true); return; }

    const headers = ['Tên khách', 'Số điện thoại', 'Sản phẩm', 'Ngày lấy', 'Giờ lấy', 'Trạng thái', 'Ngày đặt'];
    const rows = orders.map(o => [
      o.customer_name   || '',
      o.customer_phone  || '',
      o.product_name    || '',
      o.pickup_date     || '',
      o.pickup_time     || '',
      o.status          || '',
      o.created_at ? new Date(o.created_at).toLocaleDateString('en-AU') : ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));

    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    a.href     = url;
    a.download = `orders-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✅ Đã export ${orders.length} đơn hàng`);
  };

  window.applyOrderFilter = function() {
    const keyword = (document.getElementById('order-search').value || '').toLowerCase().trim();
    const status  = document.getElementById('order-status-filter').value;

    const filtered = orders.filter(o => {
      const matchSearch = !keyword
        || (o.customer_name  || '').toLowerCase().includes(keyword)
        || (o.customer_phone || '').toLowerCase().includes(keyword)
        || (o.product_name   || '').toLowerCase().includes(keyword);
      const matchStatus = status === 'all' || o.status === status;
      return matchSearch && matchStatus;
    });

    renderOrdersTable(filtered);

    const countEl = document.getElementById('order-count');
    if (keyword || status !== 'all') {
      countEl.textContent = `Hiển thị ${filtered.length} / ${orders.length} đơn`;
    } else {
      countEl.textContent = `Tổng: ${orders.length} đơn`;
    }
  };

  window.updateOrderStatus = async function (sel) {
    const id       = sel.getAttribute('data-id');
    const status   = sel.value;
    const order    = orders.find(o => String(o.id) === String(id));

    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }

    // Tự động cập nhật trạng thái sản phẩm theo đơn hàng
    if (order?.product_id) {
      let productStatus = null;

      if (status === 'done') {
        // Đơn hoàn thành → sản phẩm đã bán
        productStatus = 'sold';
      } else if (status === 'cancelled') {
        // Đơn hủy → mở lại sản phẩm về available
        productStatus = 'available';
      } else if (status === 'pending') {
        // Đơn pending → sản phẩm đang được đặt
        productStatus = 'reserved';
      }

      if (productStatus) {
        const { error: pErr } = await supabase
          .from('products')
          .update({ status: productStatus })
          .eq('id', order.product_id);
        if (pErr) console.warn('Product status update failed:', pErr.message);
        else await loadProducts();
      }
    }

    const labels = { done: 'Completed ✅', pending: 'Pending', cancelled: 'Cancelled' };
    showToast(`✅ Order marked as ${labels[status] || status}`);
    await loadOrders();
    updateStats();
  };

  window.deleteOrderById = async function (btn) {
    const id = btn.getAttribute('data-id');
    const o  = orders.find(x => String(x.id) === String(id));
    if (!o) { showToast('Order not found', true); return; }

    if (!confirm(`Xóa đơn hàng của "${o.customer_name}"?\nHành động này không thể hoàn tác.`)) return;

    // Nếu đơn đang giữ sản phẩm → tự động mở lại về Available
    if (o.product_id && (o.status === 'pending' || o.status === 'confirmed')) {
      await supabase.from('products').update({ status: 'available' }).eq('id', o.product_id);
      await loadProducts();
    }

    const { error } = await supabase.from('orders').delete().eq('id', o.id);
    if (error) {
      console.error('Delete order error:', error);
      showToast('❌ Lỗi xóa đơn hàng: ' + (error.message || error.code || JSON.stringify(error)), true);
      return;
    }
    showToast('🗑️ Đã xóa đơn hàng');
    await loadOrders();
    updateStats();
  };

  function populateProductSelect() {
    const sel = document.getElementById('o-product');
    sel.innerHTML = '<option value="">-- Select a product --</option>' +
      products.map(p => `<option value="${p.id}" data-name="${escHtml(p.name)}">${escHtml(p.name)} – ${formatPrice(p.price)}</option>`).join('');
  }

  window.openOrderModal = function () {
    ['o-name', 'o-phone'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('o-product').value = '';
    const dateInput = document.getElementById('o-date');
    dateInput.min   = new Date().toISOString().split('T')[0];
    dateInput.value = '';
    document.getElementById('o-time').innerHTML = '<option value="">-- Select a date first --</option>';
    document.getElementById('order-modal').classList.add('open');
  };
  window.closeOrderModal = () => document.getElementById('order-modal').classList.remove('open');

  document.getElementById('o-date').addEventListener('change', e => {
    const date = new Date(e.target.value + 'T00:00:00');
    const day  = date.getDay();
    const sel  = document.getElementById('o-time');
    let opts   = [];
    if (day === 0 || day === 6) { for (let h = 8;  h <= 20; h++) opts.push(`${h}:00`); }
    else                        { for (let h = 17; h <= 21; h++) opts.push(`${h}:00`); }
    sel.innerHTML = '<option value="">-- Select a time --</option>' + opts.map(t => `<option value="${t}">${t}</option>`).join('');
  });

  window.saveOrder = async function () {
    const name      = document.getElementById('o-name').value.trim();
    const phone     = document.getElementById('o-phone').value.trim();
    const sel       = document.getElementById('o-product');
    const productId = sel.value || null;
    const productName = sel.options[sel.selectedIndex]?.dataset.name || null;
    const date      = document.getElementById('o-date').value;
    const time      = document.getElementById('o-time').value;
    if (!name || !phone) { showToast('Please enter a name and phone number', true); return; }
    const { error } = await supabase.from('orders').insert({
      customer_name: name, customer_phone: phone,
      product_id: productId, product_name: productName,
      pickup_date: date || null, pickup_time: time || null
    });
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('✅ Order created');
    closeOrderModal();
    await loadOrders();
    updateStats();
  };

  // ─── MESSAGES TABLE ───────────────────────────────────────────────────────
  function renderMessagesTable() {
    applyMessageFilter();
  }

  window.updateMessageStatus = async function (sel) {
    const id     = sel.getAttribute('data-id');
    const status = sel.value;
    const { error } = await supabase.from('messages').update({ status }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('✅ Status updated');
    await loadMessages();
    updateStats();
  };

  // ─── REVIEWS TABLE ────────────────────────────────────────────────────────
  function renderReviewsTable() {
    applyReviewFilter();
  }

  // FIX: use data-id to avoid string/number mismatch
  window.openReplyModalById = function (btn) {
    const id = btn.getAttribute('data-id');
    const r  = reviews.find(x => String(x.id) === String(id));
    if (!r) { showToast('Review not found', true); return; }
    document.getElementById('reply-review-id').value = id;
    document.getElementById('reply-text').value       = r.admin_reply || '';
    document.getElementById('reply-review-preview').innerHTML =
      `<strong>${escHtml(r.name)}</strong> · ${'⭐'.repeat(r.rating)}<br>
       <span style="margin-top:4px;display:block;color:var(--text)">${escHtml(r.comment)}</span>`;
    document.getElementById('reply-modal').classList.add('open');
  };

  window.closeReplyModal = function () {
    document.getElementById('reply-modal').classList.remove('open');
  };

  window.submitReply = async function () {
    const id    = document.getElementById('reply-review-id').value;
    const reply = document.getElementById('reply-text').value.trim();
    if (!reply) { showToast('Please write a reply first', true); return; }

    const btn = document.querySelector('#reply-modal .save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    // Use supabase client (works with anon + RLS) instead of raw fetch with service key
    const { error } = await supabase.from('reviews').update({ admin_reply: reply }).eq('id', id);

    btn.disabled    = false;
    btn.textContent = '💬 Send reply';

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('✅ Reply saved');
    closeReplyModal();
    await loadReviews();
  };

  window.deleteReviewById = async function (btn) {
    const id = btn.getAttribute('data-id');
    const r  = reviews.find(x => String(x.id) === String(id));
    if (!r) { showToast('Review not found', true); return; }
    if (!confirm(`Delete review by "${r.name}"?`)) return;

    // Dùng supabase client với session admin đang đăng nhập
    // RLS policy "authenticated can delete" cho phép điều này
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('🗑️ Review deleted');
    await loadReviews();
  };

  // ─── UTILITIES ────────────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => t.className = 'toast', 3000);
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

