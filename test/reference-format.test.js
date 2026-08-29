const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatDirectoryReference,
  formatFileRangeReference,
  formatFileReference,
  isValidRelativePath,
} = require("../src/reference-format");

test("formats a selected file range with workspace-relative path and lines", () => {
  assert.equal(
    formatFileRangeReference({ path: "src\\extension.js", startLine: 2, endLine: 4 }),
    "【文件 `src/extension.js`，第 2-4 行】",
  );
  assert.equal(
    formatFileRangeReference({ path: "README.md", startLine: 8, endLine: 8 }),
    "【文件 `README.md`，第 8 行】",
  );
});

test("formats files and directories for direct pasting into Codex", () => {
  assert.equal(formatFileReference("src/index.js"), "【文件 `src/index.js`】");
  assert.equal(formatDirectoryReference("src/components"), "【目录 `src/components`】");
});

test("rejects absolute, parent-traversal, empty, and invalid line references", () => {
  assert.equal(isValidRelativePath("C:\\secret.js"), false);
  assert.equal(isValidRelativePath("../secret.js"), false);
  assert.equal(formatFileReference(""), null);
  assert.equal(formatDirectoryReference("."), null);
  assert.equal(formatFileRangeReference({ path: "src/a.js", startLine: 0, endLine: 1 }), null);
  assert.equal(formatFileRangeReference({ path: "src/a.js", startLine: 3, endLine: 2 }), null);
});