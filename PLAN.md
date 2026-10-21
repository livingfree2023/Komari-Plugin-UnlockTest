# UnlockTest 维护状态与交接记录

> 更新：2026-10-21（America/Los_Angeles）
> 当前状态：v26.1021.1 测试包已构建；前台浮窗完成对齐 NetForecast 的 Anchor 弹出、按钮常驻与前台尺寸拉伸记忆功能。

## 已确定的产品范围

- 保留现有浮窗和后台解锁矩阵。浮窗从宿主页面计算样式，跟随背景、卡片、边框、字体和明暗模式；用户已确认实际测试效果，无进一步逐主题适配计划。
- 浮窗弹出机制彻底对齐 NetForecast：展开时不隐藏 48px 小按钮，并以小按钮为 Anchor 计算弹出位置（水平自适应对齐，垂直按上下半屏智能弹出）。
- 浮窗支持前台自由拉伸调整尺寸（支持右下角手柄与原生拖拽），并在 localStorage 中持久化记忆尺寸与小按钮位置。
- 不做节点卡片注入，不删除浮窗；原因是不同主题缺少统一可靠的节点 UUID 锚点。
- 浮窗固定中文，不恢复导入导出、语言切换和分协议栈切换入口。
- 图标优先使用打包在插件内的品牌 SVG；找不到可核对来源的资源时使用自绘 SVG 或名称徽章。图标来源与授权文件随安装包交付。

## 当前实现与验证

| 项目 | 状态 | 证据与下一步 |
| --- | --- | --- |
| 浮窗 Anchor 弹出与小按钮解耦 | 已完成 | `plugin/assets/widget.js`、`plugin/assets/widget.css`；展开时不隐藏 48px 小按钮，以按钮为 anchor 动态计算位置 |
| 浮窗大小前台调整与记忆 | 已完成 | `plugin/assets/widget.js`、`plugin/assets/widget.css`；支持手柄/原生拖拽并持久化至 `prefs.cardSize` |
| 主题外观跟随 | 已完成，用户实测通过 | `plugin/assets/widget.js`、`plugin/assets/widget.css`；停止新增主题适配工作 |
| 精确服务名映射 | 已完成，用户验收通过 | `plugin/assets/logos.js`；避免相似名称误配 |
| 本地品牌图标 | 已完成，用户验收通过 | `plugin/assets/brand-icons.js`；来源见 `plugin/assets/icon-sources.csv`，许可见 `plugin/assets/THIRD_PARTY_NOTICES.txt` |
| 完整服务清单回归 | 已通过 | 从用户完整输出仅提取 163 个不同服务名，存于 `tests/fixtures/service-names.json`；不保存节点地址或检测结果 |
| 仓库清理 | 已完成 | 已删除停止的主题研究资料与未采用原型，保留 `agent.md`、`agent_general.md` 本地忽略文件 |
| 本地测试安装包 | 已生成 | `v26.1021.1`，生成于 `dist/unlock-test.zip`；清单与 `v1.json` SHA-256 对齐 |

## 后续交接

1. [v26.1020.7 Release](https://github.com/livingfree2023/Komari-Plugin-UnlockTest/releases/tag/v26.1020.7) 已发布，双语说明和 `unlock-test.zip` 附件齐全；自动发布流程成功，`v1.json` 已由发布机器人更新。官方包 SHA-256 为 `19a018aa5a5e6cb5bbce1d5b197f7e7261d17a406bc4f47cee4c245b2a5b0bbf`。
2. 后续若有具体误配或低对比图标，记录服务名与截图，修复后重新构建递增版本。

## 验证记录

- `node --test tests/probe.test.js tests/logos.test.js`：34 项通过。163 个不同服务名中，57 个映射到 49 个打包品牌资源，8 个使用特定自绘 SVG，98 个使用名称徽章。
- 全部 `plugin/` 与 `tests/` JavaScript 语法检查、49 个 SVG XML 与本地引用检查、`git diff --check` 通过。
- `tests/widget-browser.cjs` 未在本机运行：缺少 Playwright 包；用户已确认 26.1020.7 测试包在实际 Komari 上的效果。

## 交接注意

- `RELEASE_NOTES.md` 记录 v26.1020.7 正式发布说明；未来本地测试版本不要覆盖它。
- `dist/`、根目录原始 `agent.md` 和 `agent_general.md` 被 Git 忽略。不得将测试输出中的 IP、节点资料或完整探测结果提交到仓库。
- 图标资源已内联为本地脚本，无运行时第三方图标请求；新增图标时同时补充来源、固定版本、授权说明和服务名测试。
