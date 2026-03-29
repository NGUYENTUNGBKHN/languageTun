let currentModel = 'gemini';
let vocabLog = [];      // local cache
const histories = { translate: [] };

const STORAGE_KEY = 'linguaagent_dict_config';
const SB_KEY      = 'linguaagent_supabase';

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────
const DICT_SYSTEM = `Bạn là trợ lý học tiếng Anh cho người Việt Nam. Nhiệm vụ của bạn:

1. Khi người dùng nhập một từ tiếng Anh:
   - Dịch sang tiếng Việt
   - Cung cấp cách đọc phiên âm IPA (ví dụ: /ɪˈfɛm.ər.əl/)
   - Phân loại từ loại (danh từ, động từ, tính từ...)
   - Đưa ra 2–3 mẫu câu sử dụng từ đó trong tiếng Anh giao tiếp hoặc văn viết
   - Đưa ra từ đồng nghĩa (synonyms) và trái nghĩa (antonyms) nếu có
   - Thêm ghi chú ngữ pháp liên quan nếu cần thiết
   - Nếu liên quan, lồng ghép ví dụ với các từ đã học trước đó trong cuộc trò chuyện

2. Khi người dùng nhập một từ tiếng Việt:
   - Dịch sang tiếng Anh
   - Cung cấp cách đọc phiên âm IPA của từ tiếng Anh
   - Đưa ra mẫu câu sử dụng từ tiếng Anh đó
   - Đưa ra từ đồng nghĩa và trái nghĩa trong tiếng Anh

3. Nếu người dùng sai chính tả: tự động sửa lại và tra từ đúng, ghi chú "Bạn có thể muốn hỏi: [từ đúng]".

4. Định dạng câu trả lời rõ ràng, sử dụng emoji phù hợp, dễ đọc.

5. Cuối mỗi câu trả lời, thêm dòng: [VOCAB:từ tiếng Anh:nghĩa tiếng Việt] để lưu vào danh sách từ vựng.

Trả lời bằng tiếng Việt, chỉ phần ví dụ câu mới dùng tiếng Anh.`;

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────
let sbUrl = '';
let sbKey = '';

function getSupabaseConfig() {
  try {
    const s = localStorage.getItem(SB_KEY);
    if (s) { const c = JSON.parse(s); sbUrl = c.url || ''; sbKey = c.key || ''; }
  } catch(e) {}
}

function saveSupabase() {
  sbUrl = document.getElementById('supabaseUrl').value.trim().replace(/\/$/, '');
  sbKey = document.getElementById('supabaseKey').value.trim();
  if (!sbUrl || !sbKey) { setSupabaseStatus('⚠️ Vui lòng nhập đủ URL và Key', 'warn'); return; }
  localStorage.setItem(SB_KEY, JSON.stringify({ url: sbUrl, key: sbKey }));
  testSupabase();
}

async function testSupabase() {
  setSupabaseStatus('🔄 Đang kiểm tra...', 'muted');
  try {
    const res = await sbFetch('GET', '?limit=1');
    if (res.ok) {
      setSupabaseStatus('✅ Đã kết nối Supabase!', 'ok');
      document.getElementById('dbStatusRow').style.display = 'flex';
      syncLocalToCloud();
    } else {
      const d = await res.json();
      setSupabaseStatus('❌ Lỗi: ' + (d.message || d.hint || res.status), 'err');
    }
  } catch(e) {
    setSupabaseStatus('❌ ' + e.message, 'err');
  }
}

function setSupabaseStatus(msg, type) {
  const el = document.getElementById('supabaseStatus');
  const colors = { ok: 'var(--accent-test)', err: 'var(--accent-jp)', warn: '#f7c94f', muted: 'var(--muted)' };
  el.textContent = msg;
  el.style.color = colors[type] || 'var(--muted)';
}

function sbFetch(method, query, body) {
  const opts = {
    method,
    headers: {
      'apikey': sbKey,
      'Authorization': 'Bearer ' + sbKey,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=ignore-duplicates' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${sbUrl}/rest/v1/vocabulary${query}`, opts);
}

async function saveWordToCloud(word, meaning) {
  if (!sbUrl || !sbKey) return;
  try {
    await sbFetch('POST', '', { word, meaning });
    refreshCloudCount();
  } catch(e) { console.warn('Cloud save failed:', e); }
}

async function syncLocalToCloud() {
  if (!sbUrl || !sbKey || vocabLog.length === 0) return;
  try {
    const rows = vocabLog.map(v => ({ word: v.word, meaning: v.meaning }));
    await sbFetch('POST', '', rows);
    refreshCloudCount();
  } catch(e) { console.warn('Sync failed:', e); }
}

async function loadFromCloud() {
  if (!sbUrl || !sbKey) return;
  try {
    const res = await sbFetch('GET', '?order=created_at.desc&limit=500');
    if (!res.ok) return;
    const data = await res.json();
    // Merge cloud into local (cloud is source of truth)
    data.forEach(row => {
      if (!vocabLog.find(v => v.word === row.word)) {
        vocabLog.push({ word: row.word, meaning: row.meaning, date: row.created_at });
      }
    });
    document.getElementById('enCount').textContent = vocabLog.length;
    saveLocalConfig();
    renderVocabList();
    refreshCloudCount(data.length);
  } catch(e) { console.warn('Cloud load failed:', e); }
}

async function deleteWordFromCloud(word) {
  if (!sbUrl || !sbKey) return;
  try {
    await sbFetch('DELETE', `?word=eq.${encodeURIComponent(word)}`);
    refreshCloudCount();
  } catch(e) { console.warn('Cloud delete failed:', e); }
}

async function refreshCloudCount(count) {
  if (!sbUrl || !sbKey) return;
  if (count !== undefined) {
    document.getElementById('dbCount').textContent = count;
    document.getElementById('dbStatusRow').style.display = 'flex';
    return;
  }
  try {
    const res = await sbFetch('GET', '?select=id');
    if (res.ok) {
      const d = await res.json();
      document.getElementById('dbCount').textContent = d.length;
      document.getElementById('dbStatusRow').style.display = 'flex';
    }
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
// LOCAL STORAGE
// ─────────────────────────────────────────────────────────────
function saveLocalConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    apiKey: getApiKey(),
    model: currentModel,
    vocabLog
  }));
}

function loadLocalConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const c = JSON.parse(saved);
      if (c.apiKey) document.getElementById('apiKey').value = c.apiKey;
      if (c.model) setModel(c.model);
      if (c.vocabLog) { vocabLog = c.vocabLog; document.getElementById('enCount').textContent = vocabLog.length; }
    }
  } catch(e) {}
}

function exportToJSON() {
  const blob = new Blob([JSON.stringify({ apiKey: getApiKey(), model: currentModel, vocabLog, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lingua_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function importFromJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const c = JSON.parse(e.target.result);
      if (c.apiKey) document.getElementById('apiKey').value = c.apiKey;
      if (c.model) setModel(c.model);
      if (c.vocabLog) { vocabLog = c.vocabLog; document.getElementById('enCount').textContent = vocabLog.length; }
      saveLocalConfig(); renderVocabList();
      alert('Nhập dữ liệu thành công!');
    } catch(err) { alert('Lỗi: ' + err.message); }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────────────────────
// VOCAB LIST UI
// ─────────────────────────────────────────────────────────────
function renderVocabList() {
  const wrap = document.getElementById('vocabTableWrap');
  const q = (document.getElementById('vocabSearch')?.value || '').toLowerCase();
  const filtered = vocabLog.filter(v => v.word.toLowerCase().includes(q) || (v.meaning||'').toLowerCase().includes(q));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="flex:none;padding:3rem 0;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${q ? 'Không tìm thấy' : 'Chưa có từ nào'}</div>
      <div class="empty-sub">${q ? 'Thử từ khóa khác.' : 'Hãy tra từ trong Dictionary.'}</div>
    </div>`;
    return;
  }

  let html = `<table class="vocab-table">
    <thead><tr><th>#</th><th>Từ tiếng Anh</th><th>Nghĩa tiếng Việt</th><th>Ngày học</th><th></th></tr></thead><tbody>`;
  filtered.slice().reverse().forEach((v, i) => {
    const date = v.date ? new Date(v.date).toLocaleDateString('vi-VN') : '—';
    html += `<tr>
      <td style="color:var(--muted);font-size:12px;">${filtered.length - i}</td>
      <td><strong style="color:var(--accent-trans)">${escapeHtml(v.word)}</strong></td>
      <td>${escapeHtml(v.meaning || '')}</td>
      <td style="color:var(--muted);font-size:12px;">${date}</td>
      <td><button onclick="deleteWord('${escapeHtml(v.word)}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 6px;" title="Xóa">✕</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function deleteWord(word) {
  vocabLog = vocabLog.filter(v => v.word !== word);
  document.getElementById('enCount').textContent = vocabLog.length;
  saveLocalConfig();
  renderVocabList();
  deleteWordFromCloud(word);
}

function exportVocabCSV() {
  if (vocabLog.length === 0) { alert('Chưa có từ nào để export!'); return; }
  const rows = [['Word', 'Meaning', 'Date']].concat(
    vocabLog.map(v => [v.word, v.meaning || '', v.date ? new Date(v.date).toLocaleDateString('vi-VN') : ''])
  );
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `vocabulary_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ─────────────────────────────────────────────────────────────
// SUPABASE GUIDE
// ─────────────────────────────────────────────────────────────
function showSupabaseGuide() {
  const el = document.getElementById('supabaseGuide');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function copySQL() {
  const sql = document.getElementById('sqlCode').textContent;
  navigator.clipboard.writeText(sql).then(() => alert('Đã copy SQL!'));
}

// ─────────────────────────────────────────────────────────────
// MODEL SELECTION
// ─────────────────────────────────────────────────────────────
const MODEL_INFO = {
  gemini: { label: '✨ Gemini 2.5 Flash', placeholder: 'AIza... (Google AI Studio - Miễn phí)' },
  gpt:    { label: '🤖 GPT-4o mini',      placeholder: 'sk-... (OpenAI API Key)' },
  claude: { label: '⚡ Claude Sonnet',    placeholder: 'sk-ant-... (Anthropic API Key)' }
};

function setModel(m) {
  currentModel = m;
  ['gemini','gpt','claude'].forEach(id => {
    const c = document.getElementById('card-' + id);
    if (c) c.className = 'model-card' + (m === id ? ' selected-' + id : '');
  });
  const info = MODEL_INFO[m];
  const input = document.getElementById('apiKey');
  if (input) { input.placeholder = info.placeholder; input.value = ''; }
  const hints = {
    gemini: '✨ <strong>Gemini hoàn toàn miễn phí</strong> — Lấy key tại <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a>',
    gpt: '🤖 Lấy key tại <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a> (trả phí)',
    claude: '⚡ Lấy key tại <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> (trả phí)'
  };
  const hint = document.getElementById('keyHint');
  if (hint) hint.innerHTML = hints[m];
  document.getElementById('headerModel').textContent = info.label;
  updateStatus(false, 'Not connected');
}

function saveKey() {
  const key = getApiKey();
  if (!key) { updateStatus(false, 'Vui lòng nhập API key!'); return; }
  let valid = false;
  if (currentModel === 'gemini' && key.startsWith('AIza') && key.length > 20) valid = true;
  if (currentModel === 'gpt' && key.startsWith('sk-') && !key.startsWith('sk-ant-') && key.length > 20) valid = true;
  if (currentModel === 'claude' && key.startsWith('sk-ant-')) valid = true;
  if (!valid) { updateStatus(false, 'Key không hợp lệ'); return; }
  const labels = { gemini: '✓ Gemini sẵn sàng', gpt: '✓ GPT sẵn sàng', claude: '✓ Claude sẵn sàng' };
  updateStatus(true, labels[currentModel]);
  const btn = document.getElementById('saveBtn');
  btn.textContent = '✓ Đã lưu!'; btn.classList.add('saved');
  setTimeout(() => { btn.textContent = 'Save & Connect'; btn.classList.remove('saved'); }, 2000);
  saveLocalConfig();
}

function getApiKey() { return document.getElementById('apiKey').value.trim(); }

function updateStatus(ok, msg) {
  ['apiStatus','apiStatusSettings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'api-status' + (ok ? '' : ' error'); }
  });
}

// ─────────────────────────────────────────────────────────────
// API CALL
// ─────────────────────────────────────────────────────────────
async function callAPI(system, messages) {
  const key = getApiKey();
  if (!key) throw new Error('Chưa có API Key! Vào Settings để cài đặt.');

  if (currentModel === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 1000 }
        }) }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;

  } else if (currentModel === 'gpt') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1000, messages: [{ role: 'system', content: system }, ...messages] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;

  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  }
}

// ─────────────────────────────────────────────────────────────
// TAB / CHAT
// ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'trans', 'vocab'));
  document.getElementById('tab-' + tab).classList.add('active');
  const btn = document.getElementById('nav-' + tab);
  if (btn) {
    btn.classList.add('active');
    if (tab === 'translate') btn.classList.add('trans');
    if (tab === 'vocab') btn.classList.add('vocab');
  }
  if (tab === 'vocab') renderVocabList();
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function quickSend(text) {
  document.getElementById('input-translate').value = text;
  sendMessage();
}

function escapeHtml(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--surface2);padding:1px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/\n/g, '<br>');
}

function appendMsg(role, text) {
  const container = document.getElementById('chat-translate');
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const avInfo = role === 'user' ? ['Bạn','user'] : ['Dic','agent-trans'];
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + (role === 'user' ? 'user' : '');
  const cleanText = text.replace(/\[VOCAB.*?\]/g, '').trim();
  msgDiv.innerHTML = `
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role === 'user' ? 'user' : ''}">${role === 'assistant' ? formatMarkdown(cleanText) : escapeHtml(cleanText)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;

  if (role === 'assistant') {
    const matches = [...text.matchAll(/\[VOCAB:(.*?):(.*?)\]/g)];
    matches.forEach(m => {
      const word = m[1].trim(), meaning = m[2].trim();
      if (word && !vocabLog.find(v => v.word === word)) {
        const entry = { word, meaning, date: new Date().toISOString() };
        vocabLog.push(entry);
        saveWordToCloud(word, meaning);
      }
    });
    document.getElementById('enCount').textContent = vocabLog.length;
    saveLocalConfig();
  }
}

async function sendMessage() {
  const input = document.getElementById('input-translate');
  const text = input.value.trim();
  if (!text) return;
  appendMsg('user', text);
  input.value = '';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  const container = document.getElementById('chat-translate');
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;

  try {
    const msgs = histories.translate.concat({ role: 'user', content: text });
    const response = await callAPI(DICT_SYSTEM, msgs);
    indicator.remove();
    appendMsg('assistant', response);
    histories.translate.push({ role: 'user', content: text }, { role: 'assistant', content: response });
    if (histories.translate.length > 20) histories.translate.splice(0, 2);
  } catch(err) {
    indicator.remove();
    appendMsg('assistant', '❌ Lỗi: ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadLocalConfig();
  getSupabaseConfig();
  // Load supabase credentials into settings UI
  if (sbUrl) document.getElementById('supabaseUrl').value = sbUrl;
  if (sbKey) document.getElementById('supabaseKey').value = sbKey;
  if (sbUrl && sbKey) {
    setSupabaseStatus('✅ Đã cấu hình', 'ok');
    loadFromCloud();
  }
});