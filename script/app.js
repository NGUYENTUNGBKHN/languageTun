// ═══════════════════════════════════════════════════════════════
//  CONFIG — fill in your Supabase information here
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://rknbxrqlzgjmiylqihno.supabase.co';   // ← paste Project URL here, e.g.: https://xxxx.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrbmJ4cnFsemdqbWl5bHFpaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQ0NDEsImV4cCI6MjA5MDM3MDQ0MX0.BzkXWgEKYv5MdMwwS3o1Ht9QY5syzITNoobK8nnHv9g';   // ← paste anon public key here

// ═══════════════════════════════════════════════════════════════
let currentModel = 'gemini';
let vocabLog = [];
let vocabLogJP = [];
const histories = { translate: [], japanese: [] };
const STORAGE_KEY = 'linguaagent_local';
let jpCloudAvailable = true;
let jpCloudWarningShown = false;

// API keys loaded from Supabase settings table
let apiKeys = { gemini: '', gpt: '', claude: '' };

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────
const DICT_SYSTEM = `You are an English learning assistant for Vietnamese people. Your tasks:

1. When the user enters an English word:
   - Translate to Vietnamese
   - Provide IPA pronunciation (e.g.: /ɪˈfɛm.ər.əl/)
   - Classify part of speech (noun, verb, adjective...)
   - Give 2–3 example sentences using the word in spoken or written English
   - Provide synonyms and antonyms if available
   - Add relevant grammar notes if needed
   - If relevant, incorporate examples with previously learned words

2. When the user enters a Vietnamese word:
   - Translate to English
   - Provide IPA pronunciation of the English word
   - Give example sentences using that English word
   - Provide synonyms and antonyms in English

3. If the user misspells: auto-correct and note "You may have meant: [correct word]".

4. Format responses clearly, use emoji, easy to read.

5. IMPORTANT — At the end of each response, add exactly 4 metadata lines:
[VOCAB:English word:short Vietnamese meaning]
[EXAMPLE:one best English example sentence illustrating the word]
[SYN:synonym 1, synonym 2, synonym 3]
[ANT:antonym 1, antonym 2]

If no synonyms or antonyms, leave empty: [SYN:] or [ANT:]
Respond in Vietnamese, only example sentences in English.`;

const JP_SYSTEM = `Bạn là trợ lý học tiếng Nhật cho người Việt Nam. Nhiệm vụ của bạn:

1. Khi người dùng nhập từ tiếng Nhật (kanji, hiragana, katakana, romaji):
   - Dịch nghĩa sang tiếng Việt
   - Cung cấp cách đọc: hiragana + romaji (ví dụ: たべる / taberu)
   - Phân loại từ loại (động từ, tính từ, danh từ, trợ từ...)
   - Nhóm động từ (Group 1 / 2 / 3) nếu là động từ
   - Cho 2–3 câu ví dụ bằng tiếng Nhật (kèm furigana và dịch tiếng Việt)
   - Ghi chú ngữ pháp quan trọng nếu cần (ví dụ: cách chia, mẫu câu phổ biến)
   - Từ đồng nghĩa / trái nghĩa tiếng Nhật nếu có

2. Khi người dùng nhập từ tiếng Việt:
   - Dịch sang tiếng Nhật (kanji + hiragana)
   - Cung cấp romaji
   - Cho 1–2 câu ví dụ

3. Nếu người dùng gõ sai: tự động sửa và ghi chú.

4. Format rõ ràng, dùng emoji, dễ đọc.

5. QUAN TRỌNG — Cuối mỗi câu trả lời, thêm đúng 4 dòng metadata:
[VOCAB_JP:từ tiếng Nhật:nghĩa tiếng Việt ngắn gọn]
[READING:hiragana/romaji]
[EXAMPLE_JP:một câu ví dụ tiếng Nhật hay nhất]
[TYPE:品詞 (loại từ bằng tiếng Việt)]

Trả lời bằng tiếng Việt, câu ví dụ bằng tiếng Nhật.`;

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
// VOICE PRONUNCIATION  — Web Speech API TTS
// ─────────────────────────────────────────────────────────────
function speakWord(word, lang = 'en-US', btn = null) {
  if (!window.speechSynthesis) { showToast('⚠️ Speech not supported in this browser', 'warn'); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = lang;
  utter.rate = 0.85;
  utter.pitch = 1;
  if (btn) {
    btn.classList.add('speaking');
    utter.onend = () => btn.classList.remove('speaking');
    utter.onerror = () => btn.classList.remove('speaking');
  }
  window.speechSynthesis.speak(utter);
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

function handleJPCloudMissingTable(res) {
  if (res && res.status === 404) {
    jpCloudAvailable = false;
    const row = document.getElementById('dbStatusRowJP');
    const count = document.getElementById('dbCountJP');
    if (row) row.style.display = 'flex';
    if (count) count.textContent = 'off';
    if (!jpCloudWarningShown) {
      jpCloudWarningShown = true;
      console.warn('Supabase table "vocabulary_jp" was not found. Japanese vocab will stay local until that table is created.');
      showToast('Japanese cloud sync is off until Supabase table vocabulary_jp is created.', 'warn');
    }
    return true;
  }
  return false;
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
    ? { gemini:'✓ Gemini ready', gpt:'✓ GPT ready', claude:'✓ Claude ready' }[currentModel]
    : 'No API key');
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
    refreshCloudCountEN();
  } catch(e) { console.warn('Word save failed:', e); }
}

async function saveWordToCloudJP(entry) {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    const res = await sbFetch('vocabulary_jp', 'POST', '', {
      word: entry.word,
      meaning: entry.meaning,
      reading: entry.reading || null,
      example: entry.example || null,
      type: entry.type || null
    });
    if (handleJPCloudMissingTable(res) || !res.ok) return;
    refreshCloudCountJP();
  } catch(e) { console.warn('Japanese word save failed:', e); }
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
    document.getElementById('dbCountEn').textContent = data.length;
    document.getElementById('dbStatusRow').style.display = 'flex';
    saveLocalCache();
    renderVocabList();
    renderVocabListJP();
  } catch(e) { console.warn('Vocab load failed:', e); }
}

async function loadVocabFromCloudJP() {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    const res = await sbFetch('vocabulary_jp', 'GET', '?order=created_at.desc&limit=1000');
    if (handleJPCloudMissingTable(res) || !res.ok) return;
    const data = await res.json();
    data.forEach(row => {
      if (!vocabLogJP.find(v => v.word === row.word)) {
        vocabLogJP.push({
          word: row.word,
          meaning: row.meaning,
          reading: row.reading || '',
          example: row.example || '',
          type: row.type || '',
          date: row.created_at
        });
      }
    });
    document.getElementById('jpCount').textContent = vocabLogJP.length;
    document.getElementById('dbCountJP').textContent = data.length;
    document.getElementById('dbStatusRowJP').style.display = 'flex';
    saveLocalCache();
    renderVocabListJP();
  } catch(e) { console.warn('Japanese vocab load failed:', e); }
}

async function deleteWordFromCloud(word) {
  if (!sbReady()) return;
  try {
    await sbFetch('vocabulary', 'DELETE', `?word=eq.${encodeURIComponent(word)}`);
    refreshCloudCountEN();
  }
  catch(e) {}
}

async function deleteWordFromCloudJP(word) {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    const res = await sbFetch('vocabulary_jp', 'DELETE', `?word=eq.${encodeURIComponent(word)}`);
    handleJPCloudMissingTable(res);
    if (res.ok) refreshCloudCountJP();
  }
  catch(e) {}
}

async function refreshCloudCountEN() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('vocabulary', 'GET', '?select=id');
    if (res.ok) {
      const d = await res.json();
      document.getElementById('dbCountEn').textContent = d.length;
      document.getElementById('dbStatusRow').style.display = 'flex';
    }
  } catch(e) {}
}

async function refreshCloudCountJP() {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    const res = await sbFetch('vocabulary_jp', 'GET', '?select=id');
    if (handleJPCloudMissingTable(res) || !res.ok) return;
    const d = await res.json();
    document.getElementById('dbCountJP').textContent = d.length;
    document.getElementById('dbStatusRowJP').style.display = 'flex';
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
// LOCAL CACHE  (vocab only, no keys)
// ─────────────────────────────────────────────────────────────
function saveLocalCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ vocabLog, vocabLogJP, model: currentModel }));
}

function loadLocalCache() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const c = JSON.parse(s);
      if (c.vocabLog)   { vocabLog   = c.vocabLog;   document.getElementById('enCount').textContent = vocabLog.length; }
      if (c.vocabLogJP) { vocabLogJP = c.vocabLogJP; document.getElementById('jpCount').textContent = vocabLogJP.length; }
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
  if (g && !g.startsWith('AIza'))   errs.push('Gemini key must start with AIza...');
  if (p && !p.startsWith('sk-') || (p && p.startsWith('sk-ant-'))) {
    if (p && (!p.startsWith('sk-') || p.startsWith('sk-ant-'))) errs.push('GPT key must start with sk-...');
  }
  if (c && !c.startsWith('sk-ant-')) errs.push('Claude key must start with sk-ant-...');
  if (errs.length) { showToast('⚠️ ' + errs[0], 'warn'); return; }

  apiKeys.gemini = g;
  apiKeys.gpt    = p;
  apiKeys.claude = c;

  const btn = document.getElementById('saveKeysBtn');
  btn.textContent = '🔄 Saving...';
  btn.disabled = true;

  if (sbReady()) {
    await saveApiKeysToCloud();
    showToast('✅ Saved API keys to cloud!', 'ok');
  } else {
    showToast('⚠️ Supabase not configured — keys saved temporarily', 'warn');
  }

  updateKeyStatus();
  btn.textContent = '✓ Saved!';
  setTimeout(() => { btn.textContent = '💾 Save all'; btn.disabled = false; }, 2000);
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
      <div class="empty-title">${q ? 'Not found' : 'No words yet'}</div>
      <div class="empty-sub">${q ? 'Try a different keyword.' : 'Look up words in the Dictionary.'}</div>
    </div>`; return;
  }

  const list = filtered.slice().reverse();
  let html = `<table class="vocab-table">
    <thead><tr>
      <th>#</th><th>English Word</th><th>Meaning</th><th>Synonyms</th><th>Date Learned</th><th></th>
    </tr></thead><tbody>`;

  list.forEach((v, i) => {
    const date = v.date ? new Date(v.date).toLocaleDateString('en-US') : '—';
    const isOpen = expandedWord === v.word;
    const sw = v.word.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    html += `<tr class="vocab-row-main ${isOpen?'row-open':''}" onclick="toggleExpand('${sw}')">
      <td style="color:var(--muted);font-size:12px;">${list.length-i}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <strong style="color:var(--accent-trans)">${escapeHtml(v.word)}</strong>
          <button class="speak-btn" title="Pronounce" onclick="speakWord('${sw}','en-US',this);event.stopPropagation()">🔊</button>
        </span>
      </td>
      <td>${escapeHtml(v.meaning||'')}</td>
      <td style="color:var(--muted);font-size:12px;">${escapeHtml((v.synonyms||'').split(',').slice(0,2).join(', '))}</td>
      <td style="color:var(--muted);font-size:12px;">${date}</td>
      <td style="white-space:nowrap;">
        <span style="color:var(--muted);font-size:11px;margin-right:6px;">${isOpen?'▲':'▼'}</span>
        <button onclick="deleteWord('${sw}');event.stopPropagation()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px;">✕</button>
      </td></tr>`;

    if (isOpen) {
      html += `<tr class="vocab-row-detail"><td colspan="6"><div class="vocab-detail-box">
        ${v.example  ? `<div class="vd-row"><span class="vd-label">💬 Example</span><span class="vd-val example-text">${escapeHtml(v.example)}</span><button class="speak-btn speak-btn-sm" title="Pronounce example" onclick="speakWord(${JSON.stringify(v.example)},'en-US',this)">🔊</button></div>` : ''}
        ${v.synonyms ? `<div class="vd-row"><span class="vd-label">🔗 Synonyms</span><span class="vd-val syn-text">${escapeHtml(v.synonyms)}</span></div>` : ''}
        ${v.antonyms ? `<div class="vd-row"><span class="vd-label">↔️ Antonyms</span><span class="vd-val ant-text">${escapeHtml(v.antonyms)}</span></div>` : ''}
        ${!v.example&&!v.synonyms&&!v.antonyms ? `<div style="color:var(--muted);font-size:13px;">No extended data available.</div>` : ''}
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
  showToast(`🗑️ Deleted "<strong>${word}</strong>"`, 'info');
}

function exportVocabCSV() {
  if (!vocabLog.length) { showToast('No words yet!','warn'); return; }
  const rows = [['Word','Meaning','Example','Synonyms','Antonyms','Date']].concat(
    vocabLog.map(v=>[v.word,v.meaning||'',v.example||'',v.synonyms||'',v.antonyms||'',
      v.date?new Date(v.date).toLocaleDateString('en-US'):''])
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
      showToast('✅ Import successful!','ok');
    } catch(err) { showToast('❌ Error: '+err.message); }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────────────────────
// FLASHCARD ENGINE  — day filter + prev/next + keyboard
// ─────────────────────────────────────────────────────────────
let fcDeck=[],fcIndex=0,fcFlipped=false,fcCorrect=0,fcWrong=0,fcWrongWords=[];
let fcSelectedDay='all';

function toDateKey(iso) {
  if (!iso) return 'unknown';
  const d=new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDayLabel(key) {
  if (key==='all') return '📚 All';
  const today=toDateKey(new Date().toISOString());
  const yest=toDateKey(new Date(Date.now()-86400000).toISOString());
  if (key===today) return '📅 Today';
  if (key===yest)  return '📅 Yesterday';
  const [y,m,d]=key.split('-');
  return `${m}/${d}/${y}`;
}

function buildDayPills() {
  const pills=document.getElementById('fc-day-pills');
  if (!pills) return;
  const daySet=new Set(vocabLog.map(v=>toDateKey(v.date)));
  const days=['all',...[...daySet].sort().reverse()];
  pills.innerHTML=days.map(day=>{
    const count=day==='all'?vocabLog.length:vocabLog.filter(v=>toDateKey(v.date)===day).length;
    return `<button class="fc-day-pill ${fcSelectedDay===day?'active':''}" onclick="selectDay('${day}')">
      ${formatDayLabel(day)} <span class="fc-day-count">${count}</span>
    </button>`;
  }).join('');
}

function selectDay(day) {
  fcSelectedDay=day; buildDayPills(); startFlashcards(false);
}

function getFilteredDeck(shuffle=false) {
  const words=fcSelectedDay==='all'
    ?[...vocabLog]
    :vocabLog.filter(v=>toDateKey(v.date)===fcSelectedDay);
  return shuffle?words.sort(()=>Math.random()-0.5):words.slice().reverse();
}

function startFlashcards(shuffle=false,deck=null) {
  buildDayPills();
  const words=deck||getFilteredDeck(shuffle);
  if (!words.length) {
    document.getElementById('fc-empty').style.display='flex';
    document.getElementById('fc-main').style.display='none';
    document.getElementById('fc-results').style.display='none'; return;
  }
  fcDeck=words; fcIndex=fcCorrect=fcWrong=0; fcWrongWords=[];
  document.getElementById('fc-empty').style.display='none';
  document.getElementById('fc-results').style.display='none';
  document.getElementById('fc-main').style.display='flex';
  showCard();
}

function reviewWrong() {
  if (!fcWrongWords.length){showToast('No forgotten words to review!','ok');return;}
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
  const pct=((fcIndex+1)/fcDeck.length*100).toFixed(1);
  document.getElementById('fc-progress-bar').style.width=pct+'%';
  const prevBtn=document.getElementById('fc-prev-btn');
  const nextBtn=document.getElementById('fc-next-btn');
  if(prevBtn) prevBtn.disabled=fcIndex===0;
  if(nextBtn) nextBtn.disabled=fcIndex>=fcDeck.length-1;
  fcFlipped=false;
  document.getElementById('fc-card').classList.remove('flipped');
  document.getElementById('fc-actions').style.display='none';
  document.getElementById('fc-hint-reveal').style.display='block';

  // Update speak buttons with current word/example
  const speakWordBtn = document.getElementById('fc-speak-word');
  const speakExBtn   = document.getElementById('fc-speak-example');
  if (speakWordBtn) speakWordBtn.setAttribute('data-word', v.word);
  if (speakExBtn)   speakExBtn.setAttribute('data-word', v.example||'');

  // Auto-pronounce the word on each new card
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    setTimeout(() => speakWord(v.word, 'en-US'), 200);
  }
}

function flipCard() {
  fcFlipped=!fcFlipped;
  document.getElementById('fc-card').classList.toggle('flipped',fcFlipped);
  document.getElementById('fc-actions').style.display=fcFlipped?'flex':'none';
  document.getElementById('fc-hint-reveal').style.display=fcFlipped?'none':'block';
}

function fcNav(dir) {
  const next=fcIndex+dir;
  if (next<0||next>=fcDeck.length) return;
  fcIndex=next; showCard();
}

function fcAnswer(correct) {
  if(correct){fcCorrect++;showToast('✓ Good job!','ok');}
  else{fcWrong++;fcWrongWords.push(fcDeck[fcIndex]);showToast('✗ Keep studying!','dup');}
  if(fcIndex<fcDeck.length-1){fcIndex++;setTimeout(showCard,300);}
  else setTimeout(showResults,500);
}

function showResults() {
  document.getElementById('fc-main').style.display='none';
  document.getElementById('fc-results').style.display='flex';
  document.getElementById('fc-correct-count').textContent=fcCorrect;
  document.getElementById('fc-wrong-count').textContent=fcWrong;
  document.getElementById('fc-retry-wrong-btn').style.display=fcWrong>0?'block':'none';
}

// Keyboard: ← → Space (EN)
document.addEventListener('keydown',e=>{
  const enFlash = document.getElementById('tab-en-flash');
  const jpFlash = document.getElementById('tab-jp-flash');
  if (enFlash && enFlash.classList.contains('active')) {
    if(e.key==='ArrowLeft') {e.preventDefault();fcNav(-1);}
    if(e.key==='ArrowRight'){e.preventDefault();fcNav(1);}
    if(e.key===' ')         {e.preventDefault();flipCard();}
  }
  if (jpFlash && jpFlash.classList.contains('active')) {
    if(e.key==='ArrowLeft') {e.preventDefault();fcNavJP(-1);}
    if(e.key==='ArrowRight'){e.preventDefault();fcNavJP(1);}
    if(e.key===' ')         {e.preventDefault();flipCardJP();}
  }
});

// ─────────────────────────────────────────────────────────────
// JAPANESE VOCAB LIST
// ─────────────────────────────────────────────────────────────
let expandedWordJP = null;

function renderVocabListJP() {
  const wrap = document.getElementById('vocabTableWrapJP');
  if (!wrap) return;
  const q = (document.getElementById('vocabSearchJP')?.value || '').toLowerCase();
  const filtered = vocabLogJP.filter(v =>
    v.word.toLowerCase().includes(q) ||
    (v.meaning||'').toLowerCase().includes(q) ||
    (v.reading||'').toLowerCase().includes(q)
  );
  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="flex:none;padding:3rem 0;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${q ? 'Không tìm thấy' : 'Chưa có từ nào'}</div>
      <div class="empty-sub">${q ? 'Thử từ khóa khác.' : 'Tra từ trong tab 🇯🇵 Japanese.'}</div>
    </div>`; return;
  }
  const list = filtered.slice().reverse();
  let html = `<table class="vocab-table">
    <thead><tr>
      <th>#</th><th>Từ tiếng Nhật</th><th>Nghĩa</th><th>Cách đọc</th><th>Ngày học</th><th></th>
    </tr></thead><tbody>`;
  list.forEach((v, i) => {
    const date = v.date ? new Date(v.date).toLocaleDateString('vi-VN') : '—';
    const isOpen = expandedWordJP === v.word;
    const sw = v.word.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    html += `<tr class="vocab-row-main ${isOpen?'row-open':''}" onclick="toggleExpandJP('${sw}')">
      <td style="color:var(--muted);font-size:12px;">${list.length-i}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <strong style="color:var(--accent-jp);font-family:'Noto Sans JP',sans-serif;">${escapeHtml(v.word)}</strong>
          <button class="speak-btn" style="border-color:rgba(232,96,122,0.3);color:var(--accent-jp);" title="Phát âm" onclick="speakWord('${sw}','ja-JP',this);event.stopPropagation()">🔊</button>
        </span>
      </td>
      <td>${escapeHtml(v.meaning||'')}</td>
      <td style="color:var(--muted);font-size:12px;font-family:'Noto Sans JP',sans-serif;">${escapeHtml(v.reading||'')}</td>
      <td style="color:var(--muted);font-size:12px;">${date}</td>
      <td style="white-space:nowrap;">
        <span style="color:var(--muted);font-size:11px;margin-right:6px;">${isOpen?'▲':'▼'}</span>
        <button onclick="deleteWordJP('${sw}');event.stopPropagation()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px;">✕</button>
      </td></tr>`;
    if (isOpen) {
      html += `<tr class="vocab-row-detail"><td colspan="6"><div class="vocab-detail-box">
        ${v.example ? `<div class="vd-row"><span class="vd-label">💬 Ví dụ</span><span class="vd-val example-text" style="font-family:'Noto Sans JP',sans-serif;">${escapeHtml(v.example)}</span><button class="speak-btn speak-btn-sm" style="border-color:rgba(232,96,122,0.3);color:var(--accent-jp);" title="Phát âm ví dụ" onclick="speakWord(${JSON.stringify(v.example)},'ja-JP',this)">🔊</button></div>` : ''}
        ${v.type    ? `<div class="vd-row"><span class="vd-label">📝 Loại từ</span><span class="vd-val">${escapeHtml(v.type)}</span></div>` : ''}
        ${!v.example&&!v.type ? `<div style="color:var(--muted);font-size:13px;">Không có dữ liệu mở rộng.</div>` : ''}
      </div></td></tr>`;
    }
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function toggleExpandJP(word) { expandedWordJP = expandedWordJP===word?null:word; renderVocabListJP(); }

function deleteWordJP(word) {
  if (expandedWordJP===word) expandedWordJP=null;
  vocabLogJP = vocabLogJP.filter(v=>v.word!==word);
  document.getElementById('jpCount').textContent = vocabLogJP.length;
  saveLocalCache(); renderVocabListJP(); deleteWordFromCloudJP(word);
  showToast(`🗑️ Đã xóa "<strong>${word}</strong>"`, 'info');
}

function exportVocabCSVJP() {
  if (!vocabLogJP.length) { showToast('Chưa có từ nào!','warn'); return; }
  const rows = [['Word','Meaning','Reading','Example','Type','Date']].concat(
    vocabLogJP.map(v=>[v.word,v.meaning||'',v.reading||'',v.example||'',v.type||'',
      v.date?new Date(v.date).toLocaleDateString('vi-VN'):''])
  );
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download = `vocab_japanese_${new Date().toISOString().split('T')[0]}.csv`; a.click();
}

// ─────────────────────────────────────────────────────────────
// JAPANESE FLASHCARD ENGINE
// ─────────────────────────────────────────────────────────────
let fcDeckJP=[],fcIndexJP=0,fcFlippedJP=false,fcCorrectJP=0,fcWrongJP=0,fcWrongWordsJP=[];
let fcSelectedDayJP='all';

function buildDayPillsJP() {
  const pills=document.getElementById('fc-day-pills-jp');
  if (!pills) return;
  const daySet=new Set(vocabLogJP.map(v=>toDateKey(v.date)));
  const days=['all',...[...daySet].sort().reverse()];
  pills.innerHTML=days.map(day=>{
    const count=day==='all'?vocabLogJP.length:vocabLogJP.filter(v=>toDateKey(v.date)===day).length;
    return `<button class="fc-day-pill ${fcSelectedDayJP===day?'active':''}" style="${fcSelectedDayJP===day?'background:rgba(232,96,122,0.2);border-color:var(--accent-jp);color:var(--accent-jp);':''}" onclick="selectDayJP('${day}')">
      ${formatDayLabel(day)} <span class="fc-day-count">${count}</span>
    </button>`;
  }).join('');
}

function selectDayJP(day) { fcSelectedDayJP=day; buildDayPillsJP(); startFlashcardsJP(false); }

function getFilteredDeckJP(shuffle=false) {
  const words=fcSelectedDayJP==='all'
    ?[...vocabLogJP]
    :vocabLogJP.filter(v=>toDateKey(v.date)===fcSelectedDayJP);
  return shuffle?words.sort(()=>Math.random()-0.5):words.slice().reverse();
}

function startFlashcardsJP(shuffle=false,deck=null) {
  buildDayPillsJP();
  const words=deck||getFilteredDeckJP(shuffle);
  if (!words.length) {
    document.getElementById('fc-empty-jp').style.display='flex';
    document.getElementById('fc-main-jp').style.display='none';
    document.getElementById('fc-results-jp').style.display='none'; return;
  }
  fcDeckJP=words; fcIndexJP=fcCorrectJP=fcWrongJP=0; fcWrongWordsJP=[];
  document.getElementById('fc-empty-jp').style.display='none';
  document.getElementById('fc-results-jp').style.display='none';
  document.getElementById('fc-main-jp').style.display='flex';
  showCardJP();
}

function reviewWrongJP() {
  if (!fcWrongWordsJP.length){showToast('Không có từ nào cần ôn lại!','ok');return;}
  startFlashcardsJP(true,fcWrongWordsJP);
}

function showCardJP() {
  if (fcIndexJP>=fcDeckJP.length){showResultsJP();return;}
  const v=fcDeckJP[fcIndexJP];
  document.getElementById('fc-word-jp').textContent=v.word;
  const readEl=document.getElementById('fc-reading-jp');
  if(readEl) readEl.textContent=v.reading||'';
  document.getElementById('fc-meaning-jp').textContent=v.meaning||'—';
  const exEl=document.getElementById('fc-example-jp');
  const tyEl=document.getElementById('fc-type-jp');
  exEl.style.display=v.example?'flex':'none';
  tyEl.style.display=v.type?'flex':'none';
  if(v.example) document.getElementById('fc-example-val-jp').textContent=v.example;
  if(v.type)    document.getElementById('fc-type-val-jp').textContent=v.type;
  document.getElementById('fc-progress-jp').textContent=`${fcIndexJP+1} / ${fcDeckJP.length}`;
  const pct=((fcIndexJP+1)/fcDeckJP.length*100).toFixed(1);
  document.getElementById('fc-progress-bar-jp').style.width=pct+'%';
  const prevBtn=document.getElementById('fc-prev-btn-jp');
  const nextBtn=document.getElementById('fc-next-btn-jp');
  if(prevBtn) prevBtn.disabled=fcIndexJP===0;
  if(nextBtn) nextBtn.disabled=fcIndexJP>=fcDeckJP.length-1;
  fcFlippedJP=false;
  document.getElementById('fc-card-jp').classList.remove('flipped');
  document.getElementById('fc-actions-jp').style.display='none';
  document.getElementById('fc-hint-reveal-jp').style.display='block';
  const speakBtn=document.getElementById('fc-speak-word-jp');
  const speakExBtn=document.getElementById('fc-speak-example-jp');
  if(speakBtn)   speakBtn.setAttribute('data-word',v.word);
  if(speakExBtn) speakExBtn.setAttribute('data-word',v.example||'');
  if(window.speechSynthesis){
    window.speechSynthesis.cancel();
    setTimeout(()=>speakWord(v.word,'ja-JP'),200);
  }
}

function flipCardJP() {
  fcFlippedJP=!fcFlippedJP;
  document.getElementById('fc-card-jp').classList.toggle('flipped',fcFlippedJP);
  document.getElementById('fc-actions-jp').style.display=fcFlippedJP?'flex':'none';
  document.getElementById('fc-hint-reveal-jp').style.display=fcFlippedJP?'none':'block';
}

function fcNavJP(dir) {
  const next=fcIndexJP+dir;
  if(next<0||next>=fcDeckJP.length) return;
  fcIndexJP=next; showCardJP();
}

function fcAnswerJP(correct) {
  if(correct){fcCorrectJP++;showToast('✓ Nhớ rồi!','ok');}
  else{fcWrongJP++;fcWrongWordsJP.push(fcDeckJP[fcIndexJP]);showToast('✗ Cần học thêm!','dup');}
  if(fcIndexJP<fcDeckJP.length-1){fcIndexJP++;setTimeout(showCardJP,300);}
  else setTimeout(showResultsJP,500);
}

function showResultsJP() {
  document.getElementById('fc-main-jp').style.display='none';
  document.getElementById('fc-results-jp').style.display='flex';
  document.getElementById('fc-correct-count-jp').textContent=fcCorrectJP;
  document.getElementById('fc-wrong-count-jp').textContent=fcWrongJP;
  document.getElementById('fc-retry-wrong-btn-jp').style.display=fcWrongJP>0?'block':'none';
}

// ─────────────────────────────────────────────────────────────
// MODEL SELECTION
// ─────────────────────────────────────────────────────────────
const MODEL_INFO = {
  gemini: { label:'✨ Gemma 4 30B' },
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
  if (!key) throw new Error('No API key for '+currentModel+'! Go to Settings to enter one.');

  if (currentModel==='gemini') {
    const gemmaContents = messages.length > 0
      ? [
          { role: 'user', parts: [{ text: system + '\n\n' + messages[0].content }] },
          ...messages.slice(1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        ]
      : [{ role: 'user', parts: [{ text: system }] }];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${key}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          contents: gemmaContents,
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
// ─────────────────────────────────────────────────────────────
// NAVIGATION — tree sidebar + page switching
// ─────────────────────────────────────────────────────────────
const ALL_PAGES = ['en-dict','en-vocab','en-flash','jp-dict','jp-vocab','jp-flash','settings'];
let groupOpen = { en: true, jp: false };

function toggleGroup(lang) {
  groupOpen[lang] = !groupOpen[lang];
  const children = document.getElementById('children-'+lang);
  const arrow    = document.getElementById('arrow-'+lang);
  if (children) children.style.display = groupOpen[lang] ? 'flex' : 'none';
  if (arrow)    arrow.textContent = groupOpen[lang] ? '▾' : '▸';
}

function switchPage(page) {
  // Hide all panels
  ALL_PAGES.forEach(p => {
    const el = document.getElementById('tab-'+p);
    if (el) el.classList.remove('active');
  });
  // Remove active from all nav children & group headers
  document.querySelectorAll('.nav-child').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-group-header').forEach(b => b.classList.remove('active'));

  // Show target panel
  const panel = document.getElementById('tab-'+page);
  if (panel) panel.classList.add('active');

  // Activate nav child
  const btn = document.getElementById('nav-'+page);
  if (btn) btn.classList.add('active');

  // Activate parent group header too
  const lang = page.startsWith('jp') ? 'jp' : 'en';
  const groupBtn = document.getElementById('nav-group-'+lang);
  if (groupBtn) groupBtn.classList.add('active');

  // Ensure parent group is open
  if (!groupOpen[lang]) toggleGroup(lang);

  // Side effects
  if (page === 'en-vocab') renderVocabList();
  if (page === 'jp-vocab') renderVocabListJP();
  if (page === 'en-flash') { buildDayPills(); if(fcDeck.length===0||fcIndex>=fcDeck.length) startFlashcards(false); }
  if (page === 'jp-flash') { buildDayPillsJP(); if(fcDeckJP.length===0||fcIndexJP>=fcDeckJP.length) startFlashcardsJP(false); }
}

// Legacy compatibility shim used by old references
function switchTab(tab) {
  if (tab === 'translate') switchPage('en-dict');
  else if (tab === 'japanese') switchPage('jp-dict');
  else if (tab === 'settings') { openSettings(); }
  else switchPage(tab);
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
  const avInfo=role==='user'?['You','user']:['Dic','agent-trans'];
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
    if(exists){showToast(`📌 Word "<strong>${meta.word}</strong>" already in list!`,'dup');return;}
    const entry={word:meta.word,meaning:meta.meaning,example:meta.example,synonyms:meta.synonyms,antonyms:meta.antonyms,date:new Date().toISOString()};
    vocabLog.push(entry);
    saveWordToCloud(entry);
    showToast(`✅ Saved "<strong>${meta.word}</strong>"`,'ok');
    document.getElementById('enCount').textContent=vocabLog.length;
    saveLocalCache();
    buildDayPills();
    buildDayPillsJP();
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
  } catch(err){indicator.remove();appendMsg('assistant','❌ Error: '+err.message);}
}

// ─────────────────────────────────────────────────────────────
// JAPANESE DICTIONARY
// ─────────────────────────────────────────────────────────────
function parseMetaJP(text) {
  const get = tag => { const m=text.match(new RegExp(`\\[${tag}:(.*?)\\]`)); return m?m[1].trim():''; };
  const vocab = get('VOCAB_JP');
  return {
    word:    vocab.split(':')[0].trim(),
    meaning: vocab.split(':').slice(1).join(':').trim(),
    reading: get('READING'),
    example: get('EXAMPLE_JP'),
    type:    get('TYPE')
  };
}

function appendMsgJP(role, text) {
  const container=document.getElementById('chat-japanese');
  const empty=container.querySelector('.empty-state');
  if(empty) empty.remove();
  const avInfo=role==='user'?['You','user']:['JP','agent-jp'];
  const msgDiv=document.createElement('div');
  msgDiv.className='msg '+(role==='user'?'user':'');
  const cleanText=text.replace(/\[(VOCAB_JP|READING|EXAMPLE_JP|TYPE):.*?\]/g,'').trim();
  msgDiv.innerHTML=`
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role==='user'?'user':''}">${role==='assistant'?formatMarkdown(cleanText):escapeHtml(cleanText)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop=container.scrollHeight;

  if(role==='assistant') {
    if(!/\[VOCAB_JP:/.test(text)) return;
    const meta=parseMetaJP(text);
    if(!meta.word) return;
    const exists=vocabLogJP.find(v=>v.word===meta.word);
    if(exists){showToast(`📌 Từ "<strong>${meta.word}</strong>" đã có trong danh sách!`,'dup');return;}
    const entry={word:meta.word,meaning:meta.meaning,reading:meta.reading,example:meta.example,type:meta.type,date:new Date().toISOString()};
    vocabLogJP.push(entry);
    saveWordToCloudJP(entry);
    document.getElementById('jpCount').textContent=vocabLogJP.length;
    saveLocalCache();
    buildDayPillsJP();
    showToast(`✅ Đã lưu "<strong>${meta.word}</strong>" (${meta.reading})`,'ok');
  }
}

function handleKeyJP(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessageJP();}}
function quickSendJP(text){document.getElementById('input-japanese').value=text;sendMessageJP();}

async function sendMessageJP() {
  const input=document.getElementById('input-japanese');
  const text=input.value.trim();
  if(!text) return;
  appendMsgJP('user',text);
  input.value='';
  const indicator=document.createElement('div');
  indicator.className='typing-indicator';
  indicator.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  const container=document.getElementById('chat-japanese');
  container.appendChild(indicator);
  container.scrollTop=container.scrollHeight;
  try {
    const msgs=histories.japanese.concat({role:'user',content:text});
    const response=await callAPI(JP_SYSTEM,msgs);
    indicator.remove();
    appendMsgJP('assistant',response);
    histories.japanese.push({role:'user',content:text},{role:'assistant',content:response});
    if(histories.japanese.length>20) histories.japanese.splice(0,2);
  } catch(err){indicator.remove();appendMsgJP('assistant','❌ Lỗi: '+err.message);}
}

// ─────────────────────────────────────────────────────────────
// ADMIN PASSWORD GATE
// ─────────────────────────────────────────────────────────────
const ADMIN_PASS = '123';
let adminUnlocked = false;

function openSettings() {
  if (adminUnlocked) { switchPage('settings'); return; }
  const overlay = document.getElementById('pwd-overlay');
  overlay.style.display = 'flex';
  document.getElementById('pwd-input').value = '';
  document.getElementById('pwd-error').style.display = 'none';
  setTimeout(() => document.getElementById('pwd-input').focus(), 50);
}

function checkPassword() {
  const val = document.getElementById('pwd-input').value;
  if (val === ADMIN_PASS) {
    adminUnlocked = true;
    closePwdModal();
    switchPage('settings');
  } else {
    const err = document.getElementById('pwd-error');
    err.style.display = 'block';
    document.getElementById('pwd-input').value = '';
    document.getElementById('pwd-input').focus();
    // Shake animation
    const box = err.closest('div[style*="border-radius:16px"]') || document.getElementById('pwd-input');
    box.style.animation = 'shake 0.3s ease';
    setTimeout(() => box.style.animation = '', 300);
  }
}

function closePwdModal() {
  document.getElementById('pwd-overlay').style.display = 'none';
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pwd-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('pwd-overlay')) closePwdModal();
  });
});

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  loadLocalCache();
  setModel(currentModel);

  if (sbReady()) {
    document.getElementById('dbStatusRow').style.display='flex';
    document.getElementById('dbCountEn').textContent='…';
    document.getElementById('dbStatusRowJP').style.display='flex';
    document.getElementById('dbCountJP').textContent='…';
    await loadApiKeysFromCloud();
    await loadVocabFromCloud();
    await loadVocabFromCloudJP();
  } else {
    updateStatus(false,'Supabase not configured in code');
  }
});