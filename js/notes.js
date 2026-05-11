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