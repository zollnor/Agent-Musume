# 参与 AgentMusume

欢迎提交问题复现、会话格式兼容性反馈、文档改进和代码修复。提交较大功能或新增角色前，建议先用 Issue 说明想解决的问题。

## 本地开发

使用 Windows 与 Node.js 22.15 或更高版本。在项目目录运行：

```powershell
npm ci
npm test
npm start
```

`npm ci` 会下载锁定版本的 Electron。`npm test` 先执行 `src/prepare.mjs`，再运行 `test/*.test.mjs`。自动化单元测试本身无需安装 Electron；在仅检查代码时，可直接运行 `npm test`。打包执行 `npm run package`，安装包输出到 `release/`。

## 修改边界

- 主要逻辑在 `src/`；`vendor/dsh-pet/` 保留上游分发文件和许可证。
- 需要修改上游运行行为时，更新 `src/patches.mjs`，保留 `*.original*` 原样，运行准备脚本生成实际文件。
- 不提交 `node_modules/`、`data/`、`release/`、配置、日志、凭证或真实 AI 会话。
- 报告会话格式问题时，优先提交脱敏后的最小生命周期事件，不要提交提示词、模型回复或工具输出。
- 代码修复应通过相关测试；改动行为时增加能验证问题的测试，并说明 Windows 实测范围。

`test/*-verification.mjs` 中有会打开真实桌宠窗口或重启程序的脚本，运行前先阅读文件顶部说明。`interaction-verification.mjs delegation` 使用独立数据目录和合成的本地会话事件，不调用模型。

## 素材与署名

代码与角色素材采用不同许可，见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。提交素材前说明作者、直接来源、使用许可和是否由 AI 生成；保留原作者署名。不要将角色、动画或派生演示图标成 MIT，也不要提交限制再分发的字体、图片或视频。
