// ═══════════════════════════════════════════════════════════════
// DICTIONARY CHAT UI & SPEECH TTS MODULE
// ═══════════════════════════════════════════════════════════════

let toastTimer = null;

/**
 * Display toast notification at bottom of screen.
 * @param {string} msg Message HTML to show.
 * @param {string} type Notification type ('info'|'ok'|'warn'|'dup').
 */
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  const colors = {
    info: 'var(--accent-trans)',
    ok:   'var(--accent-test)',
    warn: '#f7c94f',
    dup:  '#f7a94f'
  };
  el.innerHTML = msg;
  el.style.borderColor = colors[type] || 'var(--border2)';
  el.style.color = colors[type] || 'var(--text)';
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(80px)';
  }, 2800);
}

/**
 * Voice Text-to-Speech handler using Web Speech API.
 * @param {string} text Text phrase to pronounce.
 * @param {string} lang Language locale code ('en-US' | 'ja-JP').
 * @param {HTMLElement} btn Target button element for active animation state.
 */
function speakWord(text, lang = 'en-US', btn = null) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.9;
  if (btn) {
    btn.classList.add('speaking');
    utter.onend = () => btn.classList.remove('speaking');
    utter.onerror = () => btn.classList.remove('speaking');
  }
  window.speechSynthesis.speak(utter);
}

/**
 * Escape HTML characters to prevent XSS.
 * @param {string} text Input raw string.
 * @returns {string} Escaped HTML string.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format markdown text into styled HTML elements.
 * @param {string} text Markdown string.
 * @returns {string} HTML formatted string.
 */
function formatMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--surface2);padding:1px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────────────────────
// ENGLISH DICTIONARY METADATA PARSING & CHAT UI
// ─────────────────────────────────────────────────────────────

/**
 * Parse metadata tags from English AI response.
 * @param {string} text Raw AI response text.
 * @returns {object} Parsed metadata object.
 */
function parseMeta(text) {
  const get = tag => {
    const m = text.match(new RegExp(`\\[\\s*${tag}\\s*:\\s*([\\s\\S]*?)\\]`, 'i'));
    return m ? m[1].trim() : '';
  };
  const vocab = get('VOCAB');
  let word = '';
  let meaning = '';
  if (vocab) {
    const parts = vocab.split(':');
    word = parts[0] ? parts[0].trim() : '';
    meaning = parts.slice(1).join(':').trim();
  }
  return {
    word,
    meaning,
    example:  get('EXAMPLE'),
    synonyms: get('SYN'),
    antonyms: get('ANT')
  };
}

/**
 * Append chat message bubble to English dictionary chat container.
 * @param {string} role Message sender ('user' | 'assistant').
 * @param {string} text Message content.
 * @param {string} userQuery Original user search term fallback.
 */
function appendMsg(role, text, userQuery = '') {
  const container = document.getElementById('chat-translate');
  if (!container) return;
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const avInfo = role === 'user' ? ['You', 'user'] : ['Dic', 'agent-trans'];
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + (role === 'user' ? 'user' : '');
  const cleanText = text.replace(/\[\s*(VOCAB|EXAMPLE|SYN|ANT)\s*:[\s\S]*?\]/gi, '').trim();

  msgDiv.innerHTML = `
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role === 'user' ? 'user' : ''}">${role === 'assistant' ? formatMarkdown(cleanText) : escapeHtml(cleanText)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;

  if (role === 'assistant') {
    const meta = parseMeta(text);
    const targetWord = meta.word || userQuery.trim();
    if (!targetWord) return;

    const exists = vocabLog.find(v => v.word.toLowerCase() === targetWord.toLowerCase());
    if (exists) {
      showToast(`📌 Word "<strong>${escapeHtml(targetWord)}</strong>" already in list!`, 'dup');
      return;
    }
    const entry = {
      word: targetWord,
      meaning: meta.meaning || 'Nghĩa từ vựng',
      example: meta.example || '',
      synonyms: meta.synonyms || '',
      antonyms: meta.antonyms || '',
      date: new Date().toISOString()
    };
    vocabLog.push(entry);
    saveWordToCloud(entry);
    saveLocalCache();
    renderVocabList();
    buildDayPills();
    buildDayPillsJP();
    document.getElementById('enCount').textContent = vocabLog.length;
    showToast(`✅ Saved "<strong>${escapeHtml(targetWord)}</strong>"`, 'ok');
  }
}

/** Handle Enter key press on English lookup input. */
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/** Quick send prompt chip for English dictionary. */
function quickSend(text) {
  const input = document.getElementById('input-translate');
  if (input) {
    input.value = text;
    sendMessage();
  }
}

/** Send user lookup prompt to AI for English dictionary. */
async function sendMessage() {
  const input = document.getElementById('input-translate');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  appendMsg('user', text, text);
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
    appendMsg('assistant', response, text);
    histories.translate.push({ role: 'user', content: text }, { role: 'assistant', content: response });
    if (histories.translate.length > 20) histories.translate.splice(0, 2);
  } catch (err) {
    indicator.remove();
    appendMsg('assistant', '❌ Error: ' + err.message, text);
  }
}

// ─────────────────────────────────────────────────────────────
// JAPANESE DICTIONARY METADATA PARSING & CHAT UI
// ─────────────────────────────────────────────────────────────

/**
 * Parse metadata tags from Japanese AI response.
 * @param {string} text Raw AI response text.
 * @returns {object} Parsed metadata object.
 */
function parseMetaJP(text) {
  const get = tag => {
    const m = text.match(new RegExp(`\\[\\s*${tag}\\s*:\\s*([\\s\\S]*?)\\]`, 'i'));
    return m ? m[1].trim() : '';
  };
  const vocab = get('VOCAB_JP');
  let word = '';
  let meaning = '';
  if (vocab) {
    const parts = vocab.split(':');
    word = parts[0] ? parts[0].trim() : '';
    meaning = parts.slice(1).join(':').trim();
  }
  return {
    word,
    meaning,
    reading: get('READING'),
    example: get('EXAMPLE_JP'),
    type:    get('TYPE')
  };
}

/**
 * Append chat message bubble to Japanese dictionary chat container.
 * @param {string} role Message sender ('user' | 'assistant').
 * @param {string} text Message content.
 * @param {string} userQuery Original user search term fallback.
 */
function appendMsgJP(role, text, userQuery = '') {
  const container = document.getElementById('chat-japanese');
  if (!container) return;
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const avInfo = role === 'user' ? ['You', 'user'] : ['JP', 'agent-jp'];
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + (role === 'user' ? 'user' : '');
  const cleanText = text.replace(/\[\s*(VOCAB_JP|READING|EXAMPLE_JP|TYPE)\s*:[\s\S]*?\]/gi, '').trim();

  msgDiv.innerHTML = `
    <div class="avatar ${avInfo[1]}">${avInfo[0]}</div>
    <div class="bubble ${role === 'user' ? 'user' : ''}">${role === 'assistant' ? formatMarkdown(cleanText) : escapeHtml(cleanText)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;

  if (role === 'assistant') {
    const meta = parseMetaJP(text);
    const targetWord = meta.word || userQuery.trim();
    if (!targetWord) return;

    const exists = vocabLogJP.find(v => v.word.toLowerCase() === targetWord.toLowerCase());
    if (exists) {
      showToast(`📌 Từ "<strong>${escapeHtml(targetWord)}</strong>" đã có trong danh sách!`, 'dup');
      return;
    }
    const entry = {
      word: targetWord,
      meaning: meta.meaning || '意味',
      reading: meta.reading || '',
      example: meta.example || '',
      type: meta.type || '',
      date: new Date().toISOString()
    };
    vocabLogJP.push(entry);
    saveWordToCloudJP(entry);
    saveLocalCache();
    renderVocabListJP();
    buildDayPillsJP();
    document.getElementById('jpCount').textContent = vocabLogJP.length;
    showToast(`✅ Đã lưu "<strong>${escapeHtml(targetWord)}</strong>"`, 'ok');
  }
}

/** Handle Enter key press on Japanese lookup input. */
function handleKeyJP(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessageJP();
  }
}

/** Quick send prompt chip for Japanese dictionary. */
function quickSendJP(text) {
  const input = document.getElementById('input-japanese');
  if (input) {
    input.value = text;
    sendMessageJP();
  }
}

/** Send user lookup prompt to AI for Japanese dictionary. */
async function sendMessageJP() {
  const input = document.getElementById('input-japanese');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  appendMsgJP('user', text, text);
  input.value = '';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  const container = document.getElementById('chat-japanese');
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;

  try {
    const msgs = histories.japanese.concat({ role: 'user', content: text });
    const response = await callAPI(JP_SYSTEM, msgs);
    indicator.remove();
    appendMsgJP('assistant', response, text);
    histories.japanese.push({ role: 'user', content: text }, { role: 'assistant', content: response });
    if (histories.japanese.length > 20) histories.japanese.splice(0, 2);
  } catch (err) {
    indicator.remove();
    appendMsgJP('assistant', '❌ Lỗi: ' + err.message, text);
  }
}
