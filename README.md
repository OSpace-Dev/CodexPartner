# Codex Partner

Codex Partner is a lightweight VS Code extension that turns workspace files, directories, and selected text into context references you can paste into the official Codex VS Code extension chat.

## Features

- Copy a selected file range from the editor context menu, Code Action, or keyboard shortcut.
- Copy a file or directory reference from the Explorer context menu.
- Search workspace files and directories from one Quick Pick, with recently used references shown first.
- Keep copied references workspace-relative. The extension never copies selected source text or reads Codex credentials.
- Follow the VS Code display language: English is the default, with Simplified Chinese available for `zh-cn`.

## Reference format

```text
【File `src/extension.js`, lines 12-15】
【File `README.md`】
【Directory `src/components`】
```

When VS Code is set to Simplified Chinese, the copied reference uses the corresponding Chinese labels:

```text
【文件 `src/extension.js`，第 12-15 行】
【文件 `README.md`】
【目录 `src/components`】
```

## Usage

1. Select text in an editor, then choose **Copy Codex file line reference** from the lightbulb or context menu.
2. Right-click a file or directory in the Explorer and choose the matching copy command.
3. Run **Codex Partner: Search and copy reference** to find a file, directory, or parent path.
4. Paste the copied reference into the official Codex extension chat.

## Keyboard shortcuts

- `Ctrl+Alt+C`: Copy a file and line reference for the current selection.
- `Ctrl+Alt+F`: Copy a reference for the current file when there is no selection.
- `Ctrl+Alt+R`: Search workspace files or directories and copy the selected reference.

Search for `Codex Partner` in **Keyboard Shortcuts** to change or disable the default shortcuts.

## 中文说明

Codex Partner 是一个轻量 VS Code 扩展，可将工作区文件、目录和选中文本转换为可粘贴到官方 Codex VS Code 扩展聊天框的上下文引用。

扩展默认使用英文界面；当 VS Code 显示语言为简体中文（`zh-cn`）时，命令、通知、搜索界面和生成的引用会使用中文。功能范围和快捷键与英文界面一致。
