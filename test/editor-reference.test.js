const test = require("node:test");
const assert = require("node:assert/strict");
const { createSelectionReference, getSelectionLineRange } = require("../src/editor-reference");

test("createSelectionReference formats a workspace-relative single-line reference", () => {
  assert.equal(
    createSelectionReference({
      filePath: "workspace\\src\\extension.js",
      workspaceRoot: "workspace",
      startLine: 12,
      endLine: 12,
    }),
    "Please inspect file `src/extension.js`, line 12.",
  );
});

test("createSelectionReference formats a multi-line reference", () => {
  assert.equal(
    createSelectionReference({
      filePath: "workspace\\README.md",
      workspaceRoot: "workspace",
      startLine: 3,
      endLine: 7,
    }),
    "Please inspect file `README.md`, lines 3-7.",
  );
});

test("createSelectionReference supports simplified Chinese output", () => {
  assert.equal(
    createSelectionReference({
      filePath: "workspace\\README.md",
      workspaceRoot: "workspace",
      startLine: 3,
      endLine: 7,
      locale: "zh-cn",
    }),
    "请查看文件 `README.md` 的第 3-7 行。",
  );
});

test("createSelectionReference rejects invalid ranges", () => {
  assert.equal(createSelectionReference({ filePath: "file.js", startLine: 0, endLine: 1 }), null);
  assert.equal(createSelectionReference({ filePath: "file.js", startLine: 4, endLine: 3 }), null);
});

test("getSelectionLineRange converts a selection ending at the next line", () => {
  assert.deepEqual(
    getSelectionLineRange({
      start: { line: 4, character: 2 },
      end: { line: 7, character: 0 },
    }),
    { startLine: 5, endLine: 7 },
  );
});

test("getSelectionLineRange includes a line when the selection ends after its first character", () => {
  assert.deepEqual(
    getSelectionLineRange({
      start: { line: 4, character: 2 },
      end: { line: 7, character: 1 },
    }),
    { startLine: 5, endLine: 8 },
  );
});

test("getSelectionLineRange rejects an empty selection", () => {
  assert.equal(
    getSelectionLineRange({
      start: { line: 4, character: 2 },
      end: { line: 4, character: 2 },
    }),
    null,
  );
});