const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("default and existing custom selection shortcuts use the draft-aware command", () => {
  const binding = manifest.contributes.keybindings.find(({ key }) => key === "ctrl+alt+c");
  assert.equal(binding.command, "codexPartner.copySelectionReference");
  assert.ok(manifest.contributes.commands.some(({ command }) => command === "codexPartner.copySelectionReference"));
  assert.ok(manifest.contributes.commands.some(({ command }) => command === "codexPartner.addSelectionReference"));
  assert.ok(manifest.contributes.commands.some(({ command }) => command === "codexPartner.copySelectionReferenceOnly"));
  assert.ok(manifest.contributes.menus["editor/context"].some(
    ({ command }) => command === "codexPartner.copySelectionReferenceOnly",
  ));
});

test("selection shortcut appends a reference or falls back to copying it", async () => {
  const uri = { scheme: "file", fsPath: path.join("workspace", "src", "main.js") };
  const selection = {
    start: { line: 4, character: 0 },
    end: { line: 5, character: 2 },
  };
  const copied = [];
  const shown = [];
  const vscode = {
    env: {
      language: "en",
      clipboard: { writeText: async (value) => { copied.push(value); } },
    },
    window: {
      activeTextEditor: { document: { uri }, selection },
      showInformationMessage: (value) => shown.push(value),
      showErrorMessage: (value) => { throw new Error(value); },
    },
    workspace: { getWorkspaceFolder: () => ({ uri: { fsPath: "workspace" } }) },
    l10n: { t: (message, ...args) => args.reduce(
      (value, arg, index) => value.replace(`{${index}}`, arg), message,
    ) },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  let addSelectionReference;
  try {
    ({ addSelectionReference } = require("../extension"));
  } finally {
    Module._load = originalLoad;
  }

  const received = [];
  const provider = { appendReferenceToDraft: async (value) => {
    received.push(value);
    return true;
  } };
  await addSelectionReference(provider);
  assert.deepEqual(received, ["【File `src/main.js`, lines 5-6】"]);
  assert.deepEqual(copied, []);
  assert.deepEqual(shown, []);

  provider.appendReferenceToDraft = async () => false;
  await addSelectionReference(provider);
  assert.deepEqual(copied, received);
  assert.equal(shown.length, 1);
});

test("legacy and new shortcut commands append, while menu and Code Action copy", async () => {
  const uri = { scheme: "file", fsPath: path.join("workspace", "src", "main.js") };
  const selection = {
    start: { line: 4, character: 0 },
    end: { line: 5, character: 2 },
  };
  const commands = new Map();
  const posted = [];
  const copied = [];
  let notesProvider;
  let codeActionProvider;
  const disposable = () => ({ dispose() {} });
  const vscode = {
    env: {
      language: "en",
      clipboard: { writeText: async (value) => { copied.push(value); } },
    },
    window: {
      activeTextEditor: { document: { uri }, selection },
      registerWebviewViewProvider: (_id, provider) => { notesProvider = provider; return disposable(); },
      showInformationMessage: () => {},
      showErrorMessage: (message) => { throw new Error(message); },
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: { fsPath: "workspace" } }),
      openTextDocument: async (documentUri) => ({ uri: documentUri }),
      createFileSystemWatcher: () => ({
        ...disposable(),
        onDidCreate: disposable,
        onDidDelete: disposable,
      }),
      onDidCreateFiles: disposable,
      onDidDeleteFiles: disposable,
      onDidRenameFiles: disposable,
      onDidChangeWorkspaceFolders: disposable,
    },
    commands: {
      registerCommand: (id, handler) => { commands.set(id, handler); return disposable(); },
    },
    languages: {
      registerCodeActionsProvider: (_selector, provider) => {
        codeActionProvider = provider;
        return disposable();
      },
    },
    CodeActionKind: { QuickFix: "quickfix" },
    CodeAction: class {
      constructor(title, kind) { this.title = title; this.kind = kind; }
    },
    l10n: { t: (message, ...args) => args.reduce(
      (value, arg, index) => value.replace(`{${index}}`, arg), message,
    ) },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  let activate;
  try {
    delete require.cache[require.resolve("../extension")];
    ({ activate } = require("../extension"));
  } finally {
    Module._load = originalLoad;
  }
  activate({ subscriptions: [], workspaceState: { get: () => [] } });
  notesProvider.webviewReady = true;
  notesProvider.view = {
    visible: true,
    webview: { postMessage: async (message) => { posted.push(message); return true; } },
  };

  await commands.get("codexPartner.copySelectionReference")();
  await commands.get("codexPartner.addSelectionReference")();
  assert.deepEqual(posted, [
    { type: "appendReference", reference: "【File `src/main.js`, lines 5-6】" },
    { type: "appendReference", reference: "【File `src/main.js`, lines 5-6】" },
  ]);
  assert.deepEqual(copied, []);

  const action = codeActionProvider.provideCodeActions({ uri }, selection)[0];
  assert.equal(action.command.command, "codexPartner.copySelectionReferenceOnly");
  await commands.get(action.command.command)(...action.command.arguments);
  assert.deepEqual(copied, ["【File `src/main.js`, lines 5-6】"]);

  notesProvider.view.visible = false;
  await commands.get("codexPartner.copySelectionReference")();
  assert.equal(copied.length, 2);
  assert.equal(posted.length, 2);
  notesProvider.dispose();
});
