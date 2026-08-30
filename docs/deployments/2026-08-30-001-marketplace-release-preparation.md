# Marketplace 发布准备

编号：DEP-20260830-001
目标环境：Visual Studio Marketplace
发布版本：0.4.0
对应测试：TEST-20260829-002

## 变更内容

- 为 Codex Partner 补充 Marketplace 元数据和 GitHub 仓库信息。
- 增加 MIT 许可证、变更日志和 VSIX 打包排除规则。
- 增加不使用官方标识的文档与代码引用图标，并将开发调试说明移出 Marketplace README。
- 增加统一文件/目录搜索引用、最近引用排序和 `Ctrl+Alt+R` 快捷键。
- 保留官方 Codex VS Code 扩展作为聊天、会话、模型和审批入口。

## 准入检查

- [x] `npm.cmd run check` 已通过。
- [x] `package.json` JSON 校验已通过。
- [x] Marketplace 图标已接入并包含在 VSIX 中。
- [x] Marketplace README 已移除 F5、Extension Development Host 和本地验证说明。
- [x] 当前提交身份已按用户提供的 GitHub noreply 邮箱配置。
- [ ] 已在 Visual Studio Marketplace 创建 Publisher `OSpace-Dev`。
- [ ] 已完成人工 Extension Development Host 验收。
- [x] 已生成 `codex-partner-0.4.0.vsix`，并核对包内版本与文件清单。
- [ ] 已通过 VS Code“从 VSIX 安装”完成人工验收。

## 发布制品

已生成制品：`codex-partner-0.4.0.vsix`

- 大小：15,082 字节
- SHA-256：`ae2246034d46f14ce6854ce7721bb96e35eb114c38053739555cd4ced2355576`

生成命令：

```bash
npx @vscode/vsce package
```

## 发布步骤

1. 在 Marketplace 创建 Publisher `OSpace-Dev`，或确认现有 Publisher ID 与清单一致。
2. 在本地生成 VSIX，并通过 VS Code 的“从 VSIX 安装”验收。
3. 完成 Marketplace 认证后发布 `codex-partner-0.4.0.vsix`。
4. 发布后从 Marketplace 页面确认安装、版本和 README 展示正常。

## 当前状态

GitHub 远端已配置为 `origin`；0.4.0 源码与发布准备改动已提交到 `lightweight-context-reference` 分支，尚未推送。

## 当前阻塞

Marketplace Publisher 创建和发布认证依赖用户的微软账号权限，本次不在本地代替完成。