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
   GOOGLE OAUTH - WITH CONFLICT HANDLING
════════════════════════════════════════════ */
async function handleGoogleAuth() {
  if (!supabaseClient) {
    showAuthError('login', 'Authentication service unavailable.');
    return;
  }

  // CLEAR EXISTING SESSION before starting OAuth
  await supabaseClient.auth.signOut();
  
  // Clear local storage auth tokens
  const supabaseUrl = getConfig().supabaseUrl;
  if (supabaseUrl) {
    const storageKey = `sb-${supabaseUrl.replace(/[^a-zA-Z0-9]/g, '')}-auth-token`;
    localStorage.removeItem(storageKey);
  }

  const btn = document.getElementById('google-btn') || document.getElementById('google-btn-2');
  const originalText = btn ? btn.innerHTML : '';
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Redirecting...';
  }

  try {
    // Get the email from the login form if user is trying to sign in
    const loginEmail = document.getElementById('login-email')?.value.trim();
    
    // If user entered an email in login form, check if it exists as email/password account
    if (loginEmail && isValidEmail(loginEmail)) {
      // Try to check if account exists with email/password (no API for direct check, but we can attempt)
      showToast('Checking existing account...', '');
      
      // Attempt to sign in with a fake password to see if email exists
      // This is a hack, but Supabase doesn't expose a "user exists" endpoint
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail,
        password: 'temp-password-check-' + Date.now()
      });
      
      // If error is "Invalid login credentials", the email exists (but password is wrong)
      // If error is "User not found", then no account exists with that email
      if (error && error.message.includes('Invalid login credentials')) {
        // Email exists with password - ask user what to do
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
        
        const shouldLink = confirm(
          `An account with ${loginEmail} already exists with email/password.\n\n` +
          `Would you like to link your Google account to the existing account?\n\n` +
          `• Click "OK" to link accounts (you can then use both methods)\n` +
          `• Click "Cancel" to stay on the login page\n\n` +
          `If you link, you'll be able to sign in with either method.`
        );
        
        if (!shouldLink) {
          return;
        }
        
        // User wants to link - we need to sign in with email/password first
        // This requires the user to enter their password
        const password = prompt(
          `Please enter your password for ${loginEmail} to link your Google account.\n\n` +
          `This is required for security to verify you own the account.`
        );
        
        if (!password) {
          showToast('Password required to link accounts.', 'error');
          return;
        }
        
        // Sign in with email/password
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: loginEmail,
          password: password
        });
        
        if (signInError) {
          showToast('Invalid password. Account linking failed.', 'error');
          return;
        }
        
        if (signInData.session) {
          // Now link Google account to this session
          const { error: linkError } = await supabaseClient.auth.linkIdentity({
            provider: 'google',
            options: {
              redirectTo: window.location.origin + window.location.pathname,
              queryParams: { prompt: 'select_account' }
            }
          });
          
          if (linkError) {
            console.error('Link error:', linkError);
            showToast('Failed to link Google account. Please try again.', 'error');
          } else {
            showToast('Google account linked! You can now sign in with either method.', 'success');
            // User is now signed in with linked account
            await enterApp(signInData.user);
          }
          return;
        }
      }
    }
    
    // Normal Google sign-in flow (no conflict detected)
    const cleanUrl = window.location.origin + window.location.pathname;
    
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: cleanUrl,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });

    if (error) {
      console.error('Google sign-in error:', error);
      showToast('Google sign-in failed: ' + error.message, 'error');
    }
    
  } catch (err) {
    console.error('Google auth error:', err);
    showToast('Authentication error. Please try again.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
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
  
  // IMPROVED: Check if user has a password (can change it) vs OAuth-only
  const hasPassword = user.identities?.some(i => i.provider === 'email') || 
                      user.app_metadata?.provider === 'email';
  const isOAuthOnly = !hasPassword && hasGoogleIdentity(user);

  // Store the user type in a data attribute
  document.body.setAttribute('data-auth-provider', isOAuthOnly ? 'google-only' : (hasPassword ? 'email' : 'mixed'));

  // Update SIDEBAR user display
  const sidebarAvatar = document.getElementById('user-avatar-sidebar');
  const sidebarName = document.getElementById('user-name-sidebar');
  const sidebarEmail = document.getElementById('user-email-sidebar');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarEmail) sidebarEmail.textContent = email;

  // Update SETTINGS profile display - with null checks
  const settingsName = document.getElementById('settings-full-name');
  const settingsEmail = document.getElementById('settings-email');
  
  if (settingsName) {
    settingsName.value = name;
    if (isOAuthOnly) {
      settingsName.disabled = true;
      settingsName.title = "Name is managed by Google. Change it in your Google account.";
    } else {
      settingsName.disabled = false;
    }
  }
  if (settingsEmail) settingsEmail.value = email;

  // IMPROVED: Show/hide password change button based on whether user HAS a password
  const changePasswordBtn = document.getElementById('change-password-btn');
  if (changePasswordBtn) {
    if (isOAuthOnly) {
      changePasswordBtn.disabled = true;
      changePasswordBtn.title = "This account uses Google Sign-In only. No password is set.";
      changePasswordBtn.style.opacity = '0.5';
      changePasswordBtn.style.cursor = 'not-allowed';
      changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Password (Google Account)';
    } else {
      changePasswordBtn.disabled = false;
      changePasswordBtn.title = "";
      changePasswordBtn.style.opacity = '1';
      changePasswordBtn.style.cursor = 'pointer';
      changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Change Password';
    }
  }

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const welcomeMsg = document.getElementById('welcome-msg');
  if (welcomeMsg) welcomeMsg.textContent = `${greet}, ${name.split(' ')[0]}`;

  // Load all user data from Supabase
  await loadUserDataFromSupabase();
  
  // Only load settings inputs if the elements exist
  if (document.getElementById('settings-supabase-url')) {
    loadSettingsInputs();
  }

  const googleWarning = document.getElementById('google-name-warning');
  if (googleWarning) {
    googleWarning.style.display = isOAuthOnly ? 'flex' : 'none';
  }
}

/* ════════════════════════════════════════════
   USER TYPE HELPERS
════════════════════════════════════════════ */
function isOAuthOnlyUser(user) {
  // Returns TRUE if user ONLY has OAuth (no password)
  // Returns FALSE if user has password (even if they also have Google linked)
  
  // Check if user has an email confirmed password identity
  const hasPasswordIdentity = user.identities?.some(identity => 
    identity.provider === 'email' && identity.provider_id?.includes('email')
  );
  
  // Also check if there's a password set (users can have both)
  const isEmailProvider = user.app_metadata?.provider === 'email';
  const hasPassword = user.email_confirmed_at && !isEmailProvider;
  
  // If they have any email/password identity, they can change password
  const canChangePassword = hasPasswordIdentity || hasPassword || user.app_metadata?.provider === 'email';
  
  return !canChangePassword;
}

function hasGoogleIdentity(user) {
  return user.identities?.some(i => i.provider === 'google') || 
         user.app_metadata?.provider === 'google';
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
    const { data: quizzesData, error: quizzesError } = await window.supabaseClient
      .from('quizzes')
      .select('*')
      .eq('user_id', window.currentUser.id)
      .order('date_taken', { ascending: false });

    if (quizzesError) {
      console.warn('⚠️ Quizzes load error:', quizzesError.message);
    } else {
      appState.quizzes = (quizzesData || []).map(q => ({
        id:        q.id,
        topic:     q.topic,
        score:     q.score,
        correct:   q.correct,
        total:     q.total,
        questions: q.questions || [],
        date:      q.date_taken,
        date_taken: q.date_taken
      }));
      console.log(`✅ Loaded ${appState.quizzes.length} quizzes from Supabase`);
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

    // ── Folders ──
    const { data: foldersData, error: foldersError } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (foldersError) {
      console.warn('Folders load error:', foldersError.message);
    } else {
      appState.folders = (foldersData || []).map(f => ({
        id:       f.id,
        name:     f.name,
        note_ids: f.note_ids || [],
        createdAt: f.created_at
      }));
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

// auth.js - Updated saveQuizToSupabase function

async function saveQuizToSupabase(quiz) {
  // Use the global supabaseClient and currentUser
  if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient || 
      typeof window.currentUser === 'undefined' || !window.currentUser) {
    console.log('Not saving quiz to Supabase: missing client or user');
    persistData();
    return false;
  }
  
  try {
    console.log('Attempting to save quiz to Supabase:', quiz);
    
    // Prepare data for Supabase - match the column types exactly
    const quizData = {
      id: quiz.id || uid(),
      user_id: window.currentUser.id,
      topic: quiz.topic || 'Untitled Quiz',
      score: quiz.score || 0,
      correct: quiz.correct || 0,
      total: quiz.total || 0,
      date_taken: quiz.date_taken ? new Date(quiz.date_taken).toISOString() : new Date().toISOString()
    };
    
    console.log('Sending to Supabase:', quizData);
    
    const { data, error } = await window.supabaseClient
      .from('quizzes')
      .insert(quizData)
      .select();
    
    if (error) {
      console.error('Quiz save error:', error.message);
      console.error('Error details:', error);
      persistData();
      return false;
    }
    
    console.log('✅ Quiz saved successfully to Supabase:', data);
    return true;
  } catch(e) {
    console.error('❌ Quiz save exception:', e);
    persistData();
    return false;
  }
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
   FOLDER SUPABASE HELPERS
════════════════════════════════════════════ */
async function saveFolderToSupabase(folder) {
  if (!supabaseClient || !currentUser) return false;
  const { error } = await supabaseClient.from('folders').insert({
    id:       folder.id,
    user_id:  currentUser.id,
    name:     folder.name,
    note_ids: folder.note_ids || []
  });
  if (error) { console.error('Folder save error:', error.message); return false; }
  return true;
}

async function updateFolderInSupabase(folder) {
  if (!supabaseClient || !currentUser) return false;
  const { error } = await supabaseClient.from('folders')
    .update({ name: folder.name, note_ids: folder.note_ids })
    .eq('id', folder.id)
    .eq('user_id', currentUser.id);
  if (error) { console.error('Folder update error:', error.message); return false; }
  return true;
}

async function deleteFolderFromSupabase(folderId) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from('folders').delete()
    .eq('id', folderId).eq('user_id', currentUser.id);
  if (error) console.error('Folder delete error:', error.message);
}

/* ════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════ */
function handleLogout() {
  if (supabaseClient) {
    supabaseClient.auth.signOut();
    // Clear any cached session data
    localStorage.removeItem('sb-' + getConfig().supabaseUrl?.replace(/[^a-zA-Z0-9]/g, '') + '-auth-token');
  }
  
  currentUser = null;
  
  // Clear in-memory state
  appState.notes       = [];
  appState.quizzes     = [];
  appState.proficiency = {};
  appState.folders     = [];
  appState.currentSummary = null;
  
  // Hide AI Tutor FAB and panel
  const tutorFab = document.getElementById('tutor-fab');
  const tutorPanel = document.getElementById('tutor-panel');
  if (tutorFab) tutorFab.classList.add('hidden');
  if (tutorPanel) tutorPanel.classList.add('hidden');
  
  // Show auth screen
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').style.display = 'grid';
  
  // Force remove dark mode when on auth screen
  document.body.classList.remove('dark-mode');
  
  // RESET ALL AUTH BUTTONS AND FORMS
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Sign in';
  }
  
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
  
  // Clear input fields
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
  
  // Hard reload to clear any remaining state
  // (optional - can be removed if not needed)
  // setTimeout(() => window.location.reload(), 100);
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
   PASSWORD RESET HANDLER
════════════════════════════════════════════ */
function handlePasswordReset() {
  // Check if URL contains access_token (from password reset email)
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    // Parse the hash to get the access token
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    
    if (accessToken && type === 'recovery') {
      // Store the recovery tokens temporarily
      sessionStorage.setItem('reset_access_token', accessToken);
      sessionStorage.setItem('reset_refresh_token', refreshToken);
      
      // Show the update password modal
      openUpdatePasswordModal();
      
      // Clean up the URL (remove hash)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

function openUpdatePasswordModal() {
  const modal = document.getElementById('update-password-modal');
  if (modal) {
    document.getElementById('update-new-password').value = '';
    document.getElementById('update-confirm-password').value = '';
    document.getElementById('update-password-error').classList.add('hidden');
    modal.classList.remove('hidden');
  }
}

function closeUpdatePasswordModal() {
  const modal = document.getElementById('update-password-modal');
  if (modal) modal.classList.add('hidden');
  // Clear stored tokens
  sessionStorage.removeItem('reset_access_token');
  sessionStorage.removeItem('reset_refresh_token');
}

async function updatePasswordWithToken() {
  const newPassword = document.getElementById('update-new-password').value;
  const confirmPassword = document.getElementById('update-confirm-password').value;
  const errorEl = document.getElementById('update-password-error');
  
  errorEl.classList.add('hidden');
  
  if (!newPassword || !confirmPassword) {
    showResetErrorMsg(errorEl, 'Please fill in both fields.');
    return;
  }
  
  if (newPassword.length < 8) {
    showResetErrorMsg(errorEl, 'Password must be at least 8 characters.');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showResetErrorMsg(errorEl, 'Passwords do not match.');
    return;
  }
  
  const accessToken = sessionStorage.getItem('reset_access_token');
  if (!accessToken) {
    showResetErrorMsg(errorEl, 'Session expired. Please request a new password reset email.');
    return;
  }
  
  const btn = document.getElementById('update-password-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Updating...';
  
  try {
    // Set the session with the recovery token
    const { error: sessionError } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: sessionStorage.getItem('reset_refresh_token')
    });
    
    if (sessionError) throw sessionError;
    
    // Update the user's password
    const { error } = await supabaseClient.auth.updateUser({
      password: newPassword
    });
    
    if (error) throw error;
    
    showToast('Password updated successfully! Please sign in with your new password.', 'success');
    closeUpdatePasswordModal();
    
    // Sign out and redirect to login
    await supabaseClient.auth.signOut();
    sessionStorage.clear();
    
    setTimeout(() => {
      window.location.href = window.location.origin;
    }, 2000);
    
  } catch(e) {
    console.error('Password update error:', e);
    showResetErrorMsg(errorEl, e.message || 'Failed to update password. Please request a new reset link.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Update Password';
  }
}

function showResetErrorMsg(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}

/* ════════════════════════════════════════════
   INTERNAL HELPERS
════════════════════════════════════════════ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resetBtn(btn, label) {
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = label;
  }
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
    friendly = msg;
  }

  showAuthError(form, friendly);
}