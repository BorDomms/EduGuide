// quiz.js - Quiz generation and handling with customizable question count

let isGeneratingQuiz = false;

async function handleGenerateQuiz() {
  if (!appState.currentSummary) {
    showToast('Please summarize a document first before generating a quiz.', 'error');
    return;
  }
  
  if (isGeneratingQuiz) {
    showToast('Already generating a quiz, please wait...', '');
    return;
  }
  
  // Get the selected number of questions
  let questionCountSelect = document.getElementById('quiz-question-count');
  if (!questionCountSelect) {
    questionCountSelect = document.getElementById('quiz-question-count-landing');
  }
  let requestedCount = questionCountSelect ? parseInt(questionCountSelect.value) : 5;
  requestedCount = Math.min(25, Math.max(1, requestedCount));
  
  const btn = document.getElementById('generate-quiz-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generating ${requestedCount} questions from your document...`;
  isGeneratingQuiz = true;

  try {
    await sleep(500);
    
    const prompt = `You MUST create EXACTLY ${requestedCount} multiple choice questions. Not ${requestedCount-1}, not ${requestedCount+1}. EXACTLY ${requestedCount}.

Based on this text:

${appState.currentSummary.summary.slice(0, 2500)}

Create ${requestedCount} questions. Number them from 1 to ${requestedCount}.

For EACH question, provide:
- Question text
- 4 answer options (A, B, C, D)
- The correct letter (A, B, C, or D)
- A brief explanation

Format EXACTLY like this (repeat for each question):

1. Question: [question text]
A) [option A]
B) [option B]
C) [option C]
D) [option D]
Answer: [letter]
Explanation: [explanation]

2. Question: [question text]
...and so on until question ${requestedCount}.

CRITICAL: You MUST generate ${requestedCount} questions. Count them before responding. Do NOT stop early.`;

    let result = await callGemini(prompt);
    console.log("Raw API response:", result);

    // Function to parse questions from text
    function parseQuestionsFromText(text) {
      const parsed = [];
      const lines = text.split('\n');
      let currentQuestion = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        const questionMatch = line.match(/^(\d+)[\.\)]\s*(?:Question:?\s*)?(.*)/i);
        if (questionMatch && !currentQuestion) {
          currentQuestion = {
            question: questionMatch[2].trim(),
            options: [],
            answer: null,
            explanation: ""
          };
          continue;
        }
        
        if (currentQuestion && line.match(/^[A-D][\.\)]\s*(.*)/i)) {
          const optionMatch = line.match(/^([A-D])[\.\)]\s*(.*)/i);
          if (optionMatch) {
            currentQuestion.options.push(optionMatch[2].trim());
          }
          continue;
        }
        
        if (currentQuestion && line.match(/^Answer:\s*([A-D])/i)) {
          const answerMatch = line.match(/^Answer:\s*([A-D])/i);
          if (answerMatch) {
            const letter = answerMatch[1].toUpperCase();
            currentQuestion.answer = letter.charCodeAt(0) - 65;
          }
          continue;
        }
        
        if (currentQuestion && line.match(/^Explanation:\s*(.*)/i)) {
          const explanationMatch = line.match(/^Explanation:\s*(.*)/i);
          if (explanationMatch) {
            currentQuestion.explanation = explanationMatch[1].trim();
            parsed.push(currentQuestion);
            currentQuestion = null;
          }
          continue;
        }
      }
      return parsed;
    }
    
    let questions = parseQuestionsFromText(result);
    
    // If we didn't get enough questions, try a second time
    let attempts = 1;
    while (questions.length < requestedCount && attempts < 3) {
      console.log(`Only got ${questions.length} questions, requested ${requestedCount}. Attempt ${attempts + 1}...`);
      
      const retryPrompt = `You previously only gave me ${questions.length} questions, but I need EXACTLY ${requestedCount}. Please provide the missing ${requestedCount - questions.length} more questions based on the SAME text.

Text: ${appState.currentSummary.summary.slice(0, 2000)}

Create ${requestedCount - questions.length} additional questions. Format them as:

${questions.length + 1}. Question: [question text]
A) [option A]
B) [option B]
C) [option C]
D) [option D]
Answer: [letter]
Explanation: [explanation]

And so on until question ${requestedCount}.`;

      const retryResult = await callGemini(retryPrompt);
      const additionalQuestions = parseQuestionsFromText(retryResult);
      questions = [...questions, ...additionalQuestions];
      attempts++;
      await sleep(500);
    }
    
    // If we still don't have enough, fill with placeholder questions
    if (questions.length < requestedCount) {
      console.log(`Still only ${questions.length} questions. Filling with generated questions...`);
      const existingCount = questions.length;
      for (let i = existingCount; i < requestedCount; i++) {
        questions.push({
          question: `Question ${i + 1}: Based on the document, what is an important concept to remember?`,
          options: ["Review the material", "Take notes", "Practice regularly", "All of the above"],
          answer: 3,
          explanation: "Based on the document content, reviewing, taking notes, and practicing are all important study strategies."
        });
      }
    }
    
    // Take only the requested number
    const finalQuestions = questions.slice(0, requestedCount);
    
    // Clean up questions
    for (let q of finalQuestions) {
      if (q.options.length < 4) {
        while (q.options.length < 4) {
          q.options.push("Not specified");
        }
      }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
        q.answer = 0;
      }
      if (!q.explanation) {
        q.explanation = "Based on the material.";
      }
    }
    
    const quizData = {
      topic: appState.currentSummary.title || "Quiz",
      questions: finalQuestions
    };

    appState.currentQuizData = quizData;
    appState.currentQuizIndex = 0;
    appState.currentQuizAnswers = [];

    showPage('quiz');
    startQuiz();
    showToast(`Quiz generated! ${finalQuestions.length} questions about ${quizData.topic}`, 'success');

  } catch(e) {
    console.error("Quiz generation error:", e);
    showToast('Quiz generation failed: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '🎯 Generate Quiz';
  isGeneratingQuiz = false;
}

function startQuiz() {
  document.getElementById('quiz-landing').classList.add('hidden');
  document.getElementById('quiz-results').classList.add('hidden');
  document.getElementById('quiz-active').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  const quiz = appState.currentQuizData;
  const idx = appState.currentQuizIndex;
  const total = quiz.questions.length;
  const q = quiz.questions[idx];

  document.getElementById('quiz-progress-label').textContent = `Question ${idx + 1} of ${total}`;
  const currentScore = appState.currentQuizAnswers.filter(a => a === true).length;
  document.getElementById('quiz-score-live').textContent = `Score: ${currentScore}/${idx}`;
  document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('next-btn').textContent = idx === total - 1 ? 'Finish ✓' : 'Next →';

  document.getElementById('quiz-question-area').innerHTML = `
    <div class="quiz-question-card">
      <div class="quiz-q-num">Question ${idx + 1}</div>
      <div class="quiz-question">${escHtml(q.question)}</div>
      <div class="quiz-options" id="quiz-opts">
        ${q.options.map((opt, i) => `
          <button class="quiz-option" onclick="selectOption(${i})" id="qopt-${i}">
            <span class="option-letter">${'ABCD'[i]}</span>
            ${escHtml(opt)}
          </button>
        `).join('')}
      </div>
      <div class="quiz-feedback" id="quiz-feedback"></div>
    </div>
  `;
  document.getElementById('next-btn').disabled = true;
}

function selectOption(i) {
  const quiz = appState.currentQuizData;
  const q = quiz.questions[appState.currentQuizIndex];
  const correct = q.answer;

  document.querySelectorAll('.quiz-option').forEach(btn => btn.disabled = true);
  document.getElementById(`qopt-${i}`).classList.add(i === correct ? 'correct' : 'wrong');
  if (i !== correct) document.getElementById(`qopt-${correct}`).classList.add('correct');

  const fb = document.getElementById('quiz-feedback');
  fb.className = 'quiz-feedback ' + (i === correct ? 'correct' : 'wrong');
  fb.textContent = i === correct
    ? `✓ Correct! ${q.explanation || ''}`
    : `✗ Incorrect. ${q.explanation || 'The correct answer is ' + q.options[correct]}`;

  appState.currentQuizAnswers[appState.currentQuizIndex] = (i === correct);
  document.getElementById('next-btn').disabled = false;
}

function nextQuestion() {
  const total = appState.currentQuizData.questions.length;
  if (appState.currentQuizIndex < total - 1) {
    appState.currentQuizIndex++;
    renderQuestion();
  } else {
    showResults();
  }
}

function showResults() {
  const correct = appState.currentQuizAnswers.filter(Boolean).length;
  const total = appState.currentQuizData.questions.length;
  const pct = Math.round((correct / total) * 100);
  const topic = appState.currentQuizData.topic || 'Quiz';

  document.getElementById('quiz-active').classList.add('hidden');
  document.getElementById('quiz-results').classList.remove('hidden');

  document.getElementById('results-pct').textContent = pct + '%';
  document.getElementById('result-correct').textContent = correct;
  document.getElementById('result-wrong').textContent = total - correct;
  document.getElementById('result-total').textContent = total;

  const grade = pct >= 90 ? 'Excellent! 🏆' : pct >= 75 ? 'Great job! 🌟' : pct >= 60 ? 'Good effort 👍' : pct >= 40 ? 'Keep studying 📚' : 'Keep practicing 💪';
  const msg = pct >= 90 ? 'You have a strong grasp of this material.' : pct >= 75 ? 'You understand most of the content.' : pct >= 60 ? 'Review the topics you missed and try again.' : 'Spend more time reviewing before retaking.';
  document.getElementById('results-grade').textContent = grade;
  document.getElementById('results-message').textContent = msg;

  const circle = document.getElementById('score-circle');
  const circumference = 364.4;
  setTimeout(() => {
    circle.style.strokeDashoffset = circumference * (1 - pct / 100);
    circle.style.stroke = pct >= 75 ? 'var(--jade)' : pct >= 50 ? 'var(--amber)' : 'var(--rose)';
  }, 100);

  const quizEntry = { 
    id: uid(), 
    topic: topic, 
    score: pct, 
    correct: correct, 
    total: total, 
    date: Date.now(),
    date_taken: Date.now()
  };
  appState.quizzes.push(quizEntry);
  
  // Save to Supabase (if logged in)
  if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof currentUser !== 'undefined' && currentUser) {
    saveQuizToSupabase(quizEntry);
  } else {
    persistData();
  }
  
  const prev = appState.proficiency[topic] || null;
  const newPct = prev !== null ? Math.round((prev + pct) / 2) : pct;
  appState.proficiency[topic] = newPct;
  
  // Save proficiency to Supabase
  if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof currentUser !== 'undefined' && currentUser) {
    saveProficiencyToSupabase(topic, newPct);
  } else {
    persistData();
  }
  
  renderDashboard();
  renderPastQuizzes(); // Update the past quizzes list
}

function retakeQuiz() {
  appState.currentQuizIndex = 0;
  appState.currentQuizAnswers = [];
  document.getElementById('quiz-results').classList.add('hidden');
  document.getElementById('quiz-active').classList.remove('hidden');
  renderQuestion();
}

// Render past quizzes from Supabase/localStorage
function renderPastQuizzes() {
  const container = document.getElementById('past-quizzes-list');
  if (!container) return;
  
  if (appState.quizzes.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 1rem; text-align: center; font-size: 0.875rem; color: var(--ink-3);">No quizzes taken yet. Generate and take a quiz to see your history!</div>';
    return;
  }
  
  // Sort by date (newest first)
  const sortedQuizzes = [...appState.quizzes].sort((a, b) => (b.date_taken || b.date) - (a.date_taken || a.date));
  
  container.innerHTML = sortedQuizzes.map((quiz, idx) => `
    <div class="past-quiz-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--surface-2); border-radius: var(--radius); border: 1px solid var(--border);">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <span style="font-weight: 600; font-size: 0.875rem;">${escHtml(quiz.topic)}</span>
          <span style="font-size: 0.75rem; color: var(--ink-3);">${new Date(quiz.date_taken || quiz.date).toLocaleDateString()}</span>
        </div>
        <div style="display: flex; gap: 16px; margin-top: 6px;">
          <span style="font-size: 0.75rem;">Score: <strong style="color: var(--jade);">${quiz.score}%</strong></span>
          <span style="font-size: 0.75rem;">Correct: ${quiz.correct}/${quiz.total}</span>
        </div>
      </div>
      <button class="btn-outline" onclick="retakePastQuiz(${idx})" style="padding: 6px 12px; font-size: 0.75rem;">↺ Retake</button>
    </div>
  `).join('');
}

// Retake a past quiz
async function retakePastQuiz(index) {
  const sortedQuizzes = [...appState.quizzes].sort((a, b) => (b.date_taken || b.date) - (a.date_taken || a.date));
  const quiz = sortedQuizzes[index];
  
  showToast('Loading quiz content...', '');
  
  // Find the original note that matches this topic
  const matchingNote = appState.notes.find(n => n.title === quiz.topic || (n.summary && n.summary.includes(quiz.topic)));
  
  if (matchingNote) {
    appState.currentSummary = {
      text: matchingNote.original_text || matchingNote.originalText || '',
      summary: matchingNote.summary,
      keyPoints: matchingNote.key_points || matchingNote.keyPoints || [],
      title: matchingNote.title
    };
    handleGenerateQuiz();
  } else {
    showToast('Original content not found. Generate a new quiz from the Reviewer tab.', 'error');
  }
}