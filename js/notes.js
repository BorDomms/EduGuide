// notes.js - Notes library

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
        <span class="note-card-date">${new Date(n.createdAt).toLocaleDateString()}</span>
        <span class="note-card-badge">${(n.keyPoints || []).length} key points</span>
      </div>
    </div>
  `).join('');
}

function openNote(id) {
  const note = appState.notes.find(n => n.id === id);
  if (!note) return;
  appState.currentSummary = {
    text: note.originalText || '',
    summary: note.summary,
    keyPoints: note.keyPoints,
    title: note.title
  };

  document.getElementById('text-input').value = note.originalText || note.summary || '';
  document.getElementById('note-title-input').value = note.title;
  document.getElementById('summary-text').textContent = note.summary;
  document.getElementById('key-points-list').innerHTML = (note.keyPoints || []).map(p =>
    `<div class="key-point"><div class="key-point-dot"></div><span>${escHtml(p)}</span></div>`
  ).join('');
  document.getElementById('summary-section').classList.remove('hidden');
  showPage('reviewer');
}