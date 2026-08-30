const { isValidRelativePath } = require("./reference-format");

function buildReferenceSearchEntries(files, { multiRoot = false } = {}) {
  const entries = new Map();

  for (const file of files ?? []) {
    const relativePath = normalizeSearchPath(file?.relativePath);
    if (!isValidRelativePath(relativePath)) continue;

    addEntry(entries, {
      kind: "file",
      relativePath,
      workspaceKey: file.workspaceKey,
      workspaceName: file.workspaceName,
      multiRoot,
    });

    const segments = relativePath.split("/");
    for (let segmentCount = 1; segmentCount < segments.length; segmentCount += 1) {
      addEntry(entries, {
        kind: "directory",
        relativePath: segments.slice(0, segmentCount).join("/"),
        workspaceKey: file.workspaceKey,
        workspaceName: file.workspaceName,
        multiRoot,
      });
    }
  }

  return Array.from(entries.values());
}

function prioritizeReferenceEntries(entries, recentKeys) {
  const recentRanks = new Map();
  for (const key of recentKeys ?? []) {
    if (typeof key === "string" && !recentRanks.has(key)) {
      recentRanks.set(key, recentRanks.size);
    }
  }

  return (entries ?? [])
    .map((entry) => ({
      ...entry,
      recent: recentRanks.has(entry.key),
    }))
    .sort((left, right) => {
      const leftRank = recentRanks.get(left.key);
      const rightRank = recentRanks.get(right.key);
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        return leftRank - rightRank;
      }

      const pathOrder = left.referencePath.localeCompare(
        right.referencePath,
        "en",
        { numeric: true, sensitivity: "base" },
      );
      return pathOrder || left.kind.localeCompare(right.kind);
    });
}

function updateRecentReferenceKeys(recentKeys, selectedKey, limit = 10) {
  if (typeof selectedKey !== "string" || !selectedKey) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  return [
    selectedKey,
    ...(recentKeys ?? []).filter((key) => (
      typeof key === "string" && key && key !== selectedKey
    )),
  ].slice(0, safeLimit);
}

function addEntry(entries, {
  kind,
  relativePath,
  workspaceKey,
  workspaceName,
  multiRoot,
}) {
  const normalizedWorkspaceName = normalizeSearchPath(workspaceName);
  if (multiRoot && !isValidRelativePath(normalizedWorkspaceName)) return;

  const referencePath = multiRoot
    ? `${normalizedWorkspaceName}/${relativePath}`
    : relativePath;
  if (!isValidRelativePath(referencePath)) return;

  const pathSegments = relativePath.split("/");
  const label = pathSegments.at(-1);
  const parentPath = pathSegments.slice(0, -1).join("/");
  const description = [
    multiRoot ? normalizedWorkspaceName : "",
    parentPath,
  ].filter(Boolean).join("/");
  const key = createReferenceSearchEntryKey({
    kind,
    relativePath,
    workspaceKey: workspaceKey ?? normalizedWorkspaceName,
  });

  if (!entries.has(key)) {
    entries.set(key, {
      key,
      kind,
      label,
      description,
      referencePath,
    });
  }
}

function createReferenceSearchEntryKey({ kind, relativePath, workspaceKey = "" }) {
  return JSON.stringify([
    kind,
    String(workspaceKey),
    normalizeSearchPath(relativePath),
  ]);
}

function normalizeSearchPath(value) {
  if (typeof value !== "string") return "";
  return value.split("\\").join("/").replace(/^\.\/+/, "");
}

module.exports = {
  buildReferenceSearchEntries,
  createReferenceSearchEntryKey,
  normalizeSearchPath,
  prioritizeReferenceEntries,
  updateRecentReferenceKeys,
};
