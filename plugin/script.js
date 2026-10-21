// plugin/script.js
// Komari Plugin: MediaUnlockTest (unlock-test)
// Author: livingfree2023@outlook.com
// 遵循读写分离（Read/Write Separation）：后台 Cron / 鉴权触发探测写入快照，前台注入浮层秒级读取快照

const server = require("server");
const probeLib = require("./lib/probe.js");

let probeManager = null;
let startupTimer = null;

function sendJSON(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isAdministrator(req) {
  const ctx = req && req.context;
  return Boolean(ctx && (ctx.role === "admin" ||
    (ctx.principal && Array.isArray(ctx.principal.roles) && ctx.principal.roles.indexOf("admin") >= 0)));
}

function load() {
  probeManager = probeLib.createProbeManager(server);
  probeManager.loadSnapshotFromDisk();

  // 1. 挂载前端静态资源目录 (/api/plugin/unlock-test/assets/*)
  server.static("/api/plugin/unlock-test/assets", "assets");
  server.static("/api/plugin/unlock-test/pages", "pages");

  // 2. 读路径接口：零阻塞返回预热快照与当前勾选的 -region 配置
  server.route("GET", "/api/plugin/unlock-test/snapshot", async (req, res) => {
    const isAdmin = isAdministrator(req);
    try { await probeManager.refreshClientMetadata(); }
    catch (err) {
      sendJSON(res, 503, {status: "error", message: "Unable to verify current node visibility"});
      return;
    }
    const data = probeManager.getPublicSnapshot(isAdmin);
    sendJSON(res, 200, {
      status: "success",
      data: data
    });
  });

  // 3. 诊断与透明度调试接口：返回实时任务状态、每个节点的执行 exitCode、原始 stdout、耗时及日志
  server.route("GET", "/api/plugin/unlock-test/debug", (req, res) => {
    if (!isAdministrator(req)) {
      sendJSON(res, 403, { status: "error", message: "Administrator role required" });
      return;
    }
    const data = probeManager.getDebugInfo();
    sendJSON(res, 200, {
      status: "success",
      data: data
    });
  });

  // 4. 写路径接口：管理员手动触发后台探测或取消卡死任务
  // 取消请求保留任务跟踪，直到远端返回；重复请求不会并发重启。
  server.route("POST", "/api/plugin/unlock-test/probe", async (req, res) => {
    const isAdmin = isAdministrator(req);
    if (!isAdmin) {
      sendJSON(res, 403, {
        status: "error",
        message: "Forbidden: administrator role required to trigger unlock probe"
      });
      return;
    }

    let bodyObj = {};
    if (req && req.body) {
      try {
        bodyObj = JSON.parse(req.body);
      } catch (_) {
        sendJSON(res, 400, { status: "error", message: "Invalid JSON body" });
        return;
      }
      if (!bodyObj || typeof bodyObj !== "object" || Array.isArray(bodyObj)) {
        sendJSON(res, 400, { status: "error", message: "Expected an object" });
        return;
      }
    }

    if (bodyObj.clients !== undefined && (!Array.isArray(bodyObj.clients) ||
        bodyObj.clients.some(function (uuid) { return typeof uuid !== "string"; }))) {
      sendJSON(res, 400, {status: "error", message: "clients must be an array of node UUIDs"});
      return;
    }
    try {
      const result = await probeManager.triggerProbe({
        clients: Array.isArray(bodyObj.clients) ? bodyObj.clients : undefined,
        force: Boolean(bodyObj.force),
        cancel: Boolean(bodyObj.cancel),
        reason: "manual_api"
      });
      sendJSON(res, result.triggered || result.cancelled || result.reason === "already_running" ? 200 : 503, {
        status: result.triggered || result.cancelled || result.reason === "already_running" ? "success" : "error",
        message: result.message || result.reason,
        data: result
      });
    } catch (err) {
      sendJSON(res, 500, {
        status: "error",
        message: err && err.message ? err.message : String(err)
      });
    }
  });

  // 5. 注册插件 RPC 方法，方便内部或管理端调用
  server.registerRPC("unlockTest:getSnapshot", () => {
    return probeManager.getPublicSnapshot(true);
  });

  server.registerRPC("unlockTest:getDebugInfo", () => {
    return probeManager.getDebugInfo();
  });

  server.registerRPC("unlockTest:triggerProbe", async (params) => {
    const clients = (params && Array.isArray(params.clients)) ? params.clients : undefined;
    return await probeManager.triggerProbe({ clients: clients, reason: "rpc" });
  });

  // 6. 注入 Komari 首页可拖动解锁浮层静态资源
  const headFragment = '<link rel="stylesheet" href="/api/plugin/unlock-test/assets/widget.css" />';
  const bodyFragment =
    '<script src="/api/plugin/unlock-test/assets/brand-icons.js" defer></script>' +
    '<script src="/api/plugin/unlock-test/assets/logos.js" defer></script>' +
    '<script src="/api/plugin/unlock-test/assets/widget.js" defer></script>';
  server.injectHTML(headFragment, bodyFragment);

  // Load configuration, register its cron, and resume persisted work asynchronously.
  startupTimer = setTimeout(async () => {
    if (!probeManager) return;
    try {
      await probeManager.syncConfigAndMaybeProbe();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (probeManager) {
        const snap = probeManager.loadSnapshotFromDisk();
        snap.telemetry.lastError = "Plugin initialization failed: " + message;
        probeManager.saveSnapshotToDisk(snap);
      }
      console.warn("[unlock-test] initial config sync error:", message);
    }
  }, 800);

  console.info("[unlock-test] plugin loaded with /snapshot and /debug endpoints");
}

function unload() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (probeManager) {
    probeManager.shutdown();
    probeManager = null;
  }
  console.info("[unlock-test] plugin unloaded");
}
