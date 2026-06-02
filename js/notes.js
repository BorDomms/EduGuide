// notes.js - Notes library with Supabase sync

// Store the currently viewed note for editing
let currentViewingNote = null;
let isEditingNote = false;

function renderNotes() {
  const grid = document.getElementById('notes-grid');
  if (appState.notes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><i class="fas fa-book-open"></i></div><h3>No saved notes yet</h3><p>Upload and summarize a document to create your first note.</p></div>`;
    return;
  }
  grid.innerHTML = [...appState.notes].reverse().map(n => `
    <div class="note-card" onclick="openNote('${n.id}')">
      <div class="note-card-title">${escHtml(n.title)}</div>
      <div class="note-card-preview">${escHtml(n.summary || '').substring(0, 120)}${(n.summary || '').length > 120 ? '...' : ''}</div>
      <div class="note-card-footer">
        <span class="note-card-date"><i class="far fa-calendar-alt"></i> ${new Date(n.created_at || n.createdAt).toLocaleDateString()}</span>
        <span class="note-card-badge"><i class="fas fa-list-ul"></i> ${(n.key_points || n.keyPoints || []).length} key points</span>
      </div>
      <div style="position: absolute; top: 12px; right: 12px;">
        <button class="btn-outline" onclick="event.stopPropagation(); deleteNote('${n.id}')" style="padding: 4px 8px; font-size: 0.7rem; color: var(--danger); border-color: var(--danger);"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>
  `).join('');
}

async function deleteNote(id) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  appState.notes = appState.notes.filter(n => n.id !== id);
  
  if (supabaseClient && currentUser) {
    await deleteNoteFromSupabase(id);
  }
  
  renderNotes();
  renderDashboard();
  showToast('Note deleted', '');
}

function openNote(id) {
  const note = appState.notes.find(n => n.id === id);
  if (!note) return;
  
  currentViewingNote = note;
  isEditingNote = false;
  
  const keyPoints = note.key_points || note.keyPoints || [];
  const summary = note.summary || 'No summary available.';
  
  enterViewMode();
  
  document.getElementById('viewer-note-title').textContent = note.title;
  document.getElementById('viewer-summary-text').innerHTML = escHtml(summary).replace(/\n/g, '<br/>');
  
  document.getElementById('edit-note-title').value = note.title;
  document.getElementById('edit-summary-text').value = summary;
  
  const editKeyPointsContainer = document.getElementById('edit-key-points-container');
  if (keyPoints && keyPoints.length > 0) {
    editKeyPointsContainer.innerHTML = keyPoints.map((p, idx) => `
      <div class="edit-key-point-item" style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input type="text" class="edit-key-point" value="${escHtml(p)}" placeholder="Key point ${idx + 1}" style="flex: 1; padding: 10px 12px; background: var(--surface-2); border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.875rem;">
        <button type="button" class="btn-outline remove-key-point" onclick="this.parentElement.remove()" style="padding: 8px 12px; font-size: 0.75rem;"><i class="fas fa-trash-alt"></i></button>
      </div>
    `).join('');
  } else {
    editKeyPointsContainer.innerHTML = '';
  }
  
  const keyPointsList = document.getElementById('viewer-key-points-list');
  if (keyPoints && keyPoints.length > 0) {
    keyPointsList.innerHTML = keyPoints.map(p => `
      <div class="key-point" style="margin-bottom: 8px;">
        <div class="key-point-dot" style="margin-top: 6px;"></div>
        <span>${escHtml(p)}</span>
      </div>
    `).join('');
  } else {
    keyPointsList.innerHTML = '<p style="color: var(--ink-3); font-size: 0.875rem;"><i class="fas fa-info-circle"></i> No key points available.</p>';
  }
  
  document.getElementById('note-viewer-modal').classList.remove('hidden');
}

function enterViewMode() {
  isEditingNote = false;
  document.getElementById('viewer-view-mode').style.display = 'block';
  document.getElementById('viewer-edit-mode').style.display = 'none';
  document.getElementById('viewer-edit-btn').style.display = 'flex';
  document.getElementById('viewer-save-btn').style.display = 'none';
  document.getElementById('viewer-cancel-btn').style.display = 'none';
}

function enterEditMode() {
  if (!currentViewingNote) return;
  isEditingNote = true;
  document.getElementById('viewer-view-mode').style.display = 'none';
  document.getElementById('viewer-edit-mode').style.display = 'block';
  document.getElementById('viewer-edit-btn').style.display = 'none';
  document.getElementById('viewer-save-btn').style.display = 'flex';
  document.getElementById('viewer-cancel-btn').style.display = 'flex';
}

function addKeyPointField() {
  const container = document.getElementById('edit-key-points-container');
  const newIndex = container.children.length;
  const div = document.createElement('div');
  div.className = 'edit-key-point-item';
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.style.marginBottom = '8px';
  div.innerHTML = `
    <input type="text" class="edit-key-point" placeholder="Key point ${newIndex + 1}" style="flex: 1; padding: 10px 12px; background: var(--surface-2); border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.875rem;">
    <button type="button" class="btn-outline remove-key-point" onclick="this.parentElement.remove()" style="padding: 8px 12px; font-size: 0.75rem;"><i class="fas fa-trash-alt"></i></button>
  `;
  container.appendChild(div);
}

async function saveNoteEdit() {
  if (!currentViewingNote) return;
  
  const newTitle = document.getElementById('edit-note-title').value.trim();
  const newSummary = document.getElementById('edit-summary-text').value.trim();
  const keyPointInputs = document.querySelectorAll('#edit-key-points-container .edit-key-point');
  const newKeyPoints = Array.from(keyPointInputs).map(input => input.value.trim()).filter(p => p !== '');
  
  if (!newTitle) {
    showToast('Please enter a title for your note.', 'error');
    return;
  }
  
  if (!newSummary) {
    showToast('Summary cannot be empty.', 'error');
    return;
  }
  
  currentViewingNote.title = newTitle;
  currentViewingNote.summary = newSummary;
  currentViewingNote.keyPoints = newKeyPoints;
  currentViewingNote.key_points = newKeyPoints;
  
  const noteIndex = appState.notes.findIndex(n => n.id === currentViewingNote.id);
  if (noteIndex !== -1) {
    appState.notes[noteIndex] = currentViewingNote;
  }
  
  if (supabaseClient && currentUser) {
    try {
      const { error } = await supabaseClient
        .from('notes')
        .update({
          title: newTitle,
          summary: newSummary,
          key_points: newKeyPoints
        })
        .eq('id', currentViewingNote.id)
        .eq('user_id', currentUser.id);
      
      if (error) throw error;
      showToast('Note updated in cloud! 💾', 'success');
    } catch(e) {
      console.error('Supabase update error:', e);
      persistData();
      showToast('Note saved locally (cloud sync failed)', 'warning');
    }
  } else {
    persistData();
    showToast('Note updated locally! 💾', 'success');
  }
  
  renderNotes();
  renderDashboard();
  openNote(currentViewingNote.id);
}

function cancelEdit() {
  if (!currentViewingNote) return;
  openNote(currentViewingNote.id);
}

function closeNoteViewer() {
  document.getElementById('note-viewer-modal').classList.add('hidden');
  currentViewingNote = null;
  isEditingNote = false;
}
// ═══════════════════════════════════════════
//  FOLDER SYSTEM
// ═══════════════════════════════════════════

let folderPickerTargetNoteId = null;

/* ── Render notes page (folders + ungrouped notes) ── */
// Override the original renderNotes to include folder UI
const _originalRenderNotes = renderNotes;
window.renderNotes = function() {
  renderFolderSection();
  renderUngroupedNotes();
};

function getNoteIdsInFolders() {
  const ids = new Set();
  (appState.folders || []).forEach(f => (f.note_ids || []).forEach(id => ids.add(id)));
  return ids;
}

function renderFolderSection() {
  let container = document.getElementById('folders-section');
  if (!container) {
    // Inject folders section above the notes grid
    const grid = document.getElementById('notes-grid');
    container = document.createElement('div');
    container.id = 'folders-section';
    container.style.cssText = 'margin-bottom: 1.5rem;';
    grid.parentNode.insertBefore(container, grid);
  }

  if ((appState.folders || []).length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <h3 style="font-size:0.8125rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-3);margin-bottom:0.75rem;display:flex;align-items:center;gap:8px;">
      <i class="fas fa-folder"></i> Folders
    </h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px;" id="folder-chips">
      ${(appState.folders || []).map(f => `
        <div class="folder-chip" onclick="toggleFolderView('${f.id}')" id="fchip-${f.id}">
          <i class="fas fa-folder" style="color:var(--amber);margin-right:6px;"></i>
          <span class="folder-chip-name">${escHtml(f.name)}</span>
          <span class="folder-chip-count">${(f.note_ids || []).length}</span>
          <button class="folder-chip-del" title="Delete folder" onclick="event.stopPropagation();deleteFolder('${f.id}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join('')}
    </div>
    <div id="folder-expanded-view" style="margin-top:1rem;"></div>
  `;
}

function renderUngroupedNotes() {
  const grid = document.getElementById('notes-grid');
  const inFolder = getNoteIdsInFolders();
  const ungrouped = [...appState.notes].reverse().filter(n => !inFolder.has(n.id));

  if (appState.notes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><i class="fas fa-book-open"></i></div><h3>No saved notes yet</h3><p>Upload and summarize a document to create your first note.</p></div>`;
    return;
  }

  if (ungrouped.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:1.5rem 0;"><div class="empty-icon" style="font-size:2rem;"><i class="fas fa-folder-open"></i></div><p style="font-size:0.875rem;color:var(--ink-3);">All notes are inside folders.</p></div>`;
    return;
  }

  grid.innerHTML = ungrouped.map(n => buildNoteCard(n)).join('');
}

function buildNoteCard(n) {
  return `
    <div class="note-card" onclick="openNote('${n.id}')">
      <div class="note-card-title">${escHtml(n.title)}</div>
      <div class="note-card-preview">${escHtml(n.summary || '').substring(0, 120)}${(n.summary || '').length > 120 ? '...' : ''}</div>
      <div class="note-card-footer">
        <span class="note-card-date"><i class="far fa-calendar-alt"></i> ${new Date(n.created_at || n.createdAt).toLocaleDateString()}</span>
        <span class="note-card-badge"><i class="fas fa-list-ul"></i> ${(n.key_points || n.keyPoints || []).length} key points</span>
      </div>
      <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px;">
        <button class="btn-outline note-action-btn" title="Move to folder" onclick="event.stopPropagation();openFolderPicker('${n.id}')" style="padding:4px 8px;font-size:0.7rem;color:var(--amber);border-color:var(--amber);">
          <i class="fas fa-folder-plus"></i>
        </button>
        <button class="btn-outline note-action-btn" onclick="event.stopPropagation();deleteNote('${n.id}')" style="padding:4px 8px;font-size:0.7rem;color:var(--danger);border-color:var(--danger);">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    </div>
  `;
}

/* ── Toggle expanded folder view ── */
let expandedFolderId = null;

function toggleFolderView(folderId) {
  const viewEl = document.getElementById('folder-expanded-view');
  if (!viewEl) return;

  if (expandedFolderId === folderId) {
    // Collapse
    expandedFolderId = null;
    viewEl.innerHTML = '';
    document.querySelectorAll('.folder-chip').forEach(c => c.classList.remove('active'));
    return;
  }

  expandedFolderId = folderId;
  document.querySelectorAll('.folder-chip').forEach(c => c.classList.remove('active'));
  const chip = document.getElementById(`fchip-${folderId}`);
  if (chip) chip.classList.add('active');

  renderExpandedFolder(folderId);
}

function renderExpandedFolder(folderId) {
  const folder = (appState.folders || []).find(f => f.id === folderId);
  const viewEl = document.getElementById('folder-expanded-view');
  if (!folder || !viewEl) return;

  const notes = (folder.note_ids || [])
    .map(id => appState.notes.find(n => n.id === id))
    .filter(Boolean);

  viewEl.innerHTML = `
    <div class="folder-expanded-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h4 style="font-size:0.9375rem;font-weight:700;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-folder-open" style="color:var(--amber);"></i> ${escHtml(folder.name)}
          <span style="font-size:0.75rem;color:var(--ink-3);font-weight:400;">${notes.length} note${notes.length !== 1 ? 's' : ''}</span>
        </h4>
      </div>
      ${notes.length === 0
        ? `<p style="font-size:0.875rem;color:var(--ink-3);text-align:center;padding:1rem 0;"><i class="fas fa-inbox"></i> This folder is empty.</p>`
        : `<div class="notes-grid folder-notes-grid">
            ${notes.map(n => `
              <div class="note-card" onclick="openNote('${n.id}')">
                <div class="note-card-title">${escHtml(n.title)}</div>
                <div class="note-card-preview">${escHtml(n.summary || '').substring(0, 120)}${(n.summary || '').length > 120 ? '...' : ''}</div>
                <div class="note-card-footer">
                  <span class="note-card-date"><i class="far fa-calendar-alt"></i> ${new Date(n.created_at || n.createdAt).toLocaleDateString()}</span>
                  <span class="note-card-badge"><i class="fas fa-list-ul"></i> ${(n.key_points || n.keyPoints || []).length} key points</span>
                </div>
                <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px;">
                  <button class="btn-outline note-action-btn" title="Remove from folder" onclick="event.stopPropagation();removeNoteFromFolder('${n.id}','${folderId}')" style="padding:4px 8px;font-size:0.7rem;color:var(--ink-3);border-color:var(--border);">
                    <i class="fas fa-folder-minus"></i>
                  </button>
                  <button class="btn-outline note-action-btn" onclick="event.stopPropagation();deleteNote('${n.id}')" style="padding:4px 8px;font-size:0.7rem;color:var(--danger);border-color:var(--danger);">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            `).join('')}
           </div>`
      }
    </div>
  `;
}

/* ── Create a new folder ── */
async function createFolder(name) {
  if (!name || !name.trim()) return;
  const folder = {
    id: uid(),
    name: name.trim(),
    note_ids: [],
    createdAt: Date.now()
  };
  appState.folders.push(folder);

  if (supabaseClient && currentUser) {
    const ok = await saveFolderToSupabase(folder);
    if (!ok) showToast('Folder saved locally (cloud sync failed)', 'warning');
    else showToast(`Folder "${folder.name}" created!`, 'success');
  } else {
    persistData();
    showToast(`Folder "${folder.name}" created!`, 'success');
  }
  renderNotes();
}

/* ── Delete a folder (notes stay, just removed from folder) ── */
async function deleteFolder(folderId) {
  if (!confirm('Delete this folder? Notes inside will not be deleted.')) return;
  appState.folders = appState.folders.filter(f => f.id !== folderId);
  if (expandedFolderId === folderId) expandedFolderId = null;

  if (supabaseClient && currentUser) {
    await deleteFolderFromSupabase(folderId);
  } else {
    persistData();
  }
  showToast('Folder deleted', '');
  renderNotes();
}

/* ── Remove a note from a folder ── */
async function removeNoteFromFolder(noteId, folderId) {
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder) return;
  folder.note_ids = folder.note_ids.filter(id => id !== noteId);

  if (supabaseClient && currentUser) {
    await updateFolderInSupabase(folder);
  } else {
    persistData();
  }
  showToast('Note removed from folder', '');
  renderNotes();
  if (expandedFolderId === folderId) renderExpandedFolder(folderId);
}

/* ── Move a note into a folder ── */
async function moveNoteToFolder(noteId, folderId) {
  // Remove from all other folders first
  for (const f of appState.folders) {
    if (f.id !== folderId && f.note_ids.includes(noteId)) {
      f.note_ids = f.note_ids.filter(id => id !== noteId);
      if (supabaseClient && currentUser) await updateFolderInSupabase(f);
    }
  }
  // Add to target folder (avoid duplicates)
  const target = appState.folders.find(f => f.id === folderId);
  if (!target) return;
  if (!target.note_ids.includes(noteId)) {
    target.note_ids.push(noteId);
  }

  if (supabaseClient && currentUser) {
    await updateFolderInSupabase(target);
  } else {
    persistData();
  }
  showToast(`Note moved to "${target.name}"`, 'success');
  closeFolderPicker();
  renderNotes();
}

/* ── Folder Picker Modal ── */
function openFolderPicker(noteId) {
  folderPickerTargetNoteId = noteId;
  const note = appState.notes.find(n => n.id === noteId);
  const modal = document.getElementById('folder-picker-modal');
  const list = document.getElementById('folder-picker-list');
  const noteTitle = document.getElementById('folder-picker-note-name');

  if (noteTitle && note) noteTitle.textContent = note.title;

  if ((appState.folders || []).length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:1.5rem 0;color:var(--ink-3);">
        <i class="fas fa-folder-open" style="font-size:2rem;margin-bottom:0.75rem;opacity:0.5;"></i>
        <p style="font-size:0.875rem;">No folders yet. Create one first!</p>
      </div>`;
  } else {
    // Which folder is this note currently in?
    const currentFolderIds = (appState.folders || [])
      .filter(f => f.note_ids.includes(noteId))
      .map(f => f.id);

    list.innerHTML = (appState.folders || []).map(f => {
      const isInThis = currentFolderIds.includes(f.id);
      return `
        <button class="folder-picker-item ${isInThis ? 'current' : ''}" onclick="moveNoteToFolder('${noteId}','${f.id}')">
          <i class="fas fa-folder" style="color:var(--amber);font-size:1.1rem;"></i>
          <span style="flex:1;font-weight:500;">${escHtml(f.name)}</span>
          <span style="font-size:0.75rem;color:var(--ink-3);">${f.note_ids.length} note${f.note_ids.length !== 1 ? 's' : ''}</span>
          ${isInThis ? '<i class="fas fa-check" style="color:var(--jade);margin-left:6px;"></i>' : ''}
        </button>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function closeFolderPicker() {
  document.getElementById('folder-picker-modal').classList.add('hidden');
  folderPickerTargetNoteId = null;
}

/* ── Create folder from within picker ── */
function createFolderFromPicker() {
  const input = document.getElementById('new-folder-name-picker');
  const name = input ? input.value.trim() : '';
  if (!name) { showToast('Please enter a folder name.', 'error'); return; }
  input.value = '';
  createFolder(name).then(() => {
    // Refresh the picker list so user can select the new folder
    if (folderPickerTargetNoteId) openFolderPicker(folderPickerTargetNoteId);
  });
}

/* ── Create folder from header button ── */
function promptCreateFolder() {
  const modal = document.getElementById('create-folder-modal');
  const input = document.getElementById('new-folder-name');
  if (input) input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input && input.focus(), 100);
}

function closeCreateFolderModal() {
  document.getElementById('create-folder-modal').classList.add('hidden');
}

function confirmCreateFolder() {
  const input = document.getElementById('new-folder-name');
  const name = input ? input.value.trim() : '';
  if (!name) { showToast('Please enter a folder name.', 'error'); return; }
  closeCreateFolderModal();
  createFolder(name);
}