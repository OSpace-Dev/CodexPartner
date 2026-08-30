# Codex Partner

Codex Partner is a lightweight VS Code extension that turns workspace files, directories, and selected text into context references you can paste into the official Codex VS Code extension chat.

Codex Partner 是一个轻量 VS Code 扩展：把当前工作区中的文件、目录或选中文本快速转换成可粘贴到官方 Codex VS Code 扩展聊天框的上下文引用。

## 当前范围

- 选中文本后，通过编辑器右键菜单或灯泡 Code Action 复制“文件 + 行号范围”引用。
- 在资源管理器中，通过右键菜单复制文件引用或目录引用。
- 通过统一搜索框快速查找工作区文件或目录，最近使用的引用优先显示。
- 引用只使用工作区相对路径，不复制选中的完整内容，不读取 Codex 登录态。
- 生成结果自动写入系统剪贴板，官方 Codex 扩展继续负责会话、模型、消息展示和审批。

## 生成格式

```text
【文件 `src/extension.js`，第 12-15 行】
【文件 `README.md`】
【目录 `src/components`】
```

## 使用方式

1. 在编辑器中选中文本，点击灯泡或右键选择“复制 Codex 文件行号引用”。
2. 在资源管理器中右键点击文件或目录，选择对应的复制命令。
3. 也可以执行“Codex Partner: 搜索并复制引用”，输入文件名、目录名或路径进行筛选。
4. 将剪贴板内容粘贴到官方 Codex 扩展的聊天框中。

## 快捷键

- `Ctrl+Alt+C`：在编辑器中有文本选区时，复制选区的文件行号引用。
- `Ctrl+Alt+F`：在编辑器中没有文本选区时，复制当前文件引用。
- `Ctrl+Alt+R`：搜索工作区文件或目录，并复制所选引用。
- 若已在资源管理器中定位到目录，也可以继续通过右键菜单直接复制目录引用。

可以在 VS Code 的“键盘快捷方式”中搜索 `Codex Partner`，修改或禁用这些默认快捷键。
也可以在命令面板中执行“Codex Partner: 打开 Codex Partner 快捷键设置”，直接打开已筛选的设置页面。
