const test = require("node:test");
const assert = require("node:assert/strict");
const { loadReferenceSearchEntries } = require("../src/reference-search-host");

test("loads workspace-relative file and directory entries for webview search", async () => {
  const workspaceFolder = {
    index: 0,
    name: "workspace",
    uri: { scheme: "untitled", path: "/workspace" },
  };
  const files = [
    { scheme: "untitled", path: "/workspace/src/main.js" },
  ];
  let findFilesArguments;
  const vscode = {
    workspace: {
      workspaceFolders: [workspaceFolder],
      findFiles: async (...args) => {
        findFilesArguments = args;
        return files;
      },
      getWorkspaceFolder: () => workspaceFolder,
    },
  };

  const entries = await loadReferenceSearchEntries(vscode);

  assert.deepEqual(findFilesArguments, ["**/*", undefined, 50000]);
  assert.deepEqual(
    entries.map(({ kind, referencePath }) => ({ kind, referencePath })),
    [
      { kind: "directory", referencePath: "src" },
      { kind: "file", referencePath: "src/main.js" },
    ],
  );
});

test("includes a new empty directory even when findFiles returns no files", async () => {
  const workspaceFolder = {
    index: 0,
    name: "workspace",
    uri: { scheme: "untitled", path: "/workspace" },
  };
  const directoryUri = { scheme: "untitled", path: "/workspace/new folder" };
  const vscode = {
    workspace: {
      workspaceFolders: [workspaceFolder],
      findFiles: async () => [],
      getWorkspaceFolder: () => workspaceFolder,
    },
  };

  const entries = await loadReferenceSearchEntries(vscode, [], [directoryUri]);

  assert.deepEqual(
    entries.map(({ kind, referencePath }) => ({ kind, referencePath })),
    [{ kind: "directory", referencePath: "new folder" }],
  );
});
