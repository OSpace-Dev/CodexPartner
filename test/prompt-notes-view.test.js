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
  assert.match(composer, /<label class="visually-hidden" for="content">Content to save<\/label>/);
  assert.match(composer, /id="resize-handle" class="resize-handle" role="separator"/);
  assert.match(composer, /aria-orientation="horizontal"[^>]+aria-controls="content"/);
  assert.match(composer, /aria-valuemin="82" aria-valuemax="180" aria-valuenow="82"/);
  assert.match(composer, /<textarea id="content"[^>]+aria-describedby="composer-hint"><\/textarea>/);
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
  const textareaRules = styles.match(/(?:^|\n)textarea\s*\{([\s\S]*?)\}/)?.[1];
  const resizeHandleRules = styles.match(/\.resize-handle\s*\{([\s\S]*?)\}/)?.[1];

  assert.ok(textareaRules);
  assert.match(textareaRules, /\bresize:\s*none\s*;/);
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
  assert.match(html, /placeholder="输入准备发送给 Codex 的内容…"/);
  assert.match(html, /data-l10n="\{&quot;title&quot;:&quot;内容记录&quot;/);
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
