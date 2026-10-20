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

  // 48px 方形 SVG 格式图标：融合流媒体信号、解锁挂锁与 AI 矩阵神经元
  const MINIMIZED_SVG_ICON = [
    '<svg class="km-ul-minimized-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="url(#km-ul-bg-grad)" stroke="#06b6d4" stroke-width="2"/>',
    '  <!-- 开启的挂锁锁梁 (Unlocked Shackle) -->',
    '  <path d="M16 19V13C16 8.58 19.58 5 24 5C28.42 5 32 8.58 32 13V15" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>',
    '  <!-- 锁体 (Padlock Body) -->',
    '  <rect x="11" y="18" width="26" height="23" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>',
    '  <!-- 流媒体播放三角徽章 (Streaming Media Play Indicator) -->',
    '  <path d="M21 24.5L29 29.5L21 34.5V24.5Z" fill="#10b981"/>',
    '  <!-- AI 矩阵星芒 (AI Sparkle) -->',
    '  <path d="M33 17L33.9 19.8L37 20.7L33.9 21.6L33 24.5L32.1 21.6L29 20.7L32.1 19.8L33 17Z" fill="#38bdf8"/>',
    '  <!-- 渐变底色定义 -->',
    '  <defs>',
    '    <linearGradient id="km-ul-bg-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">',
    '      <stop offset="0%" stop-color="#090d16"/>',
    '      <stop offset="100%" stop-color="#1e293b"/>',
    '    </linearGradient>',
    '  </defs>',
    '</svg>'
  ].join("\n");

  let prefs = {
    selectedNode: "",
    minimized: false,
    pos: null
  };

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
  function mountWidgetDOM() {
    if (document.getElementById("km-unlock-floating-root")) return;

    const root = document.createElement("aside");
    root.id = "km-unlock-floating-root";
    if (prefs.minimized) {
      root.classList.add("km-ul-minimized");
      if (prefs.iconPos && prefs.iconPos.left && prefs.iconPos.top) {
        root.style.left = prefs.iconPos.left;
        root.style.top = prefs.iconPos.top;
        root.style.right = "auto";
        root.style.bottom = "auto";
      }
    } else {
      root.style.left = "50%";
      root.style.top = "50%";
      root.style.transform = "translate(-50%, -50%)";
      root.style.right = "auto";
      root.style.bottom = "auto";
    }

    root.innerHTML = [
      '<!-- 64px 方形 SVG 格式未展开悬浮图标 -->',
      '<div class="km-ul-minimized-icon-box" id="km-ul-min-icon" title="' + t("minimized_tooltip") + '">',
      MINIMIZED_SVG_ICON,
      '  <span class="km-ul-minimized-badge-dot" id="km-ul-min-badge"></span>',
      "</div>",

      '<!-- 展开后的完整内容面板 -->',
      '<div class="km-ul-header" id="km-ul-drag-handle">',
      '  <div class="km-ul-title-wrap">',
      '    <span class="km-ul-drag-grip">⠿</span>',
      '    <span id="km-ul-title-text">' + t("title") + "</span>",
      "  </div>",
      '  <div class="km-ul-header-actions">',
      '    <button class="km-ul-icon-btn" id="km-ul-probe-btn" style="display:none" title="发起后台探测">' + t("trigger_probe") + "</button>",
      '    <button class="km-ul-icon-btn" id="km-ul-matrix-btn" title="查看全节点解锁矩阵大表">📊 解锁矩阵</button>',
      '    <button class="km-ul-icon-btn" id="km-ul-min-btn" title="收起浮窗">—</button>',
      "  </div>",
      "</div>",
      '<div class="km-ul-body">',
      '  <div class="km-ul-toolbar" style="margin:-14px -14px 12px -14px;">',
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
      "</div>"
    ].join("\n");

    document.body.appendChild(root);

    // 关于弹窗 (About Modal)
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

    // 诊断与调试信息弹窗 (Diagnostics & Debug Modal)
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

    bindWidgetEvents(root, aboutModal, debugModal);
    initDraggable(root, document.getElementById("km-ul-drag-handle"), document.getElementById("km-ul-min-icon"));
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

  function bindWidgetEvents(root, aboutModal, debugModal) {
    const selectEl = document.getElementById("km-ul-node-select");
    selectEl.addEventListener("change", function () {
      prefs.selectedNode = selectEl.value;
      savePrefs();
      renderServiceLogos();
      updateMinimizedIconState();
    });

    // 展开/折叠切换
    function setMinimized(minimized) {
      prefs.minimized = minimized;
      savePrefs();
      root.classList.toggle("km-ul-minimized", prefs.minimized);
      root.style.width = "";
      root.style.height = "";

      if (!minimized) {
        // 核心优化 5：点击图标展开时，无论 icon 位于屏幕何处，窗口永远在屏幕正中间展开，杜绝跑出屏幕
        root.style.left = "50%";
        root.style.top = "50%";
        root.style.transform = "translate(-50%, -50%)";
        root.style.right = "auto";
        root.style.bottom = "auto";
      } else {
        // 折叠为 48px 图标：恢复图标位置并清除居中 translate
        root.style.transform = "";
        if (prefs.iconPos && prefs.iconPos.left && prefs.iconPos.top) {
          root.style.left = prefs.iconPos.left;
          root.style.top = prefs.iconPos.top;
          root.style.right = "auto";
          root.style.bottom = "auto";
        } else {
          root.style.right = "24px";
          root.style.bottom = "28px";
          root.style.left = "auto";
          root.style.top = "auto";
        }
      }

      updateMinimizedIconState();
    }

    // 点击 64px 悬浮图标展开
    const minIcon = document.getElementById("km-ul-min-icon");
    minIcon.addEventListener("click", function (e) {
      if (root.getAttribute("data-dragged") === "yes") {
        root.removeAttribute("data-dragged");
        return;
      }
      setMinimized(false);
    });

    // 点击展开面板右上角最小化按钮收缩到 64px
    document.getElementById("km-ul-min-btn").addEventListener("click", function () {
      setMinimized(true);
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

  function initDraggable(widget, handle, minHandle) {
    if (!widget) return;
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;
    let totalMoved = 0;

    function startDrag(clientX, clientY, target) {
      if (target && target.closest("button, select, a")) return;
      dragging = true;
      totalMoved = 0;
      const rect = widget.getBoundingClientRect();
      widget.style.transform = ""; // 清除居中 transform，平滑切换为绝对像素定位
      widget.style.left = rect.left + "px";
      widget.style.top = rect.top + "px";
      widget.style.right = "auto";
      widget.style.bottom = "auto";
      startX = clientX;
      startY = clientY;
      origLeft = rect.left;
      origTop = rect.top;
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      totalMoved = Math.abs(dx) + Math.abs(dy);
      const maxLeft = Math.max(8, window.innerWidth - widget.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - widget.offsetHeight - 8);
      const nextLeft = Math.max(8, Math.min(maxLeft, origLeft + dx));
      const nextTop = Math.max(8, Math.min(maxTop, origTop + dy));
      widget.style.left = nextLeft + "px";
      widget.style.top = nextTop + "px";
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (totalMoved > 6) {
        widget.setAttribute("data-dragged", "yes");
        if (widget.classList.contains("km-ul-minimized")) {
          prefs.iconPos = { left: widget.style.left, top: widget.style.top };
        } else {
          prefs.pos = { left: widget.style.left, top: widget.style.top };
        }
        savePrefs();
      }
    }

    if (handle) {
      handle.addEventListener("mousedown", function (e) { startDrag(e.clientX, e.clientY, e.target); });
      handle.addEventListener("touchstart", function (e) {
        if (e.touches && e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
    }

    if (minHandle) {
      minHandle.addEventListener("mousedown", function (e) { startDrag(e.clientX, e.clientY, e.target); });
      minHandle.addEventListener("touchstart", function (e) {
        if (e.touches && e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
    }

    window.addEventListener("mousemove", function (e) { moveDrag(e.clientX, e.clientY); });
    window.addEventListener("touchmove", function (e) {
      if (dragging && e.touches && e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
  }

  function start() {
    loadPrefs();
    installNetworkObserver();

    if (!isExcludedAdminRoute()) {
      mountWidgetDOM();
    }

    fetchNodesAndSnapshot();

    const observer = new MutationObserver(function (mutations) {
      const root = document.getElementById("km-unlock-floating-root");
      for (let i = 0; i < mutations.length; i++) {
        if (!root || !root.contains(mutations[i].target)) {
          schedulePageSync();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(function () {
      const root = document.getElementById("km-unlock-floating-root");
      if (isExcludedAdminRoute()) {
        if (root) {
          root.style.setProperty("display", "none", "important");
          const overlay = root.querySelector(".km-unlock-floating-overlay");
          if (overlay) overlay.style.setProperty("display", "none", "important");
        }
      } else {
        if (!root) {
          mountWidgetDOM();
        } else if (root.style.display === "none") {
          root.style.setProperty("display", "", "");
        }
      }
    }, 500);

    async function refreshLoop() {
      const root = document.getElementById("km-unlock-floating-root");
      if (isExcludedAdminRoute()) {
        if (root) root.style.setProperty("display", "none", "important");
      }
      if (!isExcludedAdminRoute()) {
        if (!document.getElementById("km-unlock-floating-root")) mountWidgetDOM();
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
