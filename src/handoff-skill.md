---
name: agent-musume-handoff
description: 在 ChatGPT、Codex、Claude Code、DSH 中把实际任务交给另一个 harness、CLI 或已打开会话时，让 AgentMusume 桌宠跟随交接和回传。仅用于真实跨工具派任务。
---

# AgentMusume 跨工具交接

<!-- agent-musume-managed-handoff:v1 -->

对用户已授权的跨 harness 工作，在原来的派发流程中上报少量交接元数据。桌宠不可用时继续原任务；本技能不授权启动其他模型、提交、发布或对外发送。

当前 harness 的来源编号：ChatGPT 桌面版 `chatgpt-desktop`；独立 Codex CLI `codex-cli`；Claude Code `claude-code`；DSH `dsh-desktop`。从运行环境确定来源，不能因为底层共用 Codex 引擎就把 ChatGPT 桌面版标成 Codex CLI。

本机入口：`__LAUNCHER__`。在 PowerShell 中使用 `& '完整入口路径' ...`。不用读取桌宠 runtime.json、令牌或真实会话正文。

## 启动新 CLI

将已经确定、且已获授权的实际命令放到入口的 `run --from 来源 --to 目标 --command 程序 参数...` 后面。例如把原来的 Claude CLI 调用包在 `run --from chatgpt-desktop --to claude-code --command claude.exe -p ...` 中。使用 `--command`，不要用 PowerShell 调用脚本时会吞掉的裸 `--`。保持原命令的 cwd、输入输出和权限边界；不要新增 shell=true，不为演示而调用模型。

`run` 仅用于 Claude Code / Codex CLI 的一次性任务（例如 Claude 的 `-p`、Codex 的 `exec`），不得用它包裹打开交互终端、启动桌面程序、发起后台任务后立即返回的启动器或仅做版本/帮助查询。入口在子进程确认启动后上报派发，并在退出时按实际退出码上报回传或失败；不要重复手动上报。Windows `.cmd` 不是原生可执行文件，调用 Codex 时使用其实际 exe，或明确调用现有 `cmd.exe /d /c` 启动器并保持正确引号。

## 向已经打开的终端、桌面会话或其他会话派任务

1. 先完成原本的派发操作，并确认目标已接受任务。仅打开窗口、准备提示词、读文件或切换模型不算派发。
2. 调用 `started --from 来源 --to 目标`；保存其返回的随机 `id`。不要把真实会话 ID、提示词、文件内容或凭证用作 id。
3. 等待目标实际完成并把结果交还当前 harness 后，调用 `delivered --from 同一来源 --to 同一目标 --id 原id`。
4. 确认失败用 `failed`；用户取消或结果未知时用 `cancelled`。空闲、超时或进程消失不证明成功。不确定是否完成就保留待处理，不提前报告回传。

每次独立派发使用不同 id；重试上报同一次事件沿用 id。两个工具各自运行不构成交接，同一 harness 内部的子 Agent 由既有监听处理，不再上报跨工具事件。

入口只接收来源、目标、状态和随机任务标识。不要把任务内容、工具输出、API Key、Cookie 或截图传入上报事件。
