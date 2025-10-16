const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  { role: "assistant", content: "Hi! I'm J, How can I help?" }
];
let isProcessing = false;
let currentStreamingMessage = null;

// --- Helpers ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightCodeBlocks(container = chatMessages) {
  if (typeof Prism !== 'undefined') {
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
  
  chatMessages.appendChild(msgEl);
  scrollToBottom();

  if(isUser) {
    const userContent = document.createElement('div');
    userContent.textContent = content;
    msgEl.appendChild(userContent);
  } else {
    // For assistant messages, create container for streaming
    const contentDiv = document.createElement('div');
    msgEl.appendChild(contentDiv);
    return contentDiv; // Return the container for streaming
  }
}

// --- Streaming text ---
function appendStreamingText(chunk, container) {
  // Get current content and append new chunk
  const currentContent = container.textContent || '';
  const newContent = currentContent + chunk;
  
  renderChunk(newContent, container);
  scrollToBottom();
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

// --- STREAMING API Integration ---
async function callAIAPI(message) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          ...chatHistory,
          { role: "user", content: message }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.response && data.type === 'chunk') {
              fullResponse += data.response;
              // Update the streaming message in real-time
              if (currentStreamingMessage) {
                appendStreamingText(data.response, currentStreamingMessage);
              }
            }
            
            if (data.type === 'complete') {
              return fullResponse;
            }
            
            if (data.error) {
              throw new Error(data.message || data.error);
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.log('Skipping invalid line:', line);
          }
        }
      }
    }

    return fullResponse;

  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// --- Send message with streaming ---
async function sendMessage() {
  const message = userInput.value.trim();
  if(!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  userInput.value = '';
  userInput.style.height = 'auto';

  typingIndicator.style.display = 'flex';
  setTimeout(() => typingIndicator.classList.add('visible'), 10);
  
  renderMessage(message, true);
  chatHistory.push({ role: 'user', content: message });

  try {
    // Create assistant message container for streaming
    const assistantMessageContainer = renderMessage('', false);
    assistantMessageContainer.classList.add('streaming');
    currentStreamingMessage = assistantMessageContainer;
    
    // Call streaming API
    const responseText = await callAIAPI(message);
    
    // Remove streaming class and update final state
    assistantMessageContainer.classList.remove('streaming');
    chatHistory.push({ role: 'assistant', content: responseText });

  } catch(err) {
    console.error('Error:', err);
    
    // Remove any streaming message on error
    if (currentStreamingMessage) {
      currentStreamingMessage.parentElement.remove();
    }
    
    // Better fallback response
    const fallbackResponse = `I apologize, but I'm having trouble connecting to the AI service right now. Please try again in a moment.

In the meantime, here's what I can help with:
- Answer questions about programming
- Help with code examples
- Explain technical concepts

Error details: ${err.message}`;
    
    renderMessage(fallbackResponse, false);
    chatHistory.push({ role: 'assistant', content: fallbackResponse });
    
  } finally {
    currentStreamingMessage = null;
    typingIndicator.classList.remove('visible');
    setTimeout(() => {
      typingIndicator.style.display = 'none';
    }, 300);
    
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = userInput.value.trim() === '';
    if(userInput.value.trim()) sendButton.classList.add('enabled');
    userInput.focus();
  }
}

// --- Initial assistant message ---
const initialMessageEl = document.createElement('div');
initialMessageEl.className = 'message assistant-message visible';
chatMessages.appendChild(initialMessageEl);
renderChunk(chatHistory[0].content, initialMessageEl);









