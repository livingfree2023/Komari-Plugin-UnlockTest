# UnlockTest v26.1020.7

## 🇨🇳 中文更新日志

### 界面与图标

- 浮窗从当前 Komari 页面读取字体、字号、背景、节点卡片、边框及明暗色等样式，并在主题变化时更新；标题栏、状态栏、服务卡片和节点下拉菜单的间距一并调整。保留浮窗，不继续开展逐主题节点注入。
- 服务图标改为完整服务名精确匹配，避免相似名称错用其他平台的标志。
- 将 49 个有固定来源的品牌 SVG 随插件打包，可对应本次完整测试输出中的 57 个服务名；其余服务使用特定自绘 SVG 或名称徽章。图标不依赖运行时第三方请求。
- 随安装包提供图标来源清单、许可文本和品牌权利说明。

### 维护与验证

- 清理未采用的原型及已停止的主题调研资料，更新用户说明、技术规格书与交接记录。
- 从完整测试输出提取 163 个不同服务名用于图标回归，不保存节点地址和检测结果。
- 34 项自动化测试通过；全部 JavaScript 语法、49 个 SVG 结构、本地资源引用和安装包 SHA-256 校验通过。浏览器回归因本机缺少 Playwright 未运行；用户已确认 26.1020.7 测试包在实际环境中的效果。

## 🇬🇧 English Changelog

### Interface and icons

- The floating widget now reads fonts, sizes, backgrounds, node cards, borders, and light/dark colors from the active Komari page and updates when the theme changes. The header, status bar, service cards, and node selector spacing have also been adjusted. The widget remains in place; per-theme node-card injection is no longer planned.
- Match icons by the complete service name to prevent similar names from receiving the wrong brand mark.
- Bundle 49 traceable brand SVGs locally, covering 57 service names in the supplied full test output. Other services use a custom SVG or a name badge. Icons require no third-party runtime requests.
- Include pinned icon sources, license texts, and a brand-rights notice in the installation package.

### Maintenance and validation

- Remove unused prototypes and retired theme research files; update the user guide, technical specification, and handover record.
- Extract 163 distinct service names from the full test output for icon regression testing without storing node addresses or probe results.
- All 34 automated tests passed, as did JavaScript syntax, SVG structure, local-reference, and package SHA-256 checks. Browser regression could not run locally because Playwright was unavailable; the user confirmed the 26.1020.7 test package in a real environment.
