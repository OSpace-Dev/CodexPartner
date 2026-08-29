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
  const contextItems = new Map();
  let lastCaretRange = null;

  elements.refresh.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
  elements.newThread.addEventListener("click", () => vscode.postMessage({ type: "newThread" }));
  elements.threads.addEventListener("change", () => {
    vscode.postMessage({ type: "selectThread", threadId: elements.threads.value });
  });
  elements.prompt.addEventListener("input", () => {
    pruneContextItems();
    rememberCaret();
  });
  elements.prompt.addEventListener("keyup", rememberCaret);
  elements.prompt.addEventListener("mouseup", rememberCaret);
  elements.prompt.addEventListener("click", (event) => {
    const removeButton = event.target.closest("button[data-action=remove-context]");
    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      removeComposerContext(removeButton.closest(".context-chip"));
      return;
    }
    rememberCaret();
  });
  document.addEventListener("selectionchange", () => {
    if (isSelectionInsidePrompt()) rememberCaret();
  });
  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentState.busy) return;
    const blocks = readComposerBlocks();
    if (!hasMeaningfulComposerContent(blocks)) return;
    vscode.postMessage({ type: "send", blocks });
  });
  elements.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type === "addComposerContext") {
      const incoming = Array.isArray(event.data.contextItems) ? event.data.contextItems : [];
      for (const item of incoming) insertComposerContext(item);
      elements.prompt.focus();
      return;
    }
    if (event.data?.type === "clearComposer") {
      clearComposer();
      return;
    }
    if (event.data?.type !== "state") return;
    currentState = event.data.state;
    render();
  });
  vscode.postMessage({ type: "webviewReady" });

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
    elements.prompt.contentEditable = currentState.busy ? "false" : "true";
  }

  function insertComposerContext(item) {
    if (!item?.id || contextItems.has(item.id)) return;
    contextItems.set(item.id, item);
    elements.prompt.focus();
    const range = getInsertionRange();
    range.deleteContents();
    const chip = createContextChip(item);
    range.insertNode(chip);
    placeCaretAfter(chip);
    rememberCaret();
  }

  function createContextChip(item) {
    const chip = document.createElement("span");
    chip.className = "context-chip";
    chip.contentEditable = "false";
    chip.dataset.contextId = item.id;
    chip.title = "项目上下文 " + formatContextLabel(item);

    const label = document.createElement("span");
    label.className = "context-chip-label";
    label.textContent = formatContextLabel(item);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "context-chip-remove";
    remove.dataset.action = "remove-context";
    remove.title = "移除上下文";
    remove.ariaLabel = "移除上下文 " + formatContextLabel(item);
    remove.textContent = "×";
    chip.append(label, remove);
    return chip;
  }

  function removeComposerContext(chip) {
    if (!chip) return;
    const parent = chip.parentNode;
    const index = Array.prototype.indexOf.call(parent.childNodes, chip);
    contextItems.delete(chip.dataset.contextId);
    chip.remove();
    const range = document.createRange();
    range.setStart(parent, Math.min(index, parent.childNodes.length));
    range.collapse(true);
    setCaretRange(range);
  }

  function getInsertionRange() {
    if (
      lastCaretRange &&
      isRangeInsidePrompt(lastCaretRange) &&
      !isRangeInsideContextChip(lastCaretRange)
    ) {
      return lastCaretRange.cloneRange();
    }
    const range = document.createRange();
    range.selectNodeContents(elements.prompt);
    range.collapse(false);
    return range;
  }

  function rememberCaret() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !isSelectionInsidePrompt()) return;
    lastCaretRange = selection.getRangeAt(0).cloneRange();
  }

  function setCaretRange(range) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    lastCaretRange = range.cloneRange();
    elements.prompt.focus();
  }

  function placeCaretAfter(node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    setCaretRange(range);
  }

  function isSelectionInsidePrompt() {
    const selection = window.getSelection();
    return Boolean(selection && selection.rangeCount > 0 && isRangeInsidePrompt(selection.getRangeAt(0)));
  }

  function isRangeInsidePrompt(range) {
    return Boolean(range && elements.prompt.contains(range.commonAncestorContainer));
  }

  function isRangeInsideContextChip(range) {
    return Boolean(
      range &&
      elements.prompt.contains(range.commonAncestorContainer) &&
      (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer.closest(".context-chip")
        : range.commonAncestorContainer.parentElement?.closest(".context-chip")),
    );
  }

  function pruneContextItems() {
    const liveIds = new Set(
      [...elements.prompt.querySelectorAll(".context-chip[data-context-id]")].map((chip) => chip.dataset.contextId),
    );
    for (const id of contextItems.keys()) {
      if (!liveIds.has(id)) contextItems.delete(id);
    }
  }

  function readComposerBlocks() {
    const blocks = [];
    const appendText = (value) => {
      if (!value) return;
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "text") previous.value += value;
      else blocks.push({ type: "text", value });
    };
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.nodeValue);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches(".context-chip")) {
        const item = contextItems.get(node.dataset.contextId);
        if (item) blocks.push({ type: "context", item });
        return;
      }
      if (node.tagName === "BR") {
        appendText("\\n");
        return;
      }
      node.childNodes.forEach(visit);
    };
    elements.prompt.childNodes.forEach(visit);
    return blocks;
  }

  function hasMeaningfulComposerContent(blocks) {
    return blocks.some((block) => block.type === "context" || block.value.trim());
  }

  function clearComposer() {
    elements.prompt.replaceChildren();
    contextItems.clear();
    lastCaretRange = null;
    elements.prompt.focus();
  }

  function formatContextLabel(item) {
    const lines = item.startLine === item.endLine ? String(item.startLine) : item.startLine + "-" + item.endLine;
    return item.path + ":" + lines;
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
      article.className = "message " + message.role;
      const label = document.createElement("div");
      label.className = "message-label";
      label.textContent = message.role === "user" ? "You" : "Codex";
      const content = document.createElement("div");
      content.className = "message-content";
      if (Array.isArray(message.blocks)) renderMessageBlocks(content, message.blocks);
      else content.textContent = message.text || "";
      article.append(label, content);
      elements.messages.append(article);
    }
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function renderMessageBlocks(container, blocks) {
    for (const block of blocks) {
      if (block.type === "text") {
        container.append(document.createTextNode(block.value));
        continue;
      }
      const chip = document.createElement("span");
      chip.className = "message-context-chip";
      chip.textContent = formatContextLabel(block.item);
      chip.title = "项目上下文 " + formatContextLabel(block.item);
      container.append(chip);
    }
  }
})();
