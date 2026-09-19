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
const { getReferenceLocale } = require("./src/localization");
const {
  PromptNotesViewProvider,
  notesViewContainerId,
  notesViewId,
  openKeybindingsCommand,
} = require("./src/prompt-notes-view");

const selectionCommand = "codexPartner.copySelectionReference";
const fileCommand = "codexPartner.copyFileReference";
const directoryCommand = "codexPartner.copyDirectoryReference";
const searchCommand = "codexPartner.searchAndCopyReference";
const recentReferencesStateKey = "codexPartner.recentReferences";
const recentReferencesLimit = 10;
const searchFileLimit = 50000;
const notesCommand = "codexPartner.openNotes";

function activate(context) {
  const notesProvider = new PromptNotesViewProvider(context, vscode);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(notesViewId, notesProvider),
    vscode.commands.registerCommand(notesCommand, () => (
      vscode.commands.executeCommand(`workbench.view.extension.${notesViewContainerId}`)
    )),
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
    vscode.commands.registerCommand(openKeybindingsCommand, () => (
      openKeybindingsSettings()
    )),
  );
}

function t(message, ...args) {
  return vscode.l10n.t(message, ...args);
}

async function openKeybindingsSettings() {
  try {
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings",
      "Codex Partner",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      t("Unable to open Codex Partner keyboard shortcut settings: {0}", message),
    );
  }
}

class SelectionReferenceCodeActionProvider {
  provideCodeActions(document, range) {
    if (document.uri.scheme !== "file" || !getSelectionLineRange(range)) return [];

    const action = new vscode.CodeAction(
      t("Copy Codex file line reference"),
      vscode.CodeActionKind.QuickFix,
    );
    action.isPreferred = true;
    action.command = {
      command: selectionCommand,
      title: t("Copy Codex file line reference"),
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
      throw new Error(t("Please select text in a saved file first."));
    }

    const locale = getReferenceLocale(vscode.env.language);
    const text = formatReferenceForUri(document.uri, (relativePath) => (
      formatFileRangeReference({ path: relativePath, ...lineRange, locale })
    ));
    await copyReference(text);
  } catch (error) {
    showReferenceError(error);
  }
}

async function copyFileReference(resourceUri) {
  try {
    const uri = resourceUri ?? vscode.window.activeTextEditor?.document.uri;
    const fileUri = await requireWorkspaceUri(uri, "file");
    const stat = await vscode.workspace.fs.stat(fileUri);
    if (stat.type & vscode.FileType.Directory) {
      throw new Error(
        t("The current resource is a directory. Use \"Copy Codex directory reference\" instead."),
      );
    }

    const locale = getReferenceLocale(vscode.env.language);
    const text = formatReferenceForUri(fileUri, (relativePath) => (
      formatFileReference(relativePath, locale)
    ));
    await copyReference(text);
  } catch (error) {
    showReferenceError(error);
  }
}

async function copyDirectoryReference(resourceUri) {
  try {
    const directoryUri = await requireWorkspaceUri(resourceUri, "directory");
    const stat = await vscode.workspace.fs.stat(directoryUri);
    if (!(stat.type & vscode.FileType.Directory)) {
      throw new Error(
        t("The current resource is not a directory. Use \"Copy Codex file reference\" instead."),
      );
    }

    const locale = getReferenceLocale(vscode.env.language);
    const text = formatReferenceForUri(directoryUri, (relativePath) => (
      formatDirectoryReference(relativePath, locale)
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
      throw new Error(t("Please open a VS Code workspace first."));
    }

    const recentKeys = context.workspaceState.get(recentReferencesStateKey, []);
    const selectedItem = await vscode.window.showQuickPick(
      loadReferenceQuickPickItems(workspaceFolders, recentKeys),
      {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: t("Search workspace files or directories"),
        title: t("Codex Partner: Search and copy reference"),
      },
    );
    if (!selectedItem) return;

    const locale = getReferenceLocale(vscode.env.language);
    const text = selectedItem.entry.kind === "directory"
      ? formatDirectoryReference(selectedItem.entry.referencePath, locale)
      : formatFileReference(selectedItem.entry.referencePath, locale);
    if (!text) {
      throw new Error(t("Unable to generate a workspace reference for the selected resource."));
    }

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
    throw new Error(t("No referenceable files or directories found in the current workspace."));
  }

  return entries.map((entry) => ({
    label: entry.label,
    description: entry.description || undefined,
    detail: `${entry.recent ? `${t("Recently used")} · ` : ""}${
      entry.kind === "directory" ? t("Directory") : t("File")
    } · ${entry.referencePath}`,
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
    throw new Error(t("Please open a VS Code workspace containing this resource."));
  }

  const relativePath = nodePath.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  if (!relativePath || relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    throw new Error(t("This resource is outside the current workspace."));
  }

  const text = formatter(relativePath.split(nodePath.sep).join("/"));
  if (!text) throw new Error(t("Unable to generate a workspace reference for this resource."));
  return text;
}

async function requireWorkspaceUri(uri, resourceKind) {
  if (!uri || uri.scheme !== "file") {
    const resourceLabel = resourceKind === "directory" ? t("Workspace directory") : t("Workspace file");
    throw new Error(t("Select a {0} from the workspace Explorer.", resourceLabel));
  }
  await vscode.workspace.fs.stat(uri);
  return uri;
}

async function copyReference(text) {
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(t("Copied Codex reference: {0}", text));
}

function showReferenceError(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(t("Unable to copy Codex reference: {0}", message));
}

module.exports = {
  activate,
  copyDirectoryReference,
  copyFileReference,
  copySelectionReference,
  formatReferenceForUri,
  openKeybindingsSettings,
  PromptNotesViewProvider,
  searchAndCopyReference,
};
