const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFileRangeContext,
  normalizeComposerBlocks,
  normalizeContextItem,
  normalizeContextItems,
  serializeComposerBlocks,
  serializeComposerMessage,
} = require("../src/context-item");

test("createFileRangeContext creates a workspace-relative file range with a compact preview", () => {
  const context = createFileRangeContext({
    filePath: "workspace\\src\\extension.js",
    workspaceRoot: "workspace",
    startLine: 12,
    endLine: 15,
    preview: "  const value = 1;\n  return value;  ",
  });

  assert.equal(context.type, "fileRange");
  assert.equal(context.path, "src/extension.js");
  assert.equal(context.startLine, 12);
  assert.equal(context.endLine, 15);
  assert.equal(context.preview, "const value = 1; return value;");
  assert.match(context.id, /^ctx-/);
});

test("normalizeContextItem rejects absolute and parent-traversal paths", () => {
  assert.equal(normalizeContextItem({ type: "fileRange", path: "C:\\secret.js", startLine: 1, endLine: 1 }), null);
  assert.equal(normalizeContextItem({ type: "fileRange", path: "../secret.js", startLine: 1, endLine: 1 }), null);
  assert.equal(normalizeContextItem({ type: "fileRange", path: "src/a.js", startLine: 0, endLine: 1 }), null);
});

test("serializeComposerMessage keeps plain text fallback and separates context from instruction", () => {
  const contextItems = normalizeContextItems([
    { id: "one", type: "fileRange", path: "src/a.js", startLine: 2, endLine: 2 },
    { id: "two", type: "fileRange", path: "README.md", startLine: 3, endLine: 7, preview: "usage" },
    { id: "bad", type: "fileRange", path: "../secret", startLine: 1, endLine: 1 },
  ]);

  assert.equal(serializeComposerMessage("请解释。", contextItems), [
    "请参考以下项目上下文：",
    "- 文件 `src/a.js`，第 2 行",
    "- 文件 `README.md`，第 3-7 行：usage",
    "",
    "用户指令：",
    "请解释。",
  ].join("\n"));
  assert.equal(serializeComposerMessage("", contextItems), [
    "请参考以下项目上下文：",
    "- 文件 `src/a.js`，第 2 行",
    "- 文件 `README.md`，第 3-7 行：usage",
  ].join("\n"));
  assert.equal(serializeComposerMessage("hello", []), "hello");
});


test("serializeComposerBlocks preserves inline context position between text blocks", () => {
  const blocks = normalizeComposerBlocks([
    { type: "text", value: "请解释 " },
    {
      type: "context",
      item: { id: "one", type: "fileRange", path: "src/a.js", startLine: 2, endLine: 4 },
    },
    { type: "text", value: " 这段代码。" },
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ["text", "context", "text"]);
  assert.equal(
    serializeComposerBlocks(blocks),
    '请解释 【文件 \u0060src/a.js\u0060，第 2-4 行】 这段代码。',
  );
});

test("normalizeComposerBlocks merges adjacent text and rejects malformed blocks", () => {
  assert.deepEqual(
    normalizeComposerBlocks([
      { type: "text", value: "a" },
      { type: "text", value: "" },
      { type: "text", value: "b" },
    ]),
    [{ type: "text", value: "ab" }],
  );
  assert.equal(normalizeComposerBlocks([{ type: "text", value: 1 }]), null);
  assert.equal(normalizeComposerBlocks([{ type: "unknown", value: "x" }]), null);
  assert.equal(
    normalizeComposerBlocks([
      { type: "context", item: { type: "fileRange", path: "../secret.js", startLine: 1, endLine: 1 } },
    ]),
    null,
  );
});
