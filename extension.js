const nodePath = require("node:path");
const vscode = require("vscode");
const {
  formatDirectoryReference,
  formatFileReference,
  formatFileRangeReference,
} = require("./src/reference-format");
const { getSelectionLineRange } = require("./src/editor-reference");
const {
  buildReferenceSearchEntries,
  prioritizeReferenceEntries,
  updateRecentReferenceKeys,
} = require("./src/reference-search");

const selectionCommand = "codexPartner.copySelectionReference";
const fileCommand = "codexPartner.copyFileReference";
const directoryCommand = "codexPartner.copyDirectoryReference";
const searchCommand = "codexPartner.searchAndCopyReference";
const keybindingsCommand = "codexPartner.openKeybindings";
const recentReferencesStateKey = "codexPartner.recentReferences";
const recentReferencesLimit = 10;
const searchFileLimit = 50000;

function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new SelectionReferenceCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.commands.registerCommand(selectionCommand, (documentUri, selectionRange) => (
      copySelectionReference(documentUri, selectionRange)
    )),
    vscode.commands.registerCommand(fileCommand, (resourceUri) => (
      copyFileReference(resourceUri)
    )),
    vscode.commands.registerCommand(directoryCommand, (resourceUri) => (
      copyDirectoryReference(resourceUri)
    )),
    vscode.commands.registerCommand(searchCommand, () => (
      searchAndCopyReference(context)
    )),
    vscode.commands.registerCommand(keybindingsCommand, () => (
      openKeybindingsSettings()
    )),
  );
}

async function openKeybindingsSettings() {
  try {
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings",
      "Codex Partner",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`无法打开 Codex Partner 快捷键设置：${message}`);
  }
}

class SelectionReferenceCodeActionProvider {
  provideCodeActions(document, range) {
    if (document.uri.scheme !== "file" || !getSelectionLineRange(range)) return [];

    const action = new vscode.CodeAction(
      "复制 Codex 文件行号引用",
      vscode.CodeActionKind.QuickFix,
    );
    action.isPreferred = true;
    action.command = {
      command: selectionCommand,
      title: "复制 Codex 文件行号引用",
      arguments: [document.uri, range],
    };
    return [action];
  }
}

async function copySelectionReference(documentUri, selectionRange) {
  try {
    const editor = vscode.window.activeTextEditor;
    const document = documentUri
      ? await vscode.workspace.openTextDocument(documentUri)
      : editor?.document;
    const range = selectionRange ?? editor?.selection;
    const lineRange = getSelectionLineRange(range);
    if (!document || document.uri.scheme !== "file" || !lineRange) {
      throw new Error("请先在已保存的文件中选择一段文本。");
    }

    const text = formatReferenceForUri(document.uri, (relativePath) => (
      formatFileRangeReference({ path: relativePath, ...lineRange })
    ));
    await copyReference(text);
  } catch (error) {
    showReferenceError(error);
  }
}

async function copyFileReference(resourceUri) {
  try {
    const uri = resourceUri ?? vscode.window.activeTextEditor?.document.uri;
    const fileUri = await requireWorkspaceUri(uri, "文件");
    const stat = await vscode.workspace.fs.stat(fileUri);
    if (stat.type & vscode.FileType.Directory) {
      throw new Error("当前资源是目录，请使用“复制 Codex 目录引用”。");
    }

    const text = formatReferenceForUri(fileUri, (relativePath) => (
      formatFileReference(relativePath)
    ));
    await copyReference(text);
  } catch (error) {
    showReferenceError(error);
  }
}

async function copyDirectoryReference(resourceUri) {
  try {
    const directoryUri = await requireWorkspaceUri(resourceUri, "目录");
    const stat = await vscode.workspace.fs.stat(directoryUri);
    if (!(stat.type & vscode.FileType.Directory)) {
      throw new Error("当前资源不是目录，请使用“复制 Codex 文件引用”。");
    }

    const text = formatReferenceForUri(directoryUri, (relativePath) => (
      formatDirectoryReference(relativePath)
    ));
    await copyReference(text);
  } catch (error) {
    showReferenceError(error);
  }
}

async function searchAndCopyReference(context) {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      throw new Error("请先打开一个 VS Code 工作区。");
    }

    const recentKeys = context.workspaceState.get(recentReferencesStateKey, []);
    const selectedItem = await vscode.window.showQuickPick(
      loadReferenceQuickPickItems(workspaceFolders, recentKeys),
      {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: "搜索工作区文件或目录",
        title: "Codex Partner: 搜索并复制引用",
      },
    );
    if (!selectedItem) return;

    const text = selectedItem.entry.kind === "directory"
      ? formatDirectoryReference(selectedItem.entry.referencePath)
      : formatFileReference(selectedItem.entry.referencePath);
    if (!text) throw new Error("无法生成所选资源的工作区引用。");

    await copyReference(text);
    await context.workspaceState.update(
      recentReferencesStateKey,
      updateRecentReferenceKeys(
        recentKeys,
        selectedItem.entry.key,
        recentReferencesLimit,
      ),
    );
  } catch (error) {
    showReferenceError(error);
  }
}

async function loadReferenceQuickPickItems(workspaceFolders, recentKeys) {
  const fileUris = await vscode.workspace.findFiles(
    "**/*",
    undefined,
    searchFileLimit,
  );
  const files = fileUris.flatMap((uri) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return [];

    const relativePath = getRelativeWorkspacePath(workspaceFolder, uri);
    if (!relativePath) return [];

    return [{
      relativePath,
      workspaceKey: `${workspaceFolder.index}:${workspaceFolder.name}`,
      workspaceName: workspaceFolder.name,
    }];
  });
  const entries = prioritizeReferenceEntries(
    buildReferenceSearchEntries(files, {
      multiRoot: workspaceFolders.length > 1,
    }),
    recentKeys,
  );

  if (!entries.length) {
    throw new Error("当前工作区中没有可引用的文件或目录。");
  }

  return entries.map((entry) => ({
    label: entry.label,
    description: entry.description || undefined,
    detail: `${entry.recent ? "最近引用 · " : ""}${entry.kind === "directory" ? "目录" : "文件"} · ${entry.referencePath}`,
    iconPath: new vscode.ThemeIcon(entry.kind === "directory" ? "folder" : "file"),
    entry,
  }));
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

function formatReferenceForUri(uri, formatter) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    throw new Error("请先打开包含该资源的 VS Code 工作区。");
  }

  const relativePath = nodePath.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  if (!relativePath || relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    throw new Error("该资源不在当前工作区内。");
  }

  const text = formatter(relativePath.split(nodePath.sep).join("/"));
  if (!text) throw new Error("无法生成该资源的工作区引用。");
  return text;
}

async function requireWorkspaceUri(uri, resourceLabel) {
  if (!uri || uri.scheme !== "file") {
    throw new Error(`请从工作区资源管理器中选择一个${resourceLabel}。`);
  }
  await vscode.workspace.fs.stat(uri);
  return uri;
}

async function copyReference(text) {
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(`已复制 Codex 引用：${text}`);
}

function showReferenceError(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`无法复制 Codex 引用：${message}`);
}

module.exports = {
  activate,
  copyDirectoryReference,
  copyFileReference,
  copySelectionReference,
  formatReferenceForUri,
  openKeybindingsSettings,
  searchAndCopyReference,
};
