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

  renderAWSConfidenceDashboard();
}

/* ═══════════════════════════════════════════
   AWS CONFIDENCE TEST LOGIC
═══════════════════════════════════════════ */

let awsExamType = null;
let awsQuestions = [];
let awsCurrentQuestionIndex = 0;
let awsAnswers = {};

// ── Open / Close Modal ──

function openAWSConfidenceTest() {
  awsExamType = null;
  awsQuestions = [];
  awsCurrentQuestionIndex = 0;
  awsAnswers = {};

  document.getElementById('aws-step-exam').style.display = 'block';
  document.getElementById('aws-step-questions').style.display = 'none';
  document.getElementById('aws-step-results').style.display = 'none';
  document.getElementById('aws-progress-wrapper').style.display = 'none';
  document.getElementById('aws-confidence-modal').classList.remove('hidden');
}

function closeAWSConfidenceTest() {
  document.getElementById('aws-confidence-modal').classList.add('hidden');
  renderAWSConfidenceDashboard();
}

// ── Start Test ──

function startAWSConfidenceTest(type) {
  awsExamType = type;
  const totalModules = type === 'ai-practitioner' ? 8 : 10;
  const examName = type === 'ai-practitioner' ? 'AI Cloud Practitioner' : 'Cloud Practitioner';

  awsQuestions = [
    { key: 'preparedness', label: 'How prepared are you?', emoji: '📚', desc: 'Rate your overall preparation level' },
    { key: 'motiv', label: 'How motivated are you?', emoji: '🔥', desc: 'Rate your current motivation to study' },
    { key: 'focus', label: 'How focused are you?', emoji: '🎯', desc: 'Rate your ability to concentrate' }
  ];

  for (let i = 1; i <= totalModules; i++) {
    awsQuestions.push({
      key: `module_${i}`,
      label: `How confident are you on the topics from Module #${i}?`,
      emoji: '📖',
      desc: `Rate your confidence for ${examName} — Module ${i}`
    });
  }

  awsCurrentQuestionIndex = 0;
  awsAnswers = {};

  document.getElementById('aws-step-exam').style.display = 'none';
  document.getElementById('aws-step-questions').style.display = 'block';
  document.getElementById('aws-progress-wrapper').style.display = 'block';
  document.getElementById('aws-progress-fill').style.width = '0%';

  renderAWSQuestion();
  adjustAWSModalHeight();
}

// ── Render Question ──

function renderAWSQuestion() {
  const q = awsQuestions[awsCurrentQuestionIndex];
  const total = awsQuestions.length;
  const pct = (awsCurrentQuestionIndex / total) * 100;

  document.getElementById('aws-progress-fill').style.width = pct + '%';

  const area = document.getElementById('aws-question-area');
  const currentValue = awsAnswers[q.key] !== undefined ? awsAnswers[q.key] : 5;

  area.innerHTML = `
    <div style="text-align: center; padding: 0.5rem 0 0.75rem;">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">${q.emoji}</div>
      <div style="font-size: 0.72rem; color: var(--violet); font-weight: 600; margin-bottom: 0.5rem; letter-spacing: 0.02em; text-transform: uppercase;">
        Question ${awsCurrentQuestionIndex + 1} of ${total}
      </div>
      <h3 style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem; line-height: 1.4;">${q.label}</h3>
      <p style="font-size: 0.8rem; color: var(--ink-3); margin-bottom: 1.25rem;">${q.desc}</p>

      <div style="display: flex; align-items: center; gap: 0.75rem; max-width: 380px; margin: 0 auto;">
        <span style="font-size: 0.75rem; font-weight: 600; color: var(--ink-3); min-width: 18px; text-align: center;">1</span>
        <input type="range" min="1" max="10" value="${currentValue}" class="aws-slider" id="aws-current-slider" oninput="updateAWSValue(this.value)" />
        <span style="font-size: 0.75rem; font-weight: 600; color: var(--ink-3); min-width: 18px; text-align: center;">10</span>
      </div>

      <div style="margin-top: 0.75rem;">
        <span style="font-size: 2.25rem; font-weight: 700; color: var(--violet); line-height: 1;" id="aws-current-value">${currentValue}</span>
        <span style="font-size: 0.85rem; color: var(--ink-3);"> / 10</span>
      </div>
    </div>
  `;

  document.getElementById('aws-prev-btn').disabled = awsCurrentQuestionIndex === 0;

  const nextBtn = document.getElementById('aws-next-btn');
  if (awsCurrentQuestionIndex === total - 1) {
    nextBtn.innerHTML = '<i class="fas fa-check"></i> Submit';
  } else {
    nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
  }

  adjustAWSModalHeight();
}

function updateAWSValue(val) {
  const q = awsQuestions[awsCurrentQuestionIndex];
  awsAnswers[q.key] = parseInt(val);
  document.getElementById('aws-current-value').textContent = val;
}

function awsNextQuestion() {
  const slider = document.getElementById('aws-current-slider');
  if (slider) {
    const q = awsQuestions[awsCurrentQuestionIndex];
    awsAnswers[q.key] = parseInt(slider.value);
  }

  if (awsCurrentQuestionIndex === awsQuestions.length - 1) {
    submitAWSConfidenceTest();
  } else {
    awsCurrentQuestionIndex++;
    renderAWSQuestion();
  }
}

function awsPrevQuestion() {
  const slider = document.getElementById('aws-current-slider');
  if (slider) {
    const q = awsQuestions[awsCurrentQuestionIndex];
    awsAnswers[q.key] = parseInt(slider.value);
  }

  if (awsCurrentQuestionIndex > 0) {
    awsCurrentQuestionIndex--;
    renderAWSQuestion();
  }
}

function adjustAWSModalHeight() {
  const modal = document.querySelector('#aws-confidence-modal .modal');
  if (modal) {
    modal.style.height = 'auto';
  }
}

// ── Submit ──

async function submitAWSConfidenceTest() {
  const prepared = awsAnswers['preparedness'] || 5;
  const motiv = awsAnswers['motiv'] || 5;
  const focus = awsAnswers['focus'] || 5;

  const totalModules = awsExamType === 'ai-practitioner' ? 8 : 10;
  const moduleScores = [];
  for (let i = 1; i <= totalModules; i++) {
    moduleScores.push(awsAnswers[`module_${i}`] || 5);
  }

  // Show loading state
  const nextBtn = document.getElementById('aws-next-btn');
  const originalText = nextBtn.innerHTML;
  nextBtn.disabled = true;
  nextBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

  let prediction = null;
  
  try {
    // Call the prediction API
    const apiUrl = 'https://aws-confidence-api.onrender.com/predict';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preparedness: prepared,
        module_scores: moduleScores
      })
    });
    
    if (response.ok) {
      prediction = await response.json();
      console.log('✅ Prediction received:', prediction);
    } else {
      console.warn('⚠️ Prediction API returned error:', response.status);
      // Continue without prediction - we'll still save the test data
    }
  } catch(e) {
    console.error('❌ Prediction API error:', e);
    // Continue without prediction
  }

  // Build result object
  const result = {
    examType: awsExamType,
    examName: awsExamType === 'ai-practitioner' ? 'AI Cloud Practitioner' : 'Cloud Practitioner',
    preparedness: prepared,
    motiv: motiv,
    focus: focus,
    module_scores: moduleScores,
    completedAt: Date.now()
  };

  // Add prediction data if available
  if (prediction) {
    result.confidence_level = prediction.confidence_level;
    result.confidence_score = prediction.confidence_score;
    result.avg_module_score = prediction.avg_module_score;
    result.prediction_gap = prediction.gap;
    result.recommendation = prediction.recommendation;
    result.prediction_status = prediction.status;
  }

  // Save to localStorage (always)
  try {
    localStorage.setItem('eg_aws_test_result', JSON.stringify(result));
  } catch (e) {
    console.error('Failed to save AWS test result:', e);
  }

  // Sync to Supabase when logged in
  if (typeof supabaseClient !== 'undefined' && supabaseClient &&
      typeof currentUser !== 'undefined' && currentUser) {
    const saved = await saveAWSTestToSupabase(result);
    if (saved) {
      console.log('✅ AWS test saved to Supabase');
      
      // If prediction data exists but we had an ID, update with prediction
      if (prediction && result.id) {
        await savePredictionToSupabase(result.id, prediction);
      }
    } else {
      console.warn('AWS test saved locally only (cloud sync failed)');
    }
  }

  // Restore button
  nextBtn.disabled = false;
  nextBtn.innerHTML = originalText;

  // Show results step
  document.getElementById('aws-step-questions').style.display = 'none';
  document.getElementById('aws-step-results').style.display = 'block';
  document.getElementById('aws-progress-fill').style.width = '100%';

  // Render results summary with prediction
  renderAWSResultsSummary(result);
  renderAWSConfidenceDashboard();
  adjustAWSModalHeight();
}

// ── Results Summary ──

// dashboard.js - Updated renderAWSResultsSummary function

function renderAWSResultsSummary(result) {
  const container = document.getElementById('aws-results-summary');

  const scoreColor = (val) => {
    if (val >= 8) return 'var(--jade)';
    if (val >= 5) return 'var(--amber)';
    return 'var(--rose)';
  };

  const barHTML = (label, val, maxVal) => `
    <div class="aws-score-bar">
      <span class="aws-score-label">${label}</span>
      <div class="aws-score-track">
        <div class="aws-score-fill" style="width: ${(val / maxVal) * 100}%; background: ${scoreColor(val)};"></div>
      </div>
      <span class="aws-score-value" style="color: ${scoreColor(val)};">${val}</span>
    </div>
  `;

  const preparednessAvg = (result.preparedness + result.motiv + result.focus) / 3;
  const moduleAvg = result.module_scores.reduce((a, b) => a + b, 0) / result.module_scores.length;
  const overallAvg = ((preparednessAvg + moduleAvg) / 2);

  // Build the HTML
  let html = `
    <div style="margin-bottom: 1rem;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-4); font-weight: 600; margin-bottom: 0.75rem;">
        <i class="fas fa-file-alt"></i> ${result.examName}
      </div>
      <div style="display: flex; align-items: baseline; gap: 6px;">
        <span style="font-size: 1.75rem; font-weight: 700; color: ${scoreColor(Math.round(overallAvg))};">${overallAvg.toFixed(1)}</span>
        <span style="font-size: 0.85rem; color: var(--ink-3);">/ 10 — Overall Confidence</span>
      </div>
    </div>
  `;

  // Add prediction section if available
  if (result.confidence_level) {
    const levelColors = {
      'Extremely Under-confident': 'var(--rose)',
      'Very Under-confident': 'var(--rose)',
      'Slightly Under-confident': 'var(--amber)',
      'Average': 'var(--jade)',
      'Slightly Over-confident': 'var(--amber)',
      'Very Over-confident': 'var(--rose)',
      'Extremely Over-confident': 'var(--rose)'
    };
    const color = levelColors[result.confidence_level] || 'var(--ink-3)';
    
    html += `
      <div style="margin: 1rem 0; padding: 0.75rem; background: var(--surface-2); border-radius: var(--radius); border-left: 4px solid ${color};">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-4); font-weight: 600;">AI Analysis</span>
          <span style="font-size: 0.85rem; font-weight: 700; color: ${color};">${result.confidence_level}</span>
          <span style="font-size: 0.7rem; color: var(--ink-3);">(Score: ${result.confidence_score?.toFixed(2) || 'N/A'})</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--ink-2); line-height: 1.5;">
          ${result.recommendation || 'No recommendation available.'}
        </div>
        <div style="font-size: 0.7rem; color: var(--ink-4); margin-top: 4px;">
          Gap: ${result.prediction_gap?.toFixed(2) || 'N/A'} · ${result.prediction_status || ''}
        </div>
      </div>
    `;
  }

  // Add the score bars
  html += `
    <div style="margin-bottom: 1rem;">
      <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-4); font-weight: 600; margin-bottom: 6px;">Mindset</div>
      ${barHTML('Preparedness', result.preparedness, 10)}
      ${barHTML('Motivation', result.motiv, 10)}
      ${barHTML('Focus', result.focus, 10)}
    </div>
    <div>
      <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-4); font-weight: 600; margin-bottom: 6px;">Module Confidence</div>
      ${result.module_scores.map((score, idx) => barHTML(`Module ${idx + 1}`, score, 10)).join('')}
    </div>
  `;

  container.innerHTML = html;
}

// ── Render on Dashboard ──

// dashboard.js - Updated renderAWSConfidenceDashboard function

function renderAWSConfidenceDashboard() {
  const body = document.getElementById('confidence-card-body');
  if (!body) return;

  let saved = null;

  // Prefer appState (loaded from Supabase), fall back to localStorage
  if (appState.awsTestResult) {
    saved = appState.awsTestResult;
  } else {
    try {
      const raw = localStorage.getItem('eg_aws_test_result');
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      saved = null;
    }
  }

  if (!saved) {
    body.className = 'confidence-placeholder';
    body.style.padding = '';
    body.innerHTML = `
      <div class="confidence-placeholder-icon">
        <i class="fas fa-chart-bar" style="font-size: 2.5rem; color: var(--violet);"></i>
      </div>
      <p class="confidence-placeholder-title">Working in progress — Only for AWS Practitioner Takers!</p>
      <p class="confidence-placeholder-desc">Take the test and see your analysis!</p>
    `;
    return;
  }

  body.className = '';
  body.style.padding = '0';

  const scoreColor = (val) => {
    if (val >= 8) return 'var(--jade)';
    if (val >= 5) return 'var(--amber)';
    return 'var(--rose)';
  };

  // Only show avg_module_score, status, and recommendation
  let html = `
    <div style="padding: 0.75rem 0.25rem;">
      <div style="margin-bottom: 0.5rem;">
        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-4); font-weight: 600; margin-bottom: 4px;">
          <i class="fas fa-file-alt"></i> ${saved.examName}
        </div>
  `;

  // ── Avg Module Score ──
  if (saved.avg_module_score !== undefined && saved.avg_module_score !== null) {
    const avgScore = Number(saved.avg_module_score);
    html += `
      <div style="margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--ink-2);">Average Module Score</span>
          <span style="font-size: 1.25rem; font-weight: 700; color: ${scoreColor(Math.round(avgScore))};">${avgScore.toFixed(2)}</span>
          <span style="font-size: 0.7rem; color: var(--ink-4);">/ 10</span>
        </div>
        <div style="height: 6px; background: var(--surface-3); border-radius: 99px; overflow: hidden;">
          <div style="height: 100%; border-radius: 99px; width: ${(avgScore / 10) * 100}%; background: ${scoreColor(Math.round(avgScore))};"></div>
        </div>
      </div>
    `;
  }

  // ── Status ──
  if (saved.prediction_status) {
    const statusColors = {
      'under-confident': 'var(--rose)',
      'over-confident': 'var(--amber)',
      'confident': 'var(--jade)'
    };
    // Map known status values to colors; falls back to gray for unrecognized values
    const statusKey = saved.prediction_status.toLowerCase();
    const statusColor = statusColors[statusKey] || 'var(--ink-3)';
    html += `
      <div style="margin-bottom: 0.75rem;">
        <div style="font-size: 0.7rem; font-weight: 600; color: var(--ink-3); margin-bottom: 2px;">Status</div>
        <span style="display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: ${statusColor}20; color: ${statusColor};">
          ${saved.prediction_status}
        </span>
      </div>
    `;
  }

  // ── Recommendation ──
  if (saved.recommendation) {
    html += `
      <div style="margin-bottom: 0.75rem;">
        <div style="font-size: 0.7rem; font-weight: 600; color: var(--ink-3); margin-bottom: 4px;">Recommendation</div>
        <div style="font-size: 0.8rem; color: var(--ink-2); line-height: 1.5; background: var(--surface-2); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border-left: 3px solid var(--violet);">
          ${saved.recommendation}
        </div>
      </div>
    `;
  }

  html += `
    </div>
  `;

  body.innerHTML = html;
}