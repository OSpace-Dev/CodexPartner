(function () {
  const vscode = acquireVsCodeApi();
  const elements = {
    threads: document.getElementById("threads"),
    refresh: document.getElementById("refresh"),
    newThread: document.getElementById("new-thread"),
    messages: document.getElementById("messages"),
    error: document.getElementById("error"),
    composer: document.getElementById("composer"),
    prompt: document.getElementById("prompt"),
    send: document.getElementById("send"),
    status: document.getElementById("status"),
  };

  let currentState = {
    threads: [],
    history: [],
    selectedThreadId: null,
    busy: false,
    error: null,
  };

  elements.refresh.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
  elements.newThread.addEventListener("click", () => vscode.postMessage({ type: "newThread" }));
  elements.threads.addEventListener("change", () => {
    vscode.postMessage({ type: "selectThread", threadId: elements.threads.value });
  });
  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = elements.prompt.value.trim();
    if (!text || currentState.busy) return;
    vscode.postMessage({ type: "send", text });
    elements.prompt.value = "";
  });
  elements.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type === "insertComposerText") {
      insertComposerText(event.data.text);
      return;
    }
    if (event.data?.type !== "state") return;
    currentState = event.data.state;
    render();
  });
  vscode.postMessage({ type: "webviewReady" });

  function insertComposerText(text) {
    const value = String(text ?? "");
    const start = elements.prompt.selectionStart ?? elements.prompt.value.length;
    const end = elements.prompt.selectionEnd ?? start;
    elements.prompt.value = `${elements.prompt.value.slice(0, start)}${value}${elements.prompt.value.slice(end)}`;
    const cursor = start + value.length;
    elements.prompt.focus();
    elements.prompt.setSelectionRange(cursor, cursor);
  }

  function render() {
    renderThreads();
    renderMessages();
    elements.error.textContent = currentState.error ?? "";
    elements.error.hidden = !currentState.error;
    elements.status.textContent = currentState.busy ? "Working..." : "Ready";
    elements.send.disabled = currentState.busy;
    elements.refresh.disabled = currentState.busy;
    elements.newThread.disabled = currentState.busy;
    elements.threads.disabled = currentState.busy || currentState.threads.length === 0;
  }

  function renderThreads() {
    const previous = elements.threads.value;
    elements.threads.replaceChildren();
    if (currentState.threads.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No threads found";
      option.value = "";
      elements.threads.append(option);
      return;
    }
    for (const thread of currentState.threads) {
      const option = document.createElement("option");
      option.value = thread.id;
      option.textContent = thread.title;
      option.selected = thread.id === currentState.selectedThreadId || thread.id === previous;
      elements.threads.append(option);
    }
  }

  function renderMessages() {
    elements.messages.replaceChildren();
    if (currentState.history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<strong>Select a conversation</strong><span>History from the local Codex App Server will appear here.</span>";
      elements.messages.append(empty);
      return;
    }
    for (const message of currentState.history) {
      const article = document.createElement("article");
      article.className = `message ${message.role}`;
      const label = document.createElement("div");
      label.className = "message-label";
      label.textContent = message.role === "user" ? "You" : "Codex";
      const content = document.createElement("div");
      content.className = "message-content";
      content.textContent = message.text;
      article.append(label, content);
      elements.messages.append(article);
    }
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
})();
