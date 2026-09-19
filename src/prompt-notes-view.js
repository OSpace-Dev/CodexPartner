const { addNote, normalizeNotes, removeNote } = require("./notes-state");

const notesViewContainerId = "codexPartner";
const notesViewId = "codexPartner.notesView";
const notesStateKey = "codexPartner.promptNotes";
const openKeybindingsCommand = "codexPartner.openKeybindings";
const notesViewMessages = Object.freeze({
  title: "Prompt notes",
  recordCount: "{0} records",
  openKeybindings: "Open Codex Partner keyboard shortcuts",
  clearAll: "Clear all notes",
  savedNotes: "Saved notes",
  history: "History",
  contentLabel: "Content to save",
  resizeInput: "Resize input area",
  placeholder: "Enter content to save for Codex...",
  save: "Save note",
  composerHint: "Enter to save · Shift+Enter for a new line",
  copyNote: "Copy this note",
  copy: "Copy",
  deleteNote: "Delete this note",
  emptyTitle: "No notes yet",
  emptyDescription: "Saved notes will appear here",
  confirmClear: "Click again to confirm clearing",
  confirmClearAll: "Click again to clear all notes",
  confirmClearToast: "Click the trash button again to clear all notes",
  confirmDelete: "Click again to confirm deletion",
  confirmDeleteNote: "Click again to delete this note",
  copied: "Copied",
  operationFailed: "Unable to update prompt notes. Please try again.",
});

function createNotesViewStrings(translate = (message) => message) {
  return Object.fromEntries(
    Object.entries(notesViewMessages).map(([key, message]) => [
      key,
      key === "recordCount" ? translate(message, "{0}") : translate(message),
    ]),
  );
}

class PromptNotesViewProvider {
  constructor(context, vscode) {
    this.context = context;
    this.vscode = vscode;
    this.view = null;
    this.strings = createNotesViewStrings((...args) => vscode.l10n.t(...args));
  }

  resolveWebviewView(view) {
    this.view = view;
    const mediaRoot = this.vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
    );
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };
    view.webview.html = renderHtml(
      view.webview,
      view.webview.asWebviewUri(
        this.vscode.Uri.joinPath(mediaRoot, "notes-view.css"),
      ),
      view.webview.asWebviewUri(
        this.vscode.Uri.joinPath(mediaRoot, "notes-view.js"),
      ),
      {
        locale: this.vscode.env.language,
        strings: this.strings,
      },
    );
    view.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message).catch(() => {
        this.post({
          type: "feedback",
          status: "error",
          message: this.strings.operationFailed,
        });
      });
    });
  }

  async handleMessage(message) {
    const notes = normalizeNotes(
      this.context.workspaceState.get(notesStateKey, []),
    );
    if (message?.type === "ready") return this.post({ type: "notes", notes });
    if (message?.type === "openKeybindings") {
      return this.vscode.commands.executeCommand(openKeybindingsCommand);
    }
    if (message?.type === "add") {
      const next = addNote(notes, message.content);
      if (
        next.length === notes.length &&
        next[0]?.content === notes[0]?.content
      )
        return;
      await this.context.workspaceState.update(notesStateKey, next);
      return this.post({ type: "notes", notes: next });
    }
    if (message?.type === "remove") {
      const next = removeNote(notes, message.id);
      await this.context.workspaceState.update(notesStateKey, next);
      return this.post({ type: "notes", notes: next });
    }
    if (message?.type === "clear") {
      await this.context.workspaceState.update(notesStateKey, []);
      return this.post({ type: "notes", notes: [] });
    }
    if (message?.type === "copy") {
      const note = notes.find((item) => item.id === message.id);
      if (note) {
        await this.vscode.env.clipboard.writeText(note.content);
        this.post({ type: "feedback", status: "copied", id: note.id });
      }
    }
  }

  post(message) {
    this.view?.webview.postMessage(message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatMessage(message, ...values) {
  return message.replace(/\{(\d+)\}/g, (placeholder, index) => (
    Number(index) < values.length ? String(values[Number(index)]) : placeholder
  ));
}

function renderHtml(webview, cssUri, scriptUri, options = {}) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'`;
  const strings = options.strings ?? createNotesViewStrings();
  const locale = options.locale ?? "en";
  const initialTotal = formatMessage(strings.recordCount, 0);
  const encodedStrings = escapeHtml(JSON.stringify(strings));
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><link rel="stylesheet" href="${escapeHtml(cssUri)}"></head><body data-l10n="${encodedStrings}">
  <svg class="svg-sprite" aria-hidden="true"><symbol id="icon-notebook" viewBox="0 0 24 24"><path d="M2 6h4M2 10h4M2 14h4M2 18h4"></path><rect width="16" height="20" x="4" y="2" rx="2"></rect><path d="M16 2v20"></path></symbol><symbol id="icon-keyboard" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"></path></symbol><symbol id="icon-save" viewBox="0 0 24 24"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path></symbol><symbol id="icon-copy" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></symbol><symbol id="icon-check" viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></symbol><symbol id="icon-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"></path></symbol><symbol id="icon-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></symbol></svg>
  <main class="app-shell">
    <header class="page-header"><div class="title-group"><span class="title-icon" aria-hidden="true"><svg class="icon"><use href="#icon-notebook"></use></svg></span><div><h1>${escapeHtml(strings.title)}</h1><span id="total" class="total">${escapeHtml(initialTotal)}</span></div></div><div class="header-actions"><button id="keybindings" class="icon-button" type="button" aria-label="${escapeHtml(strings.openKeybindings)}" title="${escapeHtml(strings.openKeybindings)}"><svg class="icon"><use href="#icon-keyboard"></use></svg></button><button id="clear" class="icon-button danger" type="button" aria-label="${escapeHtml(strings.clearAll)}" title="${escapeHtml(strings.clearAll)}" disabled><svg class="icon"><use href="#icon-trash"></use></svg></button></div></header>
    <section class="history-panel" aria-label="${escapeHtml(strings.savedNotes)}"><div class="section-heading"><span>${escapeHtml(strings.history)}</span><span class="section-rule"></span></div><div id="notes" class="notes" aria-live="polite"></div></section>
    <form id="composer" class="composer"><label class="visually-hidden" for="content">${escapeHtml(strings.contentLabel)}</label><div class="input-shell"><div id="resize-handle" class="resize-handle" role="separator" aria-orientation="horizontal" aria-label="${escapeHtml(strings.resizeInput)}" title="${escapeHtml(strings.resizeInput)}" aria-controls="content" aria-valuemin="82" aria-valuemax="180" aria-valuenow="82" tabindex="0"></div><textarea id="content" placeholder="${escapeHtml(strings.placeholder)}" spellcheck="true" aria-describedby="composer-hint"></textarea><button id="save" class="send-button" type="submit" aria-label="${escapeHtml(strings.save)}" title="${escapeHtml(strings.save)}" disabled><svg class="icon"><use href="#icon-save"></use></svg></button></div><div id="composer-hint" class="compose-hint">${escapeHtml(strings.composerHint)}</div></form>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </main>
  <script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
</body></html>`;
}

module.exports = {
  PromptNotesViewProvider,
  createNotesViewStrings,
  notesViewMessages,
  notesViewContainerId,
  notesViewId,
  openKeybindingsCommand,
  renderHtml,
};
