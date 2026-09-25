const nodePath = require("node:path");
const {
  buildReferenceSearchEntries,
  prioritizeReferenceEntries,
} = require("./reference-search");

const searchFileLimit = 50000;

async function loadReferenceSearchEntries(vscode, recentKeys = [], directoryUris = []) {
  const workspace = vscode?.workspace;
  const workspaceFolders = workspace?.workspaceFolders;
  if (!workspace || !workspaceFolders?.length) return [];

  const fileUris = await workspace.findFiles("**/*", undefined, searchFileLimit);
  const files = fileUris.flatMap((uri) => {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return [];

    const relativePath = getRelativeWorkspacePath(workspaceFolder, uri);
    if (!relativePath) return [];

    return [{
      relativePath,
      workspaceKey: `${workspaceFolder.index}:${workspaceFolder.name}`,
      workspaceName: workspaceFolder.name,
    }];
  });
  const directories = directoryUris.flatMap((uri) => {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return [];

    const relativePath = getRelativeWorkspacePath(workspaceFolder, uri);
    if (!relativePath) return [];

    return [{
      relativePath,
      workspaceKey: `${workspaceFolder.index}:${workspaceFolder.name}`,
      workspaceName: workspaceFolder.name,
    }];
  });

  return prioritizeReferenceEntries(
    buildReferenceSearchEntries(files, {
      multiRoot: workspaceFolders.length > 1,
      directories,
    }),
    recentKeys,
  );
}

function getRelativeWorkspacePath(workspaceFolder, uri) {
  const relativePath = workspaceFolder.uri.scheme === "file" && uri.scheme === "file"
    ? nodePath.relative(workspaceFolder.uri.fsPath, uri.fsPath)
    : nodePath.posix.relative(workspaceFolder.uri.path, uri.path);
  if (!relativePath || relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.split(nodePath.sep).join("/");
}

module.exports = {
  loadReferenceSearchEntries,
};
