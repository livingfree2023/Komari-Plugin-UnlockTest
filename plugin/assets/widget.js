// plugin/assets/widget.js
// Komari 首页可拖动解锁浮层 + 64px 方形 SVG 悬浮图标 + 页面节点实时同步引擎 (PageNodeSync)
// Author: livingfree2023@outlook.com

(function () {
  "use strict";

  // 严格仅在前台两个页面（首页 / 与实例详情页 /instance/...）显示浮层；管理后台、矩阵页、iframe 绝不展示
  function isAllowedFrontendRoute() {
    try {
      if (window.self !== window.top) return false;

      const p = (window.location.pathname || "").toLowerCase();
      const h = (window.location.hash || "").toLowerCase();
      const full = p + " " + h;

      if (full.indexOf("/admin") !== -1 ||
          full.indexOf("/terminal") !== -1 ||
          full.indexOf("/api/plugin") !== -1 ||
          full.indexOf("/plugin") !== -1 ||
          full.indexOf("matrix.html") !== -1 ||
          full.indexOf("preview.html") !== -1 ||
          full.indexOf("public.html") !== -1 ||
          full.indexOf("admin.html") !== -1 ||
          full.indexOf("/login") !== -1 ||
          full.indexOf("/auth") !== -1 ||
          full.indexOf("/settings") !== -1) {
        return false;
      }

      const isInstance = (
        p.indexOf("/instance") !== -1 || h.indexOf("/instance") !== -1 ||
        p.indexOf("/node") !== -1 || h.indexOf("/node") !== -1 ||
        p.indexOf("/server") !== -1 || h.indexOf("/server") !== -1
      );
      if (isInstance) return true;

      const cleanP = p.replace(/\/+$/, "") || "/";
      const cleanH = h.replace(/\/+$/, "") || "";
      const isHome = (cleanP === "/" || cleanP === "/index.html") &&
                     (cleanH === "" || cleanH === "#" || cleanH === "#/" || cleanH === "#/home" || cleanH === "#/overview");
      if (isHome) return true;

      return false;
    } catch (e) {
      return false;
    }
  }

  function isExcludedAdminRoute() {
    return !isAllowedFrontendRoute();
  }

  const STORAGE_KEY = "komari_unlock_test_widget_v1";

  const THEME_FONT_STEPS = [13, 14, 16, 18, 20];
  let themeSyncTimer = null;
  let themeObserver = null;

  function parseRgbColor(value) {
    const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].replace(/\//g, " ").trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = function (part) {
      const number = parseFloat(part);
      return part.indexOf("%") >= 0 ? number * 2.55 : number;
    };
    return {
      r: channel(parts[0]),
      g: channel(parts[1]),
      b: channel(parts[2]),
      a: parts[3] === undefined ? 1 : (parts[3].indexOf("%") >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    };
  }

  function isUsableColor(value) {
    const color = parseRgbColor(value);
    return Boolean(color && color.a > 0.08);
  }

  function isDarkColor(value) {
    const color = parseRgbColor(value);
    if (!color) return false;
    const linear = [color.r, color.g, color.b].map(function (channel) {
      const normalized = Math.max(0, Math.min(255, channel)) / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] < 0.42;
  }

  function isPluginElement(element) {
    return Boolean(element && (element.id === "km-unlock-floating-root" ||
      element.id === "km-ul-min-icon" ||
      element.id === "km-ul-about-modal" || element.id === "km-ul-debug-modal" ||
      (element.closest && element.closest("#km-unlock-floating-root, #km-ul-min-icon, #km-ul-about-modal, #km-ul-debug-modal"))));
  }

  function visibleThemeElement(selectors) {
    const elements = document.querySelectorAll(selectors);
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (isPluginElement(element)) continue;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width < 2 || rect.height < 2) continue;
      return element;
    }
    return null;
  }

  function sampleBackground(element, fallback) {
    if (!element) return fallback;
    const color = window.getComputedStyle(element).backgroundColor;
    return isUsableColor(color) ? color : fallback;
  }

  function samplePageBackdrop(body, html) {
    const fallback = sampleBackground(body, sampleBackground(html, "#111827"));
    const selectors = [
      ".background-container .background-image", ".default-background", ".bp-root",
      "main", "[role='main']", "#app", "#root", "body", "html"
    ];
    for (let i = 0; i < selectors.length; i++) {
      const element = visibleThemeElement(selectors[i]);
      if (!element) continue;
      const style = window.getComputedStyle(element);
      const image = style.backgroundImage || "none";
      if (!isUsableColor(style.backgroundColor) && image === "none") continue;
      return {
        color: isUsableColor(style.backgroundColor) ? style.backgroundColor : fallback,
        image: image,
        size: style.backgroundSize || "auto",
        position: style.backgroundPosition || "0% 0%",
        repeat: style.backgroundRepeat || "repeat"
      };
    }
    return { color: fallback, image: "none", size: "auto", position: "0% 0%", repeat: "repeat" };
  }

  function sampleThemeAccent() {
    const candidate = visibleThemeElement(
      'button[class*="primary"], a[class*="primary"], button[class*="accent"], a[class*="accent"], [data-variant="default"], [role="tab"][aria-selected="true"]'
    );
    if (candidate) {
      const style = window.getComputedStyle(candidate);
      if (isUsableColor(style.backgroundColor)) return style.backgroundColor;
      if (style.color && style.color !== window.getComputedStyle(document.body).color) return style.color;
    }
    const link = visibleThemeElement("a[href]");
    if (link) {
      const color = window.getComputedStyle(link).color;
      if (isUsableColor(color) && color !== window.getComputedStyle(document.body).color) return color;
    }
    return "#06b6d4";
  }

  function collectThemeStyles() {
    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return null;

    const bodyStyle = window.getComputedStyle(body);
    const htmlStyle = window.getComputedStyle(html);
    const pageBackdrop = samplePageBackdrop(body, html);
    const card = visibleThemeElement(
      ".node-card, .km-node-card, .km-instance-server-item, [data-node-uuid], [data-uuid], article"
    );
    const cardStyle = card ? window.getComputedStyle(card) : null;
    const pageSurface = pageBackdrop.color;
    const cardSurface = sampleBackground(card, pageSurface);
    const textColor = cardStyle && isUsableColor(cardStyle.color) ? cardStyle.color : bodyStyle.color;
    const mutedElement = visibleThemeElement("[class*='muted'], [class*='secondary'], small, p");
    const mutedColor = mutedElement ? window.getComputedStyle(mutedElement).color : "";
    const borderColor = cardStyle && isUsableColor(cardStyle.borderTopColor) ? cardStyle.borderTopColor : "";
    const borderWidthValue = cardStyle ? parseFloat(cardStyle.borderTopWidth) : NaN;
    const borderWidth = Number.isFinite(borderWidthValue) ? Math.max(0.5, Math.min(3, borderWidthValue)) : 1;
    const borderStyle = cardStyle && /^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(cardStyle.borderTopStyle)
      ? cardStyle.borderTopStyle : "solid";
    const radiusText = cardStyle ? cardStyle.borderTopLeftRadius : "";
    const radius = Math.max(6, Math.min(20, parseFloat(radiusText) || 12));
    const rootClasses = (html.className && String(html.className) || "") + " " + (body.className && String(body.className) || "");
    const themeHint = ((html.getAttribute("data-theme") || "") + " " + (body.getAttribute("data-theme") || "") + " " + rootClasses).toLowerCase();
    const explicitDark = /(^|[\s_-])(dark|night)([\s_-]|$)/.test(themeHint) ||
      htmlStyle.colorScheme === "dark" || bodyStyle.colorScheme === "dark";
    const explicitLight = /(^|[\s_-])(light|day)([\s_-]|$)/.test(themeHint) ||
      htmlStyle.colorScheme === "light" || bodyStyle.colorScheme === "light";
    const dark = explicitDark || (!explicitLight && isDarkColor(pageSurface));
    const pageFontSize = parseFloat(bodyStyle.fontSize) || parseFloat(htmlStyle.fontSize) || 16;
    const fontScale = Math.max(0.875, Math.min(1.25, pageFontSize / 16));
    const codeElement = visibleThemeElement("code, pre, kbd, samp");
    const monoFont = codeElement ? window.getComputedStyle(codeElement).fontFamily : "ui-monospace, SFMono-Regular, Menlo, monospace";
    const shadow = cardStyle && cardStyle.boxShadow !== "none" ? cardStyle.boxShadow : "0 18px 44px rgba(15, 23, 42, 0.24)";
    const accent = sampleThemeAccent();

    return {
      dark: dark,
      fontFamily: bodyStyle.fontFamily || htmlStyle.fontFamily || "system-ui, sans-serif",
      monoFont: monoFont,
      pageSurface: pageSurface,
      pageImage: pageBackdrop.image,
      pageImageSize: pageBackdrop.size,
      pageImagePosition: pageBackdrop.position,
      pageImageRepeat: pageBackdrop.repeat,
      cardSurface: cardSurface,
      cardImage: cardStyle && cardStyle.backgroundImage || "none",
      cardImageSize: cardStyle && cardStyle.backgroundSize || "auto",
      cardImagePosition: cardStyle && cardStyle.backgroundPosition || "0% 0%",
      cardImageRepeat: cardStyle && cardStyle.backgroundRepeat || "repeat",
      textColor: textColor || (dark ? "#f8fafc" : "#172033"),
      mutedColor: isUsableColor(mutedColor) && mutedColor !== textColor ? mutedColor : (dark ? "#aab6c8" : "#667085"),
      borderColor: borderColor || (dark ? "rgba(255, 255, 255, 0.18)" : "rgba(15, 23, 42, 0.16)"),
      borderWidth: borderWidth + "px",
      borderStyle: borderStyle,
      accent: accent,
      accentText: dark ? "#a5f3fc" : "#0369a1",
      successText: dark ? "#34d399" : "#047857",
      dangerText: dark ? "#f87171" : "#b42318",
      radius: radius + "px",
      shadow: shadow,
      fontScale: fontScale
    };
  }

  function applyThemeStyles() {
    const root = document.getElementById("km-unlock-floating-root");
    if (!root) return;
    const theme = collectThemeStyles();
    if (!theme) return;
    const signature = JSON.stringify(theme);
    if (root.getAttribute("data-km-ul-theme-signature") === signature) return;

    const variables = {
      "--km-ul-bg": theme.pageSurface,
      "--km-ul-bg-image": theme.pageImage,
      "--km-ul-bg-size": theme.pageImageSize,
      "--km-ul-bg-position": theme.pageImagePosition,
      "--km-ul-bg-repeat": theme.pageImageRepeat,
      "--km-ul-panel": theme.pageSurface,
      "--km-ul-card": theme.cardSurface,
      "--km-ul-card-image": theme.cardImage,
      "--km-ul-card-image-size": theme.cardImageSize,
      "--km-ul-card-image-position": theme.cardImagePosition,
      "--km-ul-card-image-repeat": theme.cardImageRepeat,
      "--km-ul-card-hover": theme.cardSurface,
      "--km-ul-border": theme.borderColor,
      "--km-ul-border-width": theme.borderWidth,
      "--km-ul-border-style": theme.borderStyle,
      "--km-ul-text": theme.textColor,
      "--km-ul-muted": theme.mutedColor,
      "--km-ul-cyan": theme.accent,
      "--km-ul-accent-text": theme.accentText,
      "--km-ul-accent-hover": theme.dark ? "#e0f2fe" : "#075985",
      "--km-ul-green-text": theme.successText,
      "--km-ul-red-text": theme.dangerText,
      "--km-ul-sans": theme.fontFamily,
      "--km-ul-mono": theme.monoFont,
      "--km-ul-radius": theme.radius,
      "--km-ul-shadow": theme.shadow,
      "--km-ul-font-scale": String(theme.fontScale),
      "--km-ul-footer-bg": "transparent",
      "--km-ul-modal-bg": theme.cardSurface,
      "--km-ul-debug-bg": theme.pageSurface,
      "--km-ul-logo-bg": "transparent"
    };
    THEME_FONT_STEPS.forEach(function (size) {
      const scaled = Math.max(11, Math.min(25, size * theme.fontScale));
      variables["--km-ul-font-" + size] = scaled.toFixed(2) + "px";
    });

    const minIcon = document.getElementById("km-ul-min-icon");
    const targets = [root, minIcon].filter(Boolean).concat(Array.from(document.querySelectorAll("#km-ul-about-modal, #km-ul-debug-modal")));
    targets.forEach(function (target) {
      Object.keys(variables).forEach(function (name) { target.style.setProperty(name, variables[name]); });
      target.setAttribute("data-km-ul-theme", theme.dark ? "dark" : "light");
      target.style.colorScheme = theme.dark ? "dark" : "light";
    });
    root.setAttribute("data-km-ul-theme-signature", signature);
  }

  function scheduleThemeSync() {
    if (themeSyncTimer) clearTimeout(themeSyncTimer);
    themeSyncTimer = setTimeout(function () {
      themeSyncTimer = null;
      applyThemeStyles();
    }, 90);
  }

  const I18N = {
    "zh-CN": {
      title: "流媒体与 AI 解锁",
      all: "全部",
      no_nodes: "暂无可见节点",
      no_snapshot: "正在等待后台首次探测快照...",
      probing: "后台探测运行中...",
      trigger_probe: "探测",
      unlocked_stat: "已解锁",
      about: "关于",
      debug_btn: "诊断",
      debug_title: "MediaUnlockTest 实时任务与诊断状态",
      about_title: "关于 Komari UnlockTest 插件",
      about_desc1: "架构方案：采用读写彻底分离（Read/Write Separation）。后台通过 Komari 在 VPS 执行 MediaUnlockTest，通过 Agent 或命令直接回传结果，保存快照；前端浮层秒开读取快照，零运行时阻塞。",
      about_desc2: "检测引擎归属：HsukqiLee/MediaUnlockTest",
      about_author: "作者署名：livingfree2023@outlook.com",
      close: "关闭",
      view_raw_api: "查看 /debug API 原生数据",
      minimized_tooltip: "流媒体与 AI 解锁检测 (点击展开)"
    },

  };

  // 48px 方形小按钮内部极简线构图标：与 NetForecast 对齐设计风格 (22x22 单色线构)
  const MINIMIZED_SVG_ICON = [
    '<svg class="km-ul-minimized-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '  <!-- 开启的挂锁锁梁 (Unlocked Shackle) -->',
    '  <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
    '  <!-- 锁体 (Padlock Body) -->',
    '  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>',
    '  <!-- 锁芯中心微标 (Lock Core Dot) -->',
    '  <circle cx="12" cy="16" r="1.5" fill="currentColor"></circle>',
    '</svg>'
  ].join("\n");

  let prefs = {
    selectedNode: "",
    minimized: false,
    iconPos: null,
    cardSize: null
  };

  let isOpen = false;
  let minIconEl = null;
  let cardEl = null;

  let allNodes = [];          // 来自 /api/nodes 的全量可见节点列表
  let pageVisibleNodes = [];  // 与当前页面（分组筛选或详情页）同步后的下拉列表节点
  let snapshotData = null;    // 来自 /api/plugin/unlock-test/snapshot 的快照数据
  let isAdminUser = false;
  let lastDetailNodeUUID = "";
  let dataError = "";
  let fetching = false;
  let localProbingActive = false;
  let localProbingStart = 0;
  let localProbingTimer = null;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          prefs = Object.assign({}, prefs, parsed);
          delete prefs.ipFilter;
          delete prefs.lang;
        }
      }
    } catch (_) {}
  }

  function savePrefs() {
    try {
      const saved = Object.assign({}, prefs);
      delete saved.lang;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
  }

  function t(key) {
    const dict = I18N["zh-CN"];
    return dict[key] || key;
  }

  // ========= 页面节点同步引擎 (PageNodeSync) =========
  // 1. 识别用户是否点开了单个 VPS 的详情页（URL 含节点 UUID、/instance/<uuid>、或最近请求了该节点详情）
  function detectSingleNodeDetailUUID() {
    if (!allNodes || allNodes.length === 0) return "";
    const href = (window.location.pathname || "") + " " + (window.location.hash || "") + " " + (window.location.search || "");

    for (let i = 0; i < allNodes.length; i++) {
      const u = allNodes[i].uuid;
      if (u && href.indexOf(u) >= 0) {
        return u;
      }
    }

    const instanceRoot = document.querySelector(".km-page-instance");
    if (instanceRoot) {
      if (lastDetailNodeUUID) return lastDetailNodeUUID;
      const text = instanceRoot.textContent || "";
      for (let i = 0; i < allNodes.length; i++) {
        const n = allNodes[i];
        if (n.name && text.indexOf(n.name) >= 0) {
          return n.uuid;
        }
      }
    }

    return "";
  }

  // 2. 识别首页当前分组筛选后实际显示的节点集合
  function detectVisibleNodesOnPage() {
    if (!allNodes || allNodes.length === 0) return [];

    // 情况 A：处于单个 VPS 详情页面 -> 自动选中该节点
    const detailUUID = detectSingleNodeDetailUUID();
    if (detailUUID) {
      const target = allNodes.find(function (n) { return n.uuid === detailUUID; });
      if (target) {
        prefs.selectedNode = target.uuid;
        return [target];
      }
    }

    // 情况 B：处于首页列表/网格视图 -> 扫描当前页面可见的节点卡片/行
    const widgetEl = document.getElementById("km-unlock-floating-root");
    const matchedUUIDSet = {};
    const matchedList = [];

    function addMatched(node) {
      if (node && node.uuid && !matchedUUIDSet[node.uuid]) {
        matchedUUIDSet[node.uuid] = true;
        matchedList.push(node);
      }
    }

    function isElementVisible(el) {
      if (!el || (widgetEl && widgetEl.contains(el))) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    const cardSelectors = [
      ".km-node-card",
      ".km-instance-server-item",
      ".km-ui-table-row",
      "[data-uuid]",
      "[data-node-uuid]",
      "a[href*='/instance/']",
      "a[href*='/node/']",
      "a[href*='/server/']"
    ];
    const candidateElements = document.querySelectorAll(cardSelectors.join(","));

    if (candidateElements.length > 0) {
      for (let i = 0; i < candidateElements.length; i++) {
        const el = candidateElements[i];
        if (!isElementVisible(el)) continue;

        const attrUUID = el.getAttribute("data-uuid") || el.getAttribute("data-node-uuid") || "";
        const href = el.getAttribute("href") || "";
        const elText = el.textContent || "";

        for (let j = 0; j < allNodes.length; j++) {
          const node = allNodes[j];
          if (attrUUID && attrUUID === node.uuid) {
            addMatched(node);
            break;
          }
          if (href && href.indexOf(node.uuid) >= 0) {
            addMatched(node);
            break;
          }
          if (node.name && elText.indexOf(node.name) >= 0) {
            addMatched(node);
          }
        }
      }
    }

    if (matchedList.length === 0) {
      const mainContainer = document.querySelector(".km-node-display, .km-instance-server-list, .km-main, main, #root, #app") || document.body;
      const cloneText = collectVisibleTextOutsideWidget(mainContainer, widgetEl);
      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        if (node.name && cloneText.indexOf(node.name) >= 0) {
          addMatched(node);
        }
      }
    }

    if (matchedList.length > 0) {
      return matchedList;
    }

    return allNodes.slice();
  }

  function collectVisibleTextOutsideWidget(root, widgetEl) {
    if (!root) return "";
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (widgetEl && widgetEl.contains(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "OPTION") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let current;
    while ((current = walker.nextNode())) {
      const val = (current.nodeValue || "").trim();
      if (val) parts.push(val);
    }
    return parts.join(" | ");
  }

  function installNetworkObserver() {
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function (input, init) {
        try {
          const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
          const recentMatch = url.match(/\/api\/recent\/([0-9a-fA-F-]{8,})/);
          const queryMatch = url.match(/[?&]uuid=([0-9a-fA-F-]{8,})/);
          const detected = (recentMatch && recentMatch[1]) || (queryMatch && queryMatch[1]) || "";
          if (detected) {
            lastDetailNodeUUID = detected;
            schedulePageSync();
          }
        } catch (_) {}
        return origFetch.apply(this, arguments);
      };
    }

    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (typeof origPush === "function") {
      history.pushState = function () {
        const res = origPush.apply(this, arguments);
        schedulePageSync();
        return res;
      };
    }
    if (typeof origReplace === "function") {
      history.replaceState = function () {
        const res = origReplace.apply(this, arguments);
        schedulePageSync();
        return res;
      };
    }
    window.addEventListener("popstate", schedulePageSync);
    window.addEventListener("hashchange", schedulePageSync);
  }

  let syncDebounceTimer = null;
  function schedulePageSync() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(function () {
      syncNodesWithCurrentPage();
    }, 80);
  }

  function syncNodesWithCurrentPage() {
    const root = document.getElementById("km-unlock-floating-root");
    if (isExcludedAdminRoute()) {
      if (root) {
        root.style.setProperty("display", "none", "important");
        const overlay = root.querySelector(".km-unlock-floating-overlay");
        if (overlay) overlay.style.setProperty("display", "none", "important");
      }
      return;
    } else {
      if (root && root.style.display === "none") root.style.setProperty("display", "", "");
    }

    pageVisibleNodes = detectVisibleNodesOnPage();

    const stillVisible = pageVisibleNodes.some(function (n) { return n.uuid === prefs.selectedNode; });
    if (!stillVisible) {
      prefs.selectedNode = pageVisibleNodes.length > 0 ? pageVisibleNodes[0].uuid : "";
      savePrefs();
    }

    renderNodeSelect();
    renderServiceLogos();
    updateMinimizedIconState();
  }

  // ========= 数据拉取 (Zero-Blocking Read Path) =========
  async function fetchNodesAndSnapshot() {
    if (fetching) return;
    fetching = true;
    try {
      const [nodesResp, snapResp, meResp] = await Promise.all([
        fetch("/api/nodes", { credentials: "same-origin" }).then(function (r) { return r.json(); }).catch(function () { return null; }),
        fetch("/api/plugin/unlock-test/snapshot", { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("Snapshot HTTP " + r.status); return r.json(); }),
        fetch("/api/me", { credentials: "same-origin" }).then(function (r) { return r.json(); }).catch(function () { return null; })
      ]);

      isAdminUser = Boolean(meResp && meResp.logged_in === true);
      if (!snapResp || snapResp.status !== "success" || !snapResp.data) throw new Error("Invalid snapshot response");
      dataError = "";

      if (nodesResp && Array.isArray(nodesResp.data)) {
        allNodes = nodesResp.data;
      } else if (Array.isArray(nodesResp)) {
        allNodes = nodesResp;
      }

      if (snapResp && snapResp.status === "success" && snapResp.data) {
        snapshotData = snapResp.data;
        if (!snapshotData.activeTask && localProbingActive) {
          localProbingActive = false;
          if (localProbingTimer) {
            clearInterval(localProbingTimer);
            localProbingTimer = null;
          }
        }
        if (allNodes.length === 0 && snapshotData.nodes) {
          allNodes = Object.keys(snapshotData.nodes).map(function (uuid) {
            const n = snapshotData.nodes[uuid];
            return { uuid: uuid, name: n.name || uuid, group: n.group || "", region: n.nodeRegion || "" };
          });
        }
      }

      const probeBtn = document.getElementById("km-ul-probe-btn");
      if (probeBtn) {
        probeBtn.style.display = isAdminUser ? "inline-block" : "none";
      }

      syncNodesWithCurrentPage();
    } catch (err) {
      dataError = err.message || String(err);
      console.warn("[unlock-test] fetch snapshot failed:", err);
      renderServiceLogos();
    } finally {
      fetching = false;
    }
  }

  // ========= UI 挂载与渲染 =========
  // ========= 浮窗位置计算与展开收起引擎 =========
  function getOtherFabs(myEl, myId) {
    const list = [];
    const all = document.querySelectorAll("[data-km-fab='true'], .nf-trigger-sq, .km-ul-trigger-btn");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el === myEl || !el.isConnected) continue;
      const fabId = el.getAttribute("data-km-fab-id");
      if (fabId && fabId === myId) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        list.push(el);
      }
    }
    return list;
  }

  function isFabColliding(r1, r2) {
    return Math.abs(r1.left - r2.left) < 52 && Math.abs(r1.top - r2.top) < 52;
  }

  function resolveFabPosition(desiredL, desiredT, myEl, myId) {
    let l = desiredL;
    let t = desiredT;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const others = getOtherFabs(myEl, myId);

    let attempts = 0;
    let collided = true;
    while (collided && attempts < 8) {
      collided = false;
      for (let i = 0; i < others.length; i++) {
        const other = others[i];
        const oRect = other.getBoundingClientRect();
        if (isFabColliding({ left: l, top: t }, oRect)) {
          collided = true;
          t -= 60;
          if (t < 24) {
            t = oRect.bottom + 12;
          }
          break;
        }
      }
      attempts++;
    }
    return {
      left: Math.max(10, Math.min(winW - 58, l)),
      top: Math.max(10, Math.min(winH - 58, t))
    };
  }

  function loadSavedButtonPos() {
    if (!minIconEl) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let targetL = null;
    let targetT = null;

    try {
      if (prefs.iconPos && prefs.iconPos.left && prefs.iconPos.top) {
        const pLeft = parseFloat(prefs.iconPos.left);
        const pTop = parseFloat(prefs.iconPos.top);
        if (!isNaN(pLeft) && !isNaN(pTop)) {
          targetL = pLeft;
          targetT = pTop;
        }
      }
    } catch (_) {}

    if (targetL === null || targetT === null) {
      const others = getOtherFabs(minIconEl, "unlock-test");
      const slotIndex = others.length;
      const margin = 24;
      const slotPitch = 60;
      targetL = winW - 48 - margin;
      targetT = winH - 48 - (margin + slotIndex * slotPitch);
      if (targetT < margin) {
        targetT = winH - 48 - margin;
      }
    }

    const safePos = resolveFabPosition(targetL, targetT, minIconEl, "unlock-test");
    minIconEl.style.setProperty("left", safePos.left + "px", "important");
    minIconEl.style.setProperty("top", safePos.top + "px", "important");
    minIconEl.style.setProperty("right", "auto", "important");
    minIconEl.style.setProperty("bottom", "auto", "important");
  }

  function positionCard() {
    if (!cardEl || !minIconEl) return;
    const bRect = minIconEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 1. 卡片宽度
    const savedW = (prefs.cardSize && prefs.cardSize.width) || 440;
    const cardW = Math.max(300, Math.min(vw - 28, savedW));
    cardEl.style.setProperty("width", cardW + "px", "important");

    // 2. 纵向可用高度与上下方向判定（以小按钮为 anchor）
    const below = bRect.top <= vh / 2;
    const availableH = below ? (vh - bRect.bottom - 24) : (bRect.top - 24);
    const maxH = Math.max(200, Math.min(vh * 0.88, availableH));
    cardEl.style.setProperty("max-height", maxH + "px", "important");

    // 3. 卡片高度（支持记忆与自适应）
    if (prefs.cardSize && prefs.cardSize.height) {
      const cardH = Math.max(180, Math.min(maxH, prefs.cardSize.height));
      cardEl.style.setProperty("height", cardH + "px", "important");
    } else {
      cardEl.style.removeProperty("height");
    }

    // 4. 水平定位（以小按钮为 anchor 并防止视口溢出）
    let cardLeft;
    if (bRect.left > vw / 2) {
      cardLeft = bRect.right - cardW;
    } else {
      cardLeft = bRect.left;
    }
    cardLeft = Math.max(14, Math.min(vw - cardW - 14, cardLeft));
    cardEl.style.setProperty("left", cardLeft + "px", "important");
    cardEl.style.setProperty("right", "auto", "important");

    // 5. 垂直定位（以小按钮为 anchor）
    if (below) {
      const t = Math.max(12, bRect.bottom + 10);
      cardEl.style.setProperty("top", t + "px", "important");
      cardEl.style.setProperty("bottom", "auto", "important");
    } else {
      const b = Math.max(12, vh - bRect.top + 10);
      cardEl.style.setProperty("bottom", b + "px", "important");
      cardEl.style.setProperty("top", "auto", "important");
    }
  }

  function openCard() {
    isOpen = true;
    prefs.minimized = false;
    savePrefs();
    try {
      window.dispatchEvent(new CustomEvent("km:floating-card-open", { detail: { sourceId: "unlock-test" } }));
    } catch (_) {}
    if (cardEl) {
      cardEl.style.setProperty("display", "flex", "important");
      cardEl.classList.add("km-ul-open");
      positionCard();
    }
    renderServiceLogos();
    updateMinimizedIconState();
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("km:floating-card-open", function (e) {
      if (e.detail && e.detail.sourceId !== "unlock-test" && isOpen) {
        closeCard();
      }
    });
  }

  function closeCard() {
    isOpen = false;
    prefs.minimized = true;
    savePrefs();
    if (cardEl) {
      cardEl.style.setProperty("display", "none", "important");
      cardEl.classList.remove("km-ul-open");
    }
  }

  function toggle() {
    if (isOpen) {
      closeCard();
    } else {
      openCard();
    }
  }

  // ========= UI 挂载与渲染 =========
  function mountWidgetDOM() {
    if (document.getElementById("km-unlock-floating-root")) return;

    // 1. 挂载始终可见的 48px 方形悬浮小按钮 (支持拖拽停靠、防堆叠与位置记忆)
    minIconEl = document.createElement("div");
    minIconEl.className = "km-ul-trigger-btn";
    minIconEl.id = "km-ul-min-icon";
    minIconEl.setAttribute("data-km-fab", "true");
    minIconEl.setAttribute("data-km-fab-id", "unlock-test");
    minIconEl.title = t("minimized_tooltip");
    minIconEl.innerHTML = MINIMIZED_SVG_ICON + '<span class="km-ul-minimized-badge-dot" id="km-ul-min-badge"></span>';
    document.body.appendChild(minIconEl);
    loadSavedButtonPos();

    setTimeout(function () {
      if (!minIconEl) return;
      const rect = minIconEl.getBoundingClientRect();
      const safePos = resolveFabPosition(rect.left, rect.top, minIconEl, "unlock-test");
      if (safePos.left !== rect.left || safePos.top !== rect.top) {
        minIconEl.style.setProperty("left", safePos.left + "px", "important");
        minIconEl.style.setProperty("top", safePos.top + "px", "important");
      }
    }, 350);

    // 2. 挂载展开面板主体 (以按钮为 anchor 计算弹出位置，支持尺寸拉伸与记忆)
    cardEl = document.createElement("aside");
    cardEl.id = "km-unlock-floating-root";
    cardEl.innerHTML = [
      '<div class="km-ul-header" id="km-ul-drag-handle">',
      '  <div class="km-ul-title-wrap">',
      '    <span class="km-ul-drag-grip">⠿</span>',
      '    <span id="km-ul-title-text">' + t("title") + "</span>",
      "  </div>",
      '  <div class="km-ul-header-actions">',
      '    <button class="km-ul-icon-btn" id="km-ul-probe-btn" style="display:none" title="发起后台探测">' + t("trigger_probe") + "</button>",
      '    <button class="km-ul-icon-btn" id="km-ul-matrix-btn" title="查看全节点解锁矩阵大表">📊 解锁矩阵</button>',
      '    <button class="km-ul-icon-btn" id="km-ul-min-btn" title="收起浮窗">✕</button>',
      "  </div>",
      "</div>",
      '<div class="km-ul-body">',
      '  <div class="km-ul-toolbar">',
      '    <select class="km-ul-node-select" id="km-ul-node-select"></select>',
      "  </div>",
      '  <div id="km-ul-grid-container"></div>',
      "</div>",
      '<div class="km-ul-footer">',
      '  <span id="km-ul-stat-text" style="cursor:pointer" title="点击查看诊断调试信息">--</span>',
      '  <div class="km-ul-footer-links">',
      '    <button class="km-ul-link-btn" id="km-ul-debug-btn">' + t("debug_btn") + "</button>",
      '    <button class="km-ul-link-btn" id="km-ul-about-btn">' + t("about") + "</button>",
      "  </div>",
      '  <div class="km-ul-resize-grip" id="km-ul-resize-grip" title="拖动调整大小">',
      '    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 2L2 10M11 6L6 11M11 10L10 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      '  </div>',
      "</div>"
    ].join("\n");
    document.body.appendChild(cardEl);

    // 3. 关于弹窗 (About Modal)
    const aboutModal = document.createElement("div");
    aboutModal.className = "km-ul-modal-backdrop";
    aboutModal.id = "km-ul-about-modal";
    aboutModal.innerHTML = [
      '<div class="km-ul-modal-card">',
      '  <h3 id="km-ul-about-title">' + t("about_title") + "</h3>",
      '  <p id="km-ul-about-desc1">' + t("about_desc1") + "</p>",
      '  <p><a href="https://github.com/HsukqiLee/MediaUnlockTest" target="_blank" rel="noopener" style="color:#67e8f9">' + t("about_desc2") + "</a></p>",
      '  <p><code>' + t("about_author") + "</code></p>",
      '  <div style="text-align:right;margin-top:16px;">',
      '    <button class="km-ul-ip-pill active" id="km-ul-about-close">' + t("close") + "</button>",
      "  </div>",
      "</div>"
    ].join("\n");
    document.body.appendChild(aboutModal);

    // 4. 诊断与调试信息弹窗 (Diagnostics & Debug Modal)
    const debugModal = document.createElement("div");
    debugModal.className = "km-ul-modal-backdrop";
    debugModal.id = "km-ul-debug-modal";
    debugModal.innerHTML = [
      '<div class="km-ul-modal-card" style="max-width:640px;">',
      '  <h3 id="km-ul-debug-title">' + t("debug_title") + "</h3>",
      '  <div id="km-ul-debug-content"></div>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">',
      '    <a href="/api/plugin/unlock-test/debug" target="_blank" style="color:#67e8f9;font-family:var(--km-ul-mono);font-size:13px;" id="km-ul-debug-link">' + t("view_raw_api") + "</a>",
      '    <button class="km-ul-ip-pill active" id="km-ul-debug-close">' + t("close") + "</button>",
      "  </div>",
      "</div>"
    ].join("\n");
    document.body.appendChild(debugModal);

    bindWidgetEvents(cardEl, minIconEl, aboutModal, debugModal);
    initButtonDraggable(minIconEl);
    initCardDraggable(cardEl, document.getElementById("km-ul-drag-handle"));
    initResizable(cardEl, document.getElementById("km-ul-resize-grip"));

    if (!prefs.minimized) {
      openCard();
    } else {
      closeCard();
    }

    applyThemeStyles();
  }

  function updateMinimizedIconState() {
    const badge = document.getElementById("km-ul-min-badge");
    if (!badge) return;

    badge.className = "km-ul-minimized-badge-dot";
    const isProbing = Boolean(snapshotData && snapshotData.activeTask);
    if (isProbing) {
      badge.classList.add("probing");
      return;
    }

    const nodeUUID = prefs.selectedNode;
    const nodeSnap = (snapshotData && snapshotData.nodes && nodeUUID) ? snapshotData.nodes[nodeUUID] : null;

    if (!nodeSnap || !Array.isArray(nodeSnap.services) || nodeSnap.services.length === 0) {
      badge.classList.add(nodeSnap && nodeSnap.error ? "error" : "empty");
      return;
    }

    const hasUnlocked = nodeSnap.services.some(function (s) { return s.unlocked; });
    if (hasUnlocked) {
      // 保持绿色
    } else {
      badge.classList.add("error");
    }
  }

  function bindWidgetEvents(root, minIcon, aboutModal, debugModal) {
    const selectEl = document.getElementById("km-ul-node-select");
    if (selectEl) {
      selectEl.addEventListener("change", function () {
        prefs.selectedNode = selectEl.value;
        savePrefs();
        renderServiceLogos();
        updateMinimizedIconState();
      });
    }

    // 点击右上角关闭按钮
    const minBtn = document.getElementById("km-ul-min-btn");
    if (minBtn) {
      minBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeCard();
      });
    }

    // 窗口尺寸变化动态保持 anchor 对齐
    window.addEventListener("resize", function () {
      if (isOpen) positionCard();
    });

    // 点击外部空白区域自动关闭
    document.addEventListener("pointerdown", function (e) {
      if (!isOpen) return;
      if (root && root.contains(e.target)) return;
      if (minIcon && minIcon.contains(e.target)) return;
      if (aboutModal && aboutModal.contains(e.target)) return;
      if (debugModal && debugModal.contains(e.target)) return;
      closeCard();
    });

    // ESC 键关闭
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) {
        closeCard();
      }
    });

    const matrixBtn = document.getElementById("km-ul-matrix-btn");
    if (matrixBtn) {
      matrixBtn.addEventListener("click", function () {
        window.open("/api/plugin/unlock-test/pages/matrix.html", "_blank");
      });
    }

    // [Handover 优化]: 前端任务触发引擎，支持 force (强制抢占) 与 cancel (主动取消)
    async function triggerProbeWithClients(clients, force, cancel) {
      if (!cancel) {
        localProbingActive = true;
        localProbingStart = Date.now();
        renderServiceLogos();
        updateMinimizedIconState();

        if (localProbingTimer) clearInterval(localProbingTimer);
        localProbingTimer = setInterval(function () {
          if (!localProbingActive) {
            clearInterval(localProbingTimer);
            localProbingTimer = null;
            return;
          }
          fetchNodesAndSnapshot();
        }, 1500);
      } else {
        localProbingActive = false;
        if (localProbingTimer) {
          clearInterval(localProbingTimer);
          localProbingTimer = null;
        }
      }

      try {
        const reqPayload = {};
        if (Array.isArray(clients)) reqPayload.clients = clients;

        if (cancel) reqPayload.cancel = true;

        const response = await fetch("/api/plugin/unlock-test/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(reqPayload)
        });
        const payload = await response.json();
        if (!response.ok || (payload.status !== "success" && !payload.data && !payload.cancelled)) {
          throw new Error(payload.message || "Probe HTTP " + response.status);
        }
        dataError = "";
        await fetchNodesAndSnapshot();
        renderDebugModalContent();
      } catch (e) {
        dataError = e.message || String(e);
        localProbingActive = false;
        if (localProbingTimer) {
          clearInterval(localProbingTimer);
          localProbingTimer = null;
        }
        renderServiceLogos();
        console.warn("[unlock-test] probe trigger failed:", e);
      }
    }

    window.kmUlProbeCurrentNode = function () {
      if (prefs.selectedNode) {
        triggerProbeWithClients([prefs.selectedNode], true);
      } else {
        triggerProbeWithClients(undefined, true);
      }
    };
    window.kmUlProbeAllNodes = function () {
      triggerProbeWithClients(undefined, true);
    };
    window.kmUlCancelActiveTask = function () {
      triggerProbeWithClients(undefined, false, true);
    };

    document.getElementById("km-ul-probe-btn").addEventListener("click", async function () {
      const btn = document.getElementById("km-ul-probe-btn");
      btn.disabled = true;
      btn.textContent = "...";
      await triggerProbeWithClients(prefs.selectedNode ? [prefs.selectedNode] : undefined, true);
      btn.disabled = false;
      btn.textContent = t("trigger_probe");
    });

    // 关于弹窗
    document.getElementById("km-ul-about-btn").addEventListener("click", function () {
      aboutModal.classList.add("open");
    });
    document.getElementById("km-ul-about-close").addEventListener("click", function () {
      aboutModal.classList.remove("open");
    });
    aboutModal.addEventListener("click", function (ev) {
      if (ev.target === aboutModal) aboutModal.classList.remove("open");
    });

    // 诊断弹窗
    let debugPollTimer = null;
    function openDebugModal() {
      renderDebugModalContent();
      debugModal.classList.add("open");
      if (debugPollTimer) clearInterval(debugPollTimer);
      debugPollTimer = setInterval(async function () {
        if (!debugModal.classList.contains("open")) {
          clearInterval(debugPollTimer);
          debugPollTimer = null;
          return;
        }
        await fetchNodesAndSnapshot();
        renderDebugModalContent();
      }, 2000);
    }
    document.getElementById("km-ul-debug-btn").addEventListener("click", openDebugModal);
    document.getElementById("km-ul-stat-text").addEventListener("click", openDebugModal);
    document.getElementById("km-ul-debug-close").addEventListener("click", function () {
      debugModal.classList.remove("open");
      if (debugPollTimer) {
        clearInterval(debugPollTimer);
        debugPollTimer = null;
      }
    });
    debugModal.addEventListener("click", function (ev) {
      if (ev.target === debugModal) {
        debugModal.classList.remove("open");
        if (debugPollTimer) {
          clearInterval(debugPollTimer);
          debugPollTimer = null;
        }
      }
    });

    // 点击页面上的节点卡片时，联动选中该节点
    document.addEventListener("click", function (ev) {
      if (root.contains(ev.target)) return;
      const card = ev.target.closest(".km-node-card, .km-instance-server-item, [data-uuid], a[href*='/instance/']");
      if (card && allNodes.length > 0) {
        const text = card.textContent || "";
        const href = card.getAttribute("href") || "";
        const uuidAttr = card.getAttribute("data-uuid") || "";
        for (let i = 0; i < allNodes.length; i++) {
          const n = allNodes[i];
          if ((uuidAttr && uuidAttr === n.uuid) || (href && href.indexOf(n.uuid) >= 0) || (n.name && text.indexOf(n.name) >= 0)) {
            prefs.selectedNode = n.uuid;
            lastDetailNodeUUID = n.uuid;
            savePrefs();
            schedulePageSync();
            break;
          }
        }
      } else {
        schedulePageSync();
      }
    }, true);
  }

  function renderDebugModalContent() {
    const box = document.getElementById("km-ul-debug-content");
    if (!box) return;

    const snap = snapshotData || {};
    const active = snap.activeTask;
    const last = snap.lastTask;
    const nodeUUID = prefs.selectedNode;
    const currentNode = (snap.nodes && nodeUUID) ? snap.nodes[nodeUUID] : null;

    const lines = [];

    if (active) {
      lines.push('<div style="background:rgba(6,182,212,0.12);border:1px solid #06b6d4;border-radius:8px;padding:12px;margin-bottom:12px;">');
      lines.push('  <div style="font-weight:700;color:#67e8f9;margin-bottom:4px;">🚀 后台探测任务执行中 (Task ID: ' + escapeHTML(active.taskId) + ')</div>');
      lines.push('  <div>已运行时间: <strong>' + (active.elapsedSeconds || 0) + 's</strong> | 节点完成度: <strong>' + (active.finishedCount || 0) + ' / ' + (active.totalCount || 0) + '</strong></div>');
      lines.push('  <div style="font-size:13px;color:#94a3b8;margin-top:4px;">下发指令预览: <code>' + escapeHTML((snap.commandPreview || "unlock-test -region 0,11")) + '</code></div>');
      lines.push('</div>');
    } else {
      lines.push('<p style="font-size:14px;color:#94a3b8;">当前无执行中任务。上次快照时间: <code>' + escapeHTML((snap.updatedAt || "无")) + '</code></p>');
    }

    lines.push('<h4 style="margin:14px 0 6px 0;font-size:16px;">当前选中节点诊断: ' + escapeHTML(((currentNode && currentNode.name) || nodeUUID || "未选择")) + '</h4>');

    if (!currentNode) {
      lines.push('<p style="color:#f87171">尚未获取到该节点的解锁快照数据。可能原因：</p>');
      lines.push('<ul style="padding-left:20px;font-size:14px;color:#94a3b8;line-height:1.6;">');
      lines.push('  <li>节点当前处于离线状态，未接收到 <code>admin:exec</code> 任务</li>');
      lines.push('  <li>节点环境缺少 <code>curl</code> 或 <code>wget</code>，未能下载 <code>unlock-test</code> 二进制</li>');
      lines.push('  <li>网络访问 <code>https://unlock.icmp.ing/</code> 超时或受阻</li>');
      lines.push('</ul>');
    } else {
      lines.push('<div style="font-family:var(--km-ul-mono);font-size:14px;line-height:1.7;">');
      lines.push('  <div>UUID: <code>' + escapeHTML(currentNode.uuid) + '</code></div>');
      lines.push('  <div>Web SSH (远程执行): <strong style="color:' + (currentNode.webSshDisabled ? "#f87171" : "#34d399") + '">' + (currentNode.webSshDisabled ? "已禁用 (--disable-web-ssh)" : "正常启用") + '</strong></div>');
      lines.push('  <div>Exit Code: <strong style="color:' + (currentNode.exitCode === 0 ? "#34d399" : "#f87171") + '">' + escapeHTML(currentNode.exitCode) + '</strong></div>');
      lines.push('  <div>完成时间: ' + escapeHTML((currentNode.finishedAt || "未知")) + '</div>');
      lines.push('  <div>解析服务数: <strong>' + ((currentNode.services && currentNode.services.length) || 0) + '</strong></div>');
      if (currentNode.error) {
        lines.push('  <div style="color:#f87171;margin-top:4px;">错误信息: <strong>' + escapeHTML(currentNode.error) + '</strong></div>');
      }
      lines.push('</div>');

      if (currentNode.rawOutputSnippet) {
        lines.push('<div style="margin-top:10px;font-size:13px;color:#94a3b8;">原始终端输出片断 (Raw stdout):</div>');
        lines.push('<div class="km-ul-debug-terminal">' + escapeHTML(currentNode.rawOutputSnippet) + '</div>');
      }
    }

    if (isAdminUser) {
      lines.push('<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">');
      if (active) {
        lines.push('  <button class="km-ul-ip-pill" style="border-color:#ef4444;color:#f87171;" onclick="window.kmUlCancelActiveTask();">取消当前探测</button>');
      }
      if (nodeUUID) {
        lines.push('  <button class="km-ul-ip-pill active" onclick="window.kmUlProbeCurrentNode();">重新探测当前节点 (' + escapeHTML((currentNode && currentNode.name) || nodeUUID) + ')</button>');
      }
      lines.push('  <button class="km-ul-ip-pill" onclick="window.kmUlProbeAllNodes();">全节点重新探测</button>');
      lines.push('</div>');
    }

    box.innerHTML = lines.join("\n");
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderNodeSelect() {
    const selectEl = document.getElementById("km-ul-node-select");
    if (!selectEl) return;
    selectEl.innerHTML = "";

    if (!pageVisibleNodes || pageVisibleNodes.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("no_nodes");
      selectEl.appendChild(opt);
      return;
    }

    for (let i = 0; i < pageVisibleNodes.length; i++) {
      const n = pageVisibleNodes[i];
      const opt = document.createElement("option");
      opt.value = n.uuid;
      opt.textContent = n.name || n.uuid;
      if (n.uuid === prefs.selectedNode) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  // IPv4 wins whenever it unlocks. IPv6-only success is explicitly labelled.
  function resolveServiceDisplayForStack(svc) {
    const primary = svc.ipv4 || svc.auto;
    const useV6 = !(primary && primary.unlocked) && Boolean(svc.ipv6 && svc.ipv6.unlocked);
    const chosen = useV6 ? svc.ipv6 : (primary || svc.ipv6);
    if (!chosen) return null;
    const label = chosen.region || (chosen.unlocked ? "YES" : (chosen.status || "NO"));
    return {
      unlocked: Boolean(chosen.unlocked),
      region: (useV6 ? "V6 " : "") + label,
      viaV6: useV6,
      raw: [
        svc.ipv4 ? ("IPv4: " + svc.ipv4.raw) : "",
        svc.ipv6 ? ("IPv6: " + svc.ipv6.raw) : "",
        svc.auto ? ("Auto: " + svc.auto.raw) : ""
      ].filter(Boolean).join(" | ")
    };
  }

  function renderServiceLogos() {
    const container = document.getElementById("km-ul-grid-container");
    const statEl = document.getElementById("km-ul-stat-text");
    const probeBtn = document.getElementById("km-ul-probe-btn");
    if (!container || !statEl) return;

    const nodeUUID = prefs.selectedNode;
    const nodeSnap = (snapshotData && snapshotData.nodes && nodeUUID) ? snapshotData.nodes[nodeUUID] : null;
    const enabledRegions = (snapshotData && Array.isArray(snapshotData.regions)) ? snapshotData.regions : ["0", "11"];

    const activeTask = snapshotData && snapshotData.activeTask;
    const isNodeProbing = Boolean(
      localProbingActive ||
      (activeTask && (!activeTask.clients || activeTask.clients.indexOf(nodeUUID) >= 0))
    );

    if (probeBtn) {
      if (isNodeProbing) {
        probeBtn.disabled = true;
        probeBtn.textContent = "探测中...";
      } else {
        probeBtn.disabled = false;
        probeBtn.textContent = t("trigger_probe");
      }
    }

    // 核心优化：探测开始时立即替换旧数据，展示流线型雷达探测动效，杜绝老旧信息停留在页面
    if (isNodeProbing) {
      const elapsed = (activeTask && activeTask.elapsedSeconds !== undefined)
        ? activeTask.elapsedSeconds
        : Math.round((Date.now() - (localProbingStart || Date.now())) / 1000);
      container.innerHTML = [
        '<div class="km-ul-probing-container">',
        '  <div class="km-ul-probing-radar-box">',
        '    <div class="km-ul-probing-wave"></div>',
        '    <div class="km-ul-probing-wave delay1"></div>',
        '    <div class="km-ul-probing-wave delay2"></div>',
        '    <div class="km-ul-probing-radar-core">⚡</div>',
        '  </div>',
        '  <div class="km-ul-probing-title">' + "正在实时探测流媒体与 AI 解锁..." + '</div>',
        '  <div class="km-ul-probing-sub">' + ("节点正在测试各项服务并直接回传 (" + elapsed + "秒)...") + '</div>',
        '  <div class="km-ul-probing-bar"><div class="km-ul-probing-bar-fill"></div></div>',
        '</div>'
      ].join("\n");
      statEl.innerHTML = '<span class="km-ul-stat-dot-probing"></span> ' + ("正在探测 (" + elapsed + "秒)...");
      return;
    }

    const warnBanner = (nodeSnap && nodeSnap.webSshDisabled)
      ? ('<div class="km-ul-warn-banner">⚠️ ' + "该节点已开启 --disable-web-ssh，远程命令下发已被禁用。请在 VPS 启动参数中移除此开关。" + '</div>')
      : "";

    if (!nodeSnap || !Array.isArray(nodeSnap.services) || nodeSnap.services.length === 0) {
      let emptyMsg = t("no_snapshot");
      const lastError = dataError || (nodeSnap && nodeSnap.error) || (snapshotData && snapshotData.telemetry && snapshotData.telemetry.lastError);
      if (lastError) {
        emptyMsg = "探测异常：" + lastError;
      }
      container.innerHTML = warnBanner + '<div class="km-ul-empty-state" style="cursor:pointer;" onclick="document.getElementById(\'km-ul-debug-btn\').click()">' + escapeHTML(emptyMsg) + "</div>";
      statEl.textContent = lastError ? "探测失败" : "0 / 0";
      return;
    }

    const grid = document.createElement("div");
    grid.className = "km-ul-logo-grid";

    let totalShown = 0;
    let unlockedCount = 0;

    for (let i = 0; i < nodeSnap.services.length; i++) {
      const svc = nodeSnap.services[i];
      if (enabledRegions.indexOf(String(svc.regionId)) < 0) continue;

      const resolved = resolveServiceDisplayForStack(svc);
      if (!resolved) continue;

      totalShown++;
      if (resolved.unlocked) unlockedCount++;

      const card = document.createElement("div");
      card.className = "km-ul-service-card " + (resolved.unlocked ? "unlocked" : "locked") + (resolved.viaV6 ? " via-v6" : "");
      card.title = svc.name + (resolved.raw ? (" — " + resolved.raw) : "");

      const svgIcon = (window.KomariUnlockLogos && window.KomariUnlockLogos.getServiceSVG)
        ? window.KomariUnlockLogos.getServiceSVG(svc.name)
        : "";

      card.innerHTML = [
        '<div class="km-ul-logo-box">' + svgIcon + "</div>",
        '<div class="km-ul-service-name">' + escapeHTML(svc.displayName || svc.name) + "</div>",
        '<div class="km-ul-region-sub">' + escapeHTML(resolved.region || (resolved.unlocked ? "OK" : "NO")) + "</div>"
      ].join("");

      grid.appendChild(card);
    }

    container.innerHTML = "";
    if (totalShown === 0) {
      container.innerHTML = '<div class="km-ul-empty-state">' + t("no_snapshot") + "</div>";
    } else {
      container.appendChild(grid);
    }

    statEl.textContent = unlockedCount + " / " + totalShown + " " + t("unlocked_stat") +
      ((dataError || nodeSnap.error) ? " · 更新失败（保留上次结果）" : "");
    statEl.title = dataError || nodeSnap.error || "";
  }

  function initButtonDraggable(btn) {
    if (!btn) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let origL = 0, origT = 0;

    btn.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      btn.setPointerCapture(e.pointerId);
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      origL = rect.left;
      origT = rect.top;
    });

    btn.addEventListener("pointermove", function (e) {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        isDragging = true;
        const newL = Math.max(10, Math.min(window.innerWidth - 58, origL + dx));
        const newT = Math.max(10, Math.min(window.innerHeight - 58, origT + dy));
        btn.style.setProperty("left", newL + "px", "important");
        btn.style.setProperty("top", newT + "px", "important");
        btn.style.setProperty("right", "auto", "important");
        btn.style.setProperty("bottom", "auto", "important");
        if (isOpen) {
          positionCard();
        }
      }
    });

    btn.addEventListener("pointerup", function (e) {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
      if (isDragging) {
        const rect = btn.getBoundingClientRect();
        const safePos = resolveFabPosition(rect.left, rect.top, btn, "unlock-test");
        if (safePos.left !== rect.left || safePos.top !== rect.top) {
          btn.style.transition = "left 0.2s cubic-bezier(0.2, 0, 0, 1), top 0.2s cubic-bezier(0.2, 0, 0, 1)";
          btn.style.setProperty("left", safePos.left + "px", "important");
          btn.style.setProperty("top", safePos.top + "px", "important");
          setTimeout(function () {
            btn.style.transition = "border-color 0.25s, box-shadow 0.25s, transform 0.15s";
          }, 250);
        }
        prefs.iconPos = { left: safePos.left + "px", top: safePos.top + "px" };
        savePrefs();
        if (isOpen) positionCard();
      } else {
        toggle();
      }
    });
  }

  function initCardDraggable(card, handle) {
    if (!card || !handle) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let origL = 0, origT = 0;

    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest("button, select, a")) return;
      handle.setPointerCapture(e.pointerId);
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = card.getBoundingClientRect();
      origL = rect.left;
      origT = rect.top;
      card.style.setProperty("bottom", "auto", "important");
      card.style.setProperty("top", origT + "px", "important");
      card.style.setProperty("left", origL + "px", "important");
      card.style.setProperty("right", "auto", "important");
    });

    handle.addEventListener("pointermove", function (e) {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        isDragging = true;
        const rect = card.getBoundingClientRect();
        const maxL = Math.max(8, window.innerWidth - rect.width - 8);
        const maxT = Math.max(8, window.innerHeight - rect.height - 8);
        const nextL = Math.max(8, Math.min(maxL, origL + dx));
        const nextT = Math.max(8, Math.min(maxT, origT + dy));
        card.style.setProperty("left", nextL + "px", "important");
        card.style.setProperty("top", nextT + "px", "important");
      }
    });

    handle.addEventListener("pointerup", function (e) {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    });
  }

  function initResizable(card, grip) {
    if (!card) return;

    if (grip) {
      let isResizing = false;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;

      grip.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = card.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
      });

      grip.addEventListener("pointermove", function (e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const isBottomAnchored = card.style.bottom && card.style.bottom !== "auto";

        const minW = 320;
        const maxW = Math.max(minW, window.innerWidth - 28);
        const minH = 200;
        const maxH = Math.max(minH, window.innerHeight - 28);

        const newW = Math.max(minW, Math.min(maxW, startW + dx));
        const newH = Math.max(minH, Math.min(maxH, startH + (isBottomAnchored ? -dy : dy)));

        card.style.setProperty("width", newW + "px", "important");
        card.style.setProperty("height", newH + "px", "important");
      });

      function endResize(e) {
        if (!isResizing) return;
        isResizing = false;
        try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
        const rect = card.getBoundingClientRect();
        prefs.cardSize = {
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        savePrefs();
        positionCard();
      }

      grip.addEventListener("pointerup", endResize);
      grip.addEventListener("pointercancel", endResize);
    }

    if (window.ResizeObserver) {
      let roTimer = null;
      const ro = new ResizeObserver(function (entries) {
        if (!isOpen) return;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.target === card) {
            clearTimeout(roTimer);
            roTimer = setTimeout(function () {
              const rect = card.getBoundingClientRect();
              if (rect.width >= 250 && rect.height >= 180) {
                prefs.cardSize = {
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                };
                savePrefs();
              }
            }, 150);
          }
        }
      });
      ro.observe(card);
    }
  }

  function start() {
    loadPrefs();
    installNetworkObserver();

    if (!isExcludedAdminRoute()) {
      mountWidgetDOM();
    }

    fetchNodesAndSnapshot();

    const observer = new MutationObserver(function (mutations) {
      let pageChanged = false;
      let themeChanged = false;
      const themeElements = "style, link[rel='stylesheet'], .background-container, .default-background, .background-image, .bp-root, main, .node-card, .km-node-card";
      for (let i = 0; i < mutations.length; i++) {
        if (isPluginElement(mutations[i].target)) continue;
        pageChanged = true;
        const changedNodes = Array.from(mutations[i].addedNodes || []).concat(Array.from(mutations[i].removedNodes || []));
        for (let j = 0; j < changedNodes.length; j++) {
          const node = changedNodes[j];
          if (node.nodeType === 1 && !isPluginElement(node) &&
              ((node.matches && node.matches(themeElements)) || (node.querySelector && node.querySelector(themeElements)))) {
            themeChanged = true;
            break;
          }
        }
      }
      if (pageChanged) schedulePageSync();
      if (themeChanged) scheduleThemeSync();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    themeObserver = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        if (!isPluginElement(mutations[i].target)) {
          scheduleThemeSync();
          break;
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    themeObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "style", "data-theme"] });
    if (window.matchMedia) {
      const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (colorSchemeQuery.addEventListener) colorSchemeQuery.addEventListener("change", scheduleThemeSync);
      else if (colorSchemeQuery.addListener) colorSchemeQuery.addListener(scheduleThemeSync);
    }

    setInterval(function () {
      const root = document.getElementById("km-unlock-floating-root");
      const minIcon = document.getElementById("km-ul-min-icon");
      if (isExcludedAdminRoute()) {
        if (root) root.style.setProperty("display", "none", "important");
        if (minIcon) minIcon.style.setProperty("display", "none", "important");
      } else {
        if (!root || !minIcon) {
          mountWidgetDOM();
        } else {
          minIcon.style.removeProperty("display");
          if (isOpen) {
            root.style.setProperty("display", "flex", "important");
          } else {
            root.style.setProperty("display", "none", "important");
          }
        }
      }
    }, 500);

    async function refreshLoop() {
      const root = document.getElementById("km-unlock-floating-root");
      const minIcon = document.getElementById("km-ul-min-icon");
      if (isExcludedAdminRoute()) {
        if (root) root.style.setProperty("display", "none", "important");
        if (minIcon) minIcon.style.setProperty("display", "none", "important");
      } else {
        if (!document.getElementById("km-unlock-floating-root") || !document.getElementById("km-ul-min-icon")) mountWidgetDOM();
        await fetchNodesAndSnapshot();
      }
      setTimeout(refreshLoop, snapshotData && snapshotData.activeTask ? 4000 : 20000);
    }
    setTimeout(refreshLoop, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
