// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENT & CLOUD SYNC MODULE
// ═══════════════════════════════════════════════════════════════

/**
 * Check if Supabase credentials are path configured.
 * @returns {boolean} True if URL and Anon key are present.
 */
function sbReady() {
  return SUPABASE_URL && SUPABASE_ANON;
}

/**
 * Perform fetch request to Supabase REST API endpoint.
 * @param {string} table Target table name.
 * @param {string} method HTTP Method (GET, POST, DELETE, etc.).
 * @param {string} query Optional URL query parameter string.
 * @param {object|array} body Request body payload.
 * @returns {Promise<Response>} Fetch Response object.
 */
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

/**
 * Handle missing Japanese vocabulary table in Supabase.
 * @param {Response} res Fetch response object.
 * @returns {boolean} True if status is 404 (table missing).
 */
function handleJPCloudMissingTable(res) {
  if (res && res.status === 404) {
    jpCloudAvailable = false;
    const row = document.getElementById('dbStatusRowJP');
    const count = document.getElementById('dbCountJP');
    if (row) row.style.display = 'flex';
    if (count) count.textContent = 'off';
    if (!jpCloudWarningShown) {
      jpCloudWarningShown = true;
      console.warn('Supabase table "vocabulary_jp" was not found. Japanese vocab will stay local until table is created.');
      showToast('Japanese cloud sync is off until Supabase table vocabulary_jp is created.', 'warn');
    }
    return true;
  }
  return false;
}

/**
 * Save API key settings to Supabase cloud settings table.
 */
async function saveApiKeysToCloud() {
  if (!sbReady()) return;
  const rows = [
    { key: 'api_gemini',     value: apiKeys.gemini },
    { key: 'api_groq',       value: apiKeys.groq },
    { key: 'api_openrouter', value: apiKeys.openrouter },
    { key: 'model',          value: currentModel }
  ];
  try {
    await sbFetch('settings', 'POST', '', rows);
  } catch (e) {
    console.warn('Settings cloud save failed:', e);
  }
}

/**
 * Load API key settings directly from Supabase cloud.
 */
async function loadApiKeysFromCloud() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('settings', 'GET', '?key=in.(api_gemini,api_groq,api_openrouter,model)');
    if (!res.ok) {
      console.warn('Failed to load settings from Supabase cloud:', res.status);
      return;
    }
    const rows = await res.json();
    rows.forEach(r => {
      if (r.key === 'api_gemini')     apiKeys.gemini     = r.value || '';
      if (r.key === 'api_groq')       apiKeys.groq       = r.value || '';
      if (r.key === 'api_openrouter') apiKeys.openrouter = r.value || '';
      if (r.key === 'model')          currentModel       = r.value || 'gemini';
    });
    // Populate Settings UI fields directly from cloud
    const gEl  = document.getElementById('key-gemini');
    const grEl = document.getElementById('key-groq');
    const orEl = document.getElementById('key-openrouter');
    if (gEl)  gEl.value  = apiKeys.gemini || '';
    if (grEl) grEl.value = apiKeys.groq || '';
    if (orEl) orEl.value = apiKeys.openrouter || '';
    setModel(currentModel);
    updateKeyStatus();
  } catch (e) {
    console.warn('Settings load from cloud failed:', e);
  }
}

/**
 * Save an English vocabulary entry to Supabase cloud.
 * @param {object} entry Vocabulary entry object.
 */
async function saveWordToCloud(entry) {
  if (!sbReady()) return;
  try {
    await sbFetch('vocabulary', 'POST', '', {
      word: entry.word,
      meaning: entry.meaning,
      example: entry.example || null,
      synonyms: entry.synonyms || null,
      antonyms: entry.antonyms || null
    });
    refreshCloudCountEN();
  } catch (e) {
    console.warn('English word cloud save failed:', e);
  }
}

/**
 * Save a Japanese vocabulary entry to Supabase cloud.
 * @param {object} entry Japanese vocabulary entry object.
 */
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
  } catch (e) {
    console.warn('Japanese word cloud save failed:', e);
  }
}

/**
 * Delete an English vocabulary word from Supabase cloud.
 * @param {string} word Word to delete.
 */
async function deleteWordFromCloud(word) {
  if (!sbReady()) return;
  try {
    await sbFetch('vocabulary', 'DELETE', `?word=eq.${encodeURIComponent(word)}`);
    refreshCloudCountEN();
  } catch (e) {
    console.warn('Word cloud deletion failed:', e);
  }
}

/**
 * Delete a Japanese vocabulary word from Supabase cloud.
 * @param {string} word Word to delete.
 */
async function deleteWordFromCloudJP(word) {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    await sbFetch('vocabulary_jp', 'DELETE', `?word=eq.${encodeURIComponent(word)}`);
    refreshCloudCountJP();
  } catch (e) {
    console.warn('Japanese word cloud deletion failed:', e);
  }
}

/**
 * Fetch English vocabulary list from Supabase cloud.
 */
async function loadVocabFromCloud() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('vocabulary', 'GET', '?order=created_at.desc&limit=1000');
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(row => {
      if (!vocabLog.find(v => v.word.toLowerCase() === row.word.toLowerCase())) {
        vocabLog.push({
          word: row.word,
          meaning: row.meaning,
          example: row.example || '',
          synonyms: row.synonyms || '',
          antonyms: row.antonyms || '',
          date: row.created_at
        });
      }
    });
    document.getElementById('enCount').textContent = vocabLog.length;
    document.getElementById('dbCountEn').textContent = data.length;
    document.getElementById('dbStatusRow').style.display = 'flex';
    saveLocalCache();
    renderVocabList();
  } catch (e) {
    console.warn('English vocab cloud load failed:', e);
  }
}

/**
 * Fetch Japanese vocabulary list from Supabase cloud.
 */
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
  } catch (e) {
    console.warn('Japanese vocab cloud load failed:', e);
  }
}

/**
 * Refresh count badge for English cloud vocabulary.
 */
async function refreshCloudCountEN() {
  if (!sbReady()) return;
  try {
    const res = await sbFetch('vocabulary', 'GET', '?select=id');
    if (!res.ok) return;
    const d = await res.json();
    document.getElementById('dbCountEn').textContent = d.length;
    document.getElementById('dbStatusRow').style.display = 'flex';
  } catch (e) {}
}

/**
 * Refresh count badge for Japanese cloud vocabulary.
 */
async function refreshCloudCountJP() {
  if (!sbReady() || !jpCloudAvailable) return;
  try {
    const res = await sbFetch('vocabulary_jp', 'GET', '?select=id');
    if (handleJPCloudMissingTable(res) || !res.ok) return;
    const d = await res.json();
    document.getElementById('dbCountJP').textContent = d.length;
    document.getElementById('dbStatusRowJP').style.display = 'flex';
  } catch (e) {}
}
