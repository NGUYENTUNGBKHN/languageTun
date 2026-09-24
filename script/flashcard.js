// ═══════════════════════════════════════════════════════════════
// FLASHCARD ENGINE MODULE (ENGLISH & JAPANESE)
// ═══════════════════════════════════════════════════════════════

/** English Flashcard State */
let fcDeck = [];
let fcIndex = 0;
let fcFlipped = false;
let fcSelectedDay = 'all';
let fcWrongList = [];
let fcCorrectCount = 0;
let fcWrongCount = 0;

/** Japanese Flashcard State */
let fcDeckJP = [];
let fcIndexJP = 0;
let fcFlippedJP = false;
let fcSelectedDayJP = 'all';
let fcWrongListJP = [];
let fcCorrectCountJP = 0;
let fcWrongCountJP = 0;

// ─────────────────────────────────────────────────────────────
// ENGLISH FLASHCARD LOGIC
// ─────────────────────────────────────────────────────────────

/**
 * Filter English vocabulary by date key.
 * @param {string} dateStr ISO date string.
 * @returns {string} YYYY-MM-DD format string.
 */
function getDayKey(dateStr) {
  if (!dateStr) return 'Unknown';
  return dateStr.slice(0, 10);
}

/**
 * Build date filter pill buttons for English Flashcards.
 */
function buildDayPills() {
  const container = document.getElementById('fc-day-pills');
  if (!container) return;
  const days = Array.from(new Set(vocabLog.map(v => getDayKey(v.date)))).sort().reverse();

  let html = `<button class="fc-day-pill ${fcSelectedDay === 'all' ? 'active' : ''}" onclick="selectDayFilter('all')">All (${vocabLog.length})</button>`;
  days.forEach(d => {
    const count = vocabLog.filter(v => getDayKey(v.date) === d).length;
    html += `<button class="fc-day-pill ${fcSelectedDay === d ? 'active' : ''}" onclick="selectDayFilter('${d}')">${d} (${count})</button>`;
  });
  container.innerHTML = html;
}

/**
 * Select date filter for English Flashcards.
 * @param {string} day Selected day key or 'all'.
 */
function selectDayFilter(day) {
  fcSelectedDay = day;
  buildDayPills();
  startFlashcards(false);
}

/**
 * Initialize and start English Flashcard session.
 * @param {boolean} shuffle Whether to shuffle cards randomly.
 */
function startFlashcards(shuffle = false) {
  const source = fcSelectedDay === 'all'
    ? vocabLog
    : vocabLog.filter(v => getDayKey(v.date) === fcSelectedDay);

  if (source.length === 0) {
    document.getElementById('fc-empty').style.display = 'flex';
    document.getElementById('fc-main').style.display = 'none';
    document.getElementById('fc-results').style.display = 'none';
    return;
  }

  document.getElementById('fc-empty').style.display = 'none';
  document.getElementById('fc-results').style.display = 'none';
  document.getElementById('fc-main').style.display = 'flex';

  fcDeck = source.slice();
  if (shuffle) fcDeck.sort(() => Math.random() - 0.5);

  fcIndex = 0;
  fcFlipped = false;
  fcWrongList = [];
  fcCorrectCount = 0;
  fcWrongCount = 0;
  showCard();
}

/**
 * Display current English Flashcard content.
 */
function showCard() {
  if (fcIndex < 0) fcIndex = 0;
  if (fcIndex >= fcDeck.length) {
    showResults();
    return;
  }

  fcFlipped = false;
  const card = document.getElementById('fc-card');
  if (card) card.classList.remove('flipped');

  const item = fcDeck[fcIndex];
  document.getElementById('fc-word').textContent = item.word;

  const spWordBtn = document.getElementById('fc-speak-word');
  if (spWordBtn) spWordBtn.setAttribute('data-word', item.word);

  document.getElementById('fc-meaning').textContent = item.meaning || '—';

  const exRow = document.getElementById('fc-example');
  const exVal = document.getElementById('fc-example-val');
  const spExBtn = document.getElementById('fc-speak-example');
  if (item.example) {
    if (exRow) exRow.style.display = 'flex';
    if (exVal) exVal.textContent = item.example;
    if (spExBtn) spExBtn.setAttribute('data-word', item.example);
  } else {
    if (exRow) exRow.style.display = 'none';
  }

  const synRow = document.getElementById('fc-syn');
  const synVal = document.getElementById('fc-syn-val');
  if (item.synonyms) {
    if (synRow) synRow.style.display = 'flex';
    if (synVal) synVal.textContent = item.synonyms;
  } else {
    if (synRow) synRow.style.display = 'none';
  }

  const antRow = document.getElementById('fc-ant');
  const antVal = document.getElementById('fc-ant-val');
  if (item.antonyms) {
    if (antRow) antRow.style.display = 'flex';
    if (antVal) antVal.textContent = item.antonyms;
  } else {
    if (antRow) antRow.style.display = 'none';
  }

  document.getElementById('fc-progress').textContent = `${fcIndex + 1} / ${fcDeck.length}`;
  const pct = ((fcIndex + 1) / fcDeck.length) * 100;
  document.getElementById('fc-progress-bar').style.width = pct + '%';

  const prevBtn = document.getElementById('fc-prev-btn');
  const nextBtn = document.getElementById('fc-next-btn');
  if (prevBtn) prevBtn.disabled = fcIndex === 0;
  if (nextBtn) nextBtn.disabled = fcIndex === fcDeck.length - 1;

  const actions = document.getElementById('fc-actions');
  if (actions) actions.style.display = 'none';
}

/**
 * Flip card between front and back side.
 */
function flipCard() {
  fcFlipped = !fcFlipped;
  const card = document.getElementById('fc-card');
  if (card) card.classList.toggle('flipped', fcFlipped);

  const actions = document.getElementById('fc-actions');
  if (actions) actions.style.display = fcFlipped ? 'flex' : 'none';

  if (fcFlipped && fcDeck[fcIndex]) {
    speakWord(fcDeck[fcIndex].word, 'en-US');
  }
}

/**
 * Navigate to next or previous English Flashcard.
 * @param {number} dir Direction (-1 for previous, 1 for next).
 */
function fcNav(dir) {
  const newIndex = fcIndex + dir;
  if (newIndex >= 0 && newIndex < fcDeck.length) {
    fcIndex = newIndex;
    showCard();
  }
}

/**
 * Record answer result for English Flashcard.
 * @param {boolean} remembered True if word was remembered.
 */
function fcAnswer(remembered) {
  const item = fcDeck[fcIndex];
  if (remembered) {
    fcCorrectCount++;
  } else {
    fcWrongCount++;
    if (!fcWrongList.find(v => v.word === item.word)) {
      fcWrongList.push(item);
    }
  }

  if (fcIndex + 1 < fcDeck.length) {
    fcIndex++;
    showCard();
  } else {
    showResults();
  }
}

/**
 * Display final results score card for English Flashcards.
 */
function showResults() {
  document.getElementById('fc-main').style.display = 'none';
  document.getElementById('fc-results').style.display = 'flex';

  document.getElementById('fc-correct-count').textContent = fcCorrectCount;
  document.getElementById('fc-wrong-count').textContent = fcWrongCount;

  const retryWrongBtn = document.getElementById('fc-retry-wrong-btn');
  if (retryWrongBtn) {
    retryWrongBtn.style.display = fcWrongList.length > 0 ? 'inline-block' : 'none';
  }
}

/**
 * Restart English Flashcards using only forgotten words.
 */
function reviewWrong() {
  if (fcWrongList.length === 0) return;
  fcDeck = fcWrongList.slice();
  fcIndex = 0;
  fcFlipped = false;
  fcWrongList = [];
  fcCorrectCount = 0;
  fcWrongCount = 0;

  document.getElementById('fc-results').style.display = 'none';
  document.getElementById('fc-main').style.display = 'flex';
  showCard();
}

// ─────────────────────────────────────────────────────────────
// JAPANESE FLASHCARD LOGIC
// ─────────────────────────────────────────────────────────────

/**
 * Build date filter pill buttons for Japanese Flashcards.
 */
function buildDayPillsJP() {
  const container = document.getElementById('fc-day-pills-jp');
  if (!container) return;
  const days = Array.from(new Set(vocabLogJP.map(v => getDayKey(v.date)))).sort().reverse();

  let html = `<button class="fc-day-pill ${fcSelectedDayJP === 'all' ? 'active' : ''}" onclick="selectDayFilterJP('all')">全て (${vocabLogJP.length})</button>`;
  days.forEach(d => {
    const count = vocabLogJP.filter(v => getDayKey(v.date) === d).length;
    html += `<button class="fc-day-pill ${fcSelectedDayJP === d ? 'active' : ''}" onclick="selectDayFilterJP('${d}')">${d} (${count})</button>`;
  });
  container.innerHTML = html;
}

/**
 * Select date filter for Japanese Flashcards.
 * @param {string} day Selected day key or 'all'.
 */
function selectDayFilterJP(day) {
  fcSelectedDayJP = day;
  buildDayPillsJP();
  startFlashcardsJP(false);
}

/**
 * Initialize and start Japanese Flashcard session.
 * @param {boolean} shuffle Whether to shuffle cards randomly.
 */
function startFlashcardsJP(shuffle = false) {
  const source = fcSelectedDayJP === 'all'
    ? vocabLogJP
    : vocabLogJP.filter(v => getDayKey(v.date) === fcSelectedDayJP);

  if (source.length === 0) {
    document.getElementById('fc-empty-jp').style.display = 'flex';
    document.getElementById('fc-main-jp').style.display = 'none';
    document.getElementById('fc-results-jp').style.display = 'none';
    return;
  }

  document.getElementById('fc-empty-jp').style.display = 'none';
  document.getElementById('fc-results-jp').style.display = 'none';
  document.getElementById('fc-main-jp').style.display = 'flex';

  fcDeckJP = source.slice();
  if (shuffle) fcDeckJP.sort(() => Math.random() - 0.5);

  fcIndexJP = 0;
  fcFlippedJP = false;
  fcWrongListJP = [];
  fcCorrectCountJP = 0;
  fcWrongCountJP = 0;
  showCardJP();
}

/**
 * Display current Japanese Flashcard content.
 */
function showCardJP() {
  if (fcIndexJP < 0) fcIndexJP = 0;
  if (fcIndexJP >= fcDeckJP.length) {
    showResultsJP();
    return;
  }

  fcFlippedJP = false;
  const card = document.getElementById('fc-card-jp');
  if (card) card.classList.remove('flipped');

  const item = fcDeckJP[fcIndexJP];
  document.getElementById('fc-word-jp').textContent = item.word;

  const readingEl = document.getElementById('fc-reading-jp');
  if (readingEl) readingEl.textContent = item.reading || '';

  const spWordBtn = document.getElementById('fc-speak-word-jp');
  if (spWordBtn) spWordBtn.setAttribute('data-word', item.word);

  document.getElementById('fc-meaning-jp').textContent = item.meaning || '—';

  const exRow = document.getElementById('fc-example-jp');
  const exVal = document.getElementById('fc-example-val-jp');
  const spExBtn = document.getElementById('fc-speak-example-jp');
  if (item.example) {
    if (exRow) exRow.style.display = 'flex';
    if (exVal) exVal.textContent = item.example;
    if (spExBtn) spExBtn.setAttribute('data-word', item.example);
  } else {
    if (exRow) exRow.style.display = 'none';
  }

  const typeRow = document.getElementById('fc-type-jp');
  const typeVal = document.getElementById('fc-type-val-jp');
  if (item.type) {
    if (typeRow) typeRow.style.display = 'flex';
    if (typeVal) typeVal.textContent = item.type;
  } else {
    if (typeRow) typeRow.style.display = 'none';
  }

  document.getElementById('fc-progress-jp').textContent = `${fcIndexJP + 1} / ${fcDeckJP.length}`;
  const pct = ((fcIndexJP + 1) / fcDeckJP.length) * 100;
  document.getElementById('fc-progress-bar-jp').style.width = pct + '%';

  const prevBtn = document.getElementById('fc-prev-btn-jp');
  const nextBtn = document.getElementById('fc-next-btn-jp');
  if (prevBtn) prevBtn.disabled = fcIndexJP === 0;
  if (nextBtn) nextBtn.disabled = fcIndexJP === fcDeckJP.length - 1;

  const actions = document.getElementById('fc-actions-jp');
  if (actions) actions.style.display = 'none';
}

/**
 * Flip Japanese card between front and back side.
 */
function flipCardJP() {
  fcFlippedJP = !fcFlippedJP;
  const card = document.getElementById('fc-card-jp');
  if (card) card.classList.toggle('flipped', fcFlippedJP);

  const actions = document.getElementById('fc-actions-jp');
  if (actions) actions.style.display = fcFlippedJP ? 'flex' : 'none';

  if (fcFlippedJP && fcDeckJP[fcIndexJP]) {
    speakWord(fcDeckJP[fcIndexJP].word, 'ja-JP');
  }
}

/**
 * Navigate to next or previous Japanese Flashcard.
 * @param {number} dir Direction (-1 for previous, 1 for next).
 */
function fcNavJP(dir) {
  const newIndex = fcIndexJP + dir;
  if (newIndex >= 0 && newIndex < fcDeckJP.length) {
    fcIndexJP = newIndex;
    showCardJP();
  }
}

/**
 * Record answer result for Japanese Flashcard.
 * @param {boolean} remembered True if word was remembered.
 */
function fcAnswerJP(remembered) {
  const item = fcDeckJP[fcIndexJP];
  if (remembered) {
    fcCorrectCountJP++;
  } else {
    fcWrongCountJP++;
    if (!fcWrongListJP.find(v => v.word === item.word)) {
      fcWrongListJP.push(item);
    }
  }

  if (fcIndexJP + 1 < fcDeckJP.length) {
    fcIndexJP++;
    showCardJP();
  } else {
    showResultsJP();
  }
}

/**
 * Display final results score card for Japanese Flashcards.
 */
function showResultsJP() {
  document.getElementById('fc-main-jp').style.display = 'none';
  document.getElementById('fc-results-jp').style.display = 'flex';

  document.getElementById('fc-correct-count-jp').textContent = fcCorrectCountJP;
  document.getElementById('fc-wrong-count-jp').textContent = fcWrongCountJP;

  const retryWrongBtn = document.getElementById('fc-retry-wrong-btn-jp');
  if (retryWrongBtn) {
    retryWrongBtn.style.display = fcWrongListJP.length > 0 ? 'inline-block' : 'none';
  }
}

/**
 * Restart Japanese Flashcards using only forgotten words.
 */
function reviewWrongJP() {
  if (fcWrongListJP.length === 0) return;
  fcDeckJP = fcWrongListJP.slice();
  fcIndexJP = 0;
  fcFlippedJP = false;
  fcWrongListJP = [];
  fcCorrectCountJP = 0;
  fcWrongCountJP = 0;

  document.getElementById('fc-results-jp').style.display = 'none';
  document.getElementById('fc-main-jp').style.display = 'flex';
  showCardJP();
}

// ─────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUT EVENT LISTENERS FOR FLASHCARDS
// ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const enPanel = document.getElementById('tab-en-flash');
  if (enPanel && enPanel.classList.contains('active')) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); fcNav(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); fcNav(1); }
    if (e.key === ' ')          { e.preventDefault(); flipCard(); }
  }

  const jpPanel = document.getElementById('tab-jp-flash');
  if (jpPanel && jpPanel.classList.contains('active')) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); fcNavJP(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); fcNavJP(1); }
    if (e.key === ' ')          { e.preventDefault(); flipCardJP(); }
  }
});
