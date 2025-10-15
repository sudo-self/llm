// chat.js

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  {
    role: "assistant",
    content: "Hi! I'm J, How can I help you today?",
  },
];
let isProcessing = false;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightCodeBlocks(container = chatMessages) {
  if (typeof Prism !== 'undefined') {
    requestAnimationFrame(() => {
      try {
        Prism.highlightAllUnder(container);
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

function renderMessage(content, isUser = false) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isUser ? "user-message" : "assistant-message"} ${isUser ? 'slide-in-right' : 'slide-in-left'} visible`;

  renderChunk(content, msgEl);

  chatMessages.appendChild(msgEl);
  scrollToBottom();
}

function renderChunk(text, container) {
  // Detect code blocks and inline code
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      const p = document.createElement('p');
      p.innerHTML = before.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>').replace(/\n/g, '<br>');
      fragment.appendChild(p);
    }

    const codeBlock = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.className = `language-${match[1] || 'text'}`;
    codeEl.textContent = match[2].trim();
    codeBlock.appendChild(codeEl);
    fragment.appendChild(codeBlock);

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    const p = document.createElement('p');
    p.innerHTML = remaining.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>').replace(/\n/g, '<br>');
    fragment.appendChild(p);
  }

  container.innerHTML = '';
  container.appendChild(fragment);
  highlightCodeBlocks(container);
}

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  const newHeight = Math.min(userInput.scrollHeight, 120);
  userInput.style.height = newHeight + "px";

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
  if (copyBtn) {
    const codeBlock = copyBtn.closest('.code-block') || copyBtn.closest('pre');
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
  }
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
    const responseEl = document.createElement("div");
    responseEl.className = "message assistant-message streaming visible";
    chatMessages.appendChild(responseEl);
    scrollToBottom();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
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
          renderChunk(fullText, responseEl);
          scrollToBottom();
        }
      }
    }

    responseEl.classList.remove('streaming');
    chatHistory.push({ role: "assistant", content: fullText });

  } catch (err) {
    console.error("Chat error:", err);
    renderMessage("Sorry, I encountered an error while processing your request. Please try again.", false);
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


renderMessage(chatHistory[0].content, false);
