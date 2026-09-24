// ═══════════════════════════════════════════════════════════════
// AI MODEL SERVICE MODULE (100% FREE PROVIDERS)
// ═══════════════════════════════════════════════════════════════

/** Supported 100% Free AI Model Info Metadata */
const MODEL_INFO = {
  gemini:     { label: '✨ Gemini 3.6 Flash' },
  groq:       { label: '⚡ Groq (Llama 3.3 70B)' },
  openrouter: { label: '🌐 OpenRouter (Free)' }
};

/**
 * Set current active AI model and update UI state.
 * @param {string} m Model identifier ('gemini' | 'groq' | 'openrouter').
 */
function setModel(m) {
  if (!MODEL_INFO[m]) m = 'gemini';
  currentModel = m;
  ['gemini', 'groq', 'openrouter'].forEach(id => {
    const c = document.getElementById('card-' + id);
    if (c) c.className = 'model-card' + (m === id ? ' selected-' + id : '');
  });
  const headerEl = document.getElementById('headerModel');
  if (headerEl) headerEl.textContent = MODEL_INFO[m]?.label || m;
  updateKeyStatus();
  saveLocalCache();
}

/**
 * Update UI status indicator text and class.
 * @param {boolean} ok True if connected / ready.
 * @param {string} msg Status message to display.
 */
function updateStatus(ok, msg) {
  ['apiStatus', 'apiStatusSettings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.className = 'api-status' + (ok ? '' : ' error');
    }
  });
}

/**
 * Get active API key for current selected model.
 * @returns {string} API Key string.
 */
function getActiveKey() {
  return apiKeys[currentModel] || '';
}

/**
 * Update model connection status indicator.
 */
function updateKeyStatus() {
  const hasKey = !!getActiveKey();
  const statusMap = {
    gemini:     '✓ Gemini ready',
    groq:       '✓ Groq ready',
    openrouter: '✓ OpenRouter ready'
  };
  updateStatus(hasKey, hasKey ? (statusMap[currentModel] || '✓ Ready') : 'No API key');
}

/**
 * Validate and save all API keys directly to Supabase cloud storage.
 */
async function saveAllKeys() {
  const g  = document.getElementById('key-gemini')?.value.trim() || '';
  const gr = document.getElementById('key-groq')?.value.trim() || '';
  const or = document.getElementById('key-openrouter')?.value.trim() || '';

  // Basic validation for key formats
  const errs = [];
  if (g && !g.startsWith('AIza')) errs.push('Gemini key must start with AIza...');
  if (gr && !gr.startsWith('gsk_')) errs.push('Groq key must start with gsk_...');
  if (errs.length) {
    showToast('⚠️ ' + errs[0], 'warn');
    return;
  }

  apiKeys.gemini     = g;
  apiKeys.groq       = gr;
  apiKeys.openrouter = or;

  const btn = document.getElementById('saveKeysBtn');
  if (btn) {
    btn.textContent = '🔄 Saving...';
    btn.disabled = true;
  }

  if (sbReady()) {
    await saveApiKeysToCloud();
    showToast('✅ Saved API keys to cloud!', 'ok');
  } else {
    showToast('⚠️ Supabase not configured — keys not saved', 'warn');
  }

  updateKeyStatus();
  if (btn) {
    btn.textContent = '✓ Saved!';
    setTimeout(() => {
      btn.textContent = '💾 Save all to cloud';
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Unified API dispatcher for sending prompts to selected Free AI Provider.
 * @param {string} system System instruction prompt.
 * @param {Array<object>} messages Chat message trajectory.
 * @returns {Promise<string>} AI model response text.
 */
async function callAPI(system, messages) {
  const key = getActiveKey();
  if (!key) {
    throw new Error('No API key for ' + currentModel + '! Go to Settings to enter one.');
  }

  if (currentModel === 'gemini') {
    const geminiContents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const payload = {
      systemInstruction: {
        parts: [{ text: system }]
      },
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.2
      }
    };

    // Primary model: gemini-3.6-flash with fallback to gemini-2.5-flash
    let res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
      throw new Error('Invalid response format from Gemini API.');
    }
    return data.candidates[0].content.parts[0].text;

  } else if (currentModel === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, ...messages]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.error);
    return data.choices[0].message.content;

  } else if (currentModel === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': window.location.href,
        'X-Title': 'LanguageTun App'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite:free',
        max_tokens: 1200,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, ...messages]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.error);
    return data.choices[0].message.content;

  } else {
    throw new Error('Unsupported AI model selected.');
  }
}
