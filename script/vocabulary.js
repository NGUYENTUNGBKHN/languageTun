// ═══════════════════════════════════════════════════════════════
// LOCAL VOCABULARY & CACHE MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════

let expandedWord = null;
let expandedWordJP = null;

/**
 * Save vocabulary logs and current active model to LocalStorage.
 */
function saveLocalCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    vocabLog,
    vocabLogJP,
    model: currentModel
  }));
}

/**
 * Load local cache from LocalStorage on application startup.
 */
function loadLocalCache() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const c = JSON.parse(s);
      if (c.vocabLog) {
        vocabLog = c.vocabLog;
        const enCountEl = document.getElementById('enCount');
        if (enCountEl) enCountEl.textContent = vocabLog.length;
      }
      if (c.vocabLogJP) {
        vocabLogJP = c.vocabLogJP;
        const jpCountEl = document.getElementById('jpCount');
        if (jpCountEl) jpCountEl.textContent = vocabLogJP.length;
      }
      if (c.model) currentModel = c.model;
    }
  } catch (e) {
    console.warn('Failed to load local cache:', e);
  }
}

/**
 * Render English Vocabulary table in UI.
 */
function renderVocabList() {
  const wrap = document.getElementById('vocabTableWrap');
  if (!wrap) return;

  const searchVal = (document.getElementById('vocabSearch')?.value || '').toLowerCase();
  const filtered = vocabLog.filter(v =>
    v.word.toLowerCase().includes(searchVal) ||
    (v.meaning || '').toLowerCase().includes(searchVal)
  );

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="flex:none;padding:3rem 0;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${searchVal ? 'No words found' : 'No words yet'}</div>
      <div class="empty-sub">${searchVal ? 'Try a different search term.' : 'Look up words in Dictionary — they save here automatically.'}</div>
    </div>`;
    return;
  }

  const list = filtered.slice().reverse();
  let html = `<table class="vocab-table">
    <thead><tr>
      <th>#</th><th>Word</th><th>Meaning</th><th>Date Added</th><th></th>
    </tr></thead><tbody>`;

  list.forEach((v, i) => {
    const dateStr = v.date ? new Date(v.date).toLocaleDateString('vi-VN') : '—';
    const isOpen = expandedWord === v.word;
    const escapedWord = v.word.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    html += `<tr class="vocab-row-main ${isOpen ? 'row-open' : ''}" onclick="toggleExpand('${escapedWord}')">
      <td><span class="idx-badge">${filtered.length - i}</span></td>
      <td>
        <span class="vocab-word">${escapeHtml(v.word)}</span>
        <button class="speak-btn speak-btn-sm" data-word="${escapeHtml(v.word)}" title="Pronounce"
          onclick="event.stopPropagation();speakWord(this.getAttribute('data-word'),'en-US',this)">🔊</button>
      </td>
      <td><span class="vocab-meaning">${escapeHtml(v.meaning || '—')}</span></td>
      <td style="color:var(--muted);font-size:12px">${dateStr}</td>
      <td style="text-align:right" onclick="event.stopPropagation()">
        <button class="del-btn" onclick="deleteWord('${escapedWord}')" title="Delete word">✕</button>
      </td>
    </tr>`;

    if (isOpen) {
      html += `<tr class="vocab-row-detail"><td colspan="5"><div class="vocab-detail-box">`;
      if (v.example) {
        html += `<div class="vocab-detail-item">
          <span class="vocab-detail-icon">💬</span>
          <div class="vocab-detail-content">
            <span class="vocab-detail-title">Example</span>
            <span class="example-text">${escapeHtml(v.example)}</span>
          </div>
          <button class="speak-btn speak-btn-sm" data-word="${escapeHtml(v.example)}" title="Pronounce example"
            onclick="event.stopPropagation();speakWord(this.getAttribute('data-word'),'en-US',this)">🔊</button>
        </div>`;
      }
      if (v.synonyms) {
        html += `<div class="vocab-detail-item">
          <span class="vocab-detail-icon">🔗</span>
          <div class="vocab-detail-content">
            <span class="vocab-detail-title">Synonyms</span>
            <span class="syn-text">${escapeHtml(v.synonyms)}</span>
          </div>
        </div>`;
      }
      if (v.antonyms) {
        html += `<div class="vocab-detail-item">
          <span class="vocab-detail-icon">↔️</span>
          <div class="vocab-detail-content">
            <span class="vocab-detail-title">Antonyms</span>
            <span class="ant-text">${escapeHtml(v.antonyms)}</span>
          </div>
        </div>`;
      }
      if (!v.example && !v.synonyms && !v.antonyms) {
        html += `<div style="font-size:12px;color:var(--muted)">No additional details saved.</div>`;
      }
      html += `</div></td></tr>`;
    }
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

/**
 * Toggle expanding row details for English vocabulary word.
 * @param {string} word Word to toggle.
 */
function toggleExpand(word) {
  expandedWord = (expandedWord === word) ? null : word;
  renderVocabList();
}

/**
 * Delete English vocabulary word from local state and cloud.
 * @param {string} word Word to delete.
 */
function deleteWord(word) {
  vocabLog = vocabLog.filter(v => v.word.toLowerCase() !== word.toLowerCase());
  if (expandedWord === word) expandedWord = null;
  document.getElementById('enCount').textContent = vocabLog.length;
  saveLocalCache();
  renderVocabList();
  deleteWordFromCloud(word);
}

/**
 * Render Japanese Vocabulary table in UI.
 */
function renderVocabListJP() {
  const wrap = document.getElementById('vocabTableWrapJP');
  if (!wrap) return;

  const searchVal = (document.getElementById('vocabSearchJP')?.value || '').toLowerCase();
  const filtered = vocabLogJP.filter(v =>
    v.word.toLowerCase().includes(searchVal) ||
    (v.meaning || '').toLowerCase().includes(searchVal) ||
    (v.reading || '').toLowerCase().includes(searchVal)
  );

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="flex:none;padding:3rem 0;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${searchVal ? 'No words found' : 'No words yet'}</div>
      <div class="empty-sub">${searchVal ? 'Try a different keyword.' : 'Look up words in Japanese tab — they save here automatically.'}</div>
    </div>`;
    return;
  }

  const list = filtered.slice().reverse();
  let html = `<table class="vocab-table">
    <thead><tr>
      <th>#</th><th>Japanese Word</th><th>Meaning</th><th>Reading</th><th>Date Added</th><th></th>
    </tr></thead><tbody>`;

  list.forEach((v, i) => {
    const dateStr = v.date ? new Date(v.date).toLocaleDateString('vi-VN') : '—';
    const isOpen = expandedWordJP === v.word;
    const escapedWord = v.word.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    html += `<tr class="vocab-row-main ${isOpen ? 'row-open' : ''}" onclick="toggleExpandJP('${escapedWord}')">
      <td><span class="idx-badge" style="background:rgba(232,96,122,0.15);color:var(--accent-jp)">${filtered.length - i}</span></td>
      <td>
        <span class="vocab-word" style="font-family:'Noto Sans JP',sans-serif">${escapeHtml(v.word)}</span>
        <button class="speak-btn speak-btn-sm" style="border-color:rgba(232,96,122,0.35);color:var(--accent-jp)" data-word="${escapeHtml(v.word)}" title="Pronounce"
          onclick="event.stopPropagation();speakWord(this.getAttribute('data-word'),'ja-JP',this)">🔊</button>
      </td>
      <td><span class="vocab-meaning">${escapeHtml(v.meaning || '—')}</span></td>
      <td><span style="font-size:12px;color:var(--muted);font-family:'Noto Sans JP',sans-serif">${escapeHtml(v.reading || '—')}</span></td>
      <td style="color:var(--muted);font-size:12px">${dateStr}</td>
      <td style="text-align:right" onclick="event.stopPropagation()">
        <button class="del-btn" onclick="deleteWordJP('${escapedWord}')" title="Delete word">✕</button>
      </td>
    </tr>`;

    if (isOpen) {
      html += `<tr class="vocab-row-detail"><td colspan="6"><div class="vocab-detail-box">`;
      if (v.example) {
        html += `<div class="vocab-detail-item">
          <span class="vocab-detail-icon">💬</span>
          <div class="vocab-detail-content">
            <span class="vocab-detail-title">Example</span>
            <span class="example-text" style="font-family:'Noto Sans JP',sans-serif">${escapeHtml(v.example)}</span>
          </div>
          <button class="speak-btn speak-btn-sm" style="border-color:rgba(232,96,122,0.35);color:var(--accent-jp)" data-word="${escapeHtml(v.example)}" title="Pronounce example"
            onclick="event.stopPropagation();speakWord(this.getAttribute('data-word'),'ja-JP',this)">🔊</button>
        </div>`;
      }
      if (v.type) {
        html += `<div class="vocab-detail-item">
          <span class="vocab-detail-icon">📝</span>
          <div class="vocab-detail-content">
            <span class="vocab-detail-title">Part of Speech</span>
            <span>${escapeHtml(v.type)}</span>
          </div>
        </div>`;
      }
      if (!v.example && !v.type) {
        html += `<div style="font-size:12px;color:var(--muted)">No additional details saved.</div>`;
      }
      html += `</div></td></tr>`;
    }
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

/**
 * Toggle expanding row details for Japanese vocabulary word.
 * @param {string} word Word to toggle.
 */
function toggleExpandJP(word) {
  expandedWordJP = (expandedWordJP === word) ? null : word;
  renderVocabListJP();
}

/**
 * Delete Japanese vocabulary word from local state and cloud.
 * @param {string} word Word to delete.
 */
function deleteWordJP(word) {
  vocabLogJP = vocabLogJP.filter(v => v.word !== word);
  if (expandedWordJP === word) expandedWordJP = null;
  document.getElementById('jpCount').textContent = vocabLogJP.length;
  saveLocalCache();
  renderVocabListJP();
  deleteWordFromCloudJP(word);
}

/**
 * Export English vocabulary list to CSV file.
 */
function exportVocabCSV() {
  if (vocabLog.length === 0) {
    showToast('⚠️ No English vocabulary to export!', 'warn');
    return;
  }
  let csv = '\uFEFFWord,Meaning,Example,Synonyms,Antonyms,Date\n';
  vocabLog.forEach(v => {
    const q = s => `"${(s || '').replace(/"/g, '""')}"`;
    csv += `${q(v.word)},${q(v.meaning)},${q(v.example)},${q(v.synonyms)},${q(v.antonyms)},${q(v.date)}\n`;
  });
  downloadFile(csv, 'english_vocabulary.csv', 'text/csv;charset=utf-8;');
}

/**
 * Export Japanese vocabulary list to CSV file.
 */
function exportVocabCSVJP() {
  if (vocabLogJP.length === 0) {
    showToast('⚠️ No Japanese vocabulary to export!', 'warn');
    return;
  }
  let csv = '\uFEFFWord,Meaning,Reading,Example,Type,Date\n';
  vocabLogJP.forEach(v => {
    const q = s => `"${(s || '').replace(/"/g, '""')}"`;
    csv += `${q(v.word)},${q(v.meaning)},${q(v.reading)},${q(v.example)},${q(v.type)},${q(v.date)}\n`;
  });
  downloadFile(csv, 'japanese_vocabulary.csv', 'text/csv;charset=utf-8;');
}

/**
 * Export full JSON backup of vocabulary.
 */
function exportToJSON() {
  const data = {
    version: 1,
    exported_at: new Date().toISOString(),
    vocabLog,
    vocabLogJP
  };
  downloadFile(JSON.stringify(data, null, 2), 'languagetun_backup.json', 'application/json');
}

/**
 * Import vocabulary backup from uploaded JSON file.
 * @param {File} file Uploaded JSON file.
 */
function importFromJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.vocabLog && Array.isArray(data.vocabLog)) {
        data.vocabLog.forEach(item => {
          if (!vocabLog.find(v => v.word.toLowerCase() === item.word.toLowerCase())) {
            vocabLog.push(item);
          }
        });
      }
      if (data.vocabLogJP && Array.isArray(data.vocabLogJP)) {
        data.vocabLogJP.forEach(item => {
          if (!vocabLogJP.find(v => v.word === item.word)) {
            vocabLogJP.push(item);
          }
        });
      }
      saveLocalCache();
      renderVocabList();
      renderVocabListJP();
      document.getElementById('enCount').textContent = vocabLog.length;
      document.getElementById('jpCount').textContent = vocabLogJP.length;
      showToast('✅ Backup imported successfully!', 'ok');
    } catch (err) {
      showToast('❌ Invalid JSON file format', 'warn');
    }
  };
  reader.readAsText(file);
}

/**
 * Helper function to trigger browser file download.
 * @param {string} content File content payload.
 * @param {string} filename Output file name.
 * @param {string} mimeType MIME Type string.
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
