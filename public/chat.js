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
    requestAnimationFrame(() => Prism.highlightAllUnder(container));
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

function renderMessage(content, isUser=false) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${isUser ? 'user-message' : 'assistant-message'} visible`;
  if(!isUser) msgEl.classList.add('streaming');

  chatMessages.appendChild(msgEl);
  scrollToBottom();

  if(isUser) {
    renderChunk(content, msgEl);
  } else {
    appendStreamingText(content, msgEl);
  }
}

// --- Streaming text ---
async function appendStreamingText(fullText, container) {
  const p = document.createElement('p');
  container.appendChild(p);

  let i = 0;
  while(i < fullText.length) {
    p.innerHTML = escapeHtml(fullText.slice(0, i+1)).replace(/\n/g,'<br>');
    scrollToBottom();
    i++;
    await new Promise(r => setTimeout(r, 15)); // simulate typing
  }

  container.classList.remove('streaming');
  highlightCodeBlocks(container);
}

// --- Copy buttons ---
document.addEventListener('click', e=>{
  const btn = e.target.closest('.copy-btn');
  if(!btn) return;
  const codeEl = btn.closest('.code-block')?.querySelector('code');
  if(!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent);
  btn.classList.add('copied');
  setTimeout(()=>btn.classList.remove('copied'),2000);
});

// --- Input handling ---
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight,120)+'px';
  const hasText = userInput.value.trim() !== '';
  sendButton.disabled = !hasText || isProcessing;
  sendButton.classList.toggle('enabled', hasText && !isProcessing);
});

userInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); if(!sendButton.disabled) sendMessage(); }
});
sendButton.addEventListener('click', ()=>{ if(!sendButton.disabled) sendMessage(); });

// --- Send message ---
async function sendMessage(){
  const message = userInput.value.trim();
  if(!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  userInput.value = '';
  userInput.style.height='auto';

  typingIndicator.classList.add('visible');
  renderMessage(message, true);
  chatHistory.push({ role:'user', content:message });

  try {
    // --- Mock API streaming response ---
    const responseText = "Sure! Here's some `inline code` and a code block:\n```javascript\nconsole.log('Hello World!');\n```";
    await new Promise(r => setTimeout(r, 200)); // small delay
    renderMessage(responseText, false);
    chatHistory.push({ role:'assistant', content:responseText });

  } catch(err) {
    renderMessage("Oops! Something went wrong.", false);
    console.error(err);
  } finally {
    typingIndicator.classList.remove('visible');
    isProcessing=false;
    userInput.disabled=false;
    sendButton.disabled = userInput.value.trim()==='';
    if(userInput.value.trim()) sendButton.classList.add('enabled');
    userInput.focus();
  }
}

// --- Initial assistant message ---
renderMessage(chatHistory[0].content, false);









