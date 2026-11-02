# 署名与素材授权

本项目由代码和角色素材两部分组成，授权不同。

*Summary: the code is MIT. The character art and animation are not: they are fan adaptations under CC BY-NC-SA 4.0, non-commercial, and adaptations of them must use the same licence and keep the attribution below. No rights to any trademark or brand are granted.*

## 代码

- 本项目的代码使用 MIT 许可证，见 [LICENSE](LICENSE)。
- `vendor/dsh-pet/` 的代码来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，同样是 MIT 许可证，版权声明保留在 `vendor/dsh-pet/LICENSE`。本项目通过 `src/patches.mjs` 在运行时修改它。
- 安装版内含 [Electron](https://www.electronjs.org/)（MIT），许可证和 Chromium 第三方声明保留在安装目录的 `LICENSE.electron.txt`、`LICENSES.chromium.html`。本文件和 LICENSE 在安装目录的 `resources` 文件夹里。

## 角色素材

`pets/`、`vendor/dsh-pet/assets/`、`src/pet-menu-avatar-*.png` 以及由它们转换、合成的 `docs/media/` 演示 GIF 不在 MIT 范围内。其中的气泡字体单独授权，见文末[字体](#字体)。

**声明：**

- 鲸鱼娘（蓝色大肥鱼）形象基于 B 站 [@上善无形](https://space.bilibili.com/4456176) 原创角色二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。
- 其他娘化角色（Claude大小姐、龙娘）根据 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597) 人设二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。

因此：

- 禁止任何形式的商业使用。
- 二次创作须使用同一协议（[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)）。
- 分发或公开展示时，须保留本文件和下面的署名。
- 本项目不授予任何商标或品牌的额外权利。

### 蓝色大肥鱼

- 文件：`vendor/dsh-pet/assets/`、`pets/blue-fish/`、`pets/duets/*-fish.webm`、`src/pet-menu-avatar-blue-fish.png`
- 动画来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。上游声明：动画、提示词和源视频允许开源使用，禁止商用；衍生、修改或换皮的作品在公开渠道须附上原作者的 GitHub 地址。
- 形象是 DeepSeek 的社区同人形象，并非 DeepSeek 官方形象。原创角色"溟月"：B 站 [@上善无形](https://space.bilibili.com/4456176)；DeepSeek 女仆版：B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)。
- 形象协议：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，不可以任何形式商业化（[声明原文](https://www.bilibili.com/opus/1247156596114456581)）。本项目新增的动画和头像二创同协议授权。

### 龙娘

- 文件：`pets/dragon-girl-D/`、`pets/duets/*-dragon.webm`、`src/pet-menu-avatar-dragon-girl-D.png`
- 人设：B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，[人设出处](https://www.bilibili.com/opus/1236803362705375305)。
- 参考宠物作者和上传者：legeling，<https://codexpet.top/pets/gpt-dragon-girl--legeling>（标注为 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)）。
- 本项目的龙娘动画是 AI 生成的二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。
- 头饰是 ChatGPT 标志的角色化演绎。该标志归 OpenAI 所有。

### Claude大小姐

- 文件：`pets/claude-lady/`、`pets/duets/*-claude.webm`、`src/pet-menu-avatar-claude-lady.png`
- 人设：B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，[人设出处](https://www.bilibili.com/opus/1236803362705375305)。
- 参考图页面：<https://genderswapai.com/zh-CN/ai-gijinka/claude>，页面署名 ZipZipPipe。
- 本项目的大小姐动画是 AI 生成的二创，依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 非商业使用，二创同协议授权。

### AI 生成内容

Claude大小姐和龙娘的全部动画、双人动画，以及鲸鱼娘的侧身走路，都是用 MiniMax H3 生成的 AI 内容。它们由本地 MiniMax H3 图生视频生成，再经 FFmpeg 和 Python 抠像、缩放。各片段的动作描述记录在 `pets/*/manifest.json`。

This content is machine-generated. MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.

### 字体

气泡字体是[猫啃什锦黑 Lite](https://github.com/maoken-fonts/MaokenAssortedSans)，基于波間のかけひき的《にしき的フォント》，版权归 ZERO子 和 Umihotaru 所有，使用 [SIL Open Font License 1.1](https://openfontlicense.org)，不适用上面的 CC BY-NC-SA 4.0。协议全文在 `vendor/dsh-pet/assets/fonts/OFL-MaokenAssortedSans.txt`。上游原本使用的字体因不允许再分发，已从本项目移除。

## 商标

ChatGPT、OpenAI、Claude、Anthropic、Codex、DeepSeek 及其标志归各自所有者所有。本项目是非官方同人作品，与这些公司没有任何关联，也未获得其认可或背书。
