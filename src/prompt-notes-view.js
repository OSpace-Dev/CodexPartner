const { addNote, normalizeNotes, removeNote } = require("./notes-state");
const {
  formatDirectoryReference,
  formatFileReference,
} = require("./reference-format");
const { getReferenceLocale } = require("./localization");
const {
  filterReferenceEntries,
  updateRecentReferenceKeys,
} = require("./reference-search");
const { loadReferenceSearchEntries } = require("./reference-search-host");

const notesViewContainerId = "codexPartner";
const notesViewId = "codexPartner.notesView";
const notesStateKey = "codexPartner.promptNotes";
const recentReferencesStateKey = "codexPartner.recentReferences";
const recentReferencesLimit = 10;
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
  referenceFile: "File",
  referenceDirectory: "Directory",
  referenceLine: "line {0}",
  referenceLines: "lines {0}",
  removeReference: "Remove reference",
  searchPlaceholder: "Search workspace files or directories",
  referenceSearchLoading: "Searching workspace...",
  referenceSearchEmpty: "No matching files or directories",
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
      ["recordCount", "referenceLine", "referenceLines"].includes(key)
        ? translate(message, "{0}")
        : translate(message),
    ]),
  );
}

class PromptNotesViewProvider {
  constructor(context, vscode) {
    this.context = context;
    this.vscode = vscode;
    this.view = null;
    this.referenceEntriesPromise = null;
    this.referenceIndexVersion = 0;
    this.createdDirectoryUris = new Map();
    this.referenceRefreshTimer = null;
    this.strings = createNotesViewStrings((...args) => vscode.l10n.t(...args));
  }

  getReferenceSearchEntries() {
    if (!this.referenceEntriesPromise) {
      this.referenceEntriesPromise = loadReferenceSearchEntries(
        this.vscode,
        this.context.workspaceState.get(recentReferencesStateKey, []),
        Array.from(this.createdDirectoryUris.values()),
      );
    }
    return this.referenceEntriesPromise;
  }

  refreshReferenceSearch() {
    this.referenceEntriesPromise = null;
    this.referenceIndexVersion += 1;
    clearTimeout(this.referenceRefreshTimer);
    this.referenceRefreshTimer = setTimeout(() => {
      this.referenceRefreshTimer = null;
      this.post({ type: "referencesChanged" });
    }, 150);
  }

  async handleReferenceCreated(uri) {
    try {
      const stat = await this.vscode.workspace.fs.stat(uri);
      if (stat.type & this.vscode.FileType.Directory) {
        this.createdDirectoryUris.set(uri.toString(), uri);
      }
    } catch {
      // The resource may already have been moved or deleted; the index still needs refreshing.
    } finally {
      this.refreshReferenceSearch();
    }
  }

  handleReferenceDeleted(uri) {
    this.createdDirectoryUris.delete(uri.toString());
    this.refreshReferenceSearch();
  }

  dispose() {
    clearTimeout(this.referenceRefreshTimer);
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
        referenceScriptUri: view.webview.asWebviewUri(
          this.vscode.Uri.joinPath(mediaRoot, "reference-bubbles.js"),
        ),
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
    if (message?.type === "searchReferences") {
      const indexVersion = this.referenceIndexVersion;
      const entries = await this.getReferenceSearchEntries();
      if (indexVersion !== this.referenceIndexVersion) return;
      const results = filterReferenceEntries(entries, message.query).map((entry) => ({
        key: entry.key,
        kind: entry.kind,
        label: entry.label,
        description: entry.description,
        referencePath: entry.referencePath,
        reference: entry.kind === "directory"
          ? formatDirectoryReference(
            entry.referencePath,
            getReferenceLocale(this.vscode.env.language),
          )
          : formatFileReference(
            entry.referencePath,
            getReferenceLocale(this.vscode.env.language),
          ),
      })).filter((entry) => entry.reference);
      return this.post({
        type: "referenceSearchResults",
        query: typeof message.query === "string" ? message.query : "",
        results,
      });
    }
    if (message?.type === "referenceUsed") {
      const nextRecentKeys = updateRecentReferenceKeys(
        this.context.workspaceState.get(recentReferencesStateKey, []),
        message.key,
        recentReferencesLimit,
      );
      await this.context.workspaceState.update(recentReferencesStateKey, nextRecentKeys);
      return;
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
  const referenceScriptUri = options.referenceScriptUri ?? "";
  const referenceScript = referenceScriptUri
    ? `<script nonce="${nonce}" src="${escapeHtml(referenceScriptUri)}"></script>`
    : "";
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><link rel="stylesheet" href="${escapeHtml(cssUri)}"></head><body data-l10n="${encodedStrings}">
  <svg class="svg-sprite" aria-hidden="true"><symbol id="icon-notebook" viewBox="0 0 24 24"><path d="M2 6h4M2 10h4M2 14h4M2 18h4"></path><rect width="16" height="20" x="4" y="2" rx="2"></rect><path d="M16 2v20"></path></symbol><symbol id="icon-keyboard" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"></path></symbol><symbol id="icon-save" viewBox="0 0 24 24"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path></symbol><symbol id="icon-copy" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></symbol><symbol id="icon-check" viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></symbol><symbol id="icon-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"></path></symbol><symbol id="icon-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></symbol></svg>
  <svg class="svg-sprite" aria-hidden="true"><symbol id="icon-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5M9 13h6M9 17h6"></path></symbol><symbol id="icon-folder" viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"></path></symbol><symbol id="icon-close" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"></path></symbol></svg>
  <main class="app-shell">
    <header class="page-header"><div class="title-group"><span class="title-icon" aria-hidden="true"><svg class="icon"><use href="#icon-notebook"></use></svg></span><div><h1>${escapeHtml(strings.title)}</h1><span id="total" class="total">${escapeHtml(initialTotal)}</span></div></div><div class="header-actions"><button id="keybindings" class="icon-button" type="button" aria-label="${escapeHtml(strings.openKeybindings)}" title="${escapeHtml(strings.openKeybindings)}"><svg class="icon"><use href="#icon-keyboard"></use></svg></button><button id="clear" class="icon-button danger" type="button" aria-label="${escapeHtml(strings.clearAll)}" title="${escapeHtml(strings.clearAll)}" disabled><svg class="icon"><use href="#icon-trash"></use></svg></button></div></header>
    <section class="history-panel" aria-label="${escapeHtml(strings.savedNotes)}"><div class="section-heading"><span>${escapeHtml(strings.history)}</span><span class="section-rule"></span></div><div id="notes" class="notes" aria-live="polite"></div></section>
    <form id="composer" class="composer"><label id="content-label" class="visually-hidden" for="content">${escapeHtml(strings.contentLabel)}</label><div class="input-shell"><div id="resize-handle" class="resize-handle" role="separator" aria-orientation="horizontal" aria-label="${escapeHtml(strings.resizeInput)}" title="${escapeHtml(strings.resizeInput)}" aria-controls="content" aria-valuemin="82" aria-valuemax="180" aria-valuenow="82" tabindex="0"></div><div id="content" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="content-label" aria-controls="reference-results" aria-haspopup="listbox" aria-expanded="false" data-placeholder="${escapeHtml(strings.placeholder)}" spellcheck="true" aria-describedby="composer-hint"></div><button id="save" class="send-button" type="submit" aria-label="${escapeHtml(strings.save)}" title="${escapeHtml(strings.save)}" disabled><svg class="icon"><use href="#icon-save"></use></svg></button></div><div id="composer-hint" class="compose-hint">${escapeHtml(strings.composerHint)}</div></form>
    <div id="reference-picker" class="reference-picker" hidden><div id="reference-results" class="reference-results" role="listbox" aria-label="${escapeHtml(strings.searchPlaceholder)}"></div></div>
    <div id="reference-tooltip" class="reference-tooltip" role="tooltip" hidden></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </main>
  ${referenceScript}<script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
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
