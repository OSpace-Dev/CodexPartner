# 轻量上下文引用概要设计

设计编号：`HLD-20260829-003`
对应需求：[轻量上下文引用需求](../requirements/2026-08-29-002-lightweight-context-reference.md)
状态：已确认实施

## 结构

扩展宿主注册选区、文件、目录和统一搜索四个引用命令。命令从 VS Code API 获取资源 URI、编辑器选区或搜索结果，校验资源属于当前工作区后，交给无 VS Code 依赖的格式化模块生成文本，最后调用 `vscode.env.clipboard.writeText`。

## 引用格式

- 文件选区：`【文件 \`path\`，第 2-4 行】`
- 文件：`【文件 \`path\`】`
- 目录：`【目录 \`path\`】`

路径统一为工作区相对路径和 `/` 分隔符。扩展不把本机绝对路径写入剪贴板、通知或文档。

## 入口

- 编辑器 `editor/context`：仅在存在选区时显示选区命令。
- 编辑器 Code Action：为选区提供 preferred Quick Fix，支持灯泡和 `Ctrl+.`。
- 资源管理器 `explorer/context`：按 `explorerResourceIsFolder` 区分文件和目录。
- 命令面板和 `Ctrl+Alt+R`：打开统一 Quick Pick，按名称和路径搜索文件或目录。

## 搜索索引与最近引用

搜索命令通过 `workspace.findFiles` 延迟读取当前工作区文件，并从文件父路径推导唯一目录条目。`src/reference-search.js` 负责路径归一化、去重、结果描述和最近引用排序，不依赖 VS Code API。

最近使用的 10 个条目键保存在 `workspaceState`，只用于当前工作区排序。多根工作区在显示路径和复制路径前加工作区名称，避免同名资源产生歧义。

## 故障处理

无法解析资源、资源不在工作区、选区为空或剪贴板写入失败时，通过 VS Code 错误通知反馈。复制成功后只显示引用文本摘要。
