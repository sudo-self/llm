// chat.js

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  { role: "assistant", content: "Hi! I'm J, How can I help?" },
];
let isProcessing = false;

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Prism highlighting
function highlightCodeBlocks(container = chatMessages) {
  if (typeof Prism !== "undefined") {
    requestAnimationFrame(() => Prism.highlightAllUnder(container));
  }
}

// Scroll chat
function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}

// Parse SSE streaming chunks
function parseSSEChunk(chunk) {
  const lines = chunk.split("\n");
  const events = [];
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();
      if (data === "[DONE]") events.push({ type: "done" });
      else if (data) {
        try {
          events.push({ type: "data", data: JSON.parse(data) });
        } catch (err) {
          console.warn("Failed to parse SSE data:", data, err);
        }
      }
    }
  }
  return events;
}

// Render code & text chunks
function renderChunk(text, container) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    // Text before code block
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      const p = document.createElement("p");
      p.innerHTML = before.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`).replace(/\n/g, "<br>");
      fragment.appendChild(p);
    }

    // Code block
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-header";

    const langLabel = document.createElement("span");
    langLabel.className = "code-language";
    langLabel.textContent = match[1] || "text";

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.setAttribute("title", "Copy code");
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';

    header.appendChild(langLabel);
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.className = `language-${match[1] || "text"}`;
    codeEl.textContent = match[2].trim();
    pre.appendChild(codeEl);
    wrapper.appendChild(pre);

    fragment.appendChild(wrapper);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    const p = document.createElement("p");
    p.innerHTML = remaining.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`).replace(/\n/g, "<br>");
    fragment.appendChild(p);
  }

  container.innerHTML = "";
  container.appendChild(fragment);
  highlightCodeBlocks(container);
}

// Render a message (user or assistant)
function renderMessage(content, isUser = false) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isUser ? "user-message" : "assistant-message"} visible`;
  chatMessages.appendChild(msgEl);

  if (isUser) {
    renderChunk(content, msgEl);
  } else {
    // For assistant, start streaming empty initially
    const p = document.createElement("p");
    msgEl.appendChild(p);
  }

  scrollToBottom();
  return msgEl;
}

// Append streaming text for SSE
function appendStreamingText(text, container) {
  const lastChild = container.querySelector("p:last-of-type");
  if (!lastChild) {
    const p = document.createElement("p");
    container.appendChild(p);
  }
  renderChunk(text, container);
  scrollToBottom();
}

// Input handling
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

sendButton.addEventListener("click", () => { if (!sendButton.disabled) sendMessage(); });

// Copy code buttons
document.addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (!copyBtn) return;
  const codeEl = copyBtn.closest(".code-block")?.querySelector("code");
  if (!codeEl) return;

  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    const icon = copyBtn.querySelector("i");
    const originalClass = icon.className;
    copyBtn.classList.add("copied");
    icon.className = "fas fa-check";
    copyBtn.setAttribute("title", "Copied!");
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      icon.className = originalClass;
      copyBtn.setAttribute("title", "Copy code");
    }, 2000);
  }).catch(err => console.error("Failed to copy code:", err));
});

// Send message
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  sendButton.classList.remove("enabled");

  renderMessage(message, true);
  chatHistory.push({ role: "user", content: message });

  userInput.value = "";
  userInput.style.height = "auto";

  typingIndicator.classList.add("visible");

  try {
    const responseEl = renderMessage("", false);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = parseSSEChunk(buffer);
      const lastNewline = buffer.lastIndexOf("\n");
      if (lastNewline !== -1) buffer = buffer.slice(lastNewline + 1);

      for (const event of events) {
        if (event.type === "data" && event.data?.response) {
          fullText += event.data.response;
          renderChunk(fullText, responseEl);
          scrollToBottom();
        }
      }
    }

    responseEl.classList.remove("streaming");
    chatHistory.push({ role: "assistant", content: fullText });
    highlightCodeBlocks(responseEl);

  } catch (err) {
    console.error(err);
    renderMessage("Error: Unable to fetch response.", false);
  } finally {
    typingIndicator.classList.remove("visible");
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = userInput.value.trim() === "";
    if (userInput.value.trim()) sendButton.classList.add("enabled");
    userInput.focus();
  }
}

// Initial assistant message
renderMessage(chatHistory[0].content, false);








