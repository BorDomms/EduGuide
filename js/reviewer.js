// reviewer.js - Document summarization with PDF support

let uploadedFileContent = null;
let isSummarizing = false;

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const fileType = file.name.split('.').pop().toLowerCase();
  
  if (fileType === 'pdf') {
    // Handle PDF properly with PDF.js
    const reader = new FileReader();
    reader.onload = async function(ev) {
      try {
        showToast('📖 Parsing PDF, please wait...', '');
        const typedarray = new Uint8Array(ev.target.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        
        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        
        if (fullText.trim().length === 0) {
          showToast('No readable text found in PDF. Try copying and pasting the content instead.', 'error');
          return;
        }
        
        document.getElementById('text-input').value = fullText.slice(0, 15000);
        if (!document.getElementById('note-title-input').value) {
          document.getElementById('note-title-input').value = file.name.replace('.pdf', '');
        }
        showToast(`📄 PDF loaded: ${Math.min(fullText.length, 15000)} characters extracted`);
      } catch(error) {
        console.error('PDF parsing error:', error);
        showToast('Failed to parse PDF. Try copying and pasting the text directly.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (fileType === 'txt' || fileType === 'md') {
    // Handle text files
    const reader = new FileReader();
    reader.onload = ev => {
      uploadedFileContent = ev.target.result;
      document.getElementById('text-input').value = uploadedFileContent.slice(0, 15000);
      if (!document.getElementById('note-title-input').value) {
        document.getElementById('note-title-input').value = file.name.replace(/\.[^.]+$/, '');
      }
      showToast(`📄 "${file.name}" loaded`);
    };
    reader.readAsText(file);
  } else if (fileType === 'docx') {
    showToast('DOCX files need to be converted. Please copy and paste the text directly, or save as .txt first.', 'error');
  } else {
    showToast('Unsupported file type. Please use PDF, TXT, or MD files, or paste text directly.', 'error');
  }
}

async function handleSummarize() {
  if (isSummarizing) {
    showToast('Already processing, please wait...', '');
    return;
  }
  
  const text = document.getElementById('text-input').value.trim();
  if (!text || text.length < 30) {
    showToast('Please enter or upload some text first (minimum 30 characters).', 'error');
    return;
  }

  isSummarizing = true;
  document.getElementById('summary-section').classList.add('hidden');
  document.getElementById('summary-loading').classList.remove('hidden');
  document.getElementById('summarize-btn').disabled = true;

  try {
    // Add delay to prevent rate limiting
    await sleep(500);
    
    const result = await callGemini(`
You are a study assistant. Analyze this text and provide:
1. A clear, concise summary
2. A list of key points that are important to remember

Make sure to include important details and concepts in the summary, that important terms are mentioned, and ensure the key points are actionable study items.

Respond in this EXACT JSON format (no markdown, no preamble):
{
  "summary": "Your summary here...",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"]
}

Text to analyze:
${text.slice(0, 8000)}
    `);

    let parsed;
    try {
      const clean = result.replace(/```json?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      // Fallback if JSON parsing fails
      parsed = { 
        summary: result, 
        keyPoints: ['Review the key concepts', 'Practice with examples', 'Understand the core ideas'] 
      };
    }

    appState.currentSummary = {
      text,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      title: document.getElementById('note-title-input').value || 'Untitled Note'
    };

    document.getElementById('summary-text').textContent = parsed.summary;
    document.getElementById('key-points-list').innerHTML = (parsed.keyPoints || []).map(p =>
      `<div class="key-point"><div class="key-point-dot"></div><span>${escHtml(p)}</span></div>`
    ).join('');

    document.getElementById('summary-loading').classList.add('hidden');
    document.getElementById('summary-section').classList.remove('hidden');
    document.getElementById('summary-section').classList.add('fade-in');
    
    showToast('Summary generated successfully!', 'success');

  } catch(e) {
    document.getElementById('summary-loading').classList.add('hidden');
    
    if (e.message.includes('429') || e.message.includes('rate limit')) {
      showToast('Rate limit hit. Please wait 10 seconds and try again.', 'error');
      await sleep(10000);
    } else if (e.message.includes('Cerebras API error: 429')) {
      showToast('API is busy. Please wait a moment and try again.', 'error');
    } else {
      showToast('Summarization failed: ' + e.message, 'error');
    }
  }

  document.getElementById('summarize-btn').disabled = false;
  isSummarizing = false;
}

function saveNote() {
  if (!appState.currentSummary) {
    showToast('No summary to save. Please summarize some text first.', 'error');
    return;
  }
  
  const note = {
    id: uid(),
    title: appState.currentSummary.title,
    originalText: appState.currentSummary.text.slice(0, 3000),
    summary: appState.currentSummary.summary,
    keyPoints: appState.currentSummary.keyPoints,
    createdAt: Date.now()
  };
  
  appState.notes.push(note);
  
  // Save to localStorage (simpler - no Supabase dependency)
  persistData();
  
  renderDashboard();
  renderNotes();
  showToast('Note saved! 💾', 'success');
}

function clearReviewer() {
  document.getElementById('text-input').value = '';
  document.getElementById('note-title-input').value = '';
  document.getElementById('summary-section').classList.add('hidden');
  uploadedFileContent = null;
  document.getElementById('file-input').value = '';
  appState.currentSummary = null;
  showToast('Cleared', '');
}