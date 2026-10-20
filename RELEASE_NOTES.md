## 🇨🇳 中文更新日志 (Changelog - zh_CN)

### 🚀 v26.1020.2
#### 🎨 视觉与文档重构 (Visual & Documentation Redesign)
- **全新海报与 README 架构重构**：
  - 重新设计了 `assets/preview.svg` 海报大图，左侧突出展示 4 大核心亮点卡片（全景解锁矩阵大表、纯 Native 指令下发与并发保护、动态定向探测与状态感知、前台悬浮小组件），移除非必要底部文本。
  - 彻底重构面向终端用户的 `README.md`，移除低层技术细节，新增标准 MIT License 许可证。
- **严格限制悬浮小组件仅在前台页面展示**：
  - 增强 `isAllowedFrontendRoute` 路由校验，处于 iframe 内或访问任何后台路径（`/admin`、`/terminal`、`matrix.html`、`preview.html`、`public.html`、`admin.html`、`/login`、`/settings` 等）时严格静默隐藏。
  - 仅限在首页（`/`）与实例详情页（`/instance/:id`）展示，彻底消除在管理后台、解锁矩阵页面误显小组件的问题。
  - 增加 `popstate` / `hashchange` 事件监听与 500ms 周期巡检，单页应用动态路由跳转时瞬间隐藏。
- **版本规范与打包自动递增**：
  - 沿用 `YY.MMDD.Patch`（如 `26.1020.2`）版本命名规范。
  - `build.sh` 脚本在每次本地打包时自动递增末位版本号，并同步更新 `plugin/komari-plugin.json` 与 `v1.json`（自动计算 SHA-256 与下载链接）。
- **工程目录精简**：
  - 清理 `tools/` 目录下已不再需要的临时调试与上传脚本，保障代码整洁。

### v26.1020.1 (Previous)

### 🚀 新增功能与矩阵大表 (Features & Unlock Matrix)
- **后台全景大表「解锁矩阵」(Unlock Matrix Dashboard)**：
  - 新增管理后台专属页面 `pages/matrix.html`（通过 `komari-plugin.json` 的 `pages` 机制无缝挂载）。
  - **双向冻结窗格**：首列固定展示 VPS 节点（国旗、节点名、分组），表头固定展示各项流媒体与 AI 服务。
  - **Region 动态自适应列构建**：自动同步用户在插件配置中开启的 Region 列表（`0 跨国`、`11 AI`、`1 台湾`、`2 香港`、`3 日本`、`5 北美` 等）。仅为开启的 Region 生成服务列，未开启的 Region 不生成空白或误报列。
  - **精准状态四态区分**：
    - IPv4 解锁成功：深绿微光徽章展示地区缩写（如 `SG`、`HK`、`US`）。
    - 仅 IPv6 解锁成功：青蓝微光徽章展示 `V6 ` + 地区缩写（如 `V6 SG`、`V6 US`）。
    - 明确测试未解锁：展示低饱和度红底 `❌`。
    - 未测试 / 跳过：展示中性灰短横线 ` - `（`cell-badge untested`），彻底规避将“未开启 Region”误判为“解锁失败”。
  - **定向并发探测与动态搜索**：实时搜索过滤节点，右上角「⚡ 探测当前显示节点 (N)」动态感知过滤节点数，支持仅针对当前显示的节点下发并发探测。
- **首页悬浮卡片一键直达矩阵**：
  - 在前台可拖拽浮层操作栏中新增「📊 解锁矩阵」跳转按钮，支持新标签页一键打开全景大表。

### ⚡ 核心架构与高可用防护 (Architecture & Robustness)
- **纯 Native 探测架构回归与死锁熔断**：
  - 彻底解耦第三方回调，通过 Komari 官方 Agent RPC 命令下发执行。
  - 支持 `force: true` 抢占式终止历史卡死任务与超时自愈熔断机制。
- **NAT 小内存 VPS 保护 (Low-RAM VPS OOM Shield)**：
  - 探测脚本自动读取 `/proc/meminfo`，在内存小于 360MB 时自适应将并发降低为 5 协程并限制 `GOMAXPROCS=1`，彻底杜绝 Linux OOM Killer (Exit 137) 导致的节点掉线。
- **旧版二进制兼容性检测 (Binary Compatibility Check)**：
  - 在 VPS 本地复用既有二进制前，自动校验是否支持 `-region` 参数，防止旧版参数不识别引发 Exit 2。
- **Web SSH 禁用探测与告警 (Web SSH Disabled Detection)**：
  - 结合 `admin:getAgentStartupConfig` 自动感知节点 `--disable-web-ssh` 启动状态，在面板和调试日志中提供明确的配置告警。

---

## 🇬🇧 English Changelog (en)

### 🚀 v26.1020.2
#### 🎨 Visual & Documentation Redesign
- **Poster & Documentation Redesign**:
  - Re-architected `assets/preview.svg` poster layout to prominently feature 4 core highlight cards (Full Unlock Matrix, Pure Native Dispatch with OOM Shield, Dynamic Targeted Probing, Draggable Floating Widget) and removed redundant footer text.
  - Completely rewrote user-facing `README.md` to focus on user experience and added the standard MIT License.
- **Strict Route Isolation for Floating Widget**:
  - Enhanced route detection logic (`isAllowedFrontendRoute`) to strictly hide the floating widget inside iframes or on any management/subpages (`/admin`, `/terminal`, `matrix.html`, `preview.html`, `public.html`, `admin.html`, `/login`, `/settings`).
  - The widget now exclusively displays on the frontend home page (`/`) and instance detail pages (`/instance/:id`), eliminating visual interference on admin or matrix views.
  - Integrated `popstate` / `hashchange` listeners and a 500ms safety poll to guarantee instant hiding upon client-side SPA navigation.
- **Standardized Versioning & Automated Local Increments**:
  - Standardized on `YY.MMDD.Patch` (e.g. `26.1020.2`) version format.
  - `build.sh` automatically increments the patch number upon each local build, synchronizing `plugin/komari-plugin.json` and `v1.json` with updated SHA-256 hashes and download URLs.
- **Project Structure Cleanup**:
  - Cleaned up obsolete debug and upload scripts in the `tools/` directory.

### v26.1020.1 (Previous)

### 🚀 Features & Unlock Matrix Dashboard
- **Admin Unlock Matrix Dashboard (`pages/matrix.html`)**:
  - Seamlessly injected into Komari's admin navigation via `komari-plugin.json`'s `pages` declaration.
  - **Bi-Directional Sticky Layout**: Left column pins VPS nodes (flag, node name, group tags); top header pins streaming and AI platform columns.
  - **Region-Aware Dynamic Columns**: Automatically respects regions configured by the administrator (`0 Globe`, `11 AI`, `1 Taiwan`, `2 Hong Kong`, `3 Japan`, `5 North America`, etc.). Only configured regions render as columns, preventing misleading empty columns.
  - **Four-State Visual Distinction**:
    - IPv4 Unlocked: Glowing green badge with region code (e.g. `SG`, `HK`, `US`).
    - IPv6 Only Unlocked: Glowing cyan badge with `V6 ` prefix (e.g. `V6 SG`, `V6 US`).
    - Explicitly Locked: Subdued red `❌` badge.
    - Untested / Skipped: Neutral muted dash ` - ` (`cell-badge untested`), preventing unmonitored services from being mislabeled as failures.
  - **Targeted Concurrent Probing & Live Search**: Filter nodes instantly with real-time count sync on the "⚡ Probe Visible Nodes (N)" action button.
- **One-Click Matrix Access from Floating Widget**:
  - Added a "📊 Unlock Matrix" header button in the draggable homepage overlay for instantaneous access.

### ⚡ Core Architecture & Reliability Shields
- **Pure Native Execution & Preemptive Cancellation**:
  - Fully standardized on Komari's native agent command dispatch with automatic timeout isolation and preemptive task cancellation (`force: true`).
- **Low-Memory NAT VPS Protection (OOM Shield)**:
  - Dynamically throttles concurrency to 5 and sets `GOMAXPROCS=1` for servers with `<360MB` RAM, completely eliminating Linux OOM Killer (Exit 137) crashes.
- **Legacy Binary Compatibility Verification**:
  - Inspects existing `/usr/bin/unlock-test` binaries for `-region` support before reuse, avoiding command syntax failures (Exit 2).
- **Web SSH Disabled Detection**:
  - Automatically queries `admin:getAgentStartupConfig` to detect `--disable-web-ssh` status and presents contextual warning banners.
