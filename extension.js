const nodePath = require("node:path");
const vscode = require("vscode");
const {
  formatDirectoryReference,
  formatFileReference,
  formatFileRangeReference,
} = require("./src/reference-format");
const { getSelectionLineRange } = require("./src/editor-reference");

const selectionCommand = "codexPartner.copySelectionReference";
const fileCommand = "codexPartner.copyFileReference";
const directoryCommand = "codexPartner.copyDirectoryReference";
const keybindingsCommand = "codexPartner.openKeybindings";

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
};