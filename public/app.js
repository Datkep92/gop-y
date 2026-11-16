(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('feedback-form');
  const TOPICS = { price: 'Mức phí', scope: 'Số MST mỗi gói', payment: 'Cách thu phí', free: 'Cơ chế miễn phí', features: 'Công cụ và tính năng', other: 'Ý kiến khác' };
  const STANCES = { reasonable: 'Thấy hợp lý', adjust: 'Muốn điều chỉnh', unsuitable: 'Chưa phù hợp', undecided: 'Chưa có ý kiến' };
  let token, storageAvailable = true, items = [], pending = null, visible = 10, loaded = false, fetching = false, sending = false;
  const apiBase = (window.GOP_Y_CONFIG?.apiBase || '').replace(/\/$/, '');
  function createToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join(''); }
  try {
    token = localStorage.getItem('gop-y-token');
    if (!/^[a-f0-9]{64}$/.test(token || '')) { token = createToken(); localStorage.setItem('gop-y-token', token); }
  } catch { token = createToken(); storageAvailable = false; }
  function node(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el; }
  function message(text, error = false) { $('form-message').textContent = text; $('form-message').classList.toggle('error', error); }
  function draft() {
    if (!storageAvailable) return;
    try { localStorage.setItem('gop-y-draft', JSON.stringify({ scope: form.elements.scope.value, stance: form.elements.stance.value, topic: form.elements.topic.value, content: form.elements.content.value })); } catch { /* A full store must not stop submission. */ }
  }
  function fill(data) {
    if (!data) return;
    for (const key of ['scope', 'stance', 'topic', 'content']) if (typeof data[key] === 'string') form.elements[key].value = data[key];
    $('counter').textContent = `${$('content').value.length.toLocaleString('vi-VN')} / 2.000`;
  }
  try { fill(JSON.parse(localStorage.getItem('gop-y-draft') || 'null')); } catch { /* Ignore a damaged local draft. */ }
  if (!storageAvailable) message('Trình duyệt không cho lưu mã tham gia. Vui lòng cho phép lưu dữ liệu trang rồi tải lại để có thể sửa hoặc rút phiếu.', true);

  async function api(path, options = {}) {
    if (!apiBase) throw new Error('Trang chưa được nối nơi lưu ý kiến. Bạn vẫn có thể đọc phương án dự kiến.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(apiBase + path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Participant-Token': token, ...options.headers } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chưa gửi được yêu cầu. Vui lòng thử lại.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Kết nối bị gián đoạn. Vui lòng thử lại; nội dung đang nhập vẫn được giữ.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function renderSummary() {
    $('feed-count').textContent = items.length;
    $('stat-total').textContent = items.length;
    $('stat-adjust').textContent = `${items.filter(x => x.stance === 'adjust').length}/${items.length}`;
    $('stat-reasonable').textContent = `${items.filter(x => x.stance === 'reasonable').length}/${items.length}`;
    const mine = items.find(x => x.mine);
    $('delete-own').hidden = !mine;
    $('submit').firstChild.textContent = mine ? 'Cập nhật ý kiến của tôi ' : 'Gửi ý kiến của tôi ';
  }
  function render() {
    renderSummary();
    const topic = $('filter').value;
    const list = items.filter(item => topic === 'all' || item.topic === topic).slice().sort((a, b) => $('sort').value === 'liked' ? b.likes - a.likes || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at));
    const root = $('feed-items'); root.replaceChildren();
    if (!list.length) {
      const empty = node('div', 'empty'); empty.append(node('span', '', '“'), node('h4', '', items.length ? 'Chưa có ý kiến cho chủ đề này' : 'Lời góp ý đầu tiên có thể từ bạn'), node('p', '', items.length ? 'Bạn có thể chọn chủ đề khác hoặc chia sẻ góc nhìn của mình.' : 'Không có ý kiến mẫu. Mỗi lời góp ý tại đây đều đến từ người đã gửi phiếu.')); root.append(empty);
    }
    for (const item of list.slice(0, visible)) {
      const card = node('article', `opinion${item.mine ? ' mine' : ''}`);
      const top = node('div', 'opinion-top'), who = node('div');
      who.append(node('div', 'opinion-title', item.mine ? 'Ý kiến của bạn' : `Người tham gia · ${item.id.slice(0, 6).toUpperCase()}`));
      const date = new Date(item.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      who.append(node('div', 'opinion-meta', `${item.scope === '50+' ? 'Trên 50' : item.scope} MST · ${date}${item.updated_at !== item.created_at ? ' · Đã sửa' : ''}`));
      top.append(node('span', 'avatar', '◌'), who, node('span', 'topic-badge', TOPICS[item.topic] || 'Ý kiến khác'));
      const bottom = node('div', 'opinion-bottom'), like = node('button', 'like-button', `${item.liked ? '♥' : '♡'} Đồng tình · ${item.likes}`);
      like.type = 'button'; like.setAttribute('aria-pressed', String(Boolean(item.liked)));
      like.addEventListener('click', async () => {
        like.disabled = true;
        try { await api(`/api/feedback/${item.id}/reaction`, { method: 'POST', body: JSON.stringify({ liked: !item.liked }) }); await refresh(true); }
        catch (error) { message(error.message, true); }
        finally { like.disabled = false; }
      });
      bottom.append(like, node('span', 'opinion-stance', STANCES[item.stance]));
      if (item.mine) { const edit = node('a', 'text-button', 'Sửa phiếu'); edit.href = '#gop-y'; edit.addEventListener('click', () => { fill(item); $('consent').checked = true; }); bottom.append(edit); }
      card.append(top, node('p', 'opinion-body', item.content), bottom, node('div', 'opinion-meta', `Mã ý kiến: ${item.id.slice(0, 6).toUpperCase()}`)); root.append(card);
    }
    $('load-more').hidden = list.length <= visible;
  }
  async function refresh(force = false) {
    if (fetching || (sending && !force)) return;
    fetching = true;
    try {
      const data = await api('/api/feedback');
      $('connection').textContent = 'Đã kết nối · Tự cập nhật mỗi 15 giây'; document.querySelector('.feed-head').classList.add('connected');
      const changed = JSON.stringify(data.items) !== JSON.stringify(items);
      if (!loaded || force) {
        items = data.items; pending = null; $('new-items').hidden = true; render();
        if (!loaded) { const mine = items.find(x => x.mine); if (mine && !$('content').value) fill(mine); }
      } else if (changed) {
        pending = data.items; $('new-items').textContent = 'Có cập nhật mới · Bấm để xem'; $('new-items').hidden = false;
      }
      loaded = true;
    } catch (error) {
      document.querySelector('.feed-head').classList.remove('connected'); $('connection').textContent = loaded ? 'Mất kết nối · Đang giữ dữ liệu lần trước' : 'Chưa kết nối được nơi lưu ý kiến';
      if (!loaded) {
        const empty = node('div', 'empty'); empty.append(node('span', '', '…'), node('h4', '', 'Chưa tải được ý kiến'), node('p', '', error.message));
        const retry = node('button', 'text-button', 'Thử kết nối lại'); retry.type = 'button'; retry.addEventListener('click', () => refresh(true)); empty.append(retry); $('feed-items').replaceChildren(empty);
      }
    } finally { fetching = false; }
  }
  form.addEventListener('input', () => { $('counter').textContent = `${$('content').value.length.toLocaleString('vi-VN')} / 2.000`; draft(); });
  form.addEventListener('change', draft);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending || !form.reportValidity()) return;
    if (!storageAvailable) { message('Cần cho phép lưu dữ liệu trang để giữ quyền sửa hoặc rút phiếu của bạn.', true); return; }
    sending = true; $('submit').disabled = true; message('Đang gửi và chờ xác nhận lưu…');
    try {
      await api('/api/feedback', { method: 'POST', body: JSON.stringify({ scope: form.elements.scope.value, stance: form.elements.stance.value, topic: form.elements.topic.value, content: $('content').value, consent: $('consent').checked }) });
      message('Đã lưu ý kiến. Cảm ơn bạn đã chia sẻ! Bạn có thể sửa hoặc rút phiếu ngay tại đây.');
      await refresh(true);
    } catch (error) { message(error.message, true); }
    finally { sending = false; $('submit').disabled = false; }
  });
  $('delete-own').addEventListener('click', async () => {
    if (!confirm('Rút ý kiến của bạn khỏi trang công khai?')) return;
    $('delete-own').disabled = true;
    try { await api('/api/feedback', { method: 'DELETE', body: '{}' }); form.reset(); try { localStorage.removeItem('gop-y-draft'); } catch {} $('counter').textContent = '0 / 2.000'; message('Đã rút ý kiến của bạn.'); await refresh(true); }
    catch (error) { message(error.message, true); }
    finally { $('delete-own').disabled = false; }
  });
  $('new-items').addEventListener('click', () => { if (pending) { items = pending; pending = null; render(); } $('new-items').hidden = true; });
  for (const id of ['filter', 'sort']) $(id).addEventListener('change', () => { visible = 10; render(); });
  $('load-more').addEventListener('click', () => { visible += 10; render(); });
  document.querySelectorAll('[data-topic]').forEach(link => link.addEventListener('click', () => { $('topic').value = link.dataset.topic; draft(); }));
  $('export').addEventListener('click', () => {
    if (!loaded) { message('Chưa có kết nối để tải dữ liệu.', true); return; }
    // Guard spreadsheet formula injection for all exported user-provided fields.
    const cell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, match => `'${match}`).replaceAll('"', '""')}"`;
    const rows = [['Mã ý kiến', 'Số MST', 'Nhận xét', 'Chủ đề', 'Nội dung', 'Đồng tình', 'Ngày gửi'], ...items.map(x => [x.id, x.scope, STANCES[x.stance], TOPICS[x.topic], x.content, x.likes, x.created_at])];
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = `gop-y-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
