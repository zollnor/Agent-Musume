# AgentMusume · AI娘桌宠

**让 Agent 的工作，变成桌面上的小剧场。**

AgentMusume 是一款与 AI Agent 会话联动的 AI 娘桌宠。三位角色可分别跟随 ChatGPT/Codex、Claude Code 和 DeepSeek Harness 的本地会话，随思考、工具执行、等待确认和一轮完成等状态作出相应反应；当 Agent 之间派发子任务、交回结果或协作完成时，还会以桌宠间的互动动画呈现，让工作状态与协作过程直观地展现在桌面上。

[**看动画演示**](#动画演示) · [**下载 Windows 安装包**](https://github.com/zollnor/Agent-Musume/releases/download/v0.1.3/Agent-Musume-Setup-0.1.3.exe) · [全部版本](https://github.com/zollnor/Agent-Musume/releases) · [English](README.en.md) · [问题反馈](https://github.com/zollnor/Agent-Musume/issues)

Windows · 内置运行环境 · 无需 Node.js · 无需 API Key

## 动画演示

**v0.1.3 更新**：新增带任务启动的交互式会话及新窗口、终端标签的交接识别；右键菜单支持拖动空白处移动。详见[跨工具派任务](#跨工具派任务)。

### 三位角色，三种陪伴

| Claude大小姐 | 龙娘 | 蓝色大肥鱼 |
| :---: | :---: | :---: |
| <img src="docs/media/claude-approval.gif" alt="Claude大小姐审校完成后矜持点赞" width="220"> | <img src="docs/media/dragon-laugh.gif" alt="龙娘爽朗大笑" width="220"> | <img src="docs/media/fish-dance.gif" alt="蓝色大肥鱼跳女仆舞" width="220"> |
| 审校完成，矜持点赞 | 爽朗大笑 | 优雅女仆舞 |
| 112 段单人动画 | 112 段单人动画 | 107 段单人动画 |

### Agent 之间的三组联动

| 派发任务 | 交回结果 | 一起庆祝 |
| :---: | :---: | :---: |
| <img src="docs/media/duet-fish-assign.gif" alt="大肥鱼给大小姐派任务" width="220"> | <img src="docs/media/duet-dragon-fish-return.gif" alt="龙娘向大肥鱼交回结果" width="220"> | <img src="docs/media/duet-claude-dragon-celebrate.gif" alt="大小姐与龙娘共同庆祝" width="220"> |
| 大肥鱼 → 大小姐 | 龙娘 → 大肥鱼 | 大小姐 × 龙娘 |

GIF 展示程序内置动作与互动演出。真实联动的触发条件与一轮完成的含义，见[宠物互动](#宠物互动)。

- **跟着 AI 工作**：读取本机 ChatGPT 桌面版、Codex CLI、Claude Code、DeepSeek Harness 的会话状态，呈现思考、执行工具、等待确认、完成和出错。
- **把协作演出来**：主宠物与助手对应会话、子代理或跨工具接收方；三位角色两两之间都有专用双人动画，支持双向互动。
- **平时也有小动作**：拖动、抛接、点击回应、随机走动和闲聊，可暂停走动或安静 30 分钟。
- **本机运行**：不额外调用模型，不需要 API Key；没有兼容的 AI 工具也能看日常动作，或从托盘菜单演示互动。

桌宠根据 Agent 的状态作出反应；实际 AI 任务由你原来使用的工具执行。

基于 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 改造。代码采用 [MIT](LICENSE)，角色与动画素材按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用并保留署名，见 [NOTICE.md](NOTICE.md)。本项目为非官方同人作品，与 OpenAI、Anthropic、DeepSeek 无关联。

**AI 生成内容声明**：Claude大小姐和龙娘的全部动画、双人动画，以及鲸鱼娘的侧身走路，均为使用 MiniMax H3 生成的 AI 内容。演示 GIF 为相应素材的裁剪、合成与格式转换，遵循相同的角色素材授权。角色原设计：[@上善无形](https://space.bilibili.com/4456176)、[@ZipZipPipe](https://space.bilibili.com/4168597)；上游动画来源：[dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。

## 安装

只支持 Windows，在 Windows 11 上开发和测试。

### 安装包（推荐）

1. [下载 v0.1.3 Windows x64 安装包](https://github.com/zollnor/Agent-Musume/releases/download/v0.1.3/Agent-Musume-Setup-0.1.3.exe)（355,404,052 字节，约 355 MB / 339 MiB）。**这是可直接安装的 `.exe`；页面底部的 Source code 是源码。**
2. 双击安装，完成后程序自动启动，桌面右下角出现三只宠物。
3. 右键宠物打开设置；从托盘菜单选择“演示宠物互动”，可以先看联动效果。

不需要管理员权限，也不需要 Node.js，装好后会自动启动，桌面和开始菜单都有快捷方式。

安装包目前没有代码签名，Windows 可能提示“Windows 已保护你的电脑”。请先确认下载自本仓库的 Release，并按需要比对 [SHA256SUMS.txt](https://github.com/zollnor/Agent-Musume/releases/download/v0.1.3/SHA256SUMS.txt)；确认来源后，可在提示中选择“更多信息”→“仍要运行”。

> v0.1.3 补充新窗口与终端标签中的交互式任务识别，并支持拖动右键菜单。测试与安装包核对见 [发布核对记录](docs/release-validation-v0.1.3.md)。另一台干净 Windows 电脑上的安装、升级和卸载全流程，尚无本次实测记录。

卸载：在 Windows 的“设置 > 应用 > 已安装的应用”里卸载。配置保留在 `%APPDATA%\Agent-Musume`，不需要的话可以手动删除。

### 从源码运行

需要 [Node.js](https://nodejs.org/) 22.15 或更高版本。下载或克隆本仓库，在项目目录运行：

```powershell
npm ci
```

这一步会下载 Electron，约 140 MB，解压后约 350 MB。下载慢的话，可以先设置镜像再安装：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm ci
```

## 使用

| 操作 | 安装版 | 从源码运行 |
| --- | --- | --- |
| 启动 | 桌面或开始菜单的 Agent-Musume | `npm start` |
| 打开设置 | 宠物运行时再点一次快捷方式 | 右键宠物或托盘图标 |
| 退出 | 托盘图标右键“退出” | `npm run stop` |
| 查看运行状态 | 托盘图标右键“运行状态” | `npm run status` |
| 开机启动 | 设置 > 高级 > 开机时启动（默认关闭） | 不支持 |

第一次启动时，桌面右下角会出现三只宠物，各自跟随一类会话，所有互动默认打开：

| 宠物 | 跟随的会话 | 接手这些来源的子代理 |
| --- | --- | --- |
| 大小姐 | Claude Code | Claude Code、ChatGPT 桌面版、Codex CLI、DeepSeek Harness |
| 龙娘 | ChatGPT 桌面版、Codex CLI | ChatGPT 桌面版、Codex CLI、Claude Code |
| 大肥鱼 | DeepSeek Harness | DeepSeek Harness、Claude Code |

这些都可以在设置里改。之后这样用：

- **右键宠物**：播放动作（按分类挑选，或直接打字搜索）、暂停走动、安静 30 分钟、回到原位、互动演示。按住菜单空白处（头部、标题、底栏）用左键拖动，可以把菜单挪开。
- **设置**（右键菜单右上角，或托盘图标）：添加宠物，换形象，调大小和位置，选择跟随哪些会话、接手哪些来源的子代理，开关各种互动，调整拖拽手感。
- **拖动**：按住宠物拖到任意位置，松手时甩一下可以把她抛出去。
- **托盘图标**：显示或隐藏全部宠物，演示各种反应和互动，退出。双击图标显示宠物。
- **运行状态页**：在浏览器里查看每个来源正在做什么，也列出了全部功能。

默认不开机启动。安装版可以在设置的“高级”里打开“开机时启动”，切换后立即生效，卸载时会一并移除。退出后不留后台进程。

## 宠物怎么反应

| 会话里发生了什么 | 宠物的状态 |
| --- | --- |
| 一轮开始、模型在推理 | 正在思考 |
| 开始调用工具 | 正在执行工具 |
| 工具返回结果 | 正在整理结果 |
| 需要你输入或确认权限 | 等待确认，久了会提醒你 |
| 一轮明确结束 | 完成。只代表这一轮回复结束，不代表长期任务全部成功 |
| 明确的运行错误 | 出错。中途的重试不算失败 |
| 取消或中断 | 恢复日常动作，不庆祝 |

一只宠物同时跟随多个来源时，活动中的会话优先于完成和出错，等待确认优先于其他活动。启动时不会重放历史记录。

宠物通过读取会话记录判断状态，所以会有一点延迟，不是硬实时的。

## 宠物互动

桌面上有两只及以上的宠物时，她们会按真实发生的事情互动。这些开关都在每只宠物的设置里。

**协作演出**：需要一只跟随该来源的宠物，和一只接手它子代理的助手，默认已经配好。可以在设置的"会话"一栏调整。

| 真实事件 | 演出 |
| --- | --- |
| 主会话派出子代理，且子代理确认启动 | 主宠物走到助手身边交代任务 |
| 子代理工作中 | 助手显示子代理的进度 |
| 子代理结束，结果送回主会话 | 助手把结果交回主宠物 |
| 交回后主会话这一轮结束 | 两只一起庆祝 |
| 派发失败或子代理出错 | 两只互相安慰 |

判断依据是工具名、编号、状态和时间，不读取任务内容。

**回应同伴**：一只宠物的会话完成、出错或等你确认时，最近的另一只会祝贺、安慰或提醒你。

**闲聊**：两只都空闲一段时间后，偶尔会走到一起聊几句。

全桌面同一时间只演一场。拖动、打开右键菜单，或出现真实的等待和错误，都会中止演出。固定位置或关闭了"走到同伴身边"的宠物不会走动。

## 隐私

程序只在本机运行，不上传任何内容，也不调用模型。

它只读取这些本地记录，并且只取生命周期、工具类型、进程和时间这类信息：

- `~/.codex/sessions`，以及 `~/.codex/logs_2.sqlite` 里的线程、进程 ID 和时间，用来区分 ChatGPT 桌面版和 Codex CLI
- `~/.claude/sessions`，以及仍在运行的 Claude Code 对应的 `~/.claude/projects` 记录
- `~/.dsh/sessions`

它还会查询本机进程的程序类型、父子关系和启动/退出时间，判断记录来自哪个客户端，以及是否实际启动了另一种 harness。进程列表只含进程号、父进程号、启动顺序和程序名；只有新出现的 claude、codex、node、herdr、WezTerm、Windows Terminal（wt）、ChatGPT、DSH 进程，会在本机读一次命令行来分类（herdr 的提示词只看是否以 `/` 开头，`claude`、`codex` 只看有没有带任务，终端命令只看要运行的程序是不是 Claude Code 或 Codex，打字和排队的内容不看），不保存命令行、提示词或参数，也不读取进程的环境变量和内存。

它不保存提示词、工具参数和输出、回复正文或会话标识，不读取屏幕、键盘和登录凭证。可选安装的交接 Skill 只写入自己的技能目录，不修改各工具的配置或权限。

配置和运行信息在 `%APPDATA%\Agent-Musume` 文件夹里（从源码运行时在项目的 `data` 文件夹）。里面有仅供本机控制的令牌，**不要把整个文件夹发给别人**。本地 HTTP 服务只监听 `127.0.0.1`，写操作需要校验令牌。

## 跨工具派任务

ChatGPT 桌面版、Codex CLI、Claude Code 和 DSH 可以互相派任务。新启动的一次性任务（`claude -p`、`codex exec`）由本机父子进程关系识别，派发方等它跑完，或在后台启动（PowerShell 的 Start-Process、`cmd /c start`、分离的子进程）都可以：监视器每秒约五十次记录进程的父子关系，已退出的启动者保留两分钟，任务仍能追回派发方。两个工具独立运行不会因此被判为协作。桌宠启动前已经存在的进程只作基线，不补演历史交接。不到一秒就结束的任务可能赶不上记录，使用下面的交接入口可完整记录。

带着任务启动的交互式会话（`claude "任务"`、`codex "任务"`）也算派任务，常见于新开一个窗口或标签让它干活：

- 新开控制台窗口（`start cmd /k claude "任务"`、Start-Process 等）：同样按父子进程关系找派发方。
- 让终端新开标签或窗口（Windows Terminal 的 `wt new-tab` / `wt -w 0 nt`，WezTerm 的 `cli spawn`、`start`）：新会话挂在终端程序下面，桌宠按派发方执行的这条终端命令里写的程序（Claude Code 或 Codex），把随后几秒内出现的该程序会话配给它。

会话的第一轮结束算交回，第一轮还没结束窗口就被关掉算取消。Claude Code 会话按它登记的进程号对应；Codex 会话按启动后新建的会话记录对应。`claude --bg` 后台会话和继续旧会话的 `codex resume` 暂不算派任务。

把任务交给已经打开的 agent，以下几种方式也会自动识别，派发方都由进程关系确定：

- [Herdr](https://herdr.dev) 的 `herdr agent prompt <窗格> <内容>`：接收方是该窗格里的 agent（向 Herdr 查询，只取 agent 类型、状态和会话号）。该 agent 做完、回到空闲即算交回，提示词没被接受算失败。以 `/` 开头的内容（如 `/model`、`/effort`）是给 agent 的命令，不算任务。
- Herdr 的 `herdr agent send-keys`：按键让该窗格的会话开始新的一轮才算派任务，那一轮结束算交回。批准权限、Esc、方向键、还没按回车的文字都不算。
- WezTerm 的 `cli send-text`（按程序信息识别，改了文件名的 WezTerm 也算）：随后几秒内，另一种工具的 Claude Code 或 Codex CLI 会话开始新的一轮，就是接收方；那一轮结束算交回。
- `codex queue --thread <会话> --message <内容>`：给 ChatGPT 桌面版或 Codex CLI 的已有会话排队派任务。该会话开始处理这条消息时算派任务，这一轮结束算交回。

向其他已经打开的终端或桌面会话派任务时，进程关系不会改变，需要由派发方上报交接元数据。托盘菜单选择“接入跨工具联动…”即可安装配套 Skill；从源码也可运行 `node src/handoff.mjs install`。它为本机 ChatGPT/Codex、Claude Code、DSH 写入 `agent-musume-handoff` 技能，新会话会发现该技能。它不会调用任何模型，也不修改 AGENTS.md 或其他配置；使用自定义配置目录时沿用对应环境变量。

统一入口为 `node src/handoff.mjs`：

- `run --from chatgpt-desktop --to claude-code --command claude.exe -p ...`：包装 Claude Code / Codex CLI 的一次性调用，确认启动后派发、按真实退出码回传；保留标准输入输出。桌宠离线时仍执行实际任务。交互终端、桌面程序、后台启动器及 DSH 会话用下面的显式事件，不能把启动器正常退出当作任务完成。
- `started --from claude-code --to chatgpt-desktop`：目标确认接受任务后上报，返回随机任务 id。
- `delivered --from claude-code --to chatgpt-desktop --id 原id`：结果实际交还后上报；失败用 `failed`，取消或未知结果用 `cancelled`。

来源编号还包括 `codex-cli` 与 `dsh-desktop`，四类之间的 12 个方向使用同一接口。桌宠优先按来源和目标选择对应角色；若两个来源共用一只宠物，或没有单独设置主角色，则由允许协助该来源的另一只宠物代演。至少需要两只可见且开启协作的匹配桌宠。任务标识、来源、目标、状态之外的字段会被拒绝，写接口继续校验本机令牌。任意第三方 harness 可经同样的事件桥接扩展；未接入的网页、远程或 GUI 调度不能靠同时忙碌可靠推断。

## 范围和限制

- 目前只支持 Windows。
- 读取的是这些工具的内部记录格式，不是稳定的公开接口。工具升级后格式变了，可能需要更新解析器。
- 只覆盖本机默认目录。远程 SSH、WSL、云端会话不会触发反应，没有写入本地记录的网页版或云端任务也不会。
- 并非每种审批弹窗都会写入本地记录，所以"等待确认"不一定每次都能捕捉到。
- 多显示器、混合缩放下的走位和互动没有完整测试过。

如果你的记录不在默认位置，可以用环境变量指定：`AGENT_MUSUME_SESSIONS`（Codex 会话目录）、`AGENT_MUSUME_CLAUDE_HOME`、`AGENT_MUSUME_DSH_HOME`。

## 配置

大多数设置都能在设置窗口里完成。配置文件是上面那个文件夹里的 `dsh-pet/main-config.jsonc`，每次保存前会把旧文件备份为 `main-config.jsonc.previous`。保存时如果发现文件被别的程序改过，会提示重新读取，不会覆盖。

## 开发

```powershell
npm test
npm run package   # 生成 release/ 下的安装包
```

安装版里同一个程序担任三个角色，入口是 `src/app-entry.cjs`：从快捷方式打开时启动宿主；宿主是它以 Node.js 方式运行的自己（`ELECTRON_RUN_AS_NODE`）；宠物窗口也是它自己。程序文件打包在 `app.asar` 里，所以运行文件要在打包前生成。语言包只保留简繁中文和英文。安装脚本 `build/installer.nsh` 会对程序文件启用 Windows 自带的透明压缩（视频除外），占用空间少约三分之一，读出的内容不变；卸载时移除开机启动项。

代码在 `src/`。`vendor/dsh-pet/` 是上游 dsh-pet 0.3.7 的分发文件，`vendor/provenance.json` 记录了它们的校验值。程序不直接改动上游代码：`*.original.js` 保持原样，每次启动时由 `src/prepare.mjs` 用 `src/patches.mjs` 生成实际运行的文件，这些生成文件不进 git。

`test/` 里还有几个会打开真实窗口的验证脚本：

| 脚本 | 内容 | 影响 |
| --- | --- | --- |
| `interaction-verification.mjs <场景>` | 互动演出，场景有 `delegation`、`claude`、`social`、`fish`、`lf`、`df`、`launch`（需 Windows Terminal）、`relay`（`relay` 需 Windows 自带的 .NET Framework 编译本地测试进程） | 独立数据目录，不影响正在运行的桌宠 |
| `handoff-verification.mjs` | 本机事件桥、Skill 入口及跨工具派发、回传、失败的真实桌宠演出；可使用 `AGENT_MUSUME_QA_EXE` 验证打包版 | 独立配置目录，仅使用本地测试事件，不调用模型 |
| `appearance-verification.mjs` | 形象选择和切换 | 独立数据目录 |
| `source-verification.mjs` | 来源隔离和优先级 | 需要已有配置，结束时恢复 |
| `settings-verification.mjs` | 设置窗口全流程 | 会重启桌宠 |
| `lifecycle-verification.mjs` | 停止、重启和 HTTP 限制 | 会重启桌宠 |
| `live-verification.mjs` | 六种状态的实际播放 | 需要桌宠在运行 |

## 授权

本项目由代码和角色素材两部分组成，授权不同，完整说明见 [NOTICE.md](NOTICE.md)。

- **代码**：[MIT](LICENSE)。上游 dsh-pet 的代码也是 MIT，许可证保留在 `vendor/dsh-pet/LICENSE`。
- **角色素材**（`pets/`、`vendor/dsh-pet/assets/`、`src/pet-menu-avatar-*.png`）：不在 MIT 范围内，遵循 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，**禁止商用**，二创须保留署名并使用同一协议。

角色声明：

- 鲸鱼娘（蓝色大肥鱼）形象基于 B 站 [@上善无形](https://space.bilibili.com/4456176) 原创角色二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。
- 其他娘化角色（Claude大小姐、龙娘）根据 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597) 人设二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。

致谢：

- 上游项目：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)
- 鲸鱼娘（大肥鱼）：原创角色"溟月" B 站 [@上善无形](https://space.bilibili.com/4456176)，DeepSeek 女仆版 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)（[形象声明](https://www.bilibili.com/opus/1247156596114456581)）
- 龙娘：人设 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)（[人设出处](https://www.bilibili.com/opus/1236803362705375305)），参考宠物作者 [legeling](https://codexpet.top/pets/gpt-dragon-girl--legeling)
- Claude大小姐：人设 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)（[人设出处](https://www.bilibili.com/opus/1236803362705375305)）

- 气泡字体：[猫啃什锦黑](https://github.com/maoken-fonts/MaokenAssortedSans)（SIL OFL 1.1）

ChatGPT、OpenAI、Claude、Anthropic、Codex、DeepSeek 及其标志归各自所有者所有。本项目与这些公司没有任何关联，也未获得其认可。


## 参与项目

发现问题请提交 [Issue](https://github.com/zollnor/Agent-Musume/issues/new/choose)，注明系统版本、安装版本、会话来源和复现步骤。不要上传整个配置目录或原始 AI 会话记录。

欢迎提交修复、兼容性反馈和文档改进，开始前请读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题见 [SECURITY.md](SECURITY.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。

如果这些小剧场让你的桌面更有意思，欢迎点一个 Star，也欢迎分享你最喜欢的现有角色搭档。
