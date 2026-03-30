// ═══════════════════════════════════════════════════════════════
//  CONFIG — điền thông tin Supabase của bạn vào đây
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://rknbxrqlzgjmiylqihno.supabase.co';   // ← dán Project URL vào đây,  vd: https://xxxx.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrbmJ4cnFsemdqbWl5bHFpaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQ0NDEsImV4cCI6MjA5MDM3MDQ0MX0.BzkXWgEKYv5MdMwwS3o1Ht9QY5syzITNoobK8nnHv9g';   // ← dán anon public key vào đây

// ═══════════════════════════════════════════════════════════════
let currentModel = 'gemini';
let vocabLog = [];
const histories = { translate: [] };
const STORAGE_KEY = 'linguaagent_local';

// API keys loaded from Supabase settings table
let apiKeys = { gemini: '', gpt: '', claude: '' };

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
   - Nếu liên quan, lồng ghép ví dụ với các từ đã học trước đó

2. Khi người dùng nhập một từ tiếng Việt:
   - Dịch sang tiếng Anh
   - Cung cấp cách đọc phiên âm IPA của từ tiếng Anh
   - Đưa ra mẫu câu sử dụng từ tiếng Anh đó
   - Đưa ra từ đồng nghĩa và trái nghĩa trong tiếng Anh

3. Nếu người dùng sai chính tả: tự động sửa và ghi chú "Bạn có thể muốn hỏi: [từ đúng]".

4. Định dạng câu trả lời rõ ràng, dùng emoji, dễ đọc.

5. QUAN TRỌNG — Cuối mỗi câu trả lời, thêm đúng 4 dòng metadata:
[VOCAB:từ tiếng Anh:nghĩa tiếng Việt ngắn gọn]
[EXAMPLE:một câu mẫu tiếng Anh hay nhất minh họa từ đó]
[SYN:từ đồng nghĩa 1, từ đồng nghĩa 2, từ đồng nghĩa 3]
[ANT:từ trái nghĩa 1, từ trái nghĩa 2]

Nếu không có từ đồng nghĩa hoặc trái nghĩa thì để trống: [SYN:] hoặc [ANT:]
Trả lời bằng tiếng Việt, chỉ phần ví dụ câu dùng tiếng Anh.`;

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  const colors = { info: 'var(--accent-trans)', ok: 'var(--accent-test)', warn: '#f7c94f', dup: '#f7a94f' };
  el.innerHTML = msg;
  el.style.borderColor = colors[type] || 'var(--border2)';
  el.style.color = colors[type] || 'var(--text)';
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(80px)';
  }, 3200);
}

// ─────────────────────────────────────────────────────────────
// SUPABASE CORE  — fixed credentials, no UI input needed
// ─────────────────────────────────────────────────────────────
function sbReady() { return SUPABASE_URL && SUPABASE_ANON; }

function sbFetch(table, method, query = '', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, opts);
}

// ─── Settings table: save / load API keys ───────────────────
async function saveApiKeysToCloud() {
  if (!sbReady()) return;
  const rows = [
    { key: 'api_gemini', value: apiKeys.gemini },
    { key: 'api_gpt',    value: apiKeys.gpt },
    { key: 'api_claude', value: apiKeys.claude },
    { key: 'model',      value: currentModel }
  ];
  try {
    await sbFetch('settings', 'POST', '', rows);
  } catch(e) { console.warn('Settings save failed:', e); }
}

async function loadApiKeysFromCloud() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('settings', 'GET', '?key=in.(api_gemini,api_gpt,api_claude,model)');
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(r => {
      if (r.key === 'api_gemini') apiKeys.gemini = r.value || '';
      if (r.key === 'api_gpt')    apiKeys.gpt    = r.value || '';
      if (r.key === 'api_claude') apiKeys.claude  = r.value || '';
      if (r.key === 'model')      currentModel   = r.value || 'gemini';
    });
    // Populate Settings UI
    const gEl = document.getElementById('key-gemini');
    const pEl = document.getElementById('key-gpt');
    const cEl = document.getElementById('key-claude');
    if (gEl && apiKeys.gemini) gEl.value = apiKeys.gemini;
    if (pEl && apiKeys.gpt)    pEl.value = apiKeys.gpt;
    if (cEl && apiKeys.claude) cEl.value = apiKeys.claude;
    setModel(currentModel);
    updateKeyStatus();
  } catch(e) { console.warn('Settings load failed:', e); }
}

function getActiveKey() { return apiKeys[currentModel] || ''; }

function updateKeyStatus() {
  const hasKey = !!getActiveKey();
  updateStatus(hasKey, hasKey
    ? { gemini:'✓ Gemini sẵn sàng', gpt:'✓ GPT sẵn sàng', claude:'✓ Claude sẵn sàng' }[currentModel]
    : 'Chưa có API key');
}

// ─── Vocabulary table ────────────────────────────────────────
async function saveWordToCloud(entry) {
  if (!sbReady()) return;
  try {
    await sbFetch('vocabulary', 'POST', '', {
      word: entry.word, meaning: entry.meaning,
      example: entry.example || null,
      synonyms: entry.synonyms || null,
      antonyms: entry.antonyms || null
    });
    refreshCloudCount();
  } catch(e) { console.warn('Word save failed:', e); }
}

async function loadVocabFromCloud() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('vocabulary', 'GET', '?order=created_at.desc&limit=1000');
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(row => {
      if (!vocabLog.find(v => v.word.toLowerCase() === row.word.toLowerCase())) {
        vocabLog.push({
          word: row.word, meaning: row.meaning,
          example: row.example || '', synonyms: row.synonyms || '',
          antonyms: row.antonyms || '', date: row.created_at
        });
      }
    });
    document.getElementById('enCount').textContent = vocabLog.length;
    document.getElementById('dbCount').textContent = data.length;
    document.getElementById('dbStatusRow').style.display = 'flex';
    saveLocalCache();
    renderVocabList();
  } catch(e) { console.warn('Vocab load failed:', e); }
}

async function deleteWordFromCloud(word) {
  if (!sbReady()) return;
  try { await sbFetch('vocabulary', 'DELETE', `?word=eq.${encodeURIComponent(word)}`); }
  catch(e) {}
}

async function refreshCloudCount() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('vocabulary', 'GET', '?select=id');
    if (res.ok) {
      const d = await res.json();
      document.getElementById('dbCount').textContent = d.length;
      document.getElementById('dbStatusRow').style.display = 'flex';
    }
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
// LOCAL CACHE  (vocab only, no keys)
// ─────────────────────────────────────────────────────────────
function saveLocalCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ vocabLog, model: currentModel }));
}

function loadLocalCache() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const c = JSON.parse(s);
      if (c.vocabLog) { vocabLog = c.vocabLog; document.getElementById('enCount').textContent = vocabLog.length; }
      if (c.model)    currentModel = c.model;
    }
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
// SAVE API KEYS from UI
// ─────────────────────────────────────────────────────────────
async function saveAllKeys() {
  const g = document.getElementById('key-gemini').value.trim();
  const p = document.getElementById('key-gpt').value.trim();
  const c = document.getElementById('key-claude').value.trim();

  // Basic validation
  const errs = [];
  if (g && !g.startsWith('AIza'))   errs.push('Gemini key phải bắt đầu bằng AIza...');
  if (p && !p.startsWith('sk-') || (p && p.startsWith('sk-ant-'))) {
    if (p && (!p.startsWith('sk-') || p.startsWith('sk-ant-'))) errs.push('GPT key phải bắt đầu bằng sk-...');
  }
  if (c && !c.startsWith('sk-ant-')) errs.push('Claude key phải bắt đầu bằng sk-ant-...');
  if (errs.length) { showToast('⚠️ ' + errs[0], 'warn'); return; }

  apiKeys.gemini = g;
  apiKeys.gpt    = p;
  apiKeys.claude = c;

  const btn = document.getElementById('saveKeysBtn');
  btn.textContent = '🔄 Đang lưu...';
  btn.disabled = true;

  if (sbReady()) {
    await saveApiKeysToCloud();
    showToast('✅ Đã lưu API keys lên cloud!', 'ok');
  } else {
    showToast('⚠️ Supabase chưa cấu hình — key chỉ lưu tạm', 'warn');
  }

  updateKeyStatus();
  btn.textContent = '✓ Đã lưu!';
  setTimeout(() => { btn.textContent = '💾 Lưu tất cả'; btn.disabled = false; }, 2000);
}

// ─────────────────────────────────────────────────────────────
// VOCAB LIST  — expandable rows
// ─────────────────────────────────────────────────────────────
let expandedWord = null;

function renderVocabList() {
  const wrap = document.getElementById('vocabTableWrap');
  const q = (document.getElementById('vocabSearch')?.value || '').toLowerCase();
  const filtered = vocabLog.filter(v =>
    v.word.toLowerCase().includes(q) ||
    (v.meaning||'').toLowerCase().includes(q) ||
    (v.synonyms||'').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="flex:none;padding:3rem 0;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${q ? 'Không tìm thấy' : 'Chưa có từ nào'}</div>
      <div class="empty-sub">${q ? 'Thử từ khóa khác.' : 'Hãy tra từ trong Dictionary.'}</div>
    </div>`; return;
  }

  const list = filtered.slice().reverse();
  let html = `<table class="vocab-table">
    <thead><tr>
      <th>#</th><th>Từ tiếng Anh</th><th>Nghĩa</th><th>Đồng nghĩa</th><th>Ngày học</th><th></th>
    </tr></thead><tbody>`;

  list.forEach((v, i) => {
    const date = v.date ? new Date(v.date).toLocaleDateString('vi-VN') : '—';
    const isOpen = expandedWord === v.word;
    const sw = v.word.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    html += `<tr class="vocab-row-main ${isOpen?'row-open':''}" onclick="toggleExpand('${sw}')">
      <td style="color:var(--muted);font-size:12px;">${list.length-i}</td>
      <td><strong style="color:var(--accent-trans)">${escapeHtml(v.word)}</strong></td>
      <td>${escapeHtml(v.meaning||'')}</td>
      <td style="color:var(--muted);font-size:12px;">${escapeHtml((v.synonyms||'').split(',').slice(0,2).join(', '))}</td>
      <td style="color:var(--muted);font-size:12px;">${date}</td>
      <td style="white-space:nowrap;">
        <span style="color:var(--muted);font-size:11px;margin-right:6px;">${isOpen?'▲':'▼'}</span>
        <button onclick="deleteWord('${sw}');event.stopPropagation()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px;">✕</button>
      </td></tr>`;

    if (isOpen) {
      html += `<tr class="vocab-row-detail"><td colspan="6"><div class="vocab-detail-box">
        ${v.example  ? `<div class="vd-row"><span class="vd-label">💬 Câu mẫu</span><span class="vd-val example-text">${escapeHtml(v.example)}</span></div>` : ''}
        ${v.synonyms ? `<div class="vd-row"><span class="vd-label">🔗 Đồng nghĩa</span><span class="vd-val syn-text">${escapeHtml(v.synonyms)}</span></div>` : ''}
        ${v.antonyms ? `<div class="vd-row"><span class="vd-label">↔️ Trái nghĩa</span><span class="vd-val ant-text">${escapeHtml(v.antonyms)}</span></div>` : ''}
        ${!v.example&&!v.synonyms&&!v.antonyms ? `<div style="color:var(--muted);font-size:13px;">Không có dữ liệu mở rộng.</div>` : ''}
      </div></td></tr>`;
    }
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function toggleExpand(word) { expandedWord = expandedWord===word?null:word; renderVocabList(); }

function deleteWord(word) {
  if (expandedWord===word) expandedWord=null;
  vocabLog = vocabLog.filter(v=>v.word!==word);
  document.getElementById('enCount').textContent = vocabLog.length;
  saveLocalCache(); renderVocabList(); deleteWordFromCloud(word);
  showToast(`🗑️ Đã xóa "<strong>${word}</strong>"`, 'info');
}

function exportVocabCSV() {
  if (!vocabLog.length) { showToast('Chưa có từ nào!','warn'); return; }
  const rows = [['Word','Meaning','Example','Synonyms','Antonyms','Date']].concat(
    vocabLog.map(v=>[v.word,v.meaning||'',v.example||'',v.synonyms||'',v.antonyms||'',
      v.date?new Date(v.date).toLocaleDateString('vi-VN'):''])
  );
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download = `vocabulary_${new Date().toISOString().split('T')[0]}.csv`; a.click();
}

function exportToJSON() {
  const blob = new Blob([JSON.stringify({vocabLog,model:currentModel,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`lingua_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
}

function importFromJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const c = JSON.parse(e.target.result);
      if (c.vocabLog) { vocabLog=c.vocabLog; document.getElementById('enCount').textContent=vocabLog.length; }
      if (c.model) currentModel=c.model;
      saveLocalCache(); renderVocabList();
      showToast('✅ Import thành công!','ok');
    } catch(err) { showToast('❌ Lỗi: '+err.message); }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────────────────────
// FLASHCARD ENGINE
// ─────────────────────────────────────────────────────────────
let fcDeck=[],fcIndex=0,fcFlipped=false,fcCorrect=0,fcWrong=0,fcWrongWords=[];

function startFlashcards(shuffle=false,deck=null) {
  const words = deck||[...vocabLog];
  if (!words.length) {
    document.getElementById('fc-empty').style.display='flex';
    document.getElementById('fc-main').style.display='none';
    document.getElementById('fc-results').style.display='none'; return;
  }
  fcDeck=shuffle?words.sort(()=>Math.random()-0.5):words.slice().reverse();
  fcIndex=fcCorrect=fcWrong=0; fcWrongWords=[];
  document.getElementById('fc-empty').style.display='none';
  document.getElementById('fc-results').style.display='none';
  document.getElementById('fc-main').style.display='flex';
  showCard();
}

function reviewWrong() {
  if (!fcWrongWords.length){showToast('Không có từ cần ôn lại!','ok');return;}
  startFlashcards(true,fcWrongWords);
}

function showCard() {
  if (fcIndex>=fcDeck.length){showResults();return;}
  const v=fcDeck[fcIndex];
  document.getElementById('fc-word').textContent=v.word;
  document.getElementById('fc-meaning').textContent=v.meaning||'—';
  const exEl=document.getElementById('fc-example');
  const synEl=document.getElementById('fc-syn');
  const antEl=document.getElementById('fc-ant');
  exEl.style.display=v.example?'flex':'none';
  synEl.style.display=v.synonyms?'flex':'none';
  antEl.style.display=v.antonyms?'flex':'none';
  if(v.example)  document.getElementById('fc-example-val').textContent=v.example;
  if(v.synonyms) document.getElementById('fc-syn-val').textContent=v.synonyms;
  if(v.antonyms) document.getElementById('fc-ant-val').textContent=v.antonyms;
  document.getElementById('fc-progress').textContent=`${fcIndex+1} / ${fcDeck.length}`;
  fcFlipped=false;
  document.getElementById('fc-card').classList.remove('flipped');
  document.getElementById('fc-actions').style.display='none';
  document.getElementById('fc-hint-reveal').style.display='block';
}

function flipCard() {
  fcFlipped=!fcFlipped;
  document.getElementById('fc-card').classList.toggle('flipped',fcFlipped);
  document.getElementById('fc-actions').style.display=fcFlipped?'flex':'none';
  document.getElementById('fc-hint-reveal').style.display=fcFlipped?'none':'block';
}

function fcAnswer(correct) {
  if(correct){fcCorrect++;showToast('✓ Tốt lắm!','ok');}
  else{fcWrong++;fcWrongWords.push(fcDeck[fcIndex]);showToast('✗ Ôn thêm nhé!','dup');}
  fcIndex++;setTimeout(showCard,300);
}

function showResults() {
  document.getElementById('fc-main').style.display='none';
  document.getElementById('fc-results').style.display='flex';
  document.getElementById('fc-correct-count').textContent=fcCorrect;
  document.getElementById('fc-wrong-count').textContent=fcWrong;
  document.getElementById('fc-retry-wrong-btn').style.display=fcWrong>0?'block':'none';
}

// ─────────────────────────────────────────────────────────────
// MODEL SELECTION
// ─────────────────────────────────────────────────────────────
const MODEL_INFO = {
  gemini: { label:'✨ Gemini 2.5 Flash' },
  gpt:    { label:'🤖 GPT-4o mini' },
  claude: { label:'⚡ Claude Sonnet' }
};

function setModel(m) {
  currentModel=m;
  ['gemini','gpt','claude'].forEach(id=>{
    const c=document.getElementById('card-'+id);
    if(c) c.className='model-card'+(m===id?' selected-'+id:'');
  });
  document.getElementById('headerModel').textContent=MODEL_INFO[m]?.label||m;
  updateKeyStatus();
  saveLocalCache();
}

function updateStatus(ok, msg) {
  ['apiStatus','apiStatusSettings'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.textContent=msg;el.className='api-status'+(ok?'':' error');}
  });
}

// ─────────────────────────────────────────────────────────────
// API CALL
// ─────────────────────────────────────────────────────────────
async function callAPI(system, messages) {
  const key = getActiveKey();
  if (!key) throw new Error('Chưa có API key cho '+currentModel+'! Vào Settings để nhập.');

  if (currentModel==='gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          system_instruction:{parts:[{text:system}]},
          contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
          generationConfig:{maxOutputTokens:1200}
        })}
    );
    const data=await res.json();
    if(data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;

  } else if (currentModel==='gpt') {
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:1200,messages:[{role:'system',content:system},...messages]})
    });
    const data=await res.json();
    if(data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;

  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,system,messages})
    });
    const data=await res.json();
    if(data.error) throw new Error(data.error.message);
    return data.content[0].text;
  }
}

// ─────────────────────────────────────────────────────────────
// PARSE metadata
// ─────────────────────────────────────────────────────────────
function parseMeta(text) {
  const get = tag => { const m=text.match(new RegExp(`\\[${tag}:(.*?)\\]`)); return m?m[1].trim():''; };
  const vocab = get('VOCAB');
  return {
    word:     vocab.split(':')[0].trim(),
    meaning:  vocab.split(':').slice(1).join(':').trim(),
    example:  get('EXAMPLE'),
    synonyms: get('SYN'),
    antonyms: get('ANT')
  };
}

// ─────────────────────────────────────────────────────────────
// TAB / CHAT
// ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active','trans','vocab-nav','flash-nav'));
  document.getElementById('tab-'+tab).classList.add('active');
  const btn=document.getElementById('nav-'+tab);
  if(btn){btn.classList.add('active');btn.classList.add(tab==='translate'?'trans':tab==='vocab'?'vocab-nav':'flash-nav');}
  if(tab==='vocab') renderVocabList();
  if(tab==='flashcard'&&(fcDeck.length===0||fcIndex>=fcDeck.length)) startFlashcards(false);
}

function handleKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}
function quickSend(text){document.getElementById('input-translate').value=text;sendMessage();}
function escapeHtml(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function formatMarkdown(text){
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`(.*?)`/g,'<code style="background:var(--surface2);padding:1px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/\n/g,'<br>');
}

function appendMsg(role, text) {
  const container=document.getElementById('chat-translate');
  const empty=container.querySelector('.empty-state');
  if(empty) empty.remove();
  const avInfo=role==='user'?['Bạn','user']:['Dic','agent-trans'];
  const msgDiv=document.createElement('div');
  msgDiv.className='msg '+(role==='user'?'user':'');
  const cleanText=text.replace(/\[(VOCAB|EXAMPLE|SYN|ANT):.*?\]/g,'').trim();
  msgDiv.innerHTML=`
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role==='user'?'user':''}">${role==='assistant'?formatMarkdown(cleanText):escapeHtml(cleanText)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop=container.scrollHeight;

  if(role==='assistant') {
    if(!/\[VOCAB:/.test(text)) return;
    const meta=parseMeta(text);
    if(!meta.word) return;
    const exists=vocabLog.find(v=>v.word.toLowerCase()===meta.word.toLowerCase());
    if(exists){showToast(`📌 Từ "<strong>${meta.word}</strong>" đã có trong danh sách!`,'dup');return;}
    const entry={word:meta.word,meaning:meta.meaning,example:meta.example,synonyms:meta.synonyms,antonyms:meta.antonyms,date:new Date().toISOString()};
    vocabLog.push(entry);
    saveWordToCloud(entry);
    showToast(`✅ Đã lưu "<strong>${meta.word}</strong>"`,'ok');
    document.getElementById('enCount').textContent=vocabLog.length;
    saveLocalCache();
  }
}

async function sendMessage() {
  const input=document.getElementById('input-translate');
  const text=input.value.trim();
  if(!text) return;
  appendMsg('user',text);
  input.value='';
  const indicator=document.createElement('div');
  indicator.className='typing-indicator';
  indicator.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  const container=document.getElementById('chat-translate');
  container.appendChild(indicator);
  container.scrollTop=container.scrollHeight;
  try {
    const msgs=histories.translate.concat({role:'user',content:text});
    const response=await callAPI(DICT_SYSTEM,msgs);
    indicator.remove();
    appendMsg('assistant',response);
    histories.translate.push({role:'user',content:text},{role:'assistant',content:response});
    if(histories.translate.length>20) histories.translate.splice(0,2);
  } catch(err){indicator.remove();appendMsg('assistant','❌ Lỗi: '+err.message);}
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  loadLocalCache();
  setModel(currentModel);

  if (sbReady()) {
    document.getElementById('dbStatusRow').style.display='flex';
    document.getElementById('dbCount').textContent='…';
    await loadApiKeysFromCloud();
    await loadVocabFromCloud();
  } else {
    updateStatus(false,'Supabase chưa cấu hình trong code');
  }
});