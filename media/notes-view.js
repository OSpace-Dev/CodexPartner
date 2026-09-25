const vscode = acquireVsCodeApi();
const strings = JSON.parse(document.body.dataset.l10n || "{}");
const locale = document.documentElement.lang || undefined;
const referenceBubbles = window.CodexReferenceBubbles;
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
const referencePicker = document.getElementById("reference-picker");
const referenceResults = document.getElementById("reference-results");
const referenceTooltip = document.getElementById("reference-tooltip");
let clearArmed = false;
let resizeSession;
let toastTimer;
let referenceSearch;
let tooltipBubble;

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

function getActiveReferenceTrigger() {
  const selection = window.getSelection();
  if (
    !selection?.rangeCount
    || !selection.isCollapsed
    || !content.contains(selection.anchorNode)
  ) return null;

  const range = selection.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const prefix = range.startContainer.nodeValue.slice(0, range.startOffset);
  const trigger = referenceBubbles.findReferenceTrigger(prefix);
  if (!trigger) return null;

  return {
    container: range.startContainer,
    offset: trigger.offset,
    query: trigger.query,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  };
}

function getCaretRect() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !content.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getBoundingClientRect();
  if (rect.width || rect.height) return rect;

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  range.insertNode(marker);
  rect = marker.getBoundingClientRect();
  marker.remove();
  selection.removeAllRanges();
  selection.addRange(range);
  return rect;
}

function positionReferencePicker() {
  if (!referenceSearch || referencePicker.hidden) return;
  const rect = referenceSearch.anchorRect || getCaretRect();
  if (!rect) return;

  const viewportPadding = 8;
  const pickerWidth = Math.min(referencePicker.offsetWidth || 320, window.innerWidth - viewportPadding * 2);
  const left = Math.max(
    viewportPadding,
    Math.min(rect.left, window.innerWidth - pickerWidth - viewportPadding),
  );
  const pickerHeight = referencePicker.offsetHeight || 240;
  const top = Math.max(viewportPadding, rect.top - pickerHeight - 6);

  referencePicker.style.left = `${left}px`;
  referencePicker.style.top = `${top}px`;
}

function closeReferencePicker() {
  referenceSearch = undefined;
  referencePicker.hidden = true;
  content.setAttribute("aria-expanded", "false");
  content.removeAttribute("aria-activedescendant");
  referenceResults.replaceChildren();
}

function appendHighlightedText(element, value, indices) {
  const matches = new Set(indices);
  let start = 0;
  while (start < value.length) {
    const highlighted = matches.has(start);
    let end = start;
    while (end < value.length && matches.has(end) === highlighted) {
      end += String.fromCodePoint(value.codePointAt(end)).length;
    }
    const text = value.slice(start, end);
    if (highlighted) {
      const mark = document.createElement("mark");
      mark.textContent = text;
      element.append(mark);
    } else {
      element.append(document.createTextNode(text));
    }
    start = end;
  }
}

function createReferenceSearchOption(result, index) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "reference-option";
  option.id = `reference-option-${index}`;
  if (index === referenceSearch.selectedIndex) option.classList.add("selected");
  option.dataset.index = String(index);
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(index === referenceSearch.selectedIndex));
  option.title = result.referencePath;

  const icon = createIcon(result.kind === "directory" ? "folder" : "file");
  const text = document.createElement("span");
  text.className = "reference-option-text";
  const label = document.createElement("strong");
  const description = document.createElement("span");
  description.className = "reference-option-description";
  const highlights = referenceBubbles.getReferenceSearchHighlights(result, referenceSearch.query);
  appendHighlightedText(label, result.label, highlights.label);
  appendHighlightedText(description, result.description || result.referencePath, highlights.description);
  text.append(label, description);

  const kind = document.createElement("span");
  kind.className = "reference-option-kind";
  kind.textContent = result.kind === "directory"
    ? strings.referenceDirectory
    : strings.referenceFile;
  option.append(icon, text, kind);
  return option;
}

function renderReferencePicker() {
  if (!referenceSearch) return;
  referenceResults.replaceChildren();
  if (referenceSearch.loading) {
    const loading = document.createElement("div");
    loading.className = "reference-picker-status";
    loading.textContent = strings.referenceSearchLoading;
    referenceResults.append(loading);
  } else if (!referenceSearch.results.length) {
    const empty = document.createElement("div");
    empty.className = "reference-picker-status";
    empty.textContent = strings.referenceSearchEmpty;
    referenceResults.append(empty);
  } else {
    referenceResults.append(
      ...referenceSearch.results.map(createReferenceSearchOption),
    );
  }
  referencePicker.hidden = false;
  content.setAttribute("aria-expanded", "true");
  if (referenceSearch.results.length) {
    content.setAttribute("aria-activedescendant", `reference-option-${referenceSearch.selectedIndex}`);
  } else {
    content.removeAttribute("aria-activedescendant");
  }
  positionReferencePicker();
  if (referenceSearch.results.length) {
    referenceResults.querySelector(".reference-option.selected")?.scrollIntoView({ block: "nearest" });
  }
}

function updateReferenceSearch() {
  const trigger = getActiveReferenceTrigger();
  if (!trigger) {
    closeReferencePicker();
    return;
  }

  const sameTrigger = referenceSearch
    && referenceSearch.container === trigger.container
    && referenceSearch.offset === trigger.offset;
  if (sameTrigger && referenceSearch.query === trigger.query) {
    positionReferencePicker();
    return;
  }

  referenceSearch = {
    ...trigger,
    anchorRect: sameTrigger ? referenceSearch.anchorRect : getCaretRect(),
    loading: true,
    results: [],
    selectedIndex: 0,
  };
  renderReferencePicker();
  vscode.postMessage({ type: "searchReferences", query: trigger.query });
}

function removeReferenceTrigger() {
  if (!referenceSearch) return false;
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  try {
    range.setStart(referenceSearch.container, referenceSearch.offset);
    range.setEnd(referenceSearch.endContainer, referenceSearch.endOffset);
  } catch {
    return false;
  }
  content.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  range.deleteContents();
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function selectReferenceResult(result) {
  if (!removeReferenceTrigger()) return closeReferencePicker();
  insertRichText(result.reference);
  vscode.postMessage({ type: "referenceUsed", key: result.key });
  closeReferencePicker();
  updateComposer();
}

function handleReferenceSearchKeydown(event) {
  if (event.key === "Escape" && referenceSearch) {
    event.preventDefault();
    closeReferencePicker();
    return true;
  }
  if (!referenceSearch || referencePicker.hidden) return false;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const count = referenceSearch.results.length;
    if (count) {
      referenceSearch.selectedIndex = (referenceSearch.selectedIndex + delta + count) % count;
      renderReferencePicker();
    }
    return true;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const result = referenceSearch.results[referenceSearch.selectedIndex];
    if (result) selectReferenceResult(result);
    return true;
  }
  return false;
}

function readRichText(root) {
  const readChildren = (parent) => Array.from(parent.childNodes).reduce(
    (value, node, index, nodes) => {
      if (node.nodeType === Node.TEXT_NODE) return value + node.nodeValue;
      if (node.nodeType !== Node.ELEMENT_NODE) return value;
      if (node.dataset.reference) return value + node.dataset.reference;
      if (node.tagName === "BR") return value + "\n";

      const isBlock = node.tagName === "DIV" || node.tagName === "P";
      const prefix = isBlock && value && !value.endsWith("\n") ? "\n" : "";
      const next = value + prefix + readChildren(node);
      if (isBlock && index < nodes.length - 1 && !next.endsWith("\n")) {
        return `${next}\n`;
      }
      return next;
    },
    "",
  );

  return readChildren(root);
}

function appendPlainText(fragment, value) {
  const lines = String(value).split("\n");
  lines.forEach((line, index) => {
    if (line) fragment.append(document.createTextNode(line));
    if (index < lines.length - 1) fragment.append(document.createElement("br"));
  });
}

function getReferenceSummary(segment) {
  const kind = segment.kind === "directory"
    ? strings.referenceDirectory
    : strings.referenceFile;
  const path = referenceBubbles.compactPath(segment.path);
  if (!segment.lineLabel) return `${kind} · ${path}`;
  const lineMessage = segment.hasLineRange ? strings.referenceLines : strings.referenceLine;
  return `${kind} · ${path} · ${formatMessage(lineMessage, segment.lineLabel)}`;
}

function createReferenceBubble(segment, editable) {
  const bubble = document.createElement("span");
  bubble.className = "reference-bubble";
  if (editable) bubble.classList.add("reference-bubble-editable");
  bubble.dataset.reference = segment.raw;
  bubble.setAttribute("aria-label", segment.raw);
  bubble.setAttribute("contenteditable", "false");
  bubble.tabIndex = 0;

  const icon = createIcon(segment.kind === "directory" ? "folder" : "file");
  const label = document.createElement("span");
  label.className = "reference-bubble-label";
  label.textContent = getReferenceSummary(segment);
  bubble.append(icon, label);
  if (editable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "reference-bubble-remove";
    remove.setAttribute("aria-label", strings.removeReference);
    remove.append(createIcon("close"));
    bubble.append(remove);
  }
  return bubble;
}

function createRichTextFragment(value, editable = false) {
  const fragment = document.createDocumentFragment();
  referenceBubbles.parseReferenceSegments(value).forEach((segment) => {
    if (segment.type === "reference") fragment.append(createReferenceBubble(segment, editable));
    else appendPlainText(fragment, segment.value);
  });
  return fragment;
}

function replaceRichText(root, value) {
  root.replaceChildren(createRichTextFragment(value, root === content));
}

function getSelectedRichText() {
  const selection = window.getSelection();
  if (
    !selection?.rangeCount
    || !content.contains(selection.anchorNode)
    || !content.contains(selection.focusNode)
  ) return "";
  const holder = document.createElement("div");
  holder.append(selection.getRangeAt(0).cloneContents());
  return readRichText(holder);
}

function insertRichText(value) {
  content.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = selection.rangeCount && content.contains(selection.anchorNode)
    ? selection.getRangeAt(0)
    : document.createRange();
  if (!selection.rangeCount || !content.contains(selection.anchorNode)) {
    range.selectNodeContents(content);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(createRichTextFragment(value, true));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function positionReferenceTooltip() {
  if (!tooltipBubble || !tooltipBubble.isConnected) return hideReferenceTooltip();
  const rect = tooltipBubble.getBoundingClientRect();
  const scrollArea = content.contains(tooltipBubble)
    ? content
    : tooltipBubble.closest(".note-content") || notes;
  const areaRect = scrollArea.getBoundingClientRect();
  if (rect.bottom <= areaRect.top || rect.top >= areaRect.bottom) {
    hideReferenceTooltip();
    return;
  }
  const padding = 8;
  const width = Math.min(referenceTooltip.offsetWidth, window.innerWidth - padding * 2);
  const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding));
  const top = Math.max(padding, rect.top - referenceTooltip.offsetHeight - 9);
  referenceTooltip.style.left = `${left}px`;
  referenceTooltip.style.top = `${top}px`;
  const arrowLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - left, width - 12));
  referenceTooltip.style.setProperty("--tooltip-arrow-left", `${arrowLeft}px`);
}

function showReferenceTooltip(bubble) {
  if (tooltipBubble && tooltipBubble !== bubble) tooltipBubble.removeAttribute("aria-describedby");
  tooltipBubble = bubble;
  referenceTooltip.textContent = bubble.dataset.reference;
  referenceTooltip.hidden = false;
  bubble.setAttribute("aria-describedby", "reference-tooltip");
  positionReferenceTooltip();
}

function hideReferenceTooltip() {
  tooltipBubble?.removeAttribute("aria-describedby");
  tooltipBubble = undefined;
  referenceTooltip.hidden = true;
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
  const value = readRichText(content);
  save.disabled = !value.trim();
  updateViewState({ draft: value });
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
  noteContent.append(createRichTextFragment(note.content));

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
replaceRichText(content, initialViewState.draft || "");
applyComposerHeight(initialViewState.composerHeight);
updateComposer();
content.addEventListener("input", () => {
  updateComposer();
  updateReferenceSearch();
});
content.addEventListener("paste", (event) => {
  const pastedText = event.clipboardData?.getData("text/plain");
  if (typeof pastedText !== "string") return;
  event.preventDefault();
  insertRichText(pastedText);
  updateComposer();
  updateReferenceSearch();
});
content.addEventListener("copy", (event) => {
  const selectedText = getSelectedRichText();
  if (!selectedText || !event.clipboardData) return;
  event.preventDefault();
  event.clipboardData.setData("text/plain", selectedText);
});
content.addEventListener("keydown", (event) => {
  if (event.target !== content) return;
  if (handleReferenceSearchKeydown(event)) return;
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!readRichText(content).trim()) return;
  composer.requestSubmit();
});
content.addEventListener("mouseup", updateReferenceSearch);
content.addEventListener("keyup", (event) => {
  if (event.key !== "Escape") updateReferenceSearch();
});
content.addEventListener("scroll", positionReferencePicker);
content.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".reference-bubble-remove")) event.preventDefault();
});
content.addEventListener("click", (event) => {
  const remove = event.target.closest(".reference-bubble-remove");
  const bubble = remove?.closest(".reference-bubble");
  if (!bubble) return;
  event.preventDefault();
  const range = document.createRange();
  range.setStartBefore(bubble);
  range.collapse(true);
  hideReferenceTooltip();
  bubble.remove();
  content.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  updateComposer();
  updateReferenceSearch();
});

document.addEventListener("pointerover", (event) => {
  const bubble = event.target.closest?.(".reference-bubble");
  if (bubble && bubble !== tooltipBubble) showReferenceTooltip(bubble);
});
document.addEventListener("pointerout", (event) => {
  const bubble = event.target.closest?.(".reference-bubble");
  if (bubble === tooltipBubble && !bubble.contains(event.relatedTarget)
    && !bubble.contains(document.activeElement)) hideReferenceTooltip();
});
document.addEventListener("focusin", (event) => {
  const bubble = event.target.closest?.(".reference-bubble");
  if (bubble) showReferenceTooltip(bubble);
});
document.addEventListener("focusout", (event) => {
  const bubble = event.target.closest?.(".reference-bubble");
  if (bubble === tooltipBubble && !bubble.contains(event.relatedTarget)) hideReferenceTooltip();
});
document.addEventListener("scroll", positionReferenceTooltip, true);
window.addEventListener("resize", positionReferenceTooltip);

referencePicker.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".reference-option")) event.preventDefault();
});
referencePicker.addEventListener("click", (event) => {
  const option = event.target.closest(".reference-option");
  if (!option || !referenceSearch) return;
  const result = referenceSearch.results[Number(option.dataset.index)];
  if (result) selectReferenceResult(result);
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
  closeReferencePicker();
  const value = readRichText(content);
  if (!value.trim()) return;
  vscode.postMessage({ type: "add", content: value });
  replaceRichText(content, "");
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
  if (event.data.type === "appendReference" && typeof event.data.reference === "string") {
    const draft = readRichText(content);
    const separator = draft && !/\s$/u.test(draft) ? " " : "";
    replaceRichText(content, draft + separator + event.data.reference);
    updateComposer();
  }
  if (event.data.type === "referencesChanged" && referenceSearch) {
    referenceSearch.loading = true;
    referenceSearch.results = [];
    referenceSearch.selectedIndex = 0;
    renderReferencePicker();
    vscode.postMessage({ type: "searchReferences", query: referenceSearch.query });
  }
  if (event.data.type === "referenceSearchResults" && referenceSearch) {
    if (event.data.query !== referenceSearch.query) return;
    referenceSearch.loading = false;
    referenceSearch.results = Array.isArray(event.data.results) ? event.data.results : [];
    referenceSearch.selectedIndex = 0;
    renderReferencePicker();
  }
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

window.addEventListener("resize", positionReferencePicker);

vscode.postMessage({ type: "ready" });
