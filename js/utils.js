// utils.js - Helper functions

window.uid = function() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

window.sleep = function(ms) {
  return new Promise(r => setTimeout(r, ms));
};

window.escHtml = function(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

window.timeAgo = function(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

window.showToast = function(msg, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};

window.getConfig = function() {
  return {
    supabaseUrl: localStorage.getItem('eg_supabase_url') || '',
    supabaseKey: localStorage.getItem('eg_supabase_key') || '',
    cerebrasKey: localStorage.getItem('eg_cerebras_key') || ''
  };
};

window.saveConfigToLocal = function(url, key, cerebras) {
  if (url) localStorage.setItem('eg_supabase_url', url);
  if (key) localStorage.setItem('eg_supabase_key', key);
  if (cerebras) localStorage.setItem('eg_cerebras_key', cerebras);
};

// Global app state
window.appState = {
  notes: [],
  quizzes: [],
  proficiency: {},
  folders: [],
  currentSummary: null,
  currentQuizData: null,
  currentQuizIndex: 0,
  currentQuizAnswers: [],
  chatHistory: []
};

window.persistData = function() {
  try {
    localStorage.setItem('eg_data', JSON.stringify({
      notes: window.appState.notes || [],
      quizzes: window.appState.quizzes || [],
      proficiency: window.appState.proficiency || {}
    }));
    console.log('Data persisted to localStorage');
  } catch(e) {
    console.error('Failed to persist data:', e);
  }
};

window.loadLocalData = function() {
  try {
    const saved = localStorage.getItem('eg_data');
    if (saved) {
      const d = JSON.parse(saved);
      window.appState.notes = d.notes || [];
      window.appState.quizzes = d.quizzes || [];
      window.appState.proficiency = d.proficiency || {};
      console.log(`Loaded ${window.appState.quizzes.length} quizzes from localStorage`);
    }
  } catch(e) {
    console.error('Failed to load data:', e);
  }
};