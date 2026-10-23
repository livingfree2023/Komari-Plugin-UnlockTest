# UnlockTest v26.1023.2

## 🇨🇳 中文更新日志

### 浮窗卡片布局

- 服务卡片统一为 **94 × 108px**，按浮窗实际宽度自动增减列数，避免窄窗挤压、宽窗拉伸。
- 服务名称使用 16px 等宽字体，`Bilibili` 可完整显示；较长名称继续省略并保留完整悬停提示。
- 首次展开默认宽度为 **452px，显示 4 列**；最小宽度为 **348px，显示 3 列**。屏幕宽度不足时优先保证浮窗不溢出。
- 统一拖动缩放与尺寸恢复的宽度限制，继续记忆用户调整后的尺寸，并预留稳定的滚动条空间。

### 主题颜色与诊断输出

- 顶部“探测”“解锁矩阵”按钮与标题使用同一主题文字色，修复浅色皮肤下按钮文字过浅的问题，切换主题时立即同步。
- 管理员诊断窗口显示完整标准输出，移除原先 600 字符的保存限制，并保持文本转义和滚动浏览。公开快照不包含完整输出。
- 兼容已有的历史输出片段并提示重新探测；升级后需要重新探测才能获取完整日志，无法恢复已被截断的历史内容。
- 两种远程执行分支均使用 `2>/dev/null` 过滤写入标准错误的进度条刷新，保留标准输出、退出码和任务日志恢复。标准错误中的其他信息也会一并丢弃。

### 验证与发布

- 34 项离线自动化测试、10 个 JavaScript 文件语法检查及浏览器回归通过，覆盖完整输出持久化、权限隔离、文本转义、主题切换、列数变化、真实拖动缩放与尺寸记忆。
- 用户已安装测试并确认通过。本次直接发布已验证的 26.1023.2，不再次递增版本。
- 本地测试包版本和 SHA-256 已核对；发布流水线产物统一写入 `dist/`，自动附加 ZIP 并回写发布包校验值。

## 🇬🇧 English Changelog

### Floating Widget Layout

- Keep service cards at **94 × 108px** and adjust the column count to the widget's available width, preventing squeezed or stretched cards.
- Use 16px monospace service names so `Bilibili` fits in full. Longer names retain ellipsis and full hover details.
- Open at **452px with four columns** by default and allow resizing down to **348px with three columns**. Narrower screens prioritize keeping the widget within the viewport.
- Apply consistent width limits during resizing and size restoration, preserve saved dimensions, and reserve stable scrollbar space.

### Theme Colors and Diagnostics

- Match the header probe and matrix buttons to the title's theme text color, fixing pale button labels on light skins and synchronizing immediately during theme changes.
- Display complete standard output in administrator diagnostics without the previous 600-character storage limit. Keep text escaping and scrolling, and exclude raw output from public snapshots.
- Continue displaying legacy output snippets with a prompt to run a new probe. Previously truncated content cannot be recovered.
- Add `2>/dev/null` to both remote execution branches to suppress progress refreshes written to standard error while preserving stdout, exit codes, and task-log recovery. Other stderr messages are also discarded.

### Validation and Release

- Passed 34 offline automated tests, syntax checks for 10 JavaScript files, and browser regressions covering full-output persistence, access control, text escaping, theme switching, column counts, pointer resizing, and saved dimensions.
- The user installed and approved the test package. Release the verified 26.1023.2 without another version bump.
- Verified the local ZIP version and SHA-256. Release workflow artifacts now use `dist/`; automation attaches the ZIP and updates the published package checksum.
