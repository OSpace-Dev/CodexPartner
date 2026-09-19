# Activity Bar 独立入口测试与人工验收

编号：TEST-20260919-001

测试对象：将本地内容记录 Webview 从 Explorer 迁移到 Codex Partner 专属 Activity Bar 容器的工作区变更。

对应需求：[REQ-20260913-001](../requirements/2026-09-13-001-prompt-notes.md)

测试环境：Windows、Node.js v22.17.1、npm 11.6.0、VS Code 1.136.1。

## 覆盖范围

- 已覆盖：Activity Bar 容器声明、Webview 归属、入口图标文件、JavaScript 语法和既有单元测试回归。
- 未覆盖：真实 Extension Host 中的入口显示、点击打开、亮暗主题可见性和既有用户视图位置迁移。

## 执行结果

| 用例 | 方式 | 状态 | 证据 |
| --- | --- | --- | --- |
| TC-20260919-001 专属 Activity Bar 容器声明 | 自动化 | 通过 | `npm run check` 中 2 项入口测试通过 |
| TC-20260919-002 既有功能回归 | 自动化 | 通过 | `npm run check` 共 22 项测试通过 |
| TC-20260919-003 图标进入打包文件列表 | 自动化 | 通过 | `npm pack --dry-run --json` 包含 `media/activitybar.svg` |
| TC-20260919-004 Extension Host 视觉与交互 | 人工 | 未执行 | 按下述协议回填 |

## 人工验收协议

### 目的

确认专属入口在真实 VS Code 中可发现、可操作，并能打开原有内容记录面板。

### 准备

- 使用 VS Code 打开仓库根目录。
- 确认没有正在运行的 Extension Development Host。
- 如需验证升级行为，先记录旧版本内容面板中已有的一条测试记录。
- 验收失败时关闭 Extension Development Host 即可回退，不修改正式 VS Code 配置。

### 执行步骤

1. 按 `F5`，选择 `Run Codex Partner` 启动 Extension Development Host。
   - 预期结果：左侧 Activity Bar 显示 Codex Partner 单色图标，图标轮廓完整且未裁切。
   - 证据：截取包含 Activity Bar 的窗口截图。
2. 点击 Codex Partner 图标。
   - 预期结果：侧栏标题显示 `Codex Partner`，其中显示“内容记录”视图；Explorer 不再包含该折叠视图。
   - 证据：截取独立侧栏和 Explorer 各一张截图。
3. 从命令面板运行 `Codex Partner: 打开内容记录`。
   - 预期结果：无论当前位于哪个侧栏，都会切换到同一个 Codex Partner 内容记录视图。
   - 证据：记录命令是否成功切换。
4. 新建一条测试记录，切换到 Explorer 后再点击 Codex Partner 图标。
   - 预期结果：测试记录仍存在，保存、复制和删除操作与迁移前一致。
   - 证据：记录操作结果；完成后删除测试记录。
5. 分别切换一个浅色主题和一个深色主题。
   - 预期结果：Activity Bar 图标在两个主题下均清晰可见，选中状态可辨识。
   - 证据：各保留一张截图。

### 验收标准

- 通过：五个步骤全部符合预期，且消息记录数据与操作没有回归。
- 失败：图标缺失、点击不打开专属侧栏、视图仍默认位于 Explorer，或记录行为回归。
- 阻塞：无法启动 Extension Development Host，或本机策略禁止加载开发扩展。

### 回填

- 状态：[通过 / 失败 / 阻塞 / 未执行]
- 执行人：[填写]
- 执行时间：[填写]
- VS Code 版本：[填写]
- 证据位置：[填写]
- 备注：[填写]

## 缺陷与风险

- 未发现自动化测试失败。
- 本机未安装 `vsce`，未执行 VSIX 专用打包校验。
- 人工验收完成前，入口的实际视觉表现和点击行为仍是交付残余风险。

## 结论

自动化部分通过；真实 Extension Host 人工验收未执行，当前结论为有条件通过。
