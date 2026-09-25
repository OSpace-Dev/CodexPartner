const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PromptNotesViewProvider,
  createNotesViewStrings,
  notesViewMessages,
  openKeybindingsCommand,
  renderHtml,
} = require("../src/prompt-notes-view");

test("composer is localized, unlimited, and keeps an accessible hidden label", () => {
  const html = renderHtml(
    { cspSource: "test-source" },
    "notes-view.css",
    "notes-view.js",
  );
  const composer = html.match(/<form id="composer"[\s\S]*?<\/form>/)?.[0];

  assert.ok(composer);
  assert.match(composer, /<label id="content-label" class="visually-hidden" for="content">Content to save<\/label>/);
  assert.match(composer, /id="resize-handle" class="resize-handle" role="separator"/);
  assert.match(composer, /aria-orientation="horizontal"[^>]+aria-controls="content"/);
  assert.match(composer, /aria-valuemin="82" aria-valuemax="180" aria-valuenow="82"/);
  assert.match(composer, /<div id="content" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="content-label" aria-controls="reference-results" aria-haspopup="listbox" aria-expanded="false"[^>]+aria-describedby="composer-hint"><\/div>/);
  assert.doesNotMatch(composer, /maxlength=|character-count|id="count"/);
  assert.match(html, /id="keybindings"[\s\S]*?<use href="#icon-keyboard">/);
  assert.match(html, /data-l10n="/);
});

test("composer uses an accessible top-edge resize handle", () => {
  const styles = fs.readFileSync(
    path.join(__dirname, "..", "media", "notes-view.css"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(__dirname, "..", "media", "notes-view.js"),
    "utf8",
  );
  const editorRules = styles.match(/(?:^|\n)\.rich-editor\s*\{([\s\S]*?)\}/)?.[1];
  const resizeHandleRules = styles.match(/\.resize-handle\s*\{([\s\S]*?)\}/)?.[1];

  assert.ok(editorRules);
  assert.match(editorRules, /\bresize:\s*none\s*;/);
  assert.ok(resizeHandleRules);
  assert.match(resizeHandleRules, /\bcursor:\s*ns-resize\s*;/);
  assert.match(script, /resizeHandle\.addEventListener\("pointerdown"/);
  assert.match(script, /resizeSession\.startHeight \+ resizeSession\.startY - event\.clientY/);
  assert.match(script, /event\.key === "ArrowUp"/);
  assert.match(script, /event\.key === "ArrowDown"/);
  assert.match(script, /composerHeight/);
});

test("prompt notes messages are present in English and Chinese bundles", () => {
  const english = require("../l10n/bundle.l10n.json");
  const chinese = require("../l10n/bundle.l10n.zh-cn.json");

  for (const message of Object.values(notesViewMessages)) {
    assert.equal(typeof english[message], "string", `missing English message: ${message}`);
    assert.equal(typeof chinese[message], "string", `missing Chinese message: ${message}`);
  }
});

test("Chinese translations render in the webview and escape attribute content", () => {
  const chinese = require("../l10n/bundle.l10n.zh-cn.json");
  const strings = createNotesViewStrings((message, ...args) => args.reduce(
    (text, value, index) => text.replace(`{${index}}`, value),
    chinese[message],
  ));
  const html = renderHtml(
    { cspSource: "test-source" },
    "notes-view.css",
    "notes-view.js",
    { locale: "zh-cn", strings },
  );

  assert.match(html, /<html lang="zh-cn">/);
  assert.match(html, /<h1>内容记录<\/h1>/);
  assert.match(html, /id="total" class="total">0 条记录<\/span>/);
  assert.match(html, /aria-label="打开 Codex Partner 快捷键设置"/);
  assert.match(html, /aria-label="调整输入区域高度"/);
  assert.match(html, /data-placeholder="输入准备发送给 Codex 的内容…"/);
  assert.match(html, /data-l10n="\{&quot;title&quot;:&quot;内容记录&quot;/);
});

test("rich reference bubbles are wired into the webview", () => {
  const html = renderHtml(
    { cspSource: "test-source" },
    "notes-view.css",
    "notes-view.js",
    { referenceScriptUri: "reference-bubbles.js" },
  );

  assert.match(html, /id="icon-file"/);
  assert.match(html, /id="icon-folder"/);
  assert.match(html, /id="icon-close"/);
  assert.match(html, /<script nonce="[^"]+" src="reference-bubbles\.js"><\/script>/);
  assert.match(html, /class="rich-editor" contenteditable="true"/);
  assert.match(html, /id="reference-picker" class="reference-picker" hidden/);
  assert.doesNotMatch(html, /reference-search-input/);
  assert.match(html, /id="reference-results" class="reference-results" role="listbox"/);
  assert.match(html, /id="reference-tooltip" class="reference-tooltip" role="tooltip" hidden/);

  const script = fs.readFileSync(
    path.join(__dirname, "..", "media", "notes-view.js"),
    "utf8",
  );
  assert.match(script, /node\.dataset\.reference/);
  assert.match(script, /getReferenceSearchHighlights\(result, referenceSearch\.query\)/);
  assert.match(script, /mark\.textContent = text/);
  assert.match(script, /if \(editable\) bubble\.classList\.add\("reference-bubble-editable"\)/);
  assert.match(script, /remove\.setAttribute\("aria-label", strings\.removeReference\)/);
  assert.match(script, /bubble\.remove\(\);\s*content\.focus\(\);/);
  assert.match(script, /content\.addEventListener\("keydown", \(event\) => \{\s*if \(event\.target !== content\) return;/);
  assert.match(script, /referenceTooltip\.textContent = bubble\.dataset\.reference/);
  assert.doesNotMatch(script, /bubble\.title = segment\.raw/);
  assert.match(script, /clipboardData\.setData\("text\/plain", selectedText\)/);
  assert.match(script, /vscode\.postMessage\(\{ type: "add", content: value \}\)/);
  assert.match(script, /vscode\.postMessage\(\{ type: "searchReferences", query: trigger\.query \}\)/);
  assert.match(script, /referenceBubbles\.findReferenceTrigger\(prefix\)/);
  assert.match(script, /event\.key === "ArrowDown"/);
  assert.match(script, /content\.addEventListener\("input", \(\) => \{\s*updateComposer\(\);\s*updateReferenceSearch\(\);/);
  assert.doesNotMatch(script, /referenceSearchInput/);
  assert.match(script, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(script, /const top = Math\.max\(viewportPadding, rect\.top - pickerHeight - 6\)/);
  assert.match(script, /anchorRect: sameTrigger \? referenceSearch\.anchorRect : getCaretRect\(\)/);
  assert.match(script, /positionReferencePicker/);
  assert.match(script, /event\.key === "Escape" && referenceSearch[\s\S]*closeReferencePicker\(\)/);
  assert.match(script, /content\.addEventListener\("keyup", \(event\) => \{\s*if \(event\.key !== "Escape"\) updateReferenceSearch\(\);/);
  assert.doesNotMatch(script, /referenceSearchDismissed/);
  assert.match(script, /referenceSearch\.query === trigger\.query/);
  assert.match(script, /content\.setAttribute\("aria-activedescendant"/);
  assert.match(script, /event\.data\.type === "referencesChanged"/);

  const extension = fs.readFileSync(
    path.join(__dirname, "..", "extension.js"),
    "utf8",
  );
  assert.match(extension, /createFileSystemWatcher\("\*\*\/\*"\)/);
  assert.match(extension, /onDidCreateFiles/);
  assert.match(extension, /onDidDeleteFiles/);

  const styles = fs.readFileSync(
    path.join(__dirname, "..", "media", "notes-view.css"),
    "utf8",
  );
  assert.match(styles, /\.reference-picker\s*\{[\s\S]*height: min\(240px, calc\(100vh - 16px\)\);/);
  assert.match(styles, /\.reference-results\s*\{[\s\S]*overflow-y: auto;/);
  assert.match(styles, /\.reference-option\s*\{[\s\S]*flex: 0 0 auto;/);
  assert.match(styles, /\.reference-option\.selected \.icon \{ color: inherit; \}/);
  assert.match(styles, /\.reference-option mark\s*\{/);
  assert.match(styles, /\.reference-bubble-editable:hover \.reference-bubble-remove/);
  assert.match(styles, /\.reference-tooltip\s*\{[\s\S]*position: fixed;/);
  assert.match(styles, /\.reference-bubble\s*\{[\s\S]*height: 1\.4em;[\s\S]*line-height: inherit;/);
  assert.match(styles, /\.reference-tooltip::after\s*\{[\s\S]*border-bottom: 1px solid var\(--reference-tooltip-border\);/);
  assert.match(styles, /body\.vscode-dark \.reference-tooltip,[\s\S]*--reference-tooltip-background: #fff;/);
});

test("new workspace directories invalidate the cached reference search", async () => {
  const workspaceFolder = {
    index: 0,
    name: "workspace",
    uri: { scheme: "untitled", path: "/workspace" },
  };
  const directoryUri = {
    scheme: "untitled",
    path: "/workspace/new folder",
    toString: () => "untitled:/workspace/new folder",
  };
  const messages = [];
  let findFilesCount = 0;
  const provider = new PromptNotesViewProvider(
    { workspaceState: { get: () => [] } },
    {
      workspace: {
        workspaceFolders: [workspaceFolder],
        findFiles: async () => {
          findFilesCount += 1;
          return [];
        },
        getWorkspaceFolder: () => workspaceFolder,
        fs: { stat: async () => ({ type: 2 }) },
      },
      FileType: { Directory: 2 },
      env: { language: "en" },
      l10n: { t: (message) => message },
    },
  );
  provider.view = { webview: { postMessage: (message) => messages.push(message) } };

  await provider.handleMessage({ type: "searchReferences", query: "new" });
  assert.deepEqual(messages.at(-1).results, []);

  await provider.handleReferenceCreated(directoryUri);
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(messages.at(-1).type, "referencesChanged");
  await provider.handleMessage({ type: "searchReferences", query: "new" });
  assert.equal(findFilesCount, 2);
  assert.deepEqual(messages.at(-1).results.map(({ kind, referencePath }) => ({ kind, referencePath })), [
    { kind: "directory", referencePath: "new folder" },
  ]);

  provider.handleReferenceDeleted(directoryUri);
  await provider.handleMessage({ type: "searchReferences", query: "new" });
  assert.deepEqual(messages.at(-1).results, []);
  provider.dispose();
});

test("prompt notes executable sources contain no hard-coded Chinese UI copy", () => {
  const files = [
    path.join(__dirname, "..", "src", "prompt-notes-view.js"),
    path.join(__dirname, "..", "media", "notes-view.js"),
  ];

  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /[\u3400-\u9fff]/u);
  }
});

test("prompt notes can open the extension keyboard shortcut settings", async () => {
  let executedCommand;
  const provider = new PromptNotesViewProvider(
    { workspaceState: { get: () => [] } },
    {
      commands: {
        executeCommand: async (command) => {
          executedCommand = command;
        },
      },
      l10n: { t: (message, ...args) => args.reduce(
        (text, value, index) => text.replace(`{${index}}`, value),
        message,
      ) },
    },
  );

  await provider.handleMessage({ type: "openKeybindings" });
  assert.equal(executedCommand, openKeybindingsCommand);
});

test("prompt notes searches workspace references and returns localized raw references", async () => {
  const workspaceFolder = {
    index: 0,
    name: "workspace",
    uri: { scheme: "untitled", path: "/workspace" },
  };
  const fileUri = { scheme: "untitled", path: "/workspace/src/main.js" };
  let postedMessage;
  const provider = new PromptNotesViewProvider(
    {
      workspaceState: {
        get: () => [],
        update: async () => {},
      },
    },
    {
      workspace: {
        workspaceFolders: [workspaceFolder],
        findFiles: async () => [fileUri],
        getWorkspaceFolder: () => workspaceFolder,
      },
      env: { language: "en" },
      commands: { executeCommand: async () => {} },
      l10n: { t: (message, ...args) => args.reduce(
        (text, value, index) => text.replace(`{${index}}`, value),
        message,
      ) },
    },
  );
  provider.view = { webview: { postMessage: (message) => { postedMessage = message; } } };

  await provider.handleMessage({ type: "searchReferences", query: "main" });

  assert.equal(postedMessage.type, "referenceSearchResults");
  assert.equal(postedMessage.query, "main");
  assert.deepEqual(postedMessage.results.map(({ kind, referencePath, reference }) => ({
    kind,
    referencePath,
    reference,
  })), [
    {
      kind: "file",
      referencePath: "src/main.js",
      reference: "【File `src/main.js`】",
    },
  ]);
});
