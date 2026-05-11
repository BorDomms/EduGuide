// chat.js - AI Tutor Chat

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  input.style.height = 'auto';

  appendChatMsg('user', msg);
  appState.chatHistory.push({ role: 'user', content: msg });

  const typingEl = appendTyping();
  document.getElementById('chat-send-btn').disabled = true;

  const contextNote = appState.currentSummary
    ? `\n\nCurrent study context:\nTitle: ${appState.currentSummary.title}\nSummary: ${appState.currentSummary.summary}\nKey Points: ${(appState.currentSummary.keyPoints || []).join('; ')}`
    : '';

  const systemPrompt = `You are EduGuide, an intelligent and encouraging AI study tutor. Help students understand academic material clearly and memorably.${contextNote}

Guidelines:
- Give clear, structured explanations
- Make it concise and easy to understand
- Use examples and analogies as a short but effective way to clarify concepts
- Be encouraging and supportive`;

  try {
    const historyPrompt = appState.chatHistory.slice(-8).map(m =>
      `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`
    ).join('\n');

    await sleep(100);
    const reply = await callGemini(`${systemPrompt}\n\nConversation:\n${historyPrompt}`);
    typingEl.remove();
    appendChatMsg('ai', reply);
    appState.chatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    typingEl.remove();
    appendChatMsg('ai', `I'm having trouble connecting right now. Make sure your Cerebras API key is configured in Settings.`);
  }

  document.getElementById('chat-send-btn').disabled = false;
}

function sendSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendChatMessage();
}

function appendChatMsg(role, text) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-avatar ${role}">${role === 'ai' ? '🧠' : getUserInitials()}</div>
    <div class="chat-bubble">${escHtml(text).replace(/\n/g, '<br/>')}</div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function appendTyping() {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = `
    <div class="chat-avatar ai">🧠</div>
    <div class="chat-bubble chat-typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function getUserInitials() {
  const name = currentUser?.user_metadata?.full_name || currentUser?.email || 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}