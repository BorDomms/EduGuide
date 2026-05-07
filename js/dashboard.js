// dashboard.js - Dashboard rendering

function renderDashboard() {
  document.getElementById('stat-notes').textContent = appState.notes.length;
  document.getElementById('stat-quizzes').textContent = appState.quizzes.length;

  if (appState.quizzes.length > 0) {
    const avg = appState.quizzes.reduce((s, q) => s + q.score, 0) / appState.quizzes.length;
    document.getElementById('stat-avg').textContent = Math.round(avg) + '%';
  }

  const list = document.getElementById('recent-notes-list');
  if (appState.notes.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:2rem 0"><div class="empty-icon">📝</div><p style="font-size:0.875rem;">No notes yet — upload a document to get started.</p></div>`;
  } else {
    list.innerHTML = appState.notes.slice(-5).reverse().map(n => `
      <div class="note-item" onclick="openNote('${n.id}')">
        <div class="note-icon">📄</div>
        <div>
          <div class="note-title">${escHtml(n.title)}</div>
          <div class="note-meta">${timeAgo(n.createdAt)}</div>
        </div>
      </div>
    `).join('');
  }

  const profList = document.getElementById('proficiency-list');
  const profEntries = Object.entries(appState.proficiency);
  if (profEntries.length === 0) {
    profList.innerHTML = `<div class="empty-state" style="padding:2rem 0"><div class="empty-icon">📊</div><p style="font-size:0.875rem;">Take quizzes to build your proficiency scores.</p></div>`;
  } else {
    profList.innerHTML = profEntries.map(([subject, pct]) => `
      <div class="proficiency-item">
        <div class="prof-header">
          <span class="prof-label">${escHtml(subject)}</span>
          <span class="prof-pct">${Math.round(pct)}%</span>
        </div>
        <div class="prof-bar-bg">
          <div class="prof-bar-fill" style="width:${pct}%;background:${pct >= 80 ? 'var(--jade)' : pct >= 60 ? 'var(--amber)' : 'var(--rose)'}"></div>
        </div>
      </div>
    `).join('');
  }
}