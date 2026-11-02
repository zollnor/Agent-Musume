# AgentMusume

**Turn your AI agents’ work into a little desktop theater.**

Windows desktop companions that react to local agent sessions. When a main agent hands work to a subagent, the characters can act out the handoff together.

[Download Windows x64 installer](https://github.com/zollnor/Agent-Musume/releases/download/v0.1.0/Agent-Musume-Setup-0.1.0.exe) · [Releases](https://github.com/zollnor/Agent-Musume/releases) · [简体中文](README.md)

![Claude lady handing a task to the dragon girl](docs/media/duet-handoff.gif)

This preview combines two synchronized animation layers shipped with the app. It is an animation demonstration, not a recording of a live model run.

| Claude lady | Dragon girl | Blue whale girl |
| :---: | :---: | :---: |
| <img src="docs/media/claude-approval.gif" alt="Claude lady giving a reserved thumbs-up after review" width="220"> | <img src="docs/media/dragon-laugh.gif" alt="Dragon girl laughing heartily" width="220"> | <img src="docs/media/fish-dance.gif" alt="Blue whale girl dancing" width="220"> |
| Review complete: a reserved thumbs-up | A hearty laugh | A maid dance |

## Three agent interactions

### The whale gives Claude a task

![The blue whale girl handing a task to the Claude lady](docs/media/duet-fish-assign.gif)

### The whale returns the results to Claude

![The blue whale girl delivering the results to the Claude lady](docs/media/duet-fish-return.gif)

### Claude and the dragon celebrate a completed turn

![The Claude lady and dragon girl celebrating together](docs/media/duet-claude-dragon-celebrate.gif)

These previews also combine synchronized animation layers from the app. The celebration corresponds to the main turn ending after a collaborative result has returned; it does not certify the success of a long-running goal.

## Install and try

Windows x64 only; developed and tested on Windows 11. Download `Agent-Musume-Setup-0.1.0.exe` from the Release, rather than the source-code archives. The installer is 340,419,585 bytes (about 340 MB / 325 MiB) and includes its runtime. You do not need Node.js, administrator rights or an API key to use the installer.

The installer is unsigned. Check the Release source and, if needed, compare its SHA-256 against `SHA256SUMS.txt` before deciding whether to run it.

After launch, three pets appear near the bottom-right corner. Right-click a pet to open settings. The tray menu also lets you demonstrate interactions without an AI tool running. Start with Windows is off by default. Uninstall through Windows Settings; configuration remains in `%APPDATA%\Agent-Musume`.

This is the first public version. Automated tests and isolated runtime checks are documented in [release validation](docs/release-validation.md). First installation, shortcuts and uninstallation on a separate clean Windows machine have not been verified in this release session.

## What reacts to what

- Sources: local ChatGPT desktop, Codex CLI, Claude Code and DeepSeek Harness records.
- States: thinking, running tools, processing results, waiting for input, turn completion and errors.
- Interaction: confirmed subagent handoff, result delivery, completion and comfort after failure; occasional idle chats.
- Everyday actions: click reactions, dragging, throwing, movement, pause and a 30-minute quiet mode.

The pets display agent activity; your existing agent tools execute the AI tasks. A completed animation means a turn has ended, not that a long-running goal has succeeded. Live interaction requires compatible local records and the correct source/helper assignments. Remote, browser-only, WSL and cloud sessions are not covered. Internal log formats may change with tool updates; multi-monitor and mixed-DPI behavior has not been fully tested.

## Privacy

The application runs locally without calling a model or uploading session content. It reads lifecycle, tool-type, process and timing metadata from local agent records to determine reactions. It does not retain prompts, model replies or tool output. Its control server binds to `127.0.0.1`, and write requests require a capability token. Do not share the entire configuration directory or raw agent-session logs.

See the [Chinese README](README.md#隐私) for the exact local directories and configuration overrides.

## Run from source

Node.js 22.15 or newer is required. In the project directory:

```powershell
npm ci
npm start
```

`npm ci` downloads the pinned Electron runtime. `npm test` prepares the generated runtime files and runs the automated checks; `npm run package` creates a Windows NSIS installer under `release/`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and licenses

Based on [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet). Code: [MIT](LICENSE). Character art, animation and derived previews: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), non-commercial and share-alike; the whole application is not licensed for unrestricted commercial use. The bundled font is SIL OFL 1.1. See [NOTICE.md](NOTICE.md).

The whale character is adapted from designs by [上善无形](https://space.bilibili.com/4456176) and [ZipZipPipe](https://space.bilibili.com/4168597); the Claude and dragon characters are based on ZipZipPipe’s designs. The dragon also references a pet by [legeling](https://codexpet.top/pets/gpt-dragon-girl--legeling). Claude and dragon animation, paired takes and the new whale side-walk are AI-generated using MiniMax H3. The previews are crops/composites of the bundled animation.

Unofficial fan project. Not affiliated with or endorsed by OpenAI, Anthropic or DeepSeek. Trademarks belong to their respective owners.
