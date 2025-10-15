const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [
  {
    role: "assistant",
    content:
      "Welcome to ai.jessejesse.com!",
  },
];
let isProcessing = false;


renderMessage(chatHistory[0].content, false);


userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
  sendButton.disabled = userInput.value.trim() === "" || isProcessing;
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
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function renderMessage(content, isUser = false) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isUser ? "user-message" : "assistant-message"}`;


  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let html = content.replace(codeRegex, (match, lang, code) => {
    const safeLang = lang || "markup";
    return `
      <div class="code-block">
        <button class="copy-btn">Copy</button>
        <pre><code class="language-${safeLang}">${Prism.highlight(
      code.trim(),
      Prism.languages[safeLang] || Prism.languages.markup,
      safeLang
    )}</code></pre>
      </div>
    `;
  });


  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-gray-800 text-orange-300 px-1 py-0.5 rounded text-sm">$1</code>'
  );

  msgEl.innerHTML = html;
  chatMessages.appendChild(msgEl);
  scrollToBottom();
}


document.addEventListener("click", (e) => {
  if (e.target.classList.contains("copy-btn")) {
    const code = e.target.nextElementSibling.innerText;
    navigator.clipboard.writeText(code).then(() => {
      const original = e.target.textContent;
      e.target.textContent = "Copied!";
      setTimeout(() => (e.target.textContent = original), 1500);
    });
  }
});


async function sendMessage() {
  const message = userInput.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendButton.disabled = true;
  userInput.disabled = true;

  renderMessage(message, true);
  chatHistory.push({ role: "user", content: message });

  userInput.value = "";
  userInput.style.height = "auto";
  scrollToBottom();

  typingIndicator.style.display = "flex";

  try {
    const responseEl = document.createElement("div");
    responseEl.className = "message assistant-message";
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    responseEl.appendChild(pre);
    chatMessages.appendChild(responseEl);
    scrollToBottom();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });

    if (!res.ok) throw new Error("Failed to fetch response");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullText += data.response;
            pre.textContent = fullText;
            scrollToBottom();
          }
        } catch (err) {
          console.error("JSON parse error:", err);
        }
      }
    }

    chatHistory.push({ role: "assistant", content: fullText });
  } catch (err) {
    console.error(err);
    renderMessage("Sorry, there was an error processing your request.", false);
  } finally {
    typingIndicator.style.display = "none";
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = userInput.value.trim() === "";
    userInput.focus();
  }
}



