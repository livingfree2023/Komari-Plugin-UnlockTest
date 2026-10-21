# UnlockTest v26.1021.5

## 🇨🇳 中文更新日志

### 悬浮小组件交互与视觉优化

- **Anchor 锚点弹出机制**：卡片展开时常驻 48px 几何快捷按钮，并以小按钮为 Anchor 计算弹出位置（水平自适应对齐，垂直依据上下半屏智能弹出）。
- **前台自由拉伸与记忆**：前台悬浮窗支持自由拖拽拉伸尺寸（右下角拉伸手柄与原生拖拽），并在 `localStorage` 中持久化记忆摆放位置与窗口尺寸。
- **层级与防遮挡碰撞检测**：优化小按钮的 z-index 层级，修复针对 `offsetParent` 的 FAB 碰撞检测与避让逻辑，防止与其他悬浮控件遮挡。
- **环境安全与事件解耦**：监听 `km:floating-card-open` 事件自动互斥收起，加入运行环境安全检查，防止无 DOM/Node 运行环境中未定义方法异常。

### 维护与工程化

- 自动化测试用例全量通过（34/34 项测试通过），包含服务图标映射、指令下发、快照隔离与异常防护验证。
- 安装包与 `v1.json` 元数据强同步，SHA-256 校验和自动更新。

## 🇬🇧 English Changelog

### Floating Widget Interactions & Visual Polish

- **Anchor-Based Popover Mechanism**: Keep the 48px floating shortcut icon persistent when the card expands, using the button as an anchor to dynamically position the popup (smart vertical alignment for upper/lower half of screen and horizontal boundary detection).
- **Front-end Resizing & Persistent Geometry**: Allow users to interactively drag and resize the floating widget directly in the UI, persisting positions and custom dimensions to `localStorage`.
- **Z-Index Layering & FAB Collision Detection**: Refine the floating button's z-index and collision detection against page elements using `offsetParent`, preventing overlapping with existing host UI buttons.
- **Environment Safety & Mutual Exclusion**: Listen to `km:floating-card-open` to smoothly close inactive widgets when other plugins expand, with safe runtime environment checks for non-browser/headless execution.

### Maintenance & Quality Assurance

- All 34 automated unit and integration tests passed, covering service catalog icon mapping, command dispatch, snapshot isolation, and error boundaries.
- Build assets and `v1.json` metadata strictly synced with computed SHA-256 integrity checksums.
