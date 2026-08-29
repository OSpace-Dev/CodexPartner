# App Server 集成架构

## 结论

VS Code 扩展通过扩展宿主进程启动本地 `codex app-server --listen stdio://`，使用 JSONL 请求与通知完成线程读取和消息发送。

## 范围

当前原型覆盖：

- `initialize` / `initialized`
- `account` 不在 UI 展示，账号状态由 Codex CLI 自己管理
- `thread/list`
- `thread/read`
- `thread/start`
- `turn/start`
- `item/agentMessage/delta`
- `turn/completed`
- 编辑器选区通过 VS Code Code Action 转换为工作区相对文件路径和 1-based 行号引用，并插入侧边栏输入框

## 身份边界

扩展不读取桌面应用 Cookie、Token 或私有数据库。它只启动本机 Codex CLI，因此能否复用当前登录态取决于本机 Codex CLI 的公开认证配置。API Key 和 ChatGPT OAuth 是不同认证模式，不能在扩展层假设二者等价。

## 当前限制

- 审批请求暂时自动拒绝，避免原型在没有审批 UI 时阻塞。
- 尚未实现中断、转向、审批 UI、分页历史和完整 Markdown 渲染。
- 尚未在 VS Code Extension Development Host 中完成手工交互验收。

## 编辑器选区引用

编辑器选区旁通过 VS Code 原生 Code Action 灯泡提供“添加到 Codex Partner 对话”，右键菜单命令保留为备用入口。命令不会把选中的源码全文复制到对话，而是生成类似下面的短引用：

```text
请查看文件 `src/extension.js` 的第 120-135 行。
```

引用通过 Webview 消息插入当前 Codex Partner 输入框的光标位置。侧边栏尚未完成加载时，扩展宿主会暂存引用，待 Webview 就绪后再插入。
