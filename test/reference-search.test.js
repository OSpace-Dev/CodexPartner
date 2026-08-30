const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReferenceSearchEntries,
  createReferenceSearchEntryKey,
  normalizeSearchPath,
  prioritizeReferenceEntries,
  updateRecentReferenceKeys,
} = require("../src/reference-search");

test("builds unique file and parent directory entries", () => {
  const entries = buildReferenceSearchEntries([
    {
      relativePath: "src\\components\\button.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
    {
      relativePath: "src/components/input.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
  ]);

  assert.deepEqual(
    entries.map(({ kind, referencePath }) => ({ kind, referencePath })),
    [
      { kind: "file", referencePath: "src/components/button.js" },
      { kind: "directory", referencePath: "src" },
      { kind: "directory", referencePath: "src/components" },
      { kind: "file", referencePath: "src/components/input.js" },
    ],
  );
});

test("prefixes references and descriptions in a multi-root workspace", () => {
  const entries = buildReferenceSearchEntries([
    {
      relativePath: "src/index.js",
      workspaceKey: "0:client",
      workspaceName: "client",
    },
    {
      relativePath: "src/index.js",
      workspaceKey: "1:server",
      workspaceName: "server",
    },
  ], { multiRoot: true });

  const files = entries.filter((entry) => entry.kind === "file");
  assert.deepEqual(
    files.map(({ label, description, referencePath }) => ({
      label,
      description,
      referencePath,
    })),
    [
      {
        label: "index.js",
        description: "client/src",
        referencePath: "client/src/index.js",
      },
      {
        label: "index.js",
        description: "server/src",
        referencePath: "server/src/index.js",
      },
    ],
  );
});

test("normalizes separators and removes duplicate discoveries", () => {
  assert.equal(normalizeSearchPath(".\\src\\a.js"), "src/a.js");

  const entries = buildReferenceSearchEntries([
    {
      relativePath: "src\\a.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
    {
      relativePath: "src/a.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
  ]);

  assert.equal(entries.filter((entry) => entry.kind === "file").length, 1);
  assert.equal(entries.filter((entry) => entry.kind === "directory").length, 1);
});

test("places recent references first in most-recent order", () => {
  const entries = buildReferenceSearchEntries([
    {
      relativePath: "src/a.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
    {
      relativePath: "src/b.js",
      workspaceKey: "workspace",
      workspaceName: "workspace",
    },
  ]);
  const aKey = createReferenceSearchEntryKey({
    kind: "file",
    relativePath: "src/a.js",
    workspaceKey: "workspace",
  });
  const bKey = createReferenceSearchEntryKey({
    kind: "file",
    relativePath: "src/b.js",
    workspaceKey: "workspace",
  });

  const prioritized = prioritizeReferenceEntries(entries, [bKey, aKey]);
  assert.deepEqual(
    prioritized.slice(0, 2).map(({ referencePath, recent }) => ({
      referencePath,
      recent,
    })),
    [
      { referencePath: "src/b.js", recent: true },
      { referencePath: "src/a.js", recent: true },
    ],
  );
});

test("updates and limits recent reference keys without duplicates", () => {
  assert.deepEqual(
    updateRecentReferenceKeys(["b", "a", "c"], "a", 3),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    updateRecentReferenceKeys(["b", "c", "d"], "a", 3),
    ["a", "b", "c"],
  );
});
