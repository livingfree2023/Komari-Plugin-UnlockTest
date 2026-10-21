# Komari 插件：UnlockTest (流媒体与 AI 解锁检测)

> 面向 [Komari 监控面板](https://github.com/komari-monitor) 的 VPS 节点流媒体与主流 AI 平台全景解锁检测与可视化插件。

![UnlockTest Dashboard Preview](https://raw.githubusercontent.com/livingfree2023/Komari-Plugin-UnlockTest/main/assets/preview.svg)

> **TL;DR**：一键检测并可视化全节点流媒体与主流 AI 平台的解锁状态（Netflix、Disney+、YouTube、ChatGPT、Claude、Gemini 等）。提供后台全景「解锁矩阵」双向冻结大表与前台优雅悬浮小组件，支持 IPv4/IPv6 双栈区分、多区域自适应、自由拖拽与单节点自动聚焦。

[![Release](https://img.shields.io/github/v/release/livingfree2023/Komari-Plugin-UnlockTest?color=06b6d4&label=Release)](https://github.com/livingfree2023/Komari-Plugin-UnlockTest/releases)
[![License](https://img.shields.io/badge/License-MIT-10b981.svg)](https://github.com/livingfree2023/Komari-Plugin-UnlockTest/blob/main/LICENSE)
![Komari Compatibility](https://img.shields.io/badge/Komari%20Plugin-v1.0.5%2B-38bdf8.svg)

---

## 🌟 核心功能亮点

- 📊 **全景后台「解锁矩阵」大表**：
  - **双向冻结窗格**：节点列与服务表头智能双向锁固，纵横滑动时标题始终固定对齐，百台机器也能自如浏览。
  - **动态自适应服务目录**：完全根据后台开启的检测区域智能重构表格列，无冗余空列，清爽整洁。
  - **双栈状态全景透视**：绿色高亮标注解锁区域缩写（如 `SG`、`US`、`HK`），IPv6 专有解锁自动显示 `V6` 标志，未解锁红标警示，网络状态一目了然。
  - **即时搜索与分类筛选**：支持按节点名称和分组快速检索，并提供「全部」、「跨国平台」、「AI 矩阵」、「各区域专区」一键切换。
- ⚡ **原生指令调度与智能并发保护**：
  - **官方 Agent 原生下发**：无需在节点额外安装任何常驻后台服务，直接经由 Komari 官方 Agent 通道安全下发执行。
  - **低配小鸡深度保护**：内置自适应并发控制与安全熔断机制，单核 512MB / 1GB NAT 小内存机器平稳运行，杜绝内存溢出。
  - **任务自动追踪与幂等管理**：同一时间保护单一检测任务，后台自动检测并回收结果，杜绝重复并发争抢。
- 🎯 **灵活定向探测与自动化巡检**：
  - **定向一键复检**：大表支持「⚡ 探测当前显示节点」，可配合搜索筛选框仅针对指定节点或分组即时发起并发检测，省时省流量。
  - **定时巡检 Cron 自由配置**：支持自定义定时巡检周期（默认每 6 小时自动巡检一次），全天候掌握节点解锁变动情况。
  - **配置保存自动补齐**：后台更新区域配置或新增节点时，自动在后台对无快照的在线节点发起补充检测。
- 🪟 **前台自适应悬浮小组件 (可自由拖拽)**：
  - **轻量微交互**：前台右下角常驻 48×48 极简科技感图标，点击平滑居中展开精美的流媒体与 AI 解锁卡片。
  - **自由拖拽与位置记忆**：支持触控与鼠标平滑拖拽停靠，松手后自动记忆摆放位置（本地持久化），页面刷新不跑偏。
  - **单节点详情自动聚焦**：访问实例详情页（`/instance/:uuid`）时，浮窗自动聚焦展示当前节点指标；首页则支持下拉菜单随心切换。
  - **本地品牌图标与状态展示**：优先显示随插件打包的服务品牌 SVG；无合适品牌资源时显示自绘图标或名称徽章，并明确标注仅 IPv6 解锁状态。
  - **跟随当前主题**：从宿主页面读取字体、颜色、背景、卡片和边框等样式，随明暗模式变化更新；不同主题的最终效果以实际页面为准。
  - **后台自动免打扰**：进入后台管理、解锁矩阵或终端页面时自动静默隐藏，严格仅在前台页面展示。
- 🌍 **12 大区域及主流平台全覆盖**：
  - **跨国平台 (Globe)**：Netflix, Disney+, YouTube Premium, TikTok, Spotify, Amazon Prime Video, Apple, Steam, Bilibili, Reddit, X 等。
  - **AI 矩阵平台 (AI)**：OpenAI ChatGPT, Anthropic Claude, Google Gemini, Microsoft Copilot, Perplexity AI, x.AI Grok, DeepSeek, Quora Poe, Mistral AI 等。
  - **区域特色流媒体**：全面覆盖台湾、香港、日本、韩国、北美、南美、欧洲、非洲、东南亚、大洋洲等本地特色流媒体，后台自由开关。
- 💨 **秒级开箱与零阻塞加载**：
  - 前台全部采用本地预热快照呈现，打开页面 0 毫秒瞬间加载，彻底杜绝前端卡顿与等待。

---

## 🚀 快速安装与使用

### 方式一：通过专属插件源订阅安装（推荐 · 实时获取最新版）

在 Komari 插件市场设置中添加本仓库专属的自定义插件源订阅地址（直连 GitHub `main` 分支，穿透 CDN 缓存，确保第一时间获取最新版本）：
```text
https://raw.githubusercontent.com/livingfree2023/Komari-Plugin-UnlockTest/refs/heads/main/v1.json
```

### 方式二：通过 Komari 官方插件市场安装（每 6 小时同步一次）

1. 登录您的 Komari 管理后台。
2. 导航至左侧 **插件市场 (Plugin Market)**。
3. 在搜索框中输入 **`UnlockTest`** 或 **`流媒体与 AI 解锁`**。
4. 找到插件后点击 **安装 (Install)**，系统将自动从官方市场目录拉取最新版本。
5. 安装完成后在「插件管理」中点击 **启用**，左侧菜单即会出现 **解锁矩阵** 仪表盘入口。

### 方式三：从 GitHub Releases 手动上传安装

1. 前往本仓库 [Releases 页面](https://github.com/livingfree2023/Komari-Plugin-UnlockTest/releases) 下载最新版本的 **`unlock-test.zip`**。
2. 登录您的 Komari 管理后台，进入 **插件管理 (Plugins)**。
3. 点击右上角 **上传插件**，选择下载好的 `unlock-test.zip`。
4. 上传完成后点击启用即可。

---

## ⚙️ 常用配置说明

在 Komari 管理后台「插件管理」找到本插件，点击「配置」即可轻松调整：

* **检测区域选择**：按需勾选希望测试的区域（默认已开启「跨国平台」与「AI 平台」）。
* **连接模式 (`-m`)**：支持 `0 = 自动双栈 (IPv4 + IPv6)`、`4 = 仅测试 IPv4`、`6 = 仅测试 IPv6`。
* **最大并发数 (`-conc`)**：建议保持默认 20~30，兼顾探测效率与低配 VPS 运行平稳度。
* **定时巡检 Cron**：后台自动执行检测的 Cron 表达式，默认为每 6 小时执行一次 (`0 */6 * * *`)。
* **限定探测节点**：留空表示自动探测全部在线节点，亦可手动勾选指定部分关键节点。

---

## 🛠️ 自行构建

如需对源码进行二次开发并手动打包：
```bash
chmod +x build.sh
./build.sh
```
打包脚本将自动递增末位版本号，并于 `dist/` 目录下生成 `unlock-test.zip`，同时自动同步最新 SHA-256 校验码至 `v1.json`。

图标与插件一同打包，页面运行时不向第三方图标服务发起请求。每个品牌图标的固定来源见 [图标来源清单](plugin/assets/icon-sources.csv)，授权与品牌权利说明见 [第三方图标说明](plugin/assets/THIRD_PARTY_NOTICES.txt)。浮窗按完整测试输出中的服务名称精确匹配，避免相似名称被误认成其他平台。当前的主题外观跟随工作已完成，后续不计划增加逐主题节点注入。

---

## 📄 开源许可证

本项目代码基于 [MIT License](https://github.com/livingfree2023/Komari-Plugin-UnlockTest/blob/main/LICENSE) 协议开源。随包附带的第三方品牌图标适用各自的授权和品牌使用限制，详见[第三方图标说明](plugin/assets/THIRD_PARTY_NOTICES.txt)。

---

## 💖 致谢

* [HsukqiLee/MediaUnlockTest](https://github.com/HsukqiLee/MediaUnlockTest) —— 提供强大的底层流媒体与 AI 解锁探测核心引擎。
* [Komari 监控面板](https://github.com/komari-monitor) —— 现代、优雅的服务器探针与监控生态系统。
