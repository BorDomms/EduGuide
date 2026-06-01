// folders.js - Folder system for Notes

// ── State ─────────────────────────────────────────────
// appState.folders = [{ id, name, noteIds[], createdAt }]
// Initialised in utils.js via loadLocalData / Supabase sync

let activeFolderPanel = null; // folder id currently shown in the floating panel
let draggedNoteId     = null; // id of note being dragged

// ── Bootstrap ─────────────────────────────────────────
function initFolders() {
  if (!appState.folders) appState.folders = [];
}

// ── Persistence helpers ───────────────────────────────
function saveFolders() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient &&
      typeof currentUser !== 'undefined' && currentUser) {
    saveFoldersToSupabase();
  } else {
    persistData();
  }
}

async function saveFoldersToSupabase() {
  // Store folders as a single JSON blob in a user_meta row if you have that table,
  // otherwise fall back to localStorage so the feature still works.
  try {
    const { error } = await supabaseClient
      .from('user_meta')
      .upsert({ user_id: currentUser.id, folders: appState.folders }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch(e) {
    console.warn('Folder cloud-save skipped (table may not exist), saving locally:', e.message);
    persistData();
  }
}

async function loadFoldersFromSupabase() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_meta')
      .select('folders')
      .eq('user_id', currentUser.id)
      .single();
    if (!error && data?.folders) {
      appState.folders = data.folders;
    }
  } catch(e) {
    console.warn('Could not load folders from Supabase:', e.message);
  }
}

// ── Create folder ─────────────────────────────────────
function openCreateFolderModal() {
  document.getElementById('folder-modal-title').textContent = 'New Folder';
  document.getElementById('folder-name-input').value = '';
  document.getElementById('folder-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 80);
}

function closeCreateFolderModal() {
  document.getElementById('folder-modal').classList.add('hidden');
}

function confirmCreateFolder() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) { showToast('Please enter a folder name.', 'error'); return; }

  const folder = { id: uid(), name, noteIds: [], createdAt: Date.now() };
  appState.folders.push(folder);
  saveFolders();
  renderNotes();
  closeCreateFolderModal();
  showToast(`Folder "${name}" created!`, 'success');
}

// ── Delete folder ─────────────────────────────────────
function deleteFolder(folderId) {
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder) return;

  // Custom confirm modal
  document.getElementById('del-folder-name').textContent = folder.name;
  document.getElementById('del-folder-id').value = folderId;
  document.getElementById('delete-folder-modal').classList.remove('hidden');
}

function cancelDeleteFolder() {
  document.getElementById('delete-folder-modal').classList.add('hidden');
}

function confirmDeleteFolder() {
  const folderId = document.getElementById('del-folder-id').value;
  appState.folders = appState.folders.filter(f => f.id !== folderId);
  saveFolders();
  if (activeFolderPanel === folderId) closeFolderPanel();
  renderNotes();
  document.getElementById('delete-folder-modal').classList.add('hidden');
  showToast('Folder deleted.', '');
}

// ── Folder panel (floating) ────────────────────────────
function openFolderPanel(folderId) {
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder) return;
  activeFolderPanel = folderId;

  const panel = document.getElementById('folder-panel');
  document.getElementById('folder-panel-title').textContent = folder.name;

  renderFolderPanelNotes(folder);
  panel.classList.remove('hidden');
  // Small delay so CSS transition fires
  requestAnimationFrame(() => panel.classList.add('open'));
}

function closeFolderPanel() {
  activeFolderPanel = null;
  const panel = document.getElementById('folder-panel');
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('hidden'), 260);
}

function renderFolderPanelNotes(folder) {
  const list = document.getElementById('folder-panel-notes');
  const folderNotes = (folder.noteIds || [])
    .map(id => appState.notes.find(n => n.id === id))
    .filter(Boolean);

  if (folderNotes.length === 0) {
    list.innerHTML = `
      <div class="folder-panel-empty">
        <div style="font-size:2rem;margin-bottom:0.5rem;">📂</div>
        <p>No notes here yet.<br/>Drag a note card into this folder to add it.</p>
      </div>`;
    return;
  }

  list.innerHTML = folderNotes.map(n => `
    <div class="folder-panel-note-item" onclick="openNote('${n.id}')">
      <div style="flex:1;min-width:0;">
        <div class="folder-panel-note-title">${escHtml(n.title)}</div>
        <div class="folder-panel-note-meta">${new Date(n.created_at || n.createdAt).toLocaleDateString()}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn-outline folder-note-remove-btn"
          onclick="event.stopPropagation();removeNoteFromFolder('${n.id}','${folder.id}')"
          title="Remove from folder"
          style="padding:4px 8px;font-size:0.7rem;color:var(--ink-3);border-color:var(--border-med);">
          <i class="fas fa-folder-minus"></i>
        </button>
        <button class="btn-outline"
          onclick="event.stopPropagation();deleteNote('${n.id}')"
          title="Delete note"
          style="padding:4px 8px;font-size:0.7rem;color:var(--danger);border-color:var(--danger);">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function refreshFolderPanel() {
  if (!activeFolderPanel) return;
  const folder = appState.folders.find(f => f.id === activeFolderPanel);
  if (folder) renderFolderPanelNotes(folder);
}

// ── Add / remove note from folder ─────────────────────
function addNoteToFolder(noteId, folderId) {
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.noteIds.includes(noteId)) {
    folder.noteIds.push(noteId);
    saveFolders();
    renderNotes();
    refreshFolderPanel();
    showToast('Note moved to folder!', 'success');
  }
}

function removeNoteFromFolder(noteId, folderId) {
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder) return;
  folder.noteIds = folder.noteIds.filter(id => id !== noteId);
  saveFolders();
  renderNotes();
  refreshFolderPanel();
  showToast('Note removed from folder.', '');
}

// ── Drag-and-drop ──────────────────────────────────────
function onNoteDragStart(e, noteId) {
  draggedNoteId = noteId;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

function onNoteDragEnd(e) {
  draggedNoteId = null;
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.folder-card').forEach(el => el.classList.remove('drag-over'));
}

function onFolderDragOver(e, folderId) {
  if (!draggedNoteId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.folder-card').forEach(el => el.classList.remove('drag-over'));
  document.querySelector(`.folder-card[data-folder-id="${folderId}"]`)?.classList.add('drag-over');
}

function onFolderDragLeave(folderId) {
  document.querySelector(`.folder-card[data-folder-id="${folderId}"]`)?.classList.remove('drag-over');
}

function onFolderDrop(e, folderId) {
  e.preventDefault();
  document.querySelector(`.folder-card[data-folder-id="${folderId}"]`)?.classList.remove('drag-over');
  if (draggedNoteId) {
    addNoteToFolder(draggedNoteId, folderId);
    draggedNoteId = null;
  }
}

// ── Helpers ────────────────────────────────────────────
function noteIsInAnyFolder(noteId) {
  return appState.folders.some(f => f.noteIds.includes(noteId));
}