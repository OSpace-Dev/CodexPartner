# Codex Partner

Codex Partner is a lightweight VS Code extension that turns workspace files, directories, and selected text into context references you can paste into the official Codex VS Code extension chat.

Codex Partner 是一个轻量 VS Code 扩展：把当前工作区中的文件、目录或选中文本快速转换成可粘贴到官方 Codex VS Code 扩展聊天框的上下文引用。

## 当前范围

- 选中文本后，通过编辑器右键菜单或灯泡 Code Action 复制“文件 + 行号范围”引用。
- 在资源管理器中，通过右键菜单复制文件引用或目录引用。
- 引用只使用工作区相对路径，不复制选中的完整内容，不读取 Codex 登录态。
- 生成结果自动写入系统剪贴板，官方 Codex 扩展继续负责会话、模型、消息展示和审批。

## 生成格式

```text
【文件 `src/extension.js`，第 12-15 行】
【文件 `README.md`】
【目录 `src/components`】
```

## 在 VS Code 中运行

1. 在 VS Code 中打开本仓库根目录。
2. 按 `F5`，选择 `Run Codex Partner`，启动 Extension Development Host。
3. 在编辑器中选择文本，点击灯泡或右键选择“复制 Codex 文件行号引用”。
4. 在资源管理器中右键点击文件或目录，选择对应的复制命令。
5. 将剪贴板内容粘贴到官方 Codex 扩展的聊天框中。

关闭 VS Code 后，下一次重新打开本仓库并按 `F5` 即可再次加载开发中的扩展。

## 快捷键

- `Ctrl+Alt+C`：在编辑器中有文本选区时，复制选区的文件行号引用。
- `Ctrl+Alt+F`：在编辑器中没有文本选区时，复制当前文件引用。
- 目录引用继续使用资源管理器右键菜单，因为目录命令需要明确的目录目标。

可以在 VS Code 的“键盘快捷方式”中搜索 `Codex Partner`，修改或禁用这些默认快捷键。
也可以在命令面板中执行“Codex Partner: 打开 Codex Partner 快捷键设置”，直接打开已筛选的设置页面。

## 验证

运行 `npm run check` 执行 JavaScript 语法检查和引用格式单元测试。