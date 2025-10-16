// chat.js

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  { role: "assistant", content: "Hi! I'm J, How can I help?" }
];
let isProcessing = false;

// --- Helpers ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightCodeBlocks(container = chatMessages) {
  if (typeof Prism !== 'undefined') {
    // Wait for DOM to be updated then highlight
    setTimeout(() => {
      Prism.highlightAllUnder(container);
    }, 0);
  }
}

function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

// --- Rendering ---
function renderChunk(text, container) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if(before.trim()) {
      const p = document.createElement('p');
      p.innerHTML = before.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`).replace(/\n/g,'<br>');
      fragment.appendChild(p);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-header';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-language';
    langLabel.textContent = match[1] || 'text';

    const copyBtn = document.createElement('button');
    copyBtn.className='copy-btn';
    copyBtn.innerHTML='<i class="fas fa-copy"></i>';

    header.appendChild(langLabel);
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.className = `language-${match[1]||'text'}`;
    codeEl.textContent = match[2].trim();
    pre.appendChild(codeEl);
    wrapper.appendChild(pre);
    fragment.appendChild(wrapper);

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if(remaining.trim()) {
    const p = document.createElement('p');
    p.innerHTML = remaining.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`).replace(/\n/g,'<br>');
    fragment.appendChild(p);
  }

  container.innerHTML = '';
  container.appendChild(fragment);
  highlightCodeBlocks(container);
}

function renderMessage(content, isUser = false) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${isUser ? 'user-message' : 'assistant-message'} visible`;
  if(!isUser) msgEl.classList.add('streaming');

  chatMessages.appendChild(msgEl);
  scrollToBottom();

  if(isUser) {
    const userContent = document.createElement('div');
    userContent.textContent = content;
    msgEl.appendChild(userContent);
  } else {
    appendStreamingText(content, msgEl);
  }
}

// --- Streaming text ---
async function appendStreamingText(fullText, container) {
  const contentDiv = document.createElement('div');
  container.appendChild(contentDiv);

  let i = 0;
  const chunkSize = 2; // Process 2 characters at a time for smoother streaming
  
  while(i < fullText.length) {
    const chunk = fullText.slice(0, i + chunkSize);
    renderChunk(chunk, contentDiv);
    scrollToBottom();
    i += chunkSize;
    await new Promise(r => setTimeout(r, 15));
  }

  container.classList.remove('streaming');
}

// --- Copy buttons ---
document.addEventListener('click', e => {
  const btn = e.target.closest('.copy-btn');
  if(!btn) return;
  
  const codeBlock = btn.closest('.code-block');
  const codeEl = codeBlock?.querySelector('code');
  if(!codeEl) return;
  
  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    const icon = btn.querySelector('i');
    btn.classList.add('copied');
    icon.classList.replace('fa-copy', 'fa-check');
    
    setTimeout(() => {
      btn.classList.remove('copied');
      icon.classList.replace('fa-check', 'fa-copy');
    }, 2000);
  });
});

// --- Input handling ---
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  const hasText = userInput.value.trim() !== '';
  sendButton.disabled = !hasText || isProcessing;
  sendButton.classList.toggle('enabled', hasText && !isProcessing);
});

userInput.addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey) { 
    e.preventDefault(); 
    if(!sendButton.disabled) sendMessage(); 
  }
});

sendButton.addEventListener('click', () => { 
  if(!sendButton.disabled) sendMessage(); 
});

// --- API Integration ---
async function callAIAPI(message) {
  try {
    // Replace with your actual API endpoint
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        history: chatHistory
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response;

  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// --- Send message ---
async function sendMessage() {
  const message = userInput.value.trim();
  if(!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  userInput.value = '';
  userInput.style.height = 'auto';

  typingIndicator.classList.add('visible');
  renderMessage(message, true);
  chatHistory.push({ role: 'user', content: message });

  try {
    // Call actual API
    const responseText = await callAIAPI(message);
    
    // Render the response
    renderMessage(responseText, false);
    chatHistory.push({ role: 'assistant', content: responseText });

  } catch(err) {
    console.error('Error:', err);
    
    // Fallback response if API fails
    const fallbackResponse = "I'm having trouble connecting right now. Here's a sample response with code:\n\n```javascript\nfunction hello() {\n  console.log('Hello World!');\n}\n```\n\nAnd here's some `inline code` too!";
    renderMessage(fallbackResponse, false);
    chatHistory.push({ role: 'assistant', content: fallbackResponse });
    
  } finally {
    typingIndicator.classList.remove('visible');
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = userInput.value.trim() === '';
    if(userInput.value.trim()) sendButton.classList.add('enabled');
    userInput.focus();
  }
}

// --- Initial assistant message ---
// Use renderChunk for the initial message to properly handle code formatting
const initialMessageEl = document.createElement('div');
initialMessageEl.className = 'message assistant-message visible';
chatMessages.appendChild(initialMessageEl);
renderChunk(chatHistory[0].content, initialMessageEl);









