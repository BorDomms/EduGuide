// app.js - Main application initialization and navigation

// Pre-configured API keys
const PRESET_SUPABASE_URL = 'https://qbxadkpzynpiifaqghmc.supabase.co';
const PRESET_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFieGFka3B6eW5waWlmYXFnaG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjEwODcsImV4cCI6MjA5MzY5NzA4N30.kaU_XpIS8FXREjew9AUt9i4qUw9LVcqgkR_GVwYPILQ';
const PRESET_CEREBRAS_KEY = 'csk-664xjxnc9wrhr53hkfjm3hv28rmndxnyyjw6m3hy8v66864n';

// Auto-save pre-configured keys
saveConfigToLocal(PRESET_SUPABASE_URL, PRESET_SUPABASE_ANON_KEY, PRESET_CEREBRAS_KEY);

// Request queue for rate limiting
let lastRequestTime = 0;
let pendingRequests = [];
let isProcessingQueue = false;

async function processRequestQueue() {
  if (isProcessingQueue || pendingRequests.length === 0) return;
  
  isProcessingQueue = true;
  
  while (pendingRequests.length > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    const minDelay = 2000; // 2 seconds between requests
    
    if (timeSinceLastRequest < minDelay) {
      const waitTime = minDelay - timeSinceLastRequest;
      console.log(`Rate limit: waiting ${waitTime}ms before next request`);
      await sleep(waitTime);
    }
    
    const { prompt, resolve, reject } = pendingRequests.shift();
    
    try {
      lastRequestTime = Date.now();
      const result = await makeCerebrasRequest(prompt);
      resolve(result);
    } catch(e) {
      reject(e);
    }
  }
  
  isProcessingQueue = false;
}

async function makeCerebrasRequest(prompt) {
  const key = getConfig().cerebrasKey;
  
  if (!key || appState.demoMode) {
    await sleep(800);
    return getDemoResponse(prompt);
  }

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 512,
        temperature: 0.7
      })
    });

    if (response.status === 429) {
      console.warn('Rate limit hit, waiting 5 seconds...');
      await sleep(5000);
      return makeCerebrasRequest(prompt);
    }

    if (!response.ok) {
      throw new Error(`Cerebras API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch(e) {
    console.error('Cerebras API error:', e);
    throw e;
  }
}

async function callCerebras(prompt) {
  if (!getConfig().cerebrasKey || appState.demoMode) {
    await sleep(800);
    return getDemoResponse(prompt);
  }
  
  return new Promise((resolve, reject) => {
    pendingRequests.push({ prompt, resolve, reject });
    processRequestQueue();
  });
}

// Keep compatibility with existing code
async function callGemini(prompt) {
  return callCerebras(prompt);
}

function getDemoResponse(prompt) {
  if (prompt.includes('JSON') && prompt.includes('summary')) {
    return JSON.stringify({
      summary: "This is a demo summary. With your Cerebras API key configured, this would contain an AI-generated summary of your document. Cerebras provides fast, free AI processing.",
      keyPoints: [
        "Your Cerebras API key is configured and working!",
        "Upload any PDF, TXT, or DOCX document for analysis",
        "Key concepts are extracted and highlighted",
        "Summaries are saved to your Notes library",
        "Generate a quiz from any summary with one click"
      ]
    });
  }
  if (prompt.includes('quiz') || prompt.includes('questions')) {
    return JSON.stringify({
      topic: "Demo Quiz - EduGuide",
      questions: [
        { question: "What is EduGuide?", options: ["Social network", "AI study assistant", "Game", "Email client"], answer: 1, explanation: "EduGuide helps students study with AI." },
        { question: "Which AI powers EduGuide?", options: ["GPT-4", "Claude", "Cerebras", "LLaMA"], answer: 2, explanation: "EduGuide uses Cerebras AI." },
        { question: "What updates after a quiz?", options: ["Nothing", "Score discarded", "Proficiency updates", "Account deleted"], answer: 2, explanation: "Quiz scores update your proficiency tracker." }
      ]
    });
  }
  return "I'm EduGuide, powered by Cerebras AI. Your API key is working! I can help explain concepts, summarize documents, create quizzes, and answer academic questions. What would you like to learn about today?";
}

// Navigation
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  const sideBtn = document.querySelector(`[data-page="${name}"]`);
  if (sideBtn) sideBtn.classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'notes') renderNotes();
  if (name === 'quiz' && typeof renderPastQuizzes === 'function') renderPastQuizzes();

  // Show/hide floating AI Tutor FAB
  const fab = document.getElementById('tutor-fab');
  if (fab) {
    if (name === 'reviewer' || name === 'notes') {
      fab.classList.remove('hidden');
    } else {
      fab.classList.add('hidden');
      // Also close the panel if navigating away
      const panel = document.getElementById('tutor-panel');
      if (panel) panel.classList.add('hidden');
    }
  }
}

// Settings
function loadSettingsInputs() {
  const cfg = getConfig();
  document.getElementById('settings-supabase-url').value = cfg.supabaseUrl;
  document.getElementById('settings-supabase-key').value = cfg.supabaseKey;
  document.getElementById('settings-cerebras-key').value = cfg.cerebrasKey;
}

function saveSettingsConfig() {
  const url = document.getElementById('settings-supabase-url').value.trim();
  const key = document.getElementById('settings-supabase-key').value.trim();
  const cerebras = document.getElementById('settings-cerebras-key').value.trim();
  
  if (url) localStorage.setItem('eg_supabase_url', url);
  if (key) localStorage.setItem('eg_supabase_key', key);
  if (cerebras) localStorage.setItem('eg_cerebras_key', cerebras);
  
  appState.demoMode = false;
  if (url && key) initSupabase();
  showToast('Settings saved! Using Cerebras for AI', 'success');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ notes: appState.notes, quizzes: appState.quizzes, proficiency: appState.proficiency }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eduguide-export.json';
  a.click();
}

function clearAllData() {
  if (!confirm('Clear all notes, quiz history, and proficiency data? This cannot be undone.')) return;
  appState.notes = [];
  appState.quizzes = [];
  appState.proficiency = {};
  persistData();
  renderDashboard();
  renderNotes();
  showToast('Data cleared', '');
}

function toggleTutorPanel() {
  const panel = document.getElementById('tutor-panel');
  if (panel) panel.classList.toggle('hidden');
}

function openNewNoteModal() {
  document.getElementById('new-note-title').value = '';
  document.getElementById('new-note-text').value = '';
  document.getElementById('new-note-char-count').textContent = '';
  document.getElementById('new-note-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-note-title').focus(), 100);
}

function closeNewNoteModal() {
  document.getElementById('new-note-modal').classList.add('hidden');
}

async function summarizeFromNoteModal() {
  const title = document.getElementById('new-note-title').value.trim();
  const text = document.getElementById('new-note-text').value.trim();
  if (!text || text.length < 30) {
    showToast('Please paste some text first (minimum 30 characters).', 'error');
    return;
  }
  // Populate reviewer fields and switch to reviewer page
  document.getElementById('text-input').value = text;
  document.getElementById('note-title-input').value = title;
  closeNewNoteModal();
  showPage('reviewer');
  // Trigger summarize
  await handleSummarize();
}

// Dark Mode Functions
function initDarkMode() {
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (!darkModeToggle) return;
  
  // Check for saved preference
  const savedMode = localStorage.getItem('eg_dark_mode');
  
  // Only apply dark mode if we're NOT on the auth screen
  const authScreen = document.getElementById('auth-screen');
  const isAuthScreenVisible = authScreen && authScreen.style.display !== 'none';
  
  if (savedMode === 'enabled' && !isAuthScreenVisible) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  darkModeToggle.addEventListener('click', function() {
    // Check if we're currently on auth screen
    const authScreenNow = document.getElementById('auth-screen');
    const isAuthVisible = authScreenNow && authScreenNow.style.display !== 'none';
    
    // Only toggle if we're in the app, not on auth screen
    if (!isAuthVisible) {
      document.body.classList.toggle('dark-mode');
      
      if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('eg_dark_mode', 'enabled');
      } else {
        localStorage.setItem('eg_dark_mode', 'disabled');
      }
    }
  });
}

// Event listeners setup
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuth(tab.getAttribute('data-auth-tab') || (tab.textContent.includes('Sign In') ? 'login' : 'signup')));
  });
  document.getElementById('login-btn')?.addEventListener('click', handleLogin);
  document.getElementById('signup-btn')?.addEventListener('click', handleSignup);
  document.getElementById('google-btn')?.addEventListener('click', handleGoogleAuth);
  document.getElementById('google-btn-2')?.addEventListener('click', handleGoogleAuth);
  document.getElementById('save-config-btn')?.addEventListener('click', saveConfig);
  document.getElementById('skip-config-btn')?.addEventListener('click', skipConfig);
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('save-settings-btn')?.addEventListener('click', saveSettingsConfig);
  document.getElementById('export-data-btn')?.addEventListener('click', exportData);
  document.getElementById('clear-data-btn')?.addEventListener('click', clearAllData);
  document.getElementById('summarize-btn')?.addEventListener('click', handleSummarize);
  document.getElementById('clear-reviewer-btn')?.addEventListener('click', clearReviewer);
  document.getElementById('save-note-btn')?.addEventListener('click', saveNote);
  document.getElementById('generate-quiz-btn')?.addEventListener('click', handleGenerateQuiz);
  document.getElementById('next-btn')?.addEventListener('click', nextQuestion);
  document.getElementById('retake-quiz-btn')?.addEventListener('click', retakeQuiz);
  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('file-input')?.addEventListener('change', handleFileUpload);
  
  document.querySelectorAll('.chat-suggestion').forEach(btn => {
    btn.addEventListener('click', () => sendSuggestion(btn.getAttribute('data-suggestion')));
  });

  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.getAttribute('data-page')));
  });

  document.getElementById('new-note-text')?.addEventListener('input', function() {
    const count = this.value.length;
    const el = document.getElementById('new-note-char-count');
    if (el) el.textContent = count > 0 ? `${count.toLocaleString()} chars` : '';
  });

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        const fakeEvt = { target: { files: [file] } };
        handleFileUpload(fakeEvt);
      }
    });
  }

  initSupabase();
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) enterApp(data.session.user);
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) enterApp(session.user);
    });
  }
  
  initDarkMode();

  // Password visibility toggle - direct implementation
  const toggleButtons = document.querySelectorAll('.toggle-password');
  console.log('Found toggle buttons:', toggleButtons.length);

  toggleButtons.forEach(button => {
    button.addEventListener('click', function() {
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const eyeIcon = this.querySelector('.toggle-icon-eye');
      const eyeOffIcon = this.querySelector('.toggle-icon-eye-off');
      
      if (input.type === 'password') {
        input.type = 'text';
        if (eyeIcon) eyeIcon.style.display = 'none';
        if (eyeOffIcon) eyeOffIcon.style.display = 'inline-block';
      } else {
        input.type = 'password';
        if (eyeIcon) eyeIcon.style.display = 'inline-block';
        if (eyeOffIcon) eyeOffIcon.style.display = 'none';
      }
    });
  });

  // Enter key submit
  const loginPassword = document.getElementById('login-password');
  const signupPassword = document.getElementById('signup-password');

  if (loginPassword) {
    loginPassword.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('login-btn').click();
      }
    });
  }

  if (signupPassword) {
    signupPassword.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('signup-btn').click();
      }
    });
  }
});