# 本机 App Server 实探

编号：`INV-20260829-001`

## 目的

确认扩展可通过官方 VS Code Codex 扩展随附的 CLI，连接当前本机 Codex App Server，并读取当前认证上下文可见的账号状态、线程列表和线程历史。

## 执行范围

- 启动 `codex app-server --listen stdio://`。
- 请求 `initialize`、`account/read`、`thread/list` 和 `thread/read`。
- 不执行 `turn/start`，不创建线程，不修改任何已有会话。

## 结果

- `initialize`：通过。
- `account/read`：通过；当前认证模式返回为 `apiKey`，邮箱和套餐字段未暴露。
- `thread/list`：通过；首次探针使用上限 20，返回 20 条可见线程；最终回归探针使用上限 5，返回 5 条可见线程。
- `thread/read`：通过；返回所选线程的 11 个 turn、982 个 item，包含用户消息、助手消息、命令执行和文件变更等 item 类型。

## 结论

当前集成边界已经能够复用本机 Codex CLI 的认证上下文读取会话。扩展不需要、也不应该读取 VS Code Cookie、桌面应用 Token 或私有数据库。

## 未覆盖与限制

- 当前环境直接启动 WindowsApps 目录中的系统 Codex 可执行文件会返回拒绝访问；官方 VS Code 扩展随附的 CLI 可正常启动。
- 尚未执行真实 `turn/start` 流式验收，避免在未提供审批 UI 的原型中启动会话操作。
- App Server 的审批请求仍由客户端自动拒绝。
