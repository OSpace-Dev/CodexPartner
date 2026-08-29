const vscode = require("vscode");
const { AppServerClient, resolveCodexExecutable } = require("./src/app-server-client");
const { getSelectionLineRange } = require("./src/editor-reference");
const { createFileRangeContext, normalizeComposerBlocks, serializeComposerBlocks } = require("./src/context-item");

const addSelectionToChatTitle = "添加到 Codex Partner 对话";

function activate(context) {
  const provider = new CodexSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codexPartner.sidebar", provider),
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new SelectionCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.Refactor] },
    ),
    vscode.commands.registerCommand("codexPartner.openSidebar", () => {
      vscode.commands.executeCommand("workbench.view.extension.codexPartner");
    }),
    vscode.commands.registerCommand("codexPartner.refreshThreads", () => provider.refresh()),
    vscode.commands.registerCommand(
      "codexPartner.addSelectionToChat",
      (documentUri, selectionRange) => addSelectionToChat(provider, documentUri, selectionRange),
    ),
    { dispose: () => provider.dispose() },
  );
}

class SelectionCodeActionProvider {
  provideCodeActions(document, range) {
    if (document.uri.scheme === "untitled" || !getSelectionLineRange(range)) return [];

    const action = new vscode.CodeAction(addSelectionToChatTitle, vscode.CodeActionKind.Refactor);
    action.isPreferred = true;
    action.command = {
      command: "codexPartner.addSelectionToChat",
      title: addSelectionToChatTitle,
      arguments: [document.uri, range],
    };
    return [action];
  }
}

class CodexSidebarProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
    this.client = null;
    this.threads = [];
    this.history = [];
    this.selectedThreadId = null;
    this.busy = false;
    this.error = null;
    this.streamingMessage = null;
    this.pendingComposerContexts = [];
    this.composerReady = false;
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  }

  resolveWebviewView(view) {
    this.view = view;
    this.composerReady = false;
    view.webview.options = { enableScripts: true };
    view.webview.html = renderHtml(view.webview, this.context.extensionUri);
    view.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = null;
        this.composerReady = false;
      }
    });
    this.pushState();
    void this.refresh();
  }

  async handleMessage(message) {
    try {
      if (message.type === "refresh") return this.refresh();
      if (message.type === "selectThread") return this.selectThread(message.threadId);
      if (message.type === "newThread") return this.newThread();
      if (message.type === "send") return this.send(message.blocks);
      if (message.type === "webviewReady") {
        this.composerReady = true;
        return this.flushComposerContexts();
      }
    } catch (error) {
      this.setError(error);
    }
  }

  insertComposerContext(contextItem) {
    if (!contextItem) return;
    this.pendingComposerContexts.push(contextItem);
    this.flushComposerContexts();
  }

  flushComposerContexts() {
    if (!this.view || !this.composerReady || this.pendingComposerContexts.length === 0) return;
    const contextItems = this.pendingComposerContexts;
    this.pendingComposerContexts = [];
    void this.view.webview.postMessage({ type: "addComposerContext", contextItems });
  }

  async refresh() {
    this.error = null;
    this.busy = true;
    this.pushState();
    try {
      await this.ensureClient();
      const limit = vscode.workspace.getConfiguration("codexPartner").get("threadLimit", 50);
      const result = await this.client.request("thread/list", {
        limit,
        sortKey: "updated_at",
        sortDirection: "desc",
      });
      this.threads = getThreadList(result).map(normalizeThread).filter(Boolean);
      if (this.selectedThreadId && !this.threads.some((thread) => thread.id === this.selectedThreadId)) {
        this.selectedThreadId = null;
        this.history = [];
      }
      if (!this.selectedThreadId && this.threads[0]) this.selectedThreadId = this.threads[0].id;
      if (this.selectedThreadId) await this.loadThread(this.selectedThreadId);
    } catch (error) {
      this.setError(error);
    } finally {
      this.busy = false;
      this.pushState();
    }
  }

  async selectThread(threadId) {
    if (!threadId) return;
    this.selectedThreadId = threadId;
    this.error = null;
    this.busy = true;
    this.pushState();
    try {
      await this.ensureClient();
      await this.loadThread(threadId);
    } catch (error) {
      this.setError(error);
    } finally {
      this.busy = false;
      this.pushState();
    }
  }

  async loadThread(threadId) {
    const result = await this.client.request("thread/read", { threadId, includeTurns: true });
    this.history = normalizeHistory(result?.thread ?? result);
  }

  async newThread() {
    this.error = null;
    this.busy = true;
    this.pushState();
    try {
      await this.ensureClient();
      const result = await this.client.request("thread/start", {
        cwd: this.workspaceRoot,
        ephemeral: false,
      });
      const thread = normalizeThread(result?.thread ?? result);
      if (!thread) throw new Error("Codex thread/start returned no thread id.");
      this.selectedThreadId = thread.id;
      this.threads = [thread, ...this.threads.filter((item) => item.id !== thread.id)];
      this.history = [];
    } catch (error) {
      this.setError(error);
    } finally {
      this.busy = false;
      this.pushState();
    }
  }

  async send(blocks) {
    const normalizedBlocks = normalizeComposerBlocks(blocks);
    if (!normalizedBlocks) throw new Error("One or more composer blocks are invalid.");
    const serialized = serializeComposerBlocks(normalizedBlocks);
    const hasMeaningfulContent = normalizedBlocks.some((block) => (
      block.type === "context" || block.value.trim()
    ));
    if (!hasMeaningfulContent || this.busy) return;
    this.error = null;
    this.busy = true;
    this.streamingMessage = null;
    this.pushState();
    try {
      await this.ensureClient();
      if (!this.selectedThreadId) await this.newThread();
      if (!this.selectedThreadId) throw new Error("No Codex thread is selected.");
      this.history = [...this.history, { role: "user", blocks: normalizedBlocks, text: serialized }];
      this.pushState();
      await this.client.request("turn/start", {
        threadId: this.selectedThreadId,
        input: [{ type: "text", text: serialized }],
      });
      this.view?.webview.postMessage({ type: "clearComposer" });
    } catch (error) {
      this.setError(error);
      this.busy = false;
      this.pushState();
    }
  }
  async ensureClient() {
    if (this.client) return;
    const config = vscode.workspace.getConfiguration("codexPartner");
    const command = resolveCodexExecutable(vscode, config);
    this.client = new AppServerClient({
      command,
      cwd: this.workspaceRoot,
      log: (line) => console.debug(`[Codex Partner] ${line}`),
    });
    this.client.on("item/agentMessage/delta", (params) => this.handleDelta(params));
    this.client.on("turn/completed", () => {
      this.busy = false;
      this.streamingMessage = null;
      this.pushState();
      void this.refreshThreadList().catch((error) => this.setError(error));
    });
    this.client.on("error", (error) => this.setError(error));
    this.client.on("protocolError", (error) => this.setError(error));
    this.client.on("exit", () => {
      this.busy = false;
      this.streamingMessage = null;
      this.client = null;
      this.pushState();
    });
    try {
      await this.client.start();
    } catch (error) {
      this.client = null;
      throw error;
    }
  }

  handleDelta(params) {
    if (params.threadId !== this.selectedThreadId) return;
    if (!this.streamingMessage || this.streamingMessage.id !== params.itemId) {
      this.streamingMessage = { id: params.itemId, role: "assistant", text: "" };
      this.history = [...this.history, this.streamingMessage];
    }
    this.streamingMessage.text += params.delta ?? "";
    this.pushState();
  }

  async refreshThreadList() {
    if (!this.client) return;
    const limit = vscode.workspace.getConfiguration("codexPartner").get("threadLimit", 50);
    const client = this.client;
    const result = await client.request("thread/list", {
      limit,
      sortKey: "updated_at",
      sortDirection: "desc",
    });
    if (this.client !== client) return;
    this.threads = getThreadList(result).map(normalizeThread).filter(Boolean);
    this.pushState();
  }

  setError(error) {
    this.error = error instanceof Error ? error.message : String(error);
    this.pushState();
  }

  pushState() {
    this.view?.webview.postMessage({
      type: "state",
      state: {
        threads: this.threads,
        history: this.history,
        selectedThreadId: this.selectedThreadId,
        busy: this.busy,
        error: this.error,
      },
    });
  }

  async dispose() {
    await this.client?.stop();
    this.client = null;
  }
}

function getThreadList(result) {
  if (Array.isArray(result)) return result;
  return result?.data ?? result?.threads ?? [];
}

function createContextItemFromDocumentRange(document, range) {
  const lineRange = getSelectionLineRange(range);
  if (!document || document.uri.scheme === "untitled" || !lineRange) return null;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return createFileRangeContext({
    filePath: document.uri.fsPath,
    workspaceRoot: workspaceFolder?.uri.fsPath,
    preview: document.getText(range),
    ...lineRange,
  });
}

async function addSelectionToChat(provider, documentUri, selectionRange) {
  try {
    const editor = vscode.window.activeTextEditor;
    const document = documentUri
      ? await vscode.workspace.openTextDocument(documentUri)
      : editor?.document;
    const range = selectionRange ?? editor?.selection;
    const reference = createContextItemFromDocumentRange(document, range);
    if (!reference) {
      vscode.window.showWarningMessage("请先在文件编辑器中选择一段内容。");
      return;
    }
    provider.insertComposerContext(reference);
    await vscode.commands.executeCommand("workbench.view.extension.codexPartner");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`无法添加选区到 Codex Partner 对话：${message}`);
  }
}

function normalizeThread(thread) {
  const id = thread?.id ?? thread?.threadId;
  if (!id) return null;
  return {
    id,
    title: thread.name ?? thread.title ?? "Untitled thread",
    updatedAt: thread.updatedAt ?? thread.updated_at ?? null,
  };
}

function normalizeHistory(thread) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  return turns.flatMap((turn) => (turn.items ?? []).flatMap((item) => {
    if (item.type === "userMessage") {
      const text = (item.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
      return text ? [{ id: item.id, role: "user", text }] : [];
    }
    if (item.type === "agentMessage") return [{ id: item.id, role: "assistant", text: item.text ?? "" }];
    return [];
  }));
}

function renderHtml(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "sidebar.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "sidebar.css"));
  const nonce = createNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">LOCAL APP SERVER</p>
      <h1>Codex Partner</h1>
    </div>
    <button id="refresh" class="icon-button" type="button" title="Refresh threads" aria-label="Refresh threads">&#8635;</button>
  </header>
  <section class="thread-picker" aria-label="Thread controls">
    <label for="threads">Conversation</label>
    <div class="picker-row">
      <select id="threads" aria-label="Select conversation"></select>
      <button id="new-thread" class="new-button" type="button" title="Start a new thread">+</button>
    </div>
  </section>
  <main id="messages" class="messages" aria-live="polite"></main>
  <p id="error" class="error" role="alert" hidden></p>
  <form id="composer" class="composer">
    <label class="sr-only" for="prompt">Message Codex</label>
    <div id="prompt" class="prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message Codex" data-placeholder="Message Codex..."></div>
    <div class="composer-footer">
      <span id="status" class="status">Ready</span>
      <button id="send" class="send-button" type="submit">Send <span aria-hidden="true">&#8594;</span></button>
    </div>
  </form>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

module.exports = { activate };
