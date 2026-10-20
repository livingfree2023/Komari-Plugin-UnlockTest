# UnlockTest v26.1020.3

## 🇨🇳 中文更新日志

### 问题修复

- 修复解锁矩阵定向探测的请求参数，搜索或分组筛选后只探测当前显示节点，空节点列表不再退回全节点探测。
- 移除生产页面中的演示节点、预设结果和模拟进度。进度、成功提示及结果刷新均以后台任务状态为准；接口异常时显示失败信息。
- 修复矩阵服务名称、节点名称、分组及浮窗诊断内容的 HTML 注入问题，外部数据作为文本展示。
- 返回公开快照前核对当前节点可见性，隐藏或删除的节点不再通过旧快照和任务信息公开；无法核验时拒绝返回旧数据。
- 使用“区域 + 服务”作为矩阵结果唯一标识，防止不同区域的同名服务相互覆盖。
- 修复无活动任务时取消操作反而启动探测的问题。取消请求通知对应远端任务，并保留跟踪直至收到结束结果。
- 重复探测请求（包括 force 请求）复用活动任务，配合远端互斥锁，避免探测进程重复运行。
- 每次运行使用独立日志目录和完成标记，避免结果串写；增加结果回传丢失时的日志恢复，不重复执行平台测试。
- 修复离线节点回退下发、插件卸载后异步结果继续写入等边界问题。

### 界面与交付

- 删除浮窗底部的导入、导出入口及文件选择器。
- 删除中英文切换入口，浮窗统一使用中文，忽略旧的英文偏好。
- 真实节点暂无快照时显示未测试状态，不生成演示服务结果。
- 本地测试包统一输出至 `dist/unlock-test.zip`，版本与插件索引及 SHA-256 同步。

### 验证

- 30 项自动化回归测试通过。
- 桌面及手机浮窗浏览器检查通过。
- 矩阵页浏览器检查覆盖空快照、HTML 注入、跨区域同名服务、筛选节点下发、请求失败、真实进度及结果刷新。
- 远端脚本互斥、取消和日志隔离测试通过；JavaScript 语法及 ShellCheck 检查通过。
- 用户确认本地 v26.1020.3 测试包测试通过。

## 🇬🇧 English Changelog

### Fixes

- Correct the matrix probe request so searches and group filters target only the visible nodes. Empty target lists no longer expand to all nodes.
- Remove production demo nodes, preset results and simulated progress. Progress, completion notices and refreshed results now follow actual backend task state, with explicit request failure feedback.
- Prevent HTML injection through matrix service names, node names, groups and widget diagnostics by rendering external values as text.
- Check current node visibility before returning public snapshots. Hidden and deleted nodes are excluded from cached results and task metadata; failed visibility checks do not return stale public data.
- Key matrix results by both region and service to prevent collisions between identically named services in different regions.
- Make cancellation a no-op when no task is active. Active cancellations signal the exact remote run and retain tracking until completion is reported.
- Reuse active tasks for repeated requests, including force requests, and enforce remote mutual exclusion to prevent overlapping provider probes.
- Isolate logs and completion markers per run. Recover completed logs after lost Agent result uploads without repeating provider tests.
- Fix offline-node fallback dispatch and late asynchronous writes after plugin unload.

### Interface and packaging

- Remove widget import/export buttons and the file picker.
- Remove the language toggle. The widget uses Chinese and ignores previously saved English preferences.
- Show real nodes without snapshots as untested, without fabricated service results.
- Place local test packages in `dist/unlock-test.zip`, keeping the manifest, plugin index and SHA-256 synchronized.

### Validation

- All 30 automated regression tests passed.
- Desktop and mobile widget browser checks passed.
- Matrix browser checks cover empty snapshots, HTML injection, cross-region service identity, filtered dispatch, failed requests, actual progress and refreshed results.
- Remote mutual exclusion, cancellation and log isolation checks passed, along with JavaScript syntax validation and ShellCheck.
- The user confirmed that the local v26.1020.3 package passed acceptance testing.
