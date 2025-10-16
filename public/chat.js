// /public/chat.js 

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  { role: "assistant", content: "Hi! I'm Jesse, How can I help?" },
];
let isProcessing = false;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightCodeBlocks() {
  if (typeof Prism !== 'undefined') {
    requestAnimationFrame(() => {
      try {
        Prism.highlightAllUnder(chatMessages);
      } catch (error) {
        console.warn('Prism highlighting failed:', error);
      }
    });
  }
}

function parseSSEChunk(chunk) {
  const lines = chunk.split('\n');
  const events = [];

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        events.push({ type: 'done' });
      } else if (data) {
        try {
          events.push({ type: 'data', data: JSON.parse(data) });
        } catch (err) {
          console.warn('Failed to parse SSE data:', data, err);
        }
      }
    }
  }
  return events;
}

function detectLanguage(content) {
  if (content.includes('import React') || 
      content.includes('export default') ||
      content.includes('function Component') ||
      content.includes('const Component') ||
      content.includes('</') && content.includes('/>')) {
    return 'jsx';
  }
  
  if (content.includes('interface ') || 
      content.includes('type ') && content.includes('=') ||
      content.includes(': string') || 
      content.includes(': number') ||
      content.includes(': boolean')) {
    return 'typescript';
  }
  
  if (content.trim().startsWith('//') || content.includes('function ') || content.includes('const ')) {
    return 'javascript';
  }
  
  return 'text';
}

function renderMessage(content, isUser = false, isStreaming = false) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isUser ? "user-message" : "assistant-message"} ${isUser ? 'slide-in-right' : 'slide-in-left'} ${isStreaming ? 'streaming' : ''}`;

  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let html = content;
  
  html = html.replace(codeRegex, (match, lang, code) => {
    const detectedLang = lang || detectLanguage(code);
    const escapedCode = escapeHtml(code);
    return `
<div class="code-block">
  <div class="code-header">
    <span class="code-language">${detectedLang}</span>
    <button class="copy-btn" title="Copy code">
      <i class="fas fa-copy"></i>
    </button>
  </div>
  <pre><code class="language-${detectedLang}">${escapedCode}</code></pre>
</div>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  if (!isStreaming) {
    const lines = html.split('\n');
    html = lines.map(line => {
      line = line.trim();
      if (!line) return '';
      if (line.startsWith('<div class="code-block">')) return line;
      return `<p>${line}</p>`;
    }).join('\n');
  }

  msgEl.innerHTML = html;
  chatMessages.appendChild(msgEl);

  if (!isStreaming) {
    setTimeout(() => msgEl.classList.add('visible'), 10);
  }
  
  scrollToBottom();
  
  if (!isStreaming) {
    highlightCodeBlocks();
  }
  
  return msgEl;
}

function updateStreamingMessage(messageElement, content) {
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let html = content;
  
  html = html.replace(codeRegex, (match, lang, code) => {
    const detectedLang = lang || detectLanguage(code);
    const escapedCode = escapeHtml(code);
    return `
<div class="code-block">
  <div class="code-header">
    <span class="code-language">${detectedLang}</span>
    <button class="copy-btn" title="Copy code">
      <i class="fas fa-copy"></i>
    </button>
  </div>
  <pre><code class="language-${detectedLang}">${escapedCode}</code></pre>
</div>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  messageElement.innerHTML = html;
  
  if (!content.includes('```') || content.endsWith('```')) {
    highlightCodeBlocks();
  }
  
  scrollToBottom();
}

renderMessage(chatHistory[0].content, false);

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";

  const hasText = userInput.value.trim() !== "";
  sendButton.disabled = !hasText || isProcessing;
  sendButton.classList.toggle("enabled", hasText && !isProcessing);
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendButton.disabled) sendMessage();
  }
});

sendButton.addEventListener("click", () => {
  if (!sendButton.disabled) sendMessage();
});

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  });
}

document.addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (!copyBtn) return;

  const codeBlock = copyBtn.closest('.code-block');
  const code = codeBlock.querySelector('code').textContent;

  navigator.clipboard.writeText(code).then(() => {
    const icon = copyBtn.querySelector('i');
    const originalClass = icon.className;

    copyBtn.classList.add('copied');
    icon.className = 'fas fa-check';
    copyBtn.setAttribute('title', 'Copied!');

    setTimeout(() => {
      copyBtn.classList.remove('copied');
      icon.className = originalClass;
      copyBtn.setAttribute('title', 'Copy code');
    }, 2000);
  }).catch(err => console.error('Failed to copy text:', err));
});

async function sendMessage() {
  const message = userInput.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  sendButton.classList.remove('enabled');

  renderMessage(message, true);
  chatHistory.push({ role: "user", content: message });

  userInput.value = "";
  userInput.style.height = "auto";
  scrollToBottom();

  typingIndicator.style.display = "flex";
  typingIndicator.classList.add('visible');

  try {
    const streamingMessageEl = renderMessage("", false, true);
    let fullText = "";

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = parseSSEChunk(buffer);
      const lastNewline = buffer.lastIndexOf('\n');
      if (lastNewline !== -1) buffer = buffer.slice(lastNewline + 1);

      for (const event of events) {
        if (event.type === 'data' && event.data.response) {
          fullText += event.data.response;
          updateStreamingMessage(streamingMessageEl, fullText);
        } else if (event.type === 'done') break;
      }
    }

    const finalEvents = parseSSEChunk(buffer);
    for (const event of finalEvents) {
      if (event.type === 'data' && event.data.response) {
        fullText += event.data.response;
        updateStreamingMessage(streamingMessageEl, fullText);
      }
    }

    streamingMessageEl.classList.remove('streaming');
    streamingMessageEl.classList.add('visible');
    highlightCodeBlocks();
    
    chatHistory.push({ role: "assistant", content: fullText });

  } catch (err) {
    console.error("Chat error:", err);
    renderMessage(
      "Sorry, I encountered an error while processing your request. Please try again.",
      false
    );
  } finally {
    typingIndicator.style.display = "none";
    typingIndicator.classList.remove('visible');
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = userInput.value.trim() === "";
    if (userInput.value.trim()) sendButton.classList.add('enabled');
    userInput.focus();
  }
}

const streamingStyles = `
.message.streaming {
  position: relative;
}

.message.streaming::after {
  content: '▋';
  animation: blink 1s infinite;
  color: var(--primary);
  margin-left: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message.streaming .code-block {
  border-left: 3px solid var(--primary);
  opacity: 0.9;
}

.message.streaming .code-language::after {
  content: ' • Streaming';
  font-size: 0.7em;
  opacity: 0.7;
}
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = streamingStyles;
document.head.appendChild(styleSheet);










