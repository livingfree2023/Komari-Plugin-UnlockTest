# Technical Specification: Komari-Plugin-UnlockTest

> **版本**：`26.1020.2`  
> **状态**：`Production / Maintained`  
> **单一真实源说明**：本文档为 `Komari-Plugin-UnlockTest` 的项目技术架构规格书（Specification）。记录系统拓扑、模块职责、数据模型、接口定义、状态机与安全防护规范。任何对核心逻辑、接口或数据结构的修改必须在此文档中同步更新。

---

## 1. 系统架构与拓扑 (System Architecture)

本项目作为面向 [Komari 监控面板](https://github.com/komari-monitor) 的流媒体与 AI 解锁检测扩展，采用**纯 Native 读写分离架构**：

```mermaid
graph TD
    subgraph Komari Server (Goja JS Runtime)
        PluginScript[plugin/script.js] --> ProbeScheduler[lib/probe.js]
        ProbeScheduler --> OutputParser[lib/parser.js]
        ProbeScheduler --> SnapshotStorage[__storageDir__/snapshot.json]
        PluginScript --> HTTPRoutes[HTTP API Endpoints]
        PluginScript --> HTMLInject[server.injectHTML: Widget]
    end

    subgraph Client Browsers
        Widget[Frontend Floating Widget] -->|GET /snapshot| HTTPRoutes
        Matrix[Admin Unlock Matrix] -->|GET /snapshot| HTTPRoutes
        Matrix -->|POST /probe (Targeted)| HTTPRoutes
    end

    subgraph Monitored VPS Nodes (Komari Agent)
        CoreRPC[admin:dispatchCommand] --> AgentExec[Komari Agent Native Exec]
        AgentExec --> MUTBinary[MediaUnlockTest Binary]
        MUTBinary -->|Exit Code & Logs| AgentExec
        AgentExec -->|admin:getTaskById / Task Result| ProbeScheduler
    end

    HTTPRoutes --> SnapshotStorage
```

### 核心拓扑原则
1. **零外部回调**：下发与回收均通过 Komari 官方 Agent RPC 通道（`admin:dispatchCommand`）完成，节点无须监听外部端口或额外常驻守护进程。
2. **读写分离与零阻塞**：
   - **读路径（Read Path）**：所有前台小组件与后台大表仅从服务端内存/磁盘快照读取数据（耗时 `<1ms`），任何前台请求严禁触发远程探测。
   - **写路径（Write Path）**：仅由后台定时任务（Cron）或管理员主动下发触发，异步执行、熔断保护，并将结果回写至快照。

---

## 2. 模块结构与职责划分 (Directory & Module Manifest)

```text
Komari-Plugin-UnlockTest/
├── plugin/                          # 插件核心包 (分发归档根目录)
│   ├── komari-plugin.json           # 插件清单 (权限、managed 配置项、admin 页面)
│   ├── script.js                    # 插件运行时入口 (路由挂载、Cron 注册、HTML 注入)
│   ├── lib/
│   │   ├── probe.js                 # 核心调度器 (任务生命周期、并发限流、快照持久化)
│   │   └── parser.js                # ANSI 终端输出解析引擎 (解析双栈解锁状态与地区)
│   ├── assets/
│   │   ├── widget.js                # 前台悬浮小组件逻辑 (拖拽、路由隔离、PageNodeSync)
│   │   ├── widget.css               # 悬浮组件高对比度暗黑终端风样式表
│   │   └── logos.js                 # 各平台高清矢量 SVG Logo 图标映射库
│   └── pages/
│       └── matrix.html              # 管理后台专属大表「解锁矩阵」(双向冻结窗格、实时过滤)
├── assets/
│   └── preview.svg                  # 官方宣传海报矢量图 (4 大核心亮点卡片、3D 透视大表)
├── dist/
│   └── unlock-test.zip              # 本地打包输出产物
├── .github/workflows/
│   └── release.yml                  # 自动化发版流水线 (自动构建、Release 发布、回写 SHA-256)
├── build.sh                         # 本地构建打包脚本 (YY.MMDD.Patch 自增与元数据同步)
├── agent.md                         # 本项目专属开发避坑指南与发布红线
├── agent_general.md                 # 全局通用只读工程原则与架构审美
├── specification.md                 # 本技术架构规格说明书 (Single Source of Truth)
├── README.md                        # 面向终端用户与运维的产品说明书
├── LICENSE                          # MIT 开源许可证文件
└── v1.json                          # Komari 插件市场元数据索引 (下载链接与 SHA-256)
```

---

## 3. 数据模型与快照存储规范 (Data Models & Storage Schema)

快照持久化于 Komari 运行时提供的专属目录：`__storageDir__/snapshot.json`。

### 3.1 根数据结构 (Root Snapshot Schema)

```typescript
interface UnlockSnapshot {
  updated_at: string;           // ISO 8601 时间戳，例如 "2026-10-20T12:00:00.000Z"
  activeTask?: {                // 当前正在运行的任务元数据 (无活跃任务时为 null)
    taskId: string;             // 任务唯一标识 (UUID)
    startTime: number;          // 任务启动 Unix 时间戳 (ms)
    totalNodes: number;         // 待探测节点总数
    completedNodes: number;     // 已完成节点数
  } | null;
  nodes: {                      // 节点检测结果哈希表 (Key: 节点 UUID)
    [nodeUuid: string]: NodeUnlockRecord;
  };
}
```

### 3.2 单节点检测记录 (NodeUnlockRecord)

```typescript
interface NodeUnlockRecord {
  uuid: string;                 // 节点唯一 UUID
  name: string;                 // 节点显示名称
  tags?: string[];              // 节点标签分组
  timestamp: number;            // 探测完成 Unix 时间戳 (ms)
  exitCode: number;             // 探测程序退出码 (0: 正常, 137: OOM, 124: 超时)
  webSshDisabled?: boolean;     // 节点是否启用了 --disable-web-ssh
  error?: string | null;        // 错误提示文本 (如有)
  rawOutputSnippet?: string;    // 截取的原始终端输出 (排障用，最大 1024 字符)
  services: ServiceStatus[];    // 解析出的各服务解锁状态列表
}
```

### 3.3 服务状态四态定义 (ServiceStatus)

```typescript
interface ServiceStatus {
  id: string;                   // 规范化服务标识 (例如 "netflix", "chatgpt")
  name: string;                 // 原始服务名称 (例如 "Netflix", "ChatGPT")
  displayName: string;          // 展示名称
  region?: string;              // 解锁地区代码 (大写两位国家/地区码，例如 "SG", "US", "HK")
  unlocked: boolean;            // 是否解锁 (综合判据: unlockedV4 || unlockedV6)
  unlockedV4: boolean;          // IPv4 是否解锁
  unlockedV6: boolean;          // IPv6 是否解锁
  dualStackStatus: "v4" | "v6" | "dual" | "none" | "untested";
}
```

---

## 4. API 路由与核心 RPC 规范 (APIs & RPC Integration)

所有 HTTP 接口挂载于 `/api/plugin/unlock-test/*` 前缀下，必须显式调用 `res.end()` 发送响应。

### 4.1 HTTP API 规范

| 方法 | 路径 | 鉴权要求 | 说明 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/plugin/unlock-test/snapshot` | Public / Role Check | 读取预热快照。响应前结合 `admin:listClients` 核查节点权限，耗时 `<1ms`。 |
| `POST` | `/api/plugin/unlock-test/probe` | Admin 专属 | 触发探测任务。支持载荷 `{"clients": ["uuid1", ...], "force": false}`。 |
| `GET` | `/api/plugin/unlock-test/debug` | Admin 专属 | 输出当前调度器内存状态、运行锁及诊断信息。 |
| `GET` | `/api/plugin/unlock-test/pages/*` | Static | 静态托管 `pages/` 目录（如 `matrix.html`）。 |
| `GET` | `/api/plugin/unlock-test/assets/*` | Static | 静态托管 `assets/` 目录（JS、CSS、Logos）。 |

### 4.2 Komari 核心 RPC 交互协议

1. **`admin:listClients`**：
   - 用于获取当前所有在线 VPS 节点的实时列表（UUID、名称、分组、IP、连线状态）。
2. **`admin:getAgentStartupConfig`**：
   - 检查节点 Agent 启动参数，识别是否包含 `--disable-web-ssh` 标志。
3. **`admin:dispatchCommand`**：
   - 向指定 VPS 节点下发非交互式 Shell 执行指令，返回异步 `taskId`。
4. **`admin:getTaskById`**：
   - 轮询已下发指令的执行状态（`running`、`success`、`failed`）并回收标准输出/退出码。

---

## 5. 探测生命周期与状态机 (Execution Lifecycle)

```
[Trigger (Cron / Manual)]
         │
         ▼
[Lock Check (Single Flight)] ──(Already Active & !force)──> [Reuse Active Task]
         │
         ▼ (Acquire Lock)
[Resolve Target Nodes (Filter Online & Enabled)]
         │
         ▼
[Dispatch Shell via admin:dispatchCommand]
  ├─ OOM Shield: Check RAM < 360MB -> GOMAXPROCS=1, CONC=5
  ├─ Binary Verification: Check -region support
  └─ Timeout Wrap: timeout 240s
         │
         ▼
[Poll admin:getTaskById (Every 2~4s)]
  ├─ Finished -> Pass raw stdout to lib/parser.js
  ├─ Timeout (5m) -> One-shot fallback log fetch (/tmp/km-unlock-<runId>/)
  └─ Aborted -> Retain previous snapshot, record error
         │
         ▼
[Atomic Snapshot Write-back (__storageDir__/snapshot.json)]
         │
         ▼
[Release Lock & Emit Idle]
```

---

## 6. 节点保护与运行时安全屏障 (Safety Shields)

1. **小内存 VPS 防 OOM 熔断器 (Low-RAM OOM Shield)**：
   - 探测脚本执行前通过 `/proc/meminfo` 提取物理内存。
   - 物理内存 `< 360MB` 时：强制设置 `export GOMAXPROCS=1` 并将检测并发上限降为 `5`。
   - 彻底规避 NAT 小鸡因并发协程过多触发 Linux OOM Killer（Exit 137）。
2. **二进制版本自适应 (Legacy Binary Compatibility)**：
   - 复用本地既有 `/usr/bin/unlock-test` 前，先以 `-h` 探测是否支持 `-region` 参数。
   - 若不支持则安全回退至标准全量探测或自动拉取兼容构建，防止命令语法报错（Exit 2）。
3. **任务抢占与僵死自愈 (Preemptive Task Healing)**：
   - 支持 `force: true` 强制中断超时未响应的挂死任务，向远端下发清理信号并释放服务端运行锁。
4. **Goja 引擎 CommonJS 强约束**：
   - 所有库模块（`lib/`）严格采用 `module.exports` 规范，杜绝 ES6 `export` 语法。

---

## 7. 前端架构与路由隔离规范 (Frontend Architecture)

### 7.1 前台悬浮小组件 (`assets/widget.js`)
* **视觉呈现**：
  * 常驻状态：48×48 正方形极简悬浮微图标，绿色外边框，支持边缘磁吸拖拽与 `localStorage` 位置记忆。
  * 展开状态：居中 50% 视口弹窗，提供 `ALL / IPv4 / IPv6` 双栈切换，展示高清矢量 Logo 与解锁状态光圈。
* **单节点聚焦 (PageNodeSync)**：
  * 访问 `/instance/:uuid` 时，自动识别路由中的节点 UUID 并锁定下拉框选中项。
* **严格前台路由隔离 (Strict Route Isolation)**：
  * 处于 iframe（`window.self !== window.top`）、管理后台（`/admin`）、控制台（`/terminal`）、矩阵大表（`matrix.html`）、公开看板（`preview.html`、`public.html`、`admin.html`）、登录认证（`/login`、`/auth`）或设置（`/settings`）中，小组件**绝对不予渲染/强制隐藏**。
  * 仅限在前台首页（`/`）与实例详情页（`/instance/:id`）显示。
  * 监听 `popstate`、`hashchange` 并结合 500ms 周期巡检，SPA 页面路由变动瞬间隐退。

### 7.2 后台全景解锁矩阵大表 (`pages/matrix.html`)
* **双向冻结窗格**：首列固定（Sticky Left）展示 VPS 节点信息；表头固定（Sticky Top）展示各服务分类与名称。
* **Region 动态自适应列渲染**：
  * 读取服务端真实快照中的活跃服务集合，仅渲染用户在后台配置中开启的 Region 对应服务列。
  * 未勾选的 Region 绝不渲染多余空列，界面紧凑高效。
* **四态视觉规范**：
  * IPv4 解锁：深绿微光徽章展示大写区域码（如 `SG`, `US`）。
  * 仅 IPv6 解锁：青蓝微光徽章展示 `V6 ` 前缀（如 `V6 SG`, `V6 US`）。
  * 明确测试未解锁：红底 `❌`。
  * 未测试/已跳过：中性灰短横线 ` - `（`cell-badge untested`），禁止将未测项误显为未解锁。
* **定向并发探测**：
  * 支持右上角「⚡ 探测当前显示节点」，联动搜索框仅对当前过滤匹配出的节点即时发起探测。

---

## 8. 构建、版本控制与 CI/CD 规范 (Build & Versioning)

1. **版本命名规范**：
   - 统一遵循 `YY.MMDD.Patch` 格式（如 `26.1020.2`）。
   - Git Tag 统一附加 `v` 前缀（如 `v26.1020.2`）。
2. **自动化本地构建 (`build.sh`)**：
   - 每次执行 `./build.sh` 自动提取当前日期 `YY.MMDD.`；
   - 若与既有版本同日则自动递增末位 Patch，不同日则重置为 `.1`；
   - 自动打包生成 `dist/unlock-test.zip`；
   - 自动计算最新包的 SHA-256，同步写回 `plugin/komari-plugin.json` 与根目录 `v1.json`。
3. **GitHub Actions 自动化流水线 (`.github/workflows/release.yml`)**：
   - 仅在推送 `v*` 格式的 Git Tag 时触发；
   - 自动拉取代码并打包标准 ZIP 发行包；
   - 自动提取 `RELEASE_NOTES.md` 作为 Release 正文发布至 GitHub Releases；
   - 自动计算真实 SHA-256 并由 Bot 提交更新 `v1.json` 至 `main` 分支。
