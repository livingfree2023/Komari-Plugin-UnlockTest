# Komari Plugin: Media & AI Unlock Test (`unlock-test`)

![Media & AI Unlock Test Preview](https://raw.githubusercontent.com/livingfree2023/Komari-Plugin-UnlockTest/main/assets/preview.svg)

基于 [HsukqiLee/MediaUnlockTest](https://github.com/HsukqiLee/MediaUnlockTest) 的 Komari 流媒体与 AI 解锁检测插件。通过 `server.injectHTML` 在 Komari 首页注入可拖动浮层展示各服务 Logo、可解锁绿框 / 未解锁红框及底部区域缩写，并提供原生 `configuration` 托管配置面板勾选检测区域（`-region`）。

## 核心特性

1. **按区域勾选配置（默认勾选 `0` 跨国平台与 `11` AI 平台）**：
   - 采用 Komari 原生 `configuration`（`managed`）托管表单，覆盖 `MediaUnlockTest` 的全部 12 个区域开关（`0: Globe`、`1: Taiwan`、`2: HongKong`、`3: Japan`、`4: Korea`、`5: NorthAmerica`、`6: SouthAmerica`、`7: Europe`、`8: Africa`、`9: SouthEastAsia`、`10: Oceania`、`11: AI`）。
   - 支持配置连接模式 `-m`（`0` 自动双栈、`4` 仅 IPv4、`6` 仅 IPv6）、最大并发数 `-conc`、定时 Cron 表达式与指定探测节点。
2. **读写彻底分离（Read/Write Separation）**：
   - **后台写路径**：通过 `server.cron` 或管理员触发，经 `server.call("admin:exec")` 向在线 VPS 下发非交互式 `unlock-test` 命令（若节点未安装则自动拉取对应架构二进制），轮询 `admin:getTaskById` 解析真实输出后持久化至 `__storageDir__/snapshot.json`。
   - **前台读路径**：`GET /api/plugin/unlock-test/snapshot` 直接读取预热内存/磁盘快照，毫秒级响应，零外部请求阻塞。
3. **首页可拖动浮层与节点下拉同步（`PageNodeSync`）**：
   - **分组/搜索筛选同步**：当用户在 Komari 首页切换分组或搜索筛选（如 10 个节点仅显示 3 个）时，浮层下拉菜单实时收敛为仅包含当前页面可见的节点。
   - **单节点详情页自动锁定**：当用户点开单个 VPS 详情页（如 `/instance/<uuid>`）时，浮层下拉菜单自动选中当前节点。
   - **双栈视图切换与本地备份**：支持 `ALL / IPv4 / IPv6` 切换、自由拖拽定位（`localStorage` 持久化）、JSON 配置一键导出/导入恢复、中英双语切换（`zh-CN` / `en`）与 About 归属弹窗。

## 目录结构

```text
.
├── PLAN.md                     # 生产级开发计划与架构设计文档
├── build.sh                    # 插件 ZIP 打包脚本 (输出至 dist/unlock-test.zip)
├── prototype/
│   └── index.html              # Phase 1 交互式静态原型
└── plugin/                     # Komari 插件源码根目录
    ├── komari-plugin.json      # 插件清单与 managed configuration 定义
    ├── script.js               # 插件入口 (路由、RPC、Cron、HTML 注入)
    ├── lib/
    │   ├── parser.js           # MediaUnlockTest CLI ANSI 输出解析器
    │   └── probe.js            # 后台探测调度与 __storageDir__/snapshot.json 管理
    └── assets/
        ├── logos.js            # 流媒体与 AI 平台矢量 SVG 图标库
        ├── widget.css          # 高对比度终端风浮层样式 (正文 >= 16px)
        └── widget.js           # 可拖动浮层与 PageNodeSync 页面节点同步引擎
```

## 构建与安装

```bash
chmod +x build.sh
./build.sh
```

构建完成后，将生成的 `dist/unlock-test.zip` 在 Komari 管理后台「插件管理」中上传并启用（批准所需权限：`allowRoutes`、`allowSystemRPC`、`allowHTMLInject`）。

## 任务恢复与诊断

- 同一时间只运行一个探测任务；重复点击会返回当前任务，不会取消旧任务的结果轮询。
- 插件重载后继续查询已保存的任务，包括日志补取任务，不重新执行检测程序。
- 每次探测在节点建立独立的 `/tmp/km-unlock-<runId>/`，保存 `result.log` 和真实退出状态 `exit`。旧版本的 `/tmp/km-unlock-result.log` 不用于自动补取，以免误读旧结果。
- 正常结果通过 Komari Agent 的任务上报接收。等待 5 分钟仍缺少结果时，插件仅对缺失节点下发一次日志读取命令，再等待最多 1 分钟。若仍收不到，记录节点失败并提示检查 Agent 日志里的 `Failed to upload task result`。补取仍依赖 Agent 的上报链路，不能绕过持续的网络或认证故障。
- 节点具备 `timeout` 命令时，检测进程限制为 240 秒，超限后先终止、再强制结束；未提供该命令的系统仍受插件侧等待期限约束，但不保证远程进程已退出。
- 本次失败保留该节点上次结果，并标记更新失败；空结果、查询错误、HTTP 错误不会伪装成首次探测等待。
- 按配置注册 Cron。手动探测与 `/debug` 仅接受 Komari 已验证的管理员身份，不能仅凭 Bearer 请求头获得权限。
- 仅支持具备 POSIX Shell 的节点；Windows Agent 使用 PowerShell，当前插件未实现其命令适配。日志目录保留供排障，可在不再需要时由管理员清理。临时下载的检测二进制在执行结束后移除。

## 本地验证

```bash
node --test tests/probe.test.js
```

回归测试使用隔离的 RPC/时钟替身，不访问线上节点。检测输出样本取自实际 SGOCI 输出，IP 已替换为文档地址。覆盖输出解析、任务恢复、重复触发、部分/缺失结果、一次性日志补取、权限与前端错误展示；Shell 测试按 Agent 的 `sh -s` 执行方式验证输出和退出码。

安装新包并刷新首页后，旧版本未完成任务会被重新查询；若旧任务无法回收，将显示失败。此时可手动发起一次新的探测，新任务才具备独立日志补取能力。

## 作者与致谢

- **解锁检测引擎**：[HsukqiLee/MediaUnlockTest](https://github.com/HsukqiLee/MediaUnlockTest)
- **插件开发准则与规范**：[Komari 插件开发文档](https://komari-document.pages.dev/dev/plugin/)
- **Author**：`livingfree2023@outlook.com`
