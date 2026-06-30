// ============================================
// PCStore Perth — shared nav toggle (mobile menu)
// Used by: info.html, privacy.html (pages without Supabase forms)
// ============================================

document.getElementById('nav-toggle').addEventListener('click', () => {
  document.getElementById('nav-links').classList.toggle('open');
});
