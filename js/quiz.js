// quiz.js - Quiz generation and handling

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
  
  const btn = document.getElementById('generate-quiz-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating quiz from your document...';
  isGeneratingQuiz = true;

  try {
    await sleep(500);
    
    // Simplified prompt to avoid complex formatting
    const prompt = `Based on this text, create 5 multiple choice questions. 

Text: ${appState.currentSummary.summary.slice(0, 2500)}

For each question, provide:
- The question text
- 4 answer options (A, B, C, D)
- The correct letter (A, B, C, or D)
- A brief explanation

Format your response as a numbered list like this:

1. Question: [question text]
A) [option A]
B) [option B]
C) [option C]
D) [option D]
Answer: [letter]
Explanation: [explanation]

2. Question: [question text]
...and so on.

Do NOT use JSON. Just use plain text with this numbered format.`;

    const result = await callGemini(prompt);
    console.log("Raw API response:", result);

    // Parse the text format into questions
    const questions = [];
    const lines = result.split('\n');
    
    let currentQuestion = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match question pattern: "1. Question: ..." or "Question 1: ..."
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
      
      // Match option pattern: "A) ..." or "A. ..."
      if (currentQuestion && line.match(/^[A-D][\.\)]\s*(.*)/i)) {
        const optionMatch = line.match(/^([A-D])[\.\)]\s*(.*)/i);
        if (optionMatch) {
          currentQuestion.options.push(optionMatch[2].trim());
        }
        continue;
      }
      
      // Match answer pattern: "Answer: A" or "Answer: B"
      if (currentQuestion && line.match(/^Answer:\s*([A-D])/i)) {
        const answerMatch = line.match(/^Answer:\s*([A-D])/i);
        if (answerMatch) {
          const letter = answerMatch[1].toUpperCase();
          const answerIndex = letter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
          currentQuestion.answer = answerIndex;
        }
        continue;
      }
      
      // Match explanation pattern
      if (currentQuestion && line.match(/^Explanation:\s*(.*)/i)) {
        const explanationMatch = line.match(/^Explanation:\s*(.*)/i);
        if (explanationMatch) {
          currentQuestion.explanation = explanationMatch[1].trim();
          questions.push(currentQuestion);
          currentQuestion = null;
        }
        continue;
      }
    }
    
    // Also try to extract any JSON if the above fails
    let extractedQuestions = [...questions];
    
    if (extractedQuestions.length === 0) {
      // Try to extract from malformed JSON using regex
      const jsonPattern = /\{[^{}]*"question"[^{}]*\}/g;
      const jsonMatches = result.match(jsonPattern);
      
      if (jsonMatches) {
        for (let jsonStr of jsonMatches) {
          try {
            // Fix common malformed JSON issues
            let fixed = jsonStr
              .replace(/\[\"([A-D])\"\]/g, '"$1"') // Fix ["A"] to "A"
              .replace(/"answer":(\d+)/g, '"answer":$1');
            
            const parsed = JSON.parse(fixed);
            if (parsed.question && parsed.options) {
              extractedQuestions.push({
                question: parsed.question,
                options: parsed.options,
                answer: parsed.answer || 0,
                explanation: parsed.explanation || ""
              });
            }
          } catch(e) {}
        }
      }
    }
    
    // If still no questions, show error
    if (extractedQuestions.length === 0) {
      console.error("No questions could be extracted from:", result);
      showToast('Could not generate quiz. Please try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = '🎯 Generate Quiz';
      isGeneratingQuiz = false;
      return;
    }
    
    // Clean up questions - ensure each has 4 options
    for (let q of extractedQuestions) {
      if (q.options.length < 4) {
        // Add placeholder options if missing
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
    
    // Limit to 8 questions
    const finalQuestions = extractedQuestions.slice(0, 8);
    
    const quizData = {
      topic: appState.currentSummary.title || "Quiz",
      questions: finalQuestions
    };

    appState.currentQuizData = quizData;
    appState.currentQuizIndex = 0;
    appState.currentQuizAnswers = [];

    showPage('quiz');
    startQuiz();
    showToast(`Quiz generated! ${finalQuestions.length} questions`, 'success');

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

  appState.quizzes.push({ id: uid(), topic, score: pct, correct, total, date: Date.now() });
  const prev = appState.proficiency[topic] || null;
  appState.proficiency[topic] = prev !== null ? Math.round((prev + pct) / 2) : pct;
  persistData();
  renderDashboard();
}

function retakeQuiz() {
  appState.currentQuizIndex = 0;
  appState.currentQuizAnswers = [];
  document.getElementById('quiz-results').classList.add('hidden');
  document.getElementById('quiz-active').classList.remove('hidden');
  renderQuestion();
}