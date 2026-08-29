# 上下文 Composer 概要设计

设计编号：`HLD-20260829-002`
对应需求：[上下文引入 v1](../requirements/2026-08-29-001-context-import-v1.md)
状态：已确认实施

## 背景与目标

- 目标：把编辑器选区从“插入一段提示文本”升级为可管理的 `ContextItem`，并在不改变 App Server 契约的前提下发送。
- 非目标：本设计不处理审批、会话持久化、Markdown 渲染和其他上下文来源。
- 当前问题：M0 直接把引用字符串写入 textarea，无法识别来源，也无法把引用作为输入框内独立元素在任意位置编辑。

## 设计驱动因素

- 功能：多上下文项、删除、排序、只发送上下文。
- 兼容性：当前 App Server 只验证过文本输入，不能假设结构化输入字段。
- 隐私：消息和文档只使用工作区相对路径，不传本机绝对路径。
- 可演进性：内部模型与外部序列化分离，后续可以替换发送适配器。

## 现状设计

- `extension.js` 注册编辑器 Code Action，并通过 Webview 消息向 Composer 插入文本。
- `media/sidebar.js` 维护 `contenteditable` Composer，提交时按 DOM 顺序向扩展宿主发送 `send` 消息。
- `turn/start` 的兼容输入为 `input: [{ type: "text", text }]`。

## 目标设计

### ContextItem 模型

M1 首先实现 `fileRange`：

```js
{
  id: "ctx-...",
  type: "fileRange",
  path: "src/extension.js",
  startLine: 120,
  endLine: 135,
  preview: "const ..."
}
```

`path` 必须是工作区相对路径；`preview` 是可选短摘要，最多保留固定长度，不作为文件内容的完整替代。

### 数据流

1. Code Action 从 `TextDocument` 和 `Range` 创建 `fileRange` ContextItem。
2. 扩展宿主向 Webview 发送 `addComposerContext`；Webview 将其加入当前草稿队列。
3. Webview 在 Composer 输入框内按最近一次光标位置插入 `contenteditable=false` 的上下文气泡，支持删除。
4. Webview 按文字节点和上下文气泡的 DOM 顺序发送 `{ type: "send", blocks }`。
5. 扩展宿主校验 blocks，并调用 `serializeComposerBlocks` 生成一个兼容纯文本的消息。
6. 扩展宿主以现有 `turn/start` 发送文本；请求成功后发送 `clearComposer`。

### 兼容序列化

发送文本采用以下结构，只有存在上下文时才添加上下文段：

```text
请参考以下项目上下文：
- 文件 `src/extension.js`，第 120-135 行

用户指令：
请解释这段代码。
```

若用户没有指令，则省略“用户指令”段；若没有上下文，则保持 M0 的原始文本。

### 组件职责

- `src/context-item.js`：上下文项规范化、显示标签和兼容序列化；无 VS Code 依赖，便于单元测试。
- `src/editor-reference.js`：继续负责选区行号计算和工作区相对路径计算。
- `extension.js`：负责 VS Code 命令、宿主状态、Webview 消息桥接和发送时校验。
- `media/sidebar.js`：负责 contenteditable 草稿、光标位置、上下文气泡和 DOM blocks 读取。
- `media/sidebar.css`：负责输入框、inline 气泡、删除按钮、历史气泡和键盘焦点样式。

## 错误与故障处理

- 非法、过期或缺少路径/行号的上下文项不会进入 `turn/start`，宿主设置可诊断错误。
- App Server 请求失败时不发送 `clearComposer`，Webview 保留草稿以便重试。
- Webview 尚未就绪时，宿主暂存待添加 ContextItem；视图就绪后按顺序发送。
- 关闭 Webview 不持久化草稿，符合 M1 的生命周期假设。

## 安全边界

- Webview 消息视为不可信输入，扩展宿主只接受有限字段和合法整数行号。
- 不把 `filePath` 等绝对路径放进 ContextItem、UI 或发送文本。
- 预览只用于辅助识别，长度受限，不能绕过路径/行号规则。

## 验证

- 单元测试验证合法/非法 ContextItem、相邻文字合并、inline 气泡位于文字中间时的顺序、单行/多行序列化和纯文本回退。
- 现有 App Server 客户端测试继续验证 `turn/start` 文本输入不变。
- Extension Host 人工验收验证在文字中间添加两个上下文气泡、继续编辑、删除、只发送上下文和失败保留草稿。

## 决策与后果

- 选择：M1 内部结构化、外部纯文本兼容。
- 原因：当前协议证据只覆盖文本输入，且不需要引入协议风险即可交付核心卖点。
- 后果：服务端历史中看到的是序列化文本，不是可单独查询的结构化附件；未来需要在适配器层增加原生输入能力。
- 复查条件：App Server 探针确认原生文件引用或多段输入的稳定契约后复查。
