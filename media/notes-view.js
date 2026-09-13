const vscode = acquireVsCodeApi();
const composer = document.getElementById("composer");
const content = document.getElementById("content");
const count = document.getElementById("count");
const save = document.getElementById("save");
const clear = document.getElementById("clear");
const total = document.getElementById("total");
const notes = document.getElementById("notes");
const toast = document.getElementById("toast");
let clearArmed = false;
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
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function updateComposer() {
  const length = content.value.length;
  count.textContent = `${length} / 20000`;
  save.disabled = !content.value.trim();
  vscode.setState({ draft: content.value });
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
  copy.title = "复制这条内容";
  copy.append(createIcon("copy"), document.createTextNode("复制"));

  const remove = document.createElement("button");
  remove.className = "icon-button danger";
  remove.type = "button";
  remove.dataset.remove = note.id;
  remove.title = "删除这条记录";
  remove.setAttribute("aria-label", "删除这条记录");
  remove.append(createIcon("trash"));

  actions.append(copy, remove);
  footer.append(time, actions);
  article.append(noteContent, footer);
  return article;
}

function render(items) {
  total.textContent = `${items.length} 条记录`;
  clear.disabled = items.length === 0;
  clearArmed = false;
  clear.classList.remove("confirm");
  clear.title = "清空全部记录";
  clear.setAttribute("aria-label", "清空全部记录");
  notes.replaceChildren();

  if (items.length) {
    notes.append(...items.map(createNote));
    return;
  }

  const empty = document.createElement("div");
  empty.className = "empty-state";
  const title = document.createElement("strong");
  title.textContent = "暂无记录";
  const description = document.createElement("span");
  description.textContent = "保存的内容会显示在这里";
  empty.append(createIcon("history"), title, description);
  notes.append(empty);
}

content.value = vscode.getState()?.draft || "";
updateComposer();
content.addEventListener("input", updateComposer);
content.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!content.value.trim()) return;
  composer.requestSubmit();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!content.value.trim()) return;
  vscode.postMessage({ type: "add", content: content.value });
  content.value = "";
  updateComposer();
  content.focus();
});

clear.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    clear.classList.add("confirm");
    clear.title = "再次点击确认清空";
    clear.setAttribute("aria-label", "再次点击确认清空全部记录");
    showToast("再次点击垃圾桶以清空全部记录");
    window.setTimeout(() => {
      clearArmed = false;
      clear.classList.remove("confirm");
      clear.title = "清空全部记录";
      clear.setAttribute("aria-label", "清空全部记录");
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
    button.title = "再次点击确认删除";
    button.setAttribute("aria-label", "再次点击确认删除这条记录");
    window.setTimeout(() => {
      button.classList.remove("confirm");
      button.title = "删除这条记录";
      button.setAttribute("aria-label", "删除这条记录");
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
      button.replaceChildren(createIcon("check"), document.createTextNode("已复制"));
      window.setTimeout(() => {
        button.classList.remove("copied");
        button.replaceChildren(createIcon("copy"), document.createTextNode("复制"));
      }, 1500);
    }
  }
  if (event.data.type === "feedback" && event.data.status === "error") {
    showToast(event.data.message);
  }
});

vscode.postMessage({ type: "ready" });
