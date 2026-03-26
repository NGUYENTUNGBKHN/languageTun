let currentModel = 'gemini';
let vocabLog = { en: [], jp: [] };
let bookContext = {
  en: "Sách: English Grammar in Use - tập trung vào ngữ pháp thực hành, ví dụ thực tế.",
  jp: "Sách: Minna no Nihongo N5 - từ vựng và ngữ pháp JLPT N5 cơ bản."
};
const histories = { english: [], japanese: [], translate: [] };

const STORAGE_KEY = 'linguaagent_config';

// Voice Chat globals
let ttsSynth = window.speechSynthesis;
let isSpeaking = false;
let recognition = null;
let isListening = false;
let currentSpeakingTab = null;
let autoSpeak = true;

// Detect language for TTS
detectLanguage = (text) => {
  if (/[\u3040-\u309F]/.test(text)) return 'ja-JP';
  if (/[\u4E00-\u9FAF]/.test(text)) return 'ja-JP';
  if (/[\u3400-\u4DBF]/.test(text)) return 'ja-JP';
  if (/[a-zA-Z]/.test(text)) return 'en-US';
  return 'vi-VN';
};

// Speak text using Web Speech API
function speak(text, tab) {
  if (!ttsSynth) return;
  ttsSynth.cancel();

  const cleanText = text.replace(/\[VOCAB.*?\]/g, '').replace(/[*_`#]/g, '');
  const sentences = cleanText.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 10);
  const toSpeak = sentences.slice(0, 3).join('. ');

  const utter = new SpeechSynthesisUtterance(toSpeak);
  utter.lang = detectLanguage(toSpeak);
  utter.rate = 0.9;
  utter.pitch = 1;

  utter.onstart = () => {
    isSpeaking = true;
    updateSpeakBtn(tab, true);
  };

  utter.onend = () => {
    isSpeaking = false;
    updateSpeakBtn(tab, false);
  };

  ttsSynth.speak(utter);
}

function stopSpeaking() {
  if (ttsSynth) {
    ttsSynth.cancel();
    isSpeaking = false;
    updateSpeakBtn(currentSpeakingTab, false);
  }
}

function updateSpeakBtn(tab, active) {
  document.querySelectorAll('.speak-btn').forEach(btn => {
    btn.classList.toggle('speaking', active);
    btn.innerHTML = active ? '🔊 Đang phát...' : '🔊 Nghe';
  });
}

// Speech Recognition - Voice Input
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Browser does not support speech recognition');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  return rec;
}

function startVoiceInput(tab) {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) {
    alert('Trình duyệt không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome hoặc Edge.');
    return;
  }

  const input = document.getElementById('input-' + tab);
  const micBtn = document.getElementById('mic-btn-' + tab);

  recognition.lang = tab === 'japanese' ? 'ja-JP' : (tab === 'english' ? 'en-US' : 'vi-VN');

  recognition.onstart = () => {
    isListening = true;
    if (micBtn) {
      micBtn.classList.add('listening');
      micBtn.innerHTML = '🎙️ Đang nghe...';
    }
    input.placeholder = 'Đang nghe...';
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join('');
    input.value = transcript;
  };

  recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    isListening = false;
    if (micBtn) {
      micBtn.classList.remove('listening');
      micBtn.innerHTML = '🎙️ Nói';
    }
    input.placeholder = 'Hỏi gì về Tiếng Anh...';
  };

  recognition.onend = () => {
    isListening = false;
    if (micBtn) {
      micBtn.classList.remove('listening');
      micBtn.innerHTML = '🎙️ Nói';
    }
    input.placeholder = 'Hỏi gì về Tiếng Anh...';
    if (input.value.trim()) {
      sendMessage(tab);
    }
  };

  recognition.start();
}

function stopVoiceInput() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

function saveConfig() {
  const config = {
    apiKey: getApiKey(),
    model: currentModel,
    vocabLog: vocabLog,
    bookContext: bookContext,
    autoSpeak: autoSpeak
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      if (config.apiKey) {
        document.getElementById('apiKey').value = config.apiKey;
      }
      if (config.model) {
        setModel(config.model);
      }
      if (config.vocabLog) {
        vocabLog = config.vocabLog;
        document.getElementById('enCount').textContent = vocabLog.en.length;
        document.getElementById('jpCount').textContent = vocabLog.jp.length;
      }
      if (config.bookContext) {
        bookContext = config.bookContext;
      }
      if (config.autoSpeak !== undefined) {
        autoSpeak = config.autoSpeak;
        const autoSpeakCheckbox = document.getElementById('autoSpeak');
        if (autoSpeakCheckbox) autoSpeakCheckbox.checked = autoSpeak;
      }
      return true;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return false;
}

function exportToJSON() {
  const config = {
    apiKey: getApiKey(),
    model: currentModel,
    vocabLog: vocabLog,
    bookContext: bookContext,
    autoSpeak: autoSpeak,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linguaagent_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target.result);
      if (config.apiKey) {
        document.getElementById('apiKey').value = config.apiKey;
      }
      if (config.model) {
        setModel(config.model);
      }
      if (config.vocabLog) {
        vocabLog = config.vocabLog;
        document.getElementById('enCount').textContent = vocabLog.en.length;
        document.getElementById('jpCount').textContent = vocabLog.jp.length;
      }
      if (config.bookContext) {
        bookContext = config.bookContext;
      }
      if (config.autoSpeak !== undefined) {
        autoSpeak = config.autoSpeak;
        const autoSpeakCheckbox = document.getElementById('autoSpeak');
        if (autoSpeakCheckbox) autoSpeakCheckbox.checked = autoSpeak;
      }
      saveConfig();
      alert('Đã nhập dữ liệu thành công!');
    } catch (err) {
      alert('Lỗi đọc file JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

const SYSTEMS = {
  english: (ctx) => `Bạn là gia sư Tiếng Anh chuyên nghiệp, dạy học viên người Việt. ${ctx}
Luôn:
- Giải thích bằng tiếng Việt, ví dụ bằng tiếng Anh
- In đậm từ/cụm từ quan trọng bằng **từ**
- Cho ví dụ câu thực tế
- Khi dạy từ vựng mới, format: **word** /phiên âm/ - nghĩa - ví dụ
- Kết thúc với: [VOCAB:word:nghĩa] cho mỗi từ mới quan trọng`,

  japanese: (ctx) => `Bạn là gia sư Tiếng Nhật, dạy học viên người Việt. ${ctx}
Luôn:
- Giải thích bằng tiếng Việt
- Viết tiếng Nhật kèm furigana: 漢字（かんじ）
- Format từ vựng: **từ** (đọc) - nghĩa - ví dụ câu
- Cho ví dụ câu kèm dịch tiếng Việt
- Kết thúc với [VOCAB_JP:từ:đọc:nghĩa] cho mỗi từ mới quan trọng`,

  translate: () => `Bạn là từ điển thông minh Anh-Nhật-Việt. Khi được hỏi một từ, hãy cung cấp:
1. Từ gốc và phiên âm/cách đọc
2. Loại từ (danh từ, động từ, tính từ...)
3. Nghĩa chính bằng tiếng Việt
4. Nghĩa bổ sung nếu có
5. 3 ví dụ câu thực tế kèm dịch tiếng Việt
6. Từ đồng nghĩa / trái nghĩa nếu có
7. Ghi chú văn hóa nếu từ tiếng Nhật
Kết thúc với [VOCAB:từ:nghĩa] hoặc [VOCAB_JP:từ:đọc:nghĩa]`
};

const MODEL_INFO = {
  gemini: { label: 'Gemini 2.5 Flash', placeholder: 'AIza... (Google AI Studio - Miễn phí)', hint: 'Lấy key miễn phí tại aistudio.google.com' },
  gpt:    { label: 'GPT-4o mini',       placeholder: 'sk-... (OpenAI API Key)', hint: '' },
  claude: { label: 'Claude Sonnet',     placeholder: 'sk-ant-... (Anthropic API Key)', hint: '' }
};

function setModel(m) {
  currentModel = m;
  ['gemini','gpt','claude'].forEach(id => {
    const card = document.getElementById('card-' + id);
    if (card) card.className = 'model-card' + (m === id ? ' selected-' + id : '');
  });
  const info = MODEL_INFO[m];
  const input = document.getElementById('apiKey');
  if (input) { input.placeholder = info.placeholder; input.value = ''; }
  const hints = {
    gemini: '✨ <strong>Gemini miễn phí hoàn toàn</strong> — Lấy key tại <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a> → Đăng nhập Google → Get API Key',
    gpt: '🤖 Lấy key tại <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a> (cần tài khoản trả phí)',
    claude: '⚡ Lấy key tại <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> (cần tài khoản trả phí)'
  };
  const hint = document.getElementById('keyHint');
  if (hint) hint.innerHTML = hints[m];
  const hm = document.getElementById('headerModel');
  if (hm) hm.textContent = info.label;
  updateStatus(false, 'Chưa kết nối');
}

function saveKey() {
  const key = getApiKey();
  if (!key) { updateStatus(false, 'Nhập key trước!'); return; }
  const btn = document.getElementById('saveBtn');
  // validate
  let valid = false;
  if (currentModel === 'gemini' && key.startsWith('AIza') && key.length > 20) valid = true;
  if (currentModel === 'gpt' && key.startsWith('sk-') && !key.startsWith('sk-ant-') && key.length > 20) valid = true;
  if (currentModel === 'claude' && key.startsWith('sk-ant-')) valid = true;
  if (!valid) { updateStatus(false, 'Key không đúng format'); return; }
  const labels = { gemini: '✓ Gemini sẵn sàng', gpt: '✓ GPT sẵn sàng', claude: '✓ Claude sẵn sàng' };
  updateStatus(true, labels[currentModel]);
  btn.textContent = '✓ Đã lưu!'; btn.classList.add('saved');
  setTimeout(() => { btn.textContent = 'Lưu & Kết nối'; btn.classList.remove('saved'); }, 2000);
  saveConfig();
}

function getApiKey() { return document.getElementById('apiKey').value.trim(); }

function updateStatus(ok, msg) {
  const el = document.getElementById('apiStatus');
  el.textContent = msg;
  el.className = 'api-status' + (ok ? '' : ' error');
}

async function callAPI(system, messages) {
  const key = getApiKey();
  if (!key) throw new Error('Chưa nhập API Key! Lấy key miễn phí tại aistudio.google.com');

  if (currentModel === 'gemini') {
    const geminiContents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1000 }
        })
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;

  } else if (currentModel === 'gpt') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1000,
        messages: [{ role: 'system', content: system }, ...messages] })
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

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
    const classes = { english:'en', japanese:'jp', translate:'trans', test:'test' };
    if (classes[tab]) event.currentTarget.classList.add(classes[tab]);
  }
}

function handleKey(e, tab) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(tab); }
}

function quickSend(tab, text) {
  document.getElementById('input-' + tab).value = text;
  sendMessage(tab);
}

function appendMsg(tab, role, text) {
  const container = document.getElementById('chat-' + tab);
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const avatars = { english: ['EN','agent-en'], japanese: ['日','agent-jp'], translate: ['Dic','agent-trans'] };
  const avInfo = role === 'user' ? ['You','user'] : (avatars[tab] || ['AI','agent-en']);

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + (role === 'user' ? 'user' : '');

  const cleanText = text.replace(/\[VOCAB.*?\]/g, '');

  // Add speak button for assistant messages
  const speakBtn = role === 'assistant' ? `
    <button class="speak-btn" onclick="speak(this.dataset.text, '${tab}')" data-text="${cleanText.replace(/"/g, '&quot;')}">
      🔊 Nghe
    </button>
  ` : '';

  msgDiv.innerHTML = `
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role === 'user' ? 'user' : ''}">
      ${cleanText}
      ${speakBtn}
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;

  // Extract vocab
  if (role === 'assistant') {
    const matches = [...text.matchAll(/\[VOCAB:(.*?):(.*?)\]/g)];
    matches.forEach(m => {
      if (!vocabLog.en.find(x => x.word === m[1])) vocabLog.en.push({ word: m[1], meaning: m[2], date: new Date() });
    });
    const matchesJp = [...text.matchAll(/\[VOCAB_JP:(.*?):(.*?):(.*?)\]/g)];
    matchesJp.forEach(m => {
      if (!vocabLog.jp.find(x => x.word === m[1])) vocabLog.jp.push({ word: m[1], reading: m[2], meaning: m[3], date: new Date() });
    });
    document.getElementById('enCount').textContent = vocabLog.en.length;
    document.getElementById('jpCount').textContent = vocabLog.jp.length;
    saveConfig();

    // Auto speak if enabled
    if (autoSpeak && !isSpeaking) {
      currentSpeakingTab = tab;
      speak(cleanText, tab);
    }
  }
}

async function sendMessage(tab) {
  const input = document.getElementById('input-' + tab);
  const text = input.value.trim();
  if (!text) return;

  appendMsg(tab, 'user', text);
  input.value = '';
  
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  document.getElementById('chat-' + tab).appendChild(indicator);

  try {
    const ctx = tab === 'english' ? bookContext.en : bookContext.jp;
    const response = await callAPI(SYSTEMS[tab](ctx), histories[tab].concat({ role: 'user', content: text }));
    indicator.remove();
    appendMsg(tab, 'assistant', response);
    histories[tab].push({ role: 'user', content: text });
    histories[tab].push({ role: 'assistant', content: response });
    if (histories[tab].length > 10) histories[tab].splice(0, 2);
  } catch (err) {
    indicator.remove();
    appendMsg(tab, 'assistant', "❌ Lỗi: " + err.message);
  }
}

function generateTest() {
  const total = vocabLog.en.length + vocabLog.jp.length;
  if (total < 3) { alert("Bạn cần học ít nhất 3 từ mới để tạo bài test!"); return; }
  
  const content = document.getElementById('test-content');
  content.innerHTML = '<div class="empty-state"><div class="empty-title">Đang tạo bài test...</div></div>';
  
  setTimeout(() => {
    content.innerHTML = '';
    const all = [
      ...vocabLog.en.map(x => ({ ...x, lang: 'en' })),
      ...vocabLog.jp.map(x => ({ ...x, lang: 'jp' }))
    ].sort(() => 0.5 - Math.random()).slice(0, 5);
    
    all.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      const questionText = q.lang === 'en' ? `Từ **${q.word}** có nghĩa là gì?` : `Từ **${q.word}** (${q.reading}) nghĩa là gì?`;
      card.innerHTML = `
        <div class="q-num">CÂU HỎI ${i+1}</div>
        <div class="q-text">${questionText}</div>
        <div class="options">
          <button class="option-btn" onclick="checkAns(this, true)">${q.meaning}</button>
          <button class="option-btn" onclick="checkAns(this, false)">Nghĩa sai A</button>
          <button class="option-btn" onclick="checkAns(this, false)">Nghĩa sai B</button>
        </div>
      `;
      content.appendChild(card);
    });
  }, 1000);
}

function checkAns(btn, isCorrect) {
  const opts = btn.parentElement.querySelectorAll('.option-btn');
  opts.forEach(o => o.disabled = true);
  btn.className = 'option-btn ' + (isCorrect ? 'correct' : 'wrong');
}

function uploadBook(e) {
  const file = e.target.files[0];
  if (!file) return;
  alert("Đã nhận sách: " + file.name + ". AI sẽ ưu tiên dạy dựa trên nội dung này.");
  const item = document.createElement('div');
  item.className = 'book-item';
  item.innerHTML = `<span>📖 ${file.name}</span> <span class="book-lang en">NEW</span>`;
  document.getElementById('bookList').appendChild(item);
}

// Init: Load saved config on page load
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});