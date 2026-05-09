// notes.js - Notes library with Supabase sync

function renderNotes() {
  const grid = document.getElementById('notes-grid');
  if (appState.notes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📚</div><h3>No saved notes yet</h3><p>Upload and summarize a document to create your first note.</p></div>`;
    return;
  }
  grid.innerHTML = [...appState.notes].reverse().map(n => `
    <div class="note-card" onclick="openNote('${n.id}')">
      <div class="note-card-title">${escHtml(n.title)}</div>
      <div class="note-card-preview">${escHtml(n.summary || '')}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${new Date(n.created_at || n.createdAt).toLocaleDateString()}</span>
        <span class="note-card-badge">${(n.key_points || n.keyPoints || []).length} key points</span>
      </div>
      <div style="position: absolute; top: 12px; right: 12px;">
        <button class="btn-outline" onclick="event.stopPropagation(); deleteNote('${n.id}')" style="padding: 4px 8px; font-size: 0.7rem; color: var(--danger); border-color: var(--danger);">🗑</button>
      </div>
    </div>
  `).join('');
}

async function deleteNote(id) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  // Remove from local state
  appState.notes = appState.notes.filter(n => n.id !== id);
  
  // Remove from Supabase
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
  
  const keyPoints = note.key_points || note.keyPoints || [];
  
  appState.currentSummary = {
    text: note.original_text || note.originalText || '',
    summary: note.summary,
    keyPoints: keyPoints,
    title: note.title
  };

  document.getElementById('text-input').value = note.original_text || note.originalText || note.summary || '';
  document.getElementById('note-title-input').value = note.title;
  document.getElementById('summary-text').textContent = note.summary;
  document.getElementById('key-points-list').innerHTML = keyPoints.map(p =>
    `<div class="key-point"><div class="key-point-dot"></div><span>${escHtml(p)}</span></div>`
  ).join('');
  document.getElementById('summary-section').classList.remove('hidden');
  showPage('reviewer');
}