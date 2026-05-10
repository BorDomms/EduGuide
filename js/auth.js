// auth.js - Authentication with strict Supabase credential checking

window.supabaseClient = null;
window.currentUser    = null;

/* ── Boot: initialise Supabase immediately ── */
function initSupabase() {
  const cfg = getConfig();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    try {
      supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    } catch(e) {
      console.warn('Supabase init failed:', e);
    }
  }
}

/* ── Tab toggle ── */
function switchAuth(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs[0].classList.toggle('active', tab === 'login');
  tabs[1].classList.toggle('active', tab === 'signup');
  document.getElementById('login-form').classList.toggle('hidden',  tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
  // Clear any errors when switching
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('signup-error').classList.add('hidden');
}

/* ════════════════════════════════════════════
   LOGIN  — must match a real Supabase account
════════════════════════════════════════════ */
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');

  errEl.classList.add('hidden');

  // Basic client-side validation
  if (!email || !pass) {
    showAuthError('login', 'Please enter your email and password.');
    return;
  }
  if (!isValidEmail(email)) {
    showAuthError('login', 'Please enter a valid email address.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';

  // Require Supabase — no demo fallback for login
  if (!supabaseClient) {
    showAuthError('login', 'Authentication service unavailable. Please refresh and try again.');
    resetBtn(btn, 'Sign in');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: pass
    });

    if (error) {
      // Map Supabase error codes to friendly messages
      handleSupabaseAuthError('login', error);
      resetBtn(btn, 'Sign in');
      return;
    }

    if (!data.user) {
      showAuthError('login', 'Login failed. Please try again.');
      resetBtn(btn, 'Sign in');
      return;
    }

    // ✅ Credentials matched — enter the app
    await enterApp(data.user);

  } catch(e) {
    console.error('Login error:', e);
    showAuthError('login', 'An unexpected error occurred. Please try again.');
    resetBtn(btn, 'Sign in');
  }
}

/* ════════════════════════════════════════════
   SIGNUP  — create account + profile row
════════════════════════════════════════════ */
async function handleSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  const btn   = document.getElementById('signup-btn');

  errEl.classList.add('hidden');

  // Validation
  if (!name || !email || !pass) {
    showAuthError('signup', 'Please fill in all fields.');
    return;
  }
  if (!isValidEmail(email)) {
    showAuthError('signup', 'Please enter a valid email address.');
    return;
  }
  if (pass.length < 8) {
    showAuthError('signup', 'Password must be at least 8 characters.');
    return;
  }
  if (name.length < 2) {
    showAuthError('signup', 'Please enter your full name.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account…';

  if (!supabaseClient) {
    showAuthError('signup', 'Authentication service unavailable. Please refresh and try again.');
    resetBtn(btn, 'Create account');
    return;
  }

  try {
    // 1. Create the auth user
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name }
      }
    });

    if (error) {
      handleSupabaseAuthError('signup', error);
      resetBtn(btn, 'Create account');
      return;
    }

    if (!data.user) {
      showAuthError('signup', 'Signup failed. Please try again.');
      resetBtn(btn, 'Create account');
      return;
    }

    // 2. Insert into profiles table (NEW CODE)
    try {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: data.user.id,
          full_name: name,
          email: email,
          created_at: new Date().toISOString()
        });
      
      if (profileError) {
        console.warn('Profile insert warning:', profileError.message);
      } else {
        console.log('Profile created for user:', data.user.id);
      }
    } catch(profileErr) {
      console.warn('Could not write to profiles table:', profileErr.message);
    }

    // 3. If email confirmation is required, tell the user
    if (!data.session) {
      showAuthError('signup',
        '✅ Account created! Check your email to confirm your address, then sign in.',
        'success'
      );
      resetBtn(btn, 'Create account');
      // Auto-switch to login tab after a short delay
      setTimeout(() => switchAuth('login'), 2500);
      return;
    }

    // 4. Confirmation not required — go straight in
    await enterApp(data.user);

  } catch(e) {
    console.error('Signup error:', e);
    showAuthError('signup', 'An unexpected error occurred. Please try again.');
    resetBtn(btn, 'Create account');
  }
}

/* ════════════════════════════════════════════
   GOOGLE OAUTH
════════════════════════════════════════════ */
async function handleGoogleAuth() {
  if (!supabaseClient) {
    showAuthError('login', 'Authentication service unavailable.');
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo: window.location.href }
  });

  if (error) showToast('Google sign-in failed: ' + error.message, 'error');
}

/* ════════════════════════════════════════════
   ENTER APP  — load all user data from Supabase
════════════════════════════════════════════ */
async function enterApp(user) {
  currentUser = user;

  // Update UI
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.remove('hidden');

  // Restore dark mode preference after login
  const savedMode = localStorage.getItem('eg_dark_mode');
  if (savedMode === 'enabled') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const email = user.email || '';

  // Update SIDEBAR user display (bottom left)
  const sidebarAvatar = document.getElementById('user-avatar-sidebar');
  const sidebarName = document.getElementById('user-name-sidebar');
  const sidebarEmail = document.getElementById('user-email-sidebar');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarEmail) sidebarEmail.textContent = email;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('welcome-msg').textContent = `${greet}, ${name.split(' ')[0]} 👋`;

  // Load all user data from Supabase
  await loadUserDataFromSupabase();
  loadSettingsInputs();
}

/* ════════════════════════════════════════════
   LOAD USER DATA FROM SUPABASE
════════════════════════════════════════════ */
async function loadUserDataFromSupabase() {
  if (!supabaseClient || !currentUser) return;

  try {
    // ── Notes ──
    const { data: notesData, error: notesError } = await supabaseClient
      .from('notes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (notesError) {
      console.warn('Notes load error:', notesError.message);
    } else {
      appState.notes = notesData || [];
    }

    // ── Quizzes ──
    const { data: quizzesData, error: quizzesError } = await supabaseClient
      .from('quizzes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date_taken', { ascending: false });

    if (quizzesError) {
      console.warn('Quizzes load error:', quizzesError.message);
    } else {
      appState.quizzes = (quizzesData || []).map(q => ({
        id:        q.id,
        topic:     q.topic,
        score:     q.score,
        correct:   q.correct,
        total:     q.total,
        date:      q.date_taken,
        date_taken: q.date_taken
      }));
    }

    // ── Proficiency ──
    const { data: profData, error: profError } = await supabaseClient
      .from('proficiency')
      .select('*')
      .eq('user_id', currentUser.id);

    if (profError) {
      console.warn('Proficiency load error:', profError.message);
    } else {
      const profMap = {};
      (profData || []).forEach(p => { profMap[p.subject] = p.percentage; });
      appState.proficiency = profMap;
    }

    // Re-render with fresh data
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderNotes     === 'function') renderNotes();

  } catch(e) {
    console.error('Error loading data from Supabase:', e);
    showToast('Could not load your data. Please refresh.', 'error');
  }
}

/* ════════════════════════════════════════════
   SUPABASE WRITE HELPERS
════════════════════════════════════════════ */
async function saveNoteToSupabase(note) {
  if (!supabaseClient || !currentUser) return false;
  const { error } = await supabaseClient.from('notes').insert({
    id:            note.id,
    user_id:       currentUser.id,
    title:         note.title,
    original_text: note.originalText,
    summary:       note.summary,
    key_points:    note.keyPoints,
    created_at:    new Date(note.createdAt).toISOString()
  });
  if (error) { console.error('Note save error:', error.message); return false; }
  return true;
}

async function deleteNoteFromSupabase(noteId) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from('notes').delete()
    .eq('id', noteId).eq('user_id', currentUser.id);
  if (error) console.error('Note delete error:', error.message);
}

async function saveQuizToSupabase(quiz) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from('quizzes').insert({
    id:         quiz.id,
    user_id:    currentUser.id,
    topic:      quiz.topic,
    score:      quiz.score,
    correct:    quiz.correct,
    total:      quiz.total,
    date_taken: new Date(quiz.date).toISOString()
  });
  if (error) console.error('Quiz save error:', error.message);
}

async function saveProficiencyToSupabase(subject, percentage) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from('proficiency').upsert({
    user_id:    currentUser.id,
    subject:    subject,
    percentage: percentage
  }, { onConflict: 'user_id,subject' });
  if (error) console.error('Proficiency save error:', error.message);
}

/* ════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════ */
function handleLogout() {
  if (supabaseClient) supabaseClient.auth.signOut();
  currentUser = null;
  
  // Clear in-memory state
  appState.notes       = [];
  appState.quizzes     = [];
  appState.proficiency = {};
  appState.currentSummary = null;
  
  // Show auth screen
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').style.display = 'grid';
  
  // Force remove dark mode when on auth screen
  document.body.classList.remove('dark-mode');
  
  // RESET ALL AUTH BUTTONS AND FORMS
  // Reset login button
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Sign in';
  }
  
  // Reset signup button
  const signupBtn = document.getElementById('signup-btn');
  if (signupBtn) {
    signupBtn.disabled = false;
    signupBtn.innerHTML = 'Create account';
  }
  
  // Clear any error messages
  const loginError = document.getElementById('login-error');
  if (loginError) loginError.classList.add('hidden');
  
  const signupError = document.getElementById('signup-error');
  if (signupError) signupError.classList.add('hidden');
  
  // Clear input fields for better UX
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const signupName = document.getElementById('signup-name');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  
  if (loginEmail) loginEmail.value = '';
  if (loginPassword) loginPassword.value = '';
  if (signupName) signupName.value = '';
  if (signupEmail) signupEmail.value = '';
  if (signupPassword) signupPassword.value = '';
  
  // Reset password field types back to password
  if (loginPassword) loginPassword.type = 'password';
  if (signupPassword) signupPassword.type = 'password';
  
  // Reset password toggle icons
  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(button => {
    const eyeIcon = button.querySelector('.toggle-icon-eye');
    const eyeOffIcon = button.querySelector('.toggle-icon-eye-off');
    if (eyeIcon) eyeIcon.style.display = 'inline-block';
    if (eyeOffIcon) eyeOffIcon.style.display = 'none';
  });
  
  // Make sure we're on the login tab
  switchAuth('login');
  
  showToast('Signed out successfully');
}

/* ════════════════════════════════════════════
   CONFIG MODAL (settings shortcut)
════════════════════════════════════════════ */
function saveConfig() {
  const url      = document.getElementById('cfg-supabase-url')?.value.trim();
  const key      = document.getElementById('cfg-supabase-key')?.value.trim();
  const cerebras = document.getElementById('cfg-cerebras-key')?.value.trim();
  if (!url || !key) { showToast('Please fill Supabase fields', 'error'); return; }
  saveConfigToLocal(url, key, cerebras);
  document.getElementById('config-modal')?.classList.add('hidden');
  initSupabase();
  showToast('Configuration saved!', 'success');
}

function skipConfig() {
  // NO DEMO MODE - Require real Supabase configuration
  showToast('❌ Please configure your Supabase credentials to use EduGuide.', 'error');
  // Do nothing - stay on config modal
}

/* ════════════════════════════════════════════
   INTERNAL HELPERS
════════════════════════════════════════════ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resetBtn(btn, label) {
  btn.disabled  = false;
  btn.innerHTML = label;
}

/**
 * Show an error (or success) message in the auth form.
 * type = 'error' | 'success'
 */
function showAuthError(form, message, type = 'error') {
  const el = document.getElementById(`${form}-error`);
  if (!el) return;
  el.textContent = message;
  el.style.background = type === 'success' ? '#f0fdf4' : '';
  el.style.color      = type === 'success' ? '#166534' : '';
  el.style.borderColor = type === 'success' ? '#bbf7d0' : '';
  el.classList.remove('hidden');
}

/**
 * Map Supabase error codes/messages to user-friendly strings.
 */
function handleSupabaseAuthError(form, error) {
  const msg = error.message || '';
  const code = error.code  || '';

  let friendly = 'Something went wrong. Please try again.';

  if (msg.includes('Invalid login credentials') || code === 'invalid_credentials') {
    friendly = 'Incorrect email or password. Please check your credentials.';
  } else if (msg.includes('Email not confirmed') || code === 'email_not_confirmed') {
    friendly = 'Please confirm your email address before signing in. Check your inbox.';
  } else if (msg.includes('User already registered') || code === '23505' || msg.includes('already been registered')) {
    friendly = 'An account with this email already exists. Please sign in instead.';
  } else if (msg.includes('Password should be')) {
    friendly = 'Password is too weak. Use at least 8 characters.';
  } else if (msg.includes('Unable to validate email') || msg.includes('invalid email')) {
    friendly = 'This email address is not valid.';
  } else if (msg.includes('rate limit') || code === 'over_email_send_rate_limit') {
    friendly = 'Too many attempts. Please wait a minute and try again.';
  } else if (msg.includes('network') || msg.includes('fetch')) {
    friendly = 'Network error. Please check your connection.';
  } else if (msg) {
    friendly = msg; // fallback to raw message if unrecognised
  }

  showAuthError(form, friendly);
}