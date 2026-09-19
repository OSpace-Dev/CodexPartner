const vscode = acquireVsCodeApi();
const strings = JSON.parse(document.body.dataset.l10n || "{}");
const locale = document.documentElement.lang || undefined;
const composerMinHeight = 82;
const composerMaxHeight = 180;
const composerDefaultHeight = 82;
const composerResizeStep = 8;
const composer = document.getElementById("composer");
const content = document.getElementById("content");
const resizeHandle = document.getElementById("resize-handle");
const save = document.getElementById("save");
const clear = document.getElementById("clear");
const keybindings = document.getElementById("keybindings");
const total = document.getElementById("total");
const notes = document.getElementById("notes");
const toast = document.getElementById("toast");
let clearArmed = false;
let resizeSession;
let toastTimer;

function createIcon(name) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("icon");
  icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#icon-${name}`);
  icon.append(use);
  return icon;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatMessage(message, ...values) {
  return message.replace(/\{(\d+)\}/g, (placeholder, index) => (
    Number(index) < values.length ? String(values[Number(index)]) : placeholder
  ));
}

function updateViewState(changes) {
  vscode.setState({ ...(vscode.getState() || {}), ...changes });
}

function applyComposerHeight(height) {
  const numericHeight = Number(height);
  const nextHeight = Math.min(
    composerMaxHeight,
    Math.max(
      composerMinHeight,
      Number.isFinite(numericHeight) ? Math.round(numericHeight) : composerDefaultHeight,
    ),
  );
  content.style.height = `${nextHeight}px`;
  resizeHandle.setAttribute("aria-valuenow", String(nextHeight));
  return nextHeight;
}

function saveComposerHeight() {
  updateViewState({ composerHeight: Math.round(content.getBoundingClientRect().height) });
}

function updateComposer() {
  save.disabled = !content.value.trim();
  updateViewState({ draft: content.value });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function createNote(note) {
  const article = document.createElement("article");
  article.className = "note";
  const noteContent = document.createElement("div");
  noteContent.className = "note-content";
  noteContent.textContent = note.content;

  const footer = document.createElement("footer");
  footer.className = "note-footer";
  const time = document.createElement("time");
  time.className = "note-time";
  time.dateTime = new Date(note.createdAt).toISOString();
  time.textContent = formatTime(note.createdAt);

  const actions = document.createElement("div");
  actions.className = "note-actions";
  const copy = document.createElement("button");
  copy.className = "copy-button";
  copy.type = "button";
  copy.dataset.copy = note.id;
  copy.title = strings.copyNote;
  copy.append(createIcon("copy"), document.createTextNode(strings.copy));

  const remove = document.createElement("button");
  remove.className = "icon-button danger";
  remove.type = "button";
  remove.dataset.remove = note.id;
  remove.title = strings.deleteNote;
  remove.setAttribute("aria-label", strings.deleteNote);
  remove.append(createIcon("trash"));

  actions.append(copy, remove);
  footer.append(time, actions);
  article.append(noteContent, footer);
  return article;
}

function render(items) {
  total.textContent = formatMessage(strings.recordCount, items.length);
  clear.disabled = items.length === 0;
  clearArmed = false;
  clear.classList.remove("confirm");
  clear.title = strings.clearAll;
  clear.setAttribute("aria-label", strings.clearAll);
  notes.replaceChildren();

  if (items.length) {
    notes.append(...items.map(createNote));
    return;
  }

  const empty = document.createElement("div");
  empty.className = "empty-state";
  const title = document.createElement("strong");
  title.textContent = strings.emptyTitle;
  const description = document.createElement("span");
  description.textContent = strings.emptyDescription;
  empty.append(createIcon("history"), title, description);
  notes.append(empty);
}

const initialViewState = vscode.getState() || {};
content.value = initialViewState.draft || "";
applyComposerHeight(initialViewState.composerHeight);
updateComposer();
content.addEventListener("input", updateComposer);
content.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!content.value.trim()) return;
  composer.requestSubmit();
});

resizeHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  resizeSession = {
    pointerId: event.pointerId,
    startHeight: content.getBoundingClientRect().height,
    startY: event.clientY,
  };
  resizeHandle.setPointerCapture(event.pointerId);
  resizeHandle.classList.add("active");
  document.body.classList.add("resizing-composer");
  event.preventDefault();
});

resizeHandle.addEventListener("pointermove", (event) => {
  if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
  applyComposerHeight(
    resizeSession.startHeight + resizeSession.startY - event.clientY,
  );
});

function finishComposerResize(event) {
  if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
  resizeHandle.classList.remove("active");
  document.body.classList.remove("resizing-composer");
  saveComposerHeight();
  resizeSession = undefined;
}

resizeHandle.addEventListener("pointerup", finishComposerResize);
resizeHandle.addEventListener("pointercancel", finishComposerResize);
resizeHandle.addEventListener("lostpointercapture", finishComposerResize);
resizeHandle.addEventListener("keydown", (event) => {
  const currentHeight = content.getBoundingClientRect().height;
  let nextHeight;

  if (event.key === "ArrowUp") nextHeight = currentHeight + composerResizeStep;
  if (event.key === "ArrowDown") nextHeight = currentHeight - composerResizeStep;
  if (event.key === "Home") nextHeight = composerMinHeight;
  if (event.key === "End") nextHeight = composerMaxHeight;
  if (nextHeight === undefined) return;

  event.preventDefault();
  applyComposerHeight(nextHeight);
  saveComposerHeight();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!content.value.trim()) return;
  vscode.postMessage({ type: "add", content: content.value });
  content.value = "";
  updateComposer();
  content.focus();
});

keybindings.addEventListener("click", () => {
  vscode.postMessage({ type: "openKeybindings" });
});

clear.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    clear.classList.add("confirm");
    clear.title = strings.confirmClear;
    clear.setAttribute("aria-label", strings.confirmClearAll);
    showToast(strings.confirmClearToast);
    window.setTimeout(() => {
      clearArmed = false;
      clear.classList.remove("confirm");
      clear.title = strings.clearAll;
      clear.setAttribute("aria-label", strings.clearAll);
    }, 3000);
    return;
  }
  vscode.postMessage({ type: "clear" });
});

notes.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.copy) {
    vscode.postMessage({ type: "copy", id: button.dataset.copy });
    return;
  }

  if (!button.classList.contains("confirm")) {
    button.classList.add("confirm");
    button.title = strings.confirmDelete;
    button.setAttribute("aria-label", strings.confirmDeleteNote);
    window.setTimeout(() => {
      button.classList.remove("confirm");
      button.title = strings.deleteNote;
      button.setAttribute("aria-label", strings.deleteNote);
    }, 3000);
    return;
  }
  vscode.postMessage({ type: "remove", id: button.dataset.remove });
});

window.addEventListener("message", (event) => {
  if (event.data.type === "notes") render(event.data.notes);
  if (event.data.type === "feedback" && event.data.status === "copied") {
    const button = Array.from(notes.querySelectorAll("[data-copy]")).find(
      (candidate) => candidate.dataset.copy === event.data.id,
    );
    if (button) {
      button.classList.add("copied");
      button.replaceChildren(createIcon("check"), document.createTextNode(strings.copied));
      window.setTimeout(() => {
        button.classList.remove("copied");
        button.replaceChildren(createIcon("copy"), document.createTextNode(strings.copy));
      }, 1500);
    }
  }
  if (event.data.type === "feedback" && event.data.status === "error") {
    showToast(event.data.message);
  }
});

vscode.postMessage({ type: "ready" });
