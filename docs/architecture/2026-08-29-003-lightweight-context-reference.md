# 轻量上下文引用概要设计

设计编号：`HLD-20260829-003`
对应需求：[轻量上下文引用需求](../requirements/2026-08-29-002-lightweight-context-reference.md)
状态：已确认实施

## 结构

扩展宿主注册三个命令：选区、文件、目录。命令从 VS Code API 获取资源 URI 或编辑器选区，校验资源属于当前工作区后，交给无 VS Code 依赖的格式化模块生成文本，最后调用 `vscode.env.clipboard.writeText`。

## 引用格式

- 文件选区：`【文件 \`path\`，第 2-4 行】`
- 文件：`【文件 \`path\`】`
- 目录：`【目录 \`path\`】`

路径统一为工作区相对路径和 `/` 分隔符。扩展不把本机绝对路径写入剪贴板、通知或文档。

## 入口

- 编辑器 `editor/context`：仅在存在选区时显示选区命令。
- 编辑器 Code Action：为选区提供 preferred Quick Fix，支持灯泡和 `Ctrl+.`。
- 资源管理器 `explorer/context`：按 `explorerResourceIsFolder` 区分文件和目录。

## 故障处理

无法解析资源、资源不在工作区、选区为空或剪贴板写入失败时，通过 VS Code 错误通知反馈。复制成功后只显示引用文本摘要。