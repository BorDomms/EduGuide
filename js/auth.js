// auth.js - Authentication handling

let supabaseClient = null;
let currentUser = null;

function initSupabase() {
  const cfg = getConfig();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    try {
      supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    } catch(e) { console.warn('Supabase init failed:', e); }
  }
}

function switchAuth(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs[0].classList.toggle('active', tab === 'login');
  tabs[1].classList.toggle('active', tab === 'signup');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  errEl.classList.add('hidden');
  if (!email || !pass) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';

  if (appState.demoMode || !supabaseClient) {
    await sleep(1000);
    enterApp({ email, user_metadata: { full_name: email.split('@')[0] } });
    btn.disabled = false;
    btn.innerHTML = 'Sign in';
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    enterApp(data.user);
  } catch(e) {
    errEl.textContent = e.message || 'Login failed. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = 'Sign in';
  }
}

async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  const btn = document.getElementById('signup-btn');

  errEl.classList.add('hidden');
  if (!name || !email || !pass) {
    errEl.textContent = 'Please fill all fields.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pass.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account…';

  if (appState.demoMode || !supabaseClient) {
    await sleep(1000);
    enterApp({ email, user_metadata: { full_name: name } });
    btn.disabled = false;
    btn.innerHTML = 'Create account';
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name } }
    });
    if (error) throw error;
    if (data.user && !data.session) {
      showToast('Check your email to confirm your account!', 'success');
      btn.disabled = false;
      btn.innerHTML = 'Create account';
    } else {
      enterApp(data.user);
    }
  } catch(e) {
    errEl.textContent = e.message || 'Signup failed. Please try again.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = 'Create account';
  }
}

async function handleGoogleAuth() {
  if (appState.demoMode || !supabaseClient) {
    enterApp({ email: 'google@eduguide.app', user_metadata: { full_name: 'Google User' } });
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) showToast('Google auth failed: ' + error.message, 'error');
}

function handleLogout() {
  if (supabaseClient) supabaseClient.auth.signOut();
  currentUser = null;
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').style.display = 'grid';
  showToast('Signed out successfully');
}

function enterApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.remove('hidden');

  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name-display').textContent = name.split(' ')[0];

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('welcome-msg').textContent = `${greet}, ${name.split(' ')[0]} 👋`;

  loadLocalData();
  renderDashboard();
  loadSettingsInputs();

  if (!getConfig().cerebrasKey && !appState.demoMode) {
    document.getElementById('config-modal').classList.remove('hidden');
    document.getElementById('cfg-supabase-url').value = getConfig().supabaseUrl;
    document.getElementById('cfg-supabase-key').value = getConfig().supabaseKey;
  }
}

function saveConfig() {
  const url = document.getElementById('cfg-supabase-url').value.trim();
  const key = document.getElementById('cfg-supabase-key').value.trim();
  const cerebras = document.getElementById('cfg-cerebras-key').value.trim();
  
  if (!url || !key) {
    showToast('Please fill Supabase fields', 'error');
    return;
  }
  
  saveConfigToLocal(url, key, cerebras);
  document.getElementById('config-modal').classList.add('hidden');
  initSupabase();
  showToast('Configuration saved! Using Cerebras for AI', 'success');
}

function skipConfig() {
  appState.demoMode = true;
  document.getElementById('config-modal').classList.add('hidden');
  enterApp({ email: 'demo@eduguide.app', user_metadata: { full_name: 'Demo User' } });
  showToast('Running in demo mode — AI features use placeholder responses', '');
}