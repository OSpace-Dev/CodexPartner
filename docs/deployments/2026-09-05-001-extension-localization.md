# 扩展国际化与 Marketplace 文案准备

编号：`DEP-20260905-001`
目标环境：Visual Studio Marketplace
发布版本：0.5.0
对应变更：英文主界面与简体中文辅助翻译

## 目标

让 Codex Partner 以英文作为默认产品语言，保留简体中文辅助翻译，为 Marketplace 上架和英文用户使用做准备。

## 实施范围

- 使用 VS Code 官方 `package.nls.json` 机制本地化扩展清单中的显示名、描述、命令标题和命令分类。
- 使用 VS Code 官方 `vscode.l10n` API 本地化运行时通知、错误、Code Action 和 Quick Pick 文案。
- 提供 `en` 默认资源和 `zh-cn` 翻译资源。
- 生成的文件、目录和行号引用跟随 VS Code 显示语言；路径、行号计算和工作区相对路径约束不变。
- Marketplace `README.md` 改为英文优先，并保留中文说明。
- 将 Marketplace 图标优化为 256×256 PNG，降低扩展包体积。

## 非目标

- 不改变命令 ID、默认快捷键、App Server 契约或剪贴板权限边界。
- 不新增翻译平台、运行时下载或外部依赖。
- 不扩展到其他语言。

## 验收条件

1. 默认英文环境下，命令面板、灯泡、Quick Pick、成功通知和错误通知均显示英文。
2. `zh-cn` 环境下，上述界面显示简体中文。
3. 默认英文环境复制的引用使用 `File`、`Directory` 和 `lines` 标签；`zh-cn` 环境保留中文标签。
4. 所有现有引用格式、路径校验、最近引用排序和快捷键行为保持不变。
5. `npm run check` 通过，且包清单、英文资源和中文资源均为有效 JSON。

## 验证记录

- 自动化：已执行，`npm run check` 通过；包清单、英文资源和中文资源 JSON 校验通过。
- Extension Development Host 人工验收：待执行。
- VSIX 重新打包：已完成，生成 `codex-partner-0.5.0.vsix`。
