# UnlockTest v26.1024.1

## 🇨🇳 中文更新日志

### 诊断输出滚动与刷新

- 修复诊断弹窗每两秒重绘时 raw stdout 滚动位置跳回首行的问题；刷新后保留原位置，原先停在底部时继续跟随新增输出。
- 远端任务返回后，刷新并显示最终诊断结果，然后停止诊断轮询；探测成功或失败均适用。

### 验证

- 项目内 JavaScript 原生语法检查与 `git diff --check` 通过。
- 本地测试包 ZIP 完整性、版本号及 SHA-256 已核对。
- 测试包版本：`26.1024.1`。
- SHA-256：`78d2c165787636568dd6a1c62a81a873ac2ab035cbf251071a05ca95bbc74a13`。

## 🇬🇧 English Changelog

### Diagnostic Output Scrolling and Polling

- Preserve the raw stdout scroll position when the diagnostic modal redraws every two seconds. If the view was at the bottom, it continues following new output.
- After the remote task returns, refresh and display the final diagnostic result, then stop polling. This applies to both successful and failed probes.

### Validation

- JavaScript syntax checks and `git diff --check` passed.
- Verified the local test ZIP integrity, version, and SHA-256.
- Test package version: `26.1024.1`.
- SHA-256: `78d2c165787636568dd6a1c62a81a873ac2ab035cbf251071a05ca95bbc74a13`.
