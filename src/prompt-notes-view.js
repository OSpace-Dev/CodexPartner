const { addNote, normalizeNotes, removeNote } = require("./notes-state");

const notesViewId = "codexPartner.notesView";
const notesStateKey = "codexPartner.promptNotes";

class PromptNotesViewProvider {
  constructor(context, vscode) {
    this.context = context;
    this.vscode = vscode;
    this.view = null;
  }

  resolveWebviewView(view) {
    this.view = view;
    const mediaRoot = this.vscode.Uri.joinPath(this.context.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    view.webview.html = renderHtml(
      view.webview,
      view.webview.asWebviewUri(this.vscode.Uri.joinPath(mediaRoot, "notes-view.css")),
      view.webview.asWebviewUri(this.vscode.Uri.joinPath(mediaRoot, "notes-view.js")),
    );
    view.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message).catch(() => {
        this.post({ type: "feedback", status: "error", message: "操作失败，请重试" });
      });
    });
  }

  async handleMessage(message) {
    const notes = normalizeNotes(this.context.workspaceState.get(notesStateKey, []));
    if (message?.type === "ready") return this.post({ type: "notes", notes });
    if (message?.type === "add") {
      const next = addNote(notes, message.content);
      if (next.length === notes.length && next[0]?.content === notes[0]?.content) return;
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

  post(message) { this.view?.webview.postMessage(message); }
}

function renderHtml(webview, cssUri, scriptUri) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><link rel="stylesheet" href="${cssUri}"></head><body>
  <svg class="svg-sprite" aria-hidden="true"><symbol id="icon-notebook" viewBox="0 0 24 24"><path d="M2 6h4M2 10h4M2 14h4M2 18h4"></path><rect width="16" height="20" x="4" y="2" rx="2"></rect><path d="M16 2v20"></path></symbol><symbol id="icon-save" viewBox="0 0 24 24"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path></symbol><symbol id="icon-copy" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></symbol><symbol id="icon-check" viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></symbol><symbol id="icon-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"></path></symbol><symbol id="icon-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></symbol></svg>
  <main class="app-shell">
    <header class="page-header"><div class="title-group"><span class="title-icon" aria-hidden="true"><svg class="icon"><use href="#icon-notebook"></use></svg></span><div><h1>内容记录</h1><span id="total" class="total">0 条记录</span></div></div><button id="clear" class="icon-button danger" type="button" aria-label="清空全部记录" title="清空全部记录" disabled><svg class="icon"><use href="#icon-trash"></use></svg></button></header>
    <section class="history-panel" aria-label="已保存的内容"><div class="section-heading"><span>历史记录</span><span class="section-rule"></span></div><div id="notes" class="notes" aria-live="polite"></div></section>
    <form id="composer" class="composer"><div class="composer-label-row"><label for="content">新内容</label><span id="count" class="character-count">0 / 20000</span></div><div class="input-shell"><textarea id="content" maxlength="20000" placeholder="输入准备发送给 Codex 的内容…" spellcheck="true"></textarea><button id="save" class="send-button" type="submit" aria-label="保存记录" title="保存记录" disabled><svg class="icon"><use href="#icon-save"></use></svg></button></div><div class="compose-hint">Enter 保存 · Shift+Enter 换行</div></form>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
}

module.exports = { PromptNotesViewProvider, notesViewId, renderHtml };
