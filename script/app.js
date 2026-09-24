// ═══════════════════════════════════════════════════════════════
// MAIN APPLICATION ENTRY POINT & NAVIGATION
// ═══════════════════════════════════════════════════════════════

/** List of all tab page IDs */
const ALL_PAGES = ['en-dict', 'en-vocab', 'en-flash', 'jp-dict', 'jp-vocab', 'jp-flash', 'settings'];
let groupOpen = { en: true, jp: false };

/**
 * Toggle collapse state for language navigation group in sidebar.
 * @param {string} lang Language code ('en' | 'jp').
 */
function toggleGroup(lang) {
  groupOpen[lang] = !groupOpen[lang];
  const children = document.getElementById('children-' + lang);
  const arrow    = document.getElementById('arrow-' + lang);
  if (children) children.style.display = groupOpen[lang] ? 'flex' : 'none';
  if (arrow)    arrow.textContent = groupOpen[lang] ? '▾' : '▸';
}

/**
 * Switch active view page tab.
 * @param {string} page Target page ID.
 */
function switchPage(page) {
  // Hide all tab panels
  ALL_PAGES.forEach(p => {
    const el = document.getElementById('tab-' + p);
    if (el) el.classList.remove('active');
  });

  // Remove active styling from navigation items
  document.querySelectorAll('.nav-child').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-group-header').forEach(b => b.classList.remove('active'));

  // Show selected panel
  const panel = document.getElementById('tab-' + page);
  if (panel) panel.classList.add('active');

  // Highlight nav button
  const btn = document.getElementById('nav-' + page);
  if (btn) btn.classList.add('active');

  // Highlight parent group header
  const lang = page.startsWith('jp') ? 'jp' : 'en';
  const groupBtn = document.getElementById('nav-group-' + lang);
  if (groupBtn) groupBtn.classList.add('active');

  // Ensure parent navigation group is expanded
  if (!groupOpen[lang]) toggleGroup(lang);

  // Tab view side effects
  if (page === 'en-vocab') renderVocabList();
  if (page === 'jp-vocab') renderVocabListJP();
  if (page === 'en-flash') {
    buildDayPills();
    if (fcDeck.length === 0 || fcIndex >= fcDeck.length) startFlashcards(false);
  }
  if (page === 'jp-flash') {
    buildDayPillsJP();
    if (fcDeckJP.length === 0 || fcIndexJP >= fcDeckJP.length) startFlashcardsJP(false);
  }
}

/**
 * Compatibility shim for legacy tab switching.
 * @param {string} tab Tab identifier.
 */
function switchTab(tab) {
  if (tab === 'translate') switchPage('en-dict');
  else if (tab === 'japanese') switchPage('jp-dict');
  else if (tab === 'settings') openSettings();
  else switchPage(tab);
}

// ─────────────────────────────────────────────────────────────
// ADMIN PASSWORD MODAL
// ─────────────────────────────────────────────────────────────

/**
 * Open Settings panel with admin password validation.
 */
function openSettings() {
  if (adminUnlocked) {
    switchPage('settings');
    return;
  }
  document.getElementById('pwd-overlay').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
  document.getElementById('pwd-error').style.display = 'none';
  setTimeout(() => document.getElementById('pwd-input').focus(), 50);
}

/**
 * Verify entered admin password.
 */
function checkPassword() {
  const val = document.getElementById('pwd-input').value;
  if (val === ADMIN_PASS) {
    adminUnlocked = true;
    closePwdModal();
    switchPage('settings');
  } else {
    const err = document.getElementById('pwd-error');
    if (err) err.style.display = 'block';
    const pwdInput = document.getElementById('pwd-input');
    if (pwdInput) {
      pwdInput.value = '';
      pwdInput.focus();
    }
    const box = err?.closest('div[style*="border-radius:16px"]') || pwdInput;
    if (box) {
      box.style.animation = 'shake 0.3s ease';
      setTimeout(() => box.style.animation = '', 300);
    }
  }
}

/**
 * Close admin password modal dialog.
 */
function closePwdModal() {
  const modal = document.getElementById('pwd-overlay');
  if (modal) modal.style.display = 'none';
}

// Close modal when clicking backdrop outside dialog
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('pwd-overlay');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closePwdModal();
    });
  }
});

// ─────────────────────────────────────────────────────────────
// APPLICATION INITIALIZATION SEQUENCE
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Load local cache (vocab logs & active model)
  loadLocalCache();
  setModel(currentModel);

  // 2. Load cloud settings & cloud vocabulary if Supabase is configured
  if (sbReady()) {
    const statusRowEN = document.getElementById('dbStatusRow');
    const countEN = document.getElementById('dbCountEn');
    const statusRowJP = document.getElementById('dbStatusRowJP');
    const countJP = document.getElementById('dbCountJP');

    if (statusRowEN) statusRowEN.style.display = 'flex';
    if (countEN) countEN.textContent = '…';
    if (statusRowJP) statusRowJP.style.display = 'flex';
    if (countJP) countJP.textContent = '…';

    await loadApiKeysFromCloud();
    await loadVocabFromCloud();
    await loadVocabFromCloudJP();
  } else {
    updateStatus(false, 'Supabase not configured');
  }

  // 3. Render initial vocabulary tables and build day pills
  renderVocabList();
  renderVocabListJP();
  buildDayPills();
  buildDayPillsJP();
});