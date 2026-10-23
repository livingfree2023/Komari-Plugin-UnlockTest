// plugin/lib/probe.js
// 后台探测调度与读写分离快照存储模块 (Native 模式)
// Author: livingfree2023@outlook.com
// Write Path: server.cron / POST /probe -> admin:exec -> 异步轮询 admin:getTaskById -> 写入 __storageDir__/snapshot.json
// Read Path: 内存 + __storageDir__/snapshot.json 零阻塞快照读取

const fs = require("fs");
const path = require("path");
const parser = require("./parser.js");

const SNAPSHOT_FILENAME = "snapshot.json";
const POLL_INTERVAL_MS = 3000;
const MAX_TASK_TIMEOUT_MS = 300000; // 5 分钟超时保护

function getStorageFilePath() {
  const baseDir = (typeof __storageDir__ === "string" && __storageDir__) ? __storageDir__ : ".";
  return path.join(baseDir, SNAPSHOT_FILENAME);
}

// 内存日志缓冲区
const memoryLogs = [];
function log(level, message, data) {
  const timeStr = new Date().toISOString();
  const entry = {
    time: timeStr,
    level: level,
    message: message,
    data: data || null
  };
  memoryLogs.push(entry);
  if (memoryLogs.length > 100) memoryLogs.shift();

  const formatted = "[unlock-test] [" + timeStr.slice(11, 19) + "] [" + level.toUpperCase() + "] " + message + (data ? (" " + JSON.stringify(data)) : "");
  if (level === "error") console.error(formatted);
  else if (level === "warn") console.warn(formatted);
  else console.info(formatted);
}

// 规范化插件配置，提取勾选的 region 列表（默认 0, 11）
function normalizeConfig(rawCfg) {
  const cfg = rawCfg || {};
  const selectedRegions = [];

  for (let i = 0; i <= 11; i++) {
    const key = "region_" + i;
    const val = cfg[key];
    if (val === true || val === "true" || val === 1 || val === "1") {
      selectedRegions.push(String(i));
    } else if (val === undefined && (i === 0 || i === 11)) {
      selectedRegions.push(String(i));
    }
  }

  if (selectedRegions.length === 0) {
    selectedRegions.push("0", "11");
  }

  const ipModeRaw = String(cfg.ip_mode !== undefined ? cfg.ip_mode : "0").trim();
  const ipMode = (ipModeRaw === "4" || ipModeRaw === "6") ? ipModeRaw : "0";

  let concurrency = cfg.concurrency === undefined || cfg.concurrency === "" ? 30 : Number(cfg.concurrency);
  if (isNaN(concurrency) || concurrency < 0) concurrency = 30;
  concurrency = Math.floor(Math.min(concurrency, 200));

  const cronSpec = String(cfg.cron_spec || "0 */6 * * *").trim() || "0 */6 * * *";

  let targetNodes = [];
  if (Array.isArray(cfg.target_nodes)) {
    targetNodes = cfg.target_nodes.filter(Boolean);
  } else if (typeof cfg.target_nodes === "string" && cfg.target_nodes.trim()) {
    try {
      const parsed = JSON.parse(cfg.target_nodes);
      if (Array.isArray(parsed)) targetNodes = parsed.filter(Boolean);
    } catch (_) {}
  }

  const autoProbeOnSave = cfg.auto_probe_on_save !== false && cfg.auto_probe_on_save !== "false";

  const configSignature = [
    selectedRegions.join(","),
    ipMode,
    String(concurrency),
    targetNodes.slice().sort().join(",")
  ].join("|");

  return {
    regions: selectedRegions,
    regionArg: selectedRegions.join(","),
    ipMode: ipMode,
    concurrency: concurrency,
    cronSpec: cronSpec,
    targetNodes: targetNodes,
    autoProbeOnSave: autoProbeOnSave,
    signature: configSignature
  };
}

// 构造在目标 VPS 节点上执行的高可靠 Native shell 命令
// 1. 设置完整 PATH 并以绝对路径识别 /usr/bin/unlock-test、/usr/local/bin/unlock-test 等
// 2. 每次运行使用独立私有目录保存输出与完成标记，并对远端执行加互斥锁
// 3. 执行完毕后通过 cat 输出给 Komari 捕获并持久化保留日志供随时排查
function validateRunId(runId) {
  if (typeof runId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(runId)) throw new Error("Invalid run ID");
  return runId;
}

function buildRecoveryCommand(runId) {
  const dir = "/tmp/km-unlock-" + validateRunId(runId);
  return 'RUN_DIR="' + dir + '"\n' +
    'if [ ! -f "$RUN_DIR/exit" ]; then echo "Probe did not finish; no complete log available"; exit 1; fi\n' +
    'code=$(cat "$RUN_DIR/exit"); cat "$RUN_DIR/output.log"; exit "$code"';
}

function buildCancelCommand(runId) {
  return 'RUN_DIR="/tmp/km-unlock-' + validateRunId(runId) + '"\n' +
    '[ -d "$RUN_DIR" ] && [ -O "$RUN_DIR" ] && touch "$RUN_DIR/cancel"';
}

function buildRemoteCommand(normalizedCfg, runId) {
  validateRunId(runId);
  const baseFlags = "-region " + normalizedCfg.regionArg +
    (normalizedCfg.ipMode !== "0" ? " -m " + normalizedCfg.ipMode : "") + " -show-active=false";
  return [
    'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$HOME/.local/bin:$PATH"',
    'export TERM=dumb NO_COLOR=1',
    'umask 077',
    'RUN_DIR="/tmp/km-unlock-' + runId + '"',
    'mkdir "$RUN_DIR" || { echo "Run directory already exists"; exit 1; }',
    'LOG="$RUN_DIR/output.log"',
    'LOCK="/tmp/km-unlock-$(id -u).lock"',
    'if ! mkdir "$LOCK" 2>/dev/null; then echo "Another unlock probe is running" > "$LOG"; echo 75 > "$RUN_DIR/exit"; cat "$LOG"; exit 75; fi',
    'child=""; watcher=""',
    '# cleanup is invoked by the EXIT trap',
    '# shellcheck disable=SC2329',
    'cleanup() { [ -z "$child" ] || kill "$child" 2>/dev/null; [ -z "$watcher" ] || kill "$watcher" 2>/dev/null; rm -f "$RUN_DIR/unlock-test"; rmdir "$LOCK" 2>/dev/null; }',
    "trap 'cleanup' EXIT",
    "trap 'exit 143' TERM INT HUP",
    'BIN=""',
    '# [旧版二进制兼容性检测]: 只有当二进制存在且支持 -region 参数时才复用，避免旧版参数报错 (如 LAX.AMD.OCI)',
    'for candidate in /usr/bin/unlock-test /usr/local/bin/unlock-test "$HOME/.local/bin/unlock-test"; do',
    '  if [ -x "$candidate" ] && "$candidate" -h 2>&1 | grep -q -- "-region"; then BIN="$candidate"; break; fi',
    'done',
    'if [ -z "$BIN" ] && command -v unlock-test >/dev/null 2>&1; then',
    '  cand=$(command -v unlock-test); if "$cand" -h 2>&1 | grep -q -- "-region"; then BIN="$cand"; fi',
    'fi',
    'if [ -z "$BIN" ]; then',
    '  os=$(uname -s | tr "[:upper:]" "[:lower:]"); arch=$(uname -m)',
    '  case "$arch" in x86_64|amd64) arch=amd64;; aarch64|arm64) arch=arm64;; armv7*|armv8l) arch=arm7;; armv6*) arch=arm6;; i?86) arch=386;; *) echo "Unsupported architecture: $arch" > "$LOG"; cat "$LOG"; exit 1;; esac',
    '  target="$RUN_DIR/unlock-test"',
    '  url="https://unlock.icmp.ing/test/latest/unlock-test_${os}_${arch}"',
    '  if (curl -fsSL --connect-timeout 6 -m 30 "$url" -o "$target" || wget -q -T 8 "$url" -O "$target") && chmod +x "$target"; then BIN="$target"; fi',
    '  if [ -n "$BIN" ] && [ -w /usr/bin ]; then cp "$BIN" /usr/bin/unlock-test 2>/dev/null || true; fi',
    'fi',
    '# [NAT 小内存 VPS 保护]: 检测内存，小于 360MB 时自适应降低并发为 5 并限制单线程，防止 OOM 报错 (如 US.VMISS)',
    'CONC="' + normalizedCfg.concurrency + '"',
    "mem_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')",
    'if [ -n "$mem_kb" ] && [ "$mem_kb" -lt 360000 ]; then',
    '  export GOMAXPROCS=1',
    '  CONC=5',
    'fi',
    'set -- ' + baseFlags + ' -conc "$CONC"',
    'if [ -n "$BIN" ] && [ -x "$BIN" ]; then',
    '  if command -v timeout >/dev/null 2>&1; then',
    '    timeout -k 5 240 "$BIN" "$@" </dev/null > "$LOG" 2>/dev/null &',
    '  else',
    '    "$BIN" "$@" </dev/null > "$LOG" 2>/dev/null &',
    '  fi',
    '  child=$!',
    '  (elapsed=0; while kill -0 "$child" 2>/dev/null; do',
    '    if [ -f "$RUN_DIR/cancel" ] || [ "$elapsed" -ge 240 ]; then kill "$child" 2>/dev/null; sleep 5; kill -9 "$child" 2>/dev/null; break; fi',
    '    sleep 1; elapsed=$((elapsed + 1))',
    '  done) &',
    '  watcher=$!',
    '  wait "$child"; code=$?; child=""',
    '  kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null; watcher=""',
    '  [ ! -f "$RUN_DIR/cancel" ] || code=130',
    'else',
    '  echo "ERROR: unlock-test binary not found or failed to download" > "$LOG"',
    '  code=127',
    'fi',
    'echo "$code" > "$RUN_DIR/exit.tmp"; mv "$RUN_DIR/exit.tmp" "$RUN_DIR/exit"',
    'cat "$LOG"',
    'exit "$code"'
  ].join("\n");
}

function createProbeManager(server) {
  let memorySnapshot = null;
  let activePollTimer = null;
  let isUnloaded = false;
  let dispatching = false;
  let cronRegistered = false;
  let clientMetadata = null;

  function loadSnapshotFromDisk() {
    if (memorySnapshot) return memorySnapshot;
    const filePath = getStorageFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          memorySnapshot = parsed;
          memorySnapshot.nodes = memorySnapshot.nodes || {};
          memorySnapshot.telemetry = memorySnapshot.telemetry || {};
          return memorySnapshot;
        }
      }
    } catch (err) {
      log("warn", "Failed to read snapshot from disk", { error: err && err.message ? err.message : String(err) });
    }
    memorySnapshot = {
      schemaVersion: 1,
      configSignature: "",
      regions: ["0", "11"],
      ipMode: "0",
      concurrency: 30,
      commandPreview: "unlock-test -region 0,11 -conc 30 -show-active=false 2>/dev/null",
      updatedAt: null,
      activeTask: null,
      lastTask: null,
      nodes: {},
      telemetry: {
        lastTaskId: "",
        lastProbeStartedAt: null,
        lastProbeFinishedAt: null,
        lastProbeDurationMs: 0,
        lastProbeNodeCount: 0,
        totalProbesRun: 0,
        lastError: null
      }
    };
    return memorySnapshot;
  }

  function saveSnapshotToDisk(snap, strict) {
    memorySnapshot = snap;
    const filePath = getStorageFilePath();
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath + ".tmp", JSON.stringify(snap, null, 2));
      fs.renameSync(filePath + ".tmp", filePath);
    } catch (err) {
      log("error", "Failed to write snapshot to disk", { error: err && err.message ? err.message : String(err) });
      if (strict) throw err;
    }
  }

  function stopPolling() {
    if (activePollTimer) {
      clearTimeout(activePollTimer);
      activePollTimer = null;
    }
  }

  // 核心功能：主动探测 Agent 是否开启了 --disable-web-ssh 禁用远程命令下发
  async function checkNodeWebSsh(uuid) {
    try {
      const p = server.call("admin:getAgentStartupConfig", { uuid: uuid });
      const timeout = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, 2500);
      });
      const cfg = await Promise.race([p, timeout]);
      if (cfg && typeof cfg === "object") {
        const disabled = cfg.disable_web_ssh === true || cfg.disable_web_ssh === "true" ||
          cfg.web_ssh === false || cfg.web_ssh === "false";
        return !disabled;
      }
    } catch (_) {}
    return null; // 未知/老旧 Agent 或超时
  }

  async function refreshClientMetadata() {
    clientMetadata = null;
    const clients = await server.call("admin:listClients");
    if (!Array.isArray(clients)) throw new Error("Invalid client list");
    const map = {};
    clients.forEach(function (c) {
      if (c && c.uuid) map[c.uuid] = { uuid: c.uuid, name: c.name || c.uuid,
        group: c.group || "", region: c.region || "", hidden: Boolean(c.hidden) };
    });
    clientMetadata = map;
    const snap = loadSnapshotFromDisk();
    Object.keys(snap.nodes).forEach(function (uuid) {
      if (!map[uuid]) delete snap.nodes[uuid];
      else Object.assign(snap.nodes[uuid], {name: map[uuid].name, group: map[uuid].group,
        nodeRegion: map[uuid].region, hidden: map[uuid].hidden});
    });
    return map;
  }

  async function resolveOnlineTargetNodes(normalizedCfg, requestedUUIDs) {
    const clientNameMap = await refreshClientMetadata();
    const allClients = Object.keys(clientNameMap);
    let statusMap = {};
    try {
      statusMap = await server.call("common:getNodesLatestStatus") || {};
    } catch (err) { log("warn", "Unable to resolve online nodes", {error: String(err)}); }

    // 显式指定的单节点直接放行，不被 statusMap 过滤
    if (Array.isArray(requestedUUIDs)) {
      const explicitUUIDs = requestedUUIDs.filter(function (uuid, index, list) {
        return typeof uuid === "string" && clientNameMap[uuid] && list.indexOf(uuid) === index;
      });
      log("info", "Target nodes explicitly requested by caller", {
        count: explicitUUIDs.length,
        uuids: explicitUUIDs
      });
      return {
        uuids: explicitUUIDs,
        clientMeta: clientNameMap
      };
    }

    let candidateUUIDs = [];
    if (normalizedCfg.targetNodes && normalizedCfg.targetNodes.length > 0) {
      candidateUUIDs = normalizedCfg.targetNodes.slice();
    } else {
      candidateUUIDs = Object.keys(clientNameMap);
    }

    const onlineUUIDs = [];
    for (let i = 0; i < candidateUUIDs.length; i++) {
      const uuid = candidateUUIDs[i];
      const st = statusMap[uuid];
      if (st && st.online === true) {
        onlineUUIDs.push(uuid);
      }
    }

    // 无在线节点时保持空集合，避免定时任务误向离线节点下发。
    const finalUUIDs = onlineUUIDs.filter(function (uuid) { return Boolean(clientNameMap[uuid]); });
    log("info", "Resolved target nodes for probe", {
      totalClients: allClients.length,
      candidateCount: candidateUUIDs.length,
      onlineCount: onlineUUIDs.length,
      finalTargetUUIDs: finalUUIDs
    });

    return {
      uuids: finalUUIDs,
      clientMeta: clientNameMap
    };
  }

  function isCurrent(task) {
    return !isUnloaded && loadSnapshotFromDisk().activeTask === task;
  }

  function pendingClients(task) {
    return task.clients.filter(function (uuid) { return !task.completed[uuid]; });
  }

  function finishTask(task, error) {
    if (!isCurrent(task)) return;
    const snap = loadSnapshotFromDisk();
    const now = new Date().toISOString();
    pendingClients(task).forEach(function (uuid) {
      const meta = task.clientMeta[uuid] || {};
      const previous = snap.nodes[uuid] || {};
      snap.nodes[uuid] = Object.assign({}, previous, {
        uuid: uuid, name: meta.name || previous.name || uuid,
        hidden: Boolean(meta.hidden || previous.hidden),
        services: previous.services || [], meta: previous.meta || {},
        error: error || "Agent returned no result for this node",
        lastAttemptAt: now, taskId: task.taskId
      });
    });
    task.finishedAt = now;
    task.durationSeconds = Math.round((Date.now() - Date.parse(task.startedAt)) / 1000);
    task.error = error || null;
    snap.lastTask = task;
    snap.activeTask = null;
    snap.updatedAt = now;
    snap.telemetry.lastProbeFinishedAt = now;
    snap.telemetry.lastProbeDurationMs = Date.now() - Date.parse(task.startedAt);
    snap.telemetry.lastError = error || null;
    stopPolling();
    saveSnapshotToDisk(snap);
    log(error ? "warn" : "info", "Probe task finalized", { taskId: task.taskId, error: error || null });
  }

  async function applyResult(task, result) {
    const uuid = result.client;
    if (task.clients.indexOf(uuid) < 0 || task.completed[uuid] || !result.finished_at) return;
    const snap = loadSnapshotFromDisk();
    const rawText = String(result.result || "");
    const parsed = parser.parseUnlockTestOutput(rawText);
    const meta = task.clientMeta[uuid] || {};
    const old = snap.nodes[uuid] || {};
    const exitCode = result.exit_code;

    let webSshStatus = null;
    let isWebSshDisabled = false;

    // 若结果为空或执行失败，主动探测是否由于 --disable-web-ssh 导致
    if (exitCode !== 0 || !parsed.services.length) {
      webSshStatus = await checkNodeWebSsh(uuid);
      if (webSshStatus === false) {
        isWebSshDisabled = true;
      }
    }

    let error = null;
    if (isWebSshDisabled) {
      error = "该节点已开启 --disable-web-ssh，远程命令下发已被 Agent 禁用";
    } else if (exitCode !== 0 || !parsed.services.length) {
      const stripped = parser.stripAnsi(rawText).trim();
      error = "Exit " + exitCode + ": " + (stripped.slice(0, 400) || "Empty task output");
    }

    if (!isCurrent(task)) return;
    snap.nodes[uuid] = {
      uuid: uuid, name: meta.name || old.name || uuid,
      group: meta.group || old.group || "", nodeRegion: meta.region || old.nodeRegion || "",
      hidden: Boolean(meta.hidden), exitCode: exitCode, finishedAt: result.finished_at,
      updatedAt: error && old.updatedAt ? old.updatedAt : new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(), taskId: task.taskId,
      meta: parsed.services.length ? parsed.meta : (old.meta || {}),
      services: parsed.services.length ? parsed.services : (old.services || []),
      webSshDisabled: isWebSshDisabled,
      error: error, rawOutput: rawText
    };
    task.completed[uuid] = true;
    task.nodeSummary[uuid] = { finished: true, exitCode: exitCode, finishedAt: result.finished_at, error: error, webSshDisabled: isWebSshDisabled };
    task.finishedCount = Object.keys(task.completed).length;
    log(error ? "warn" : "info", "Node result received", { node: uuid, services: parsed.services.length, exitCode: exitCode, webSshDisabled: isWebSshDisabled });
  }

  function pollTaskUntilDone(task) {
    stopPolling();
    if (!isCurrent(task)) return;
    activePollTimer = setTimeout(async function () {
      activePollTimer = null;
      if (!isCurrent(task)) return;
      let pollError = "";
      try {
        const info = await server.call("admin:getTaskById", { task_id: task.recoveryTaskId || task.taskId });
        if (!isCurrent(task)) return;
        if (!info || !Array.isArray(info.results)) throw new Error("Invalid task response: results must be an array");
        for (let i = 0; i < info.results.length; i++) {
          await applyResult(task, info.results[i]);
        }
        task.lastPollError = null;
      } catch (err) {
        if (!isCurrent(task)) return;
        pollError = err.message || String(err);
        task.lastPollError = pollError;
        log("warn", "Task result query failed", { taskId: task.taskId, error: pollError });
      }
      if (!isCurrent(task)) return;
      task.elapsedSeconds = Math.round((Date.now() - Date.parse(task.startedAt)) / 1000);
      task.lastPolledAt = new Date().toISOString();

      if (!pendingClients(task).length) {
        const failed = task.clients.some(function (uuid) { return task.nodeSummary[uuid] && task.nodeSummary[uuid].error; });
        finishTask(task, failed ? "One or more nodes failed; inspect node errors" : null);
        return;
      }

      saveSnapshotToDisk(loadSnapshotFromDisk());

      if (Date.now() >= Date.parse(task.deadlineAt)) {
        if (task.runId && task.phase !== "recovering") {
          // Read only this run's completed log; never re-run the provider tests.
          task.phase = "recovering";
          task.deadlineAt = new Date(Date.now() + 60000).toISOString();
          saveSnapshotToDisk(loadSnapshotFromDisk());
          try {
            const recovery = await server.call("admin:exec", {
              command: buildRecoveryCommand(task.runId), clients: pendingClients(task)
            });
            if (!isCurrent(task)) return;
            if (!recovery || !recovery.task_id) throw new Error("Recovery dispatch returned no task ID");
            task.recoveryTaskId = String(recovery.task_id);
            saveSnapshotToDisk(loadSnapshotFromDisk());
            pollTaskUntilDone(task);
          } catch (err) {
            finishTask(task, "Task query timed out: " + (pollError || String(err)));
          }
        } else {
          finishTask(task, pollError ? "Task query timed out: " + pollError : "Timed out waiting for Agent task results");
        }
      } else {
        pollTaskUntilDone(task);
      }
    }, POLL_INTERVAL_MS);
  }

  function taskForDisplay(task) {
    if (!task) return task;
    return Object.assign({}, task);
  }

  // 手动/定时触发探测调度入口
  // 取消请求发送到远端，保留任务跟踪直到 Agent 确认结束；重复/force 请求不会并发重启。
  async function triggerProbe(options) {
    const opts = options || {};
    const snap = loadSnapshotFromDisk();
    const current = snap.activeTask;

    if (opts.cancel) {
      if (!current) return { triggered: false, cancelled: true, message: "No active task to cancel" };
      if (!current.runId) return { triggered: false, reason: "already_running", message: "Legacy task is still running; wait for its deadline" };
      if (!current.cancelRequested) {
        current.cancelRequested = true;
        try {
          await server.call("admin:exec", {command: buildCancelCommand(current.runId), clients: pendingClients(current)});
        } catch (err) { current.cancelRequested = false; throw err; }
        saveSnapshotToDisk(snap);
      }
      return { triggered: false, cancelled: true, message: "Cancellation requested; waiting for Agent completion" };
    }
    // A force request must not abandon a process that is still running remotely.
    if (dispatching || current) return { triggered: false, reason: "already_running", taskId: current && current.taskId };

    if (isUnloaded) return { triggered: false, reason: "unloaded" };
    dispatching = true;
    try {
      return await dispatchProbe(options);
    } finally {
      dispatching = false;
    }
  }

  async function dispatchProbe(options) {
    const opts = options || {};
    const rawCfg = await server.getConfig();
    const normalizedCfg = normalizeConfig(rawCfg);
    const snap = loadSnapshotFromDisk();

    snap.regions = normalizedCfg.regions;
    snap.ipMode = normalizedCfg.ipMode;
    snap.concurrency = normalizedCfg.concurrency;
    snap.commandPreview = "unlock-test -region " + normalizedCfg.regionArg +
      (normalizedCfg.ipMode !== "0" ? (" -m " + normalizedCfg.ipMode) : "") +
      (normalizedCfg.concurrency > 0 ? (" -conc " + normalizedCfg.concurrency) : "") +
      " -show-active=false 2>/dev/null";

    const resolved = await resolveOnlineTargetNodes(normalizedCfg, opts.clients);
    if (!resolved.uuids || resolved.uuids.length === 0) {
      log("warn", "Cannot trigger probe: no online nodes available");
      snap.configSignature = normalizedCfg.signature;
      snap.telemetry.lastError = "No eligible online nodes available";
      saveSnapshotToDisk(snap);
      return {
        triggered: false,
        reason: "no_online_nodes",
        message: "No online nodes connected to Komari. Please ensure agents are running.",
        commandPreview: snap.commandPreview
      };
    }

    if (isUnloaded) return { triggered: false, reason: "unloaded" };
    const runId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
    const command = buildRemoteCommand(normalizedCfg, runId);
    log("info", "Dispatching native admin:exec probe command", {
      regions: normalizedCfg.regionArg,
      targetNodesCount: resolved.uuids.length,
      commandSnippet: command.slice(0, 240) + "..."
    });

    try {
      const execResp = await server.call("admin:exec", {
        command: command,
        clients: resolved.uuids
      });
      const taskId = execResp && execResp.task_id ? String(execResp.task_id) : "";
      if (!taskId) {
        throw new Error("admin:exec returned empty task_id: " + JSON.stringify(execResp));
      }

      const nowIso = new Date().toISOString();
      snap.configSignature = normalizedCfg.signature;

      snap.activeTask = {
        taskId: taskId,
        runId: runId,
        startedAt: nowIso,
        deadlineAt: new Date(Date.now() + MAX_TASK_TIMEOUT_MS).toISOString(),
        clientMeta: resolved.clientMeta,
        completed: {},
        phase: "running",
        elapsedSeconds: 0,
        clients: resolved.uuids,
        finishedCount: 0,
        totalCount: resolved.uuids.length,
        nodeSummary: {}
      };
      snap.telemetry.lastTaskId = taskId;
      snap.telemetry.lastProbeStartedAt = nowIso;
      snap.telemetry.lastProbeNodeCount = resolved.uuids.length;
      snap.telemetry.totalProbesRun = (snap.telemetry.totalProbesRun || 0) + 1;
      snap.telemetry.lastError = null;
      saveSnapshotToDisk(snap);

      log("info", "Probe task dispatched successfully", {
        taskId: taskId,
        clients: resolved.uuids
      });

      pollTaskUntilDone(snap.activeTask);

      return {
        triggered: true,
        taskId: taskId,
        clients: resolved.uuids,
        commandPreview: snap.commandPreview
      };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      log("error", "Failed to dispatch probe via admin:exec", { error: msg });
      snap.configSignature = normalizedCfg.signature;
      snap.telemetry.lastError = msg;
      saveSnapshotToDisk(snap);
      return {
        triggered: false,
        reason: msg,
        commandPreview: snap.commandPreview
      };
    }
  }

  async function syncConfigAndMaybeProbe() {
    const rawCfg = await server.getConfig();
    const normalizedCfg = normalizeConfig(rawCfg);
    const snap = loadSnapshotFromDisk();

    if (!cronRegistered) {
      try {
        server.cron(normalizedCfg.cronSpec, async function () {
          if (!isUnloaded) await triggerProbe({ reason: "scheduled_cron" });
        });
        cronRegistered = true;
      } catch (err) {
        log("error", "Invalid cron configuration", { error: err.message || String(err) });
      }
    }

    if (snap.activeTask) {
      const task = snap.activeTask;
      const isExpired = Date.now() >= Date.parse(task.deadlineAt || 0);

      if (isExpired && !task.runId) {
        log("warn", "Aborting expired persisted task on reload", { taskId: task.taskId });
        finishTask(task, "Task deadline expired during reload");
      } else {
        task.clients = Array.isArray(task.clients) ? task.clients : [];
        task.completed = task.completed || {};
        task.nodeSummary = task.nodeSummary || {};
        task.clientMeta = task.clientMeta || snap.nodes;
        task.startedAt = isNaN(Date.parse(task.startedAt)) ? new Date(0).toISOString() : task.startedAt;
        task.deadlineAt = task.deadlineAt || new Date(Date.parse(task.startedAt) + MAX_TASK_TIMEOUT_MS).toISOString();
        task.totalCount = task.clients.length;
        saveSnapshotToDisk(snap);
        pollTaskUntilDone(task);
        log("info", "Resuming persisted native task", { taskId: task.taskId });
        return normalizedCfg;
      }
    }

    const sigChanged = snap.configSignature !== normalizedCfg.signature;
    const hasNodeData = snap.nodes && Object.keys(snap.nodes).length > 0;

    snap.regions = normalizedCfg.regions;
    snap.ipMode = normalizedCfg.ipMode;
    snap.concurrency = normalizedCfg.concurrency;
    snap.commandPreview = "unlock-test -region " + normalizedCfg.regionArg +
      (normalizedCfg.ipMode !== "0" ? (" -m " + normalizedCfg.ipMode) : "") +
      (normalizedCfg.concurrency > 0 ? (" -conc " + normalizedCfg.concurrency) : "") +
      " -show-active=false 2>/dev/null";
    saveSnapshotToDisk(snap);

    log("info", "Synced plugin configuration", {
      regions: normalizedCfg.regionArg,
      ipMode: normalizedCfg.ipMode,
      sigChanged: sigChanged,
      hasNodeData: hasNodeData,
      autoProbeOnSave: normalizedCfg.autoProbeOnSave
    });

    if (normalizedCfg.autoProbeOnSave && (sigChanged || !hasNodeData)) {
      await triggerProbe({ reason: sigChanged ? "config_changed" : "initial_load" });
    }
    return normalizedCfg;
  }

  function getPublicSnapshot(isAdmin) {
    const snap = loadSnapshotFromDisk();
    const filteredNodes = {};
    const nodeKeys = Object.keys(Object.assign({}, snap.nodes || {}, clientMetadata || {}));
    for (let i = 0; i < nodeKeys.length; i++) {
      const uuid = nodeKeys[i];
      const currentMeta = clientMetadata && clientMetadata[uuid];
      const nodeData = snap.nodes[uuid] || (currentMeta && {
        uuid: uuid, name: currentMeta.name, group: currentMeta.group, nodeRegion: currentMeta.region,
        hidden: currentMeta.hidden, services: [], meta: {}, updatedAt: null, error: null
      });
      if (!nodeData) continue;
      if (!isAdmin && (!clientMetadata || !clientMetadata[uuid] || clientMetadata[uuid].hidden)) continue;
      filteredNodes[uuid] = isAdmin ? nodeData : Object.assign({}, nodeData, {
        rawOutput: undefined,
        rawOutputSnippet: undefined,
        meta: Object.assign({}, nodeData.meta, { ipv4: undefined, ipv6: undefined }),
        error: nodeData.error ? "Last probe failed; administrator diagnostics required" : null
      });
    }
    function publicTask(task) {
      if (!task || isAdmin) return taskForDisplay(task);
      const visible = (task.clients || []).filter(function (uuid) {
        const meta = clientMetadata && clientMetadata[uuid];
        return meta && !meta.hidden;
      });
      const done = visible.filter(function (uuid) { return task.nodeSummary && task.nodeSummary[uuid] && task.nodeSummary[uuid].finished; });
      return { startedAt: task.startedAt, finishedAt: task.finishedAt,
        elapsedSeconds: task.elapsedSeconds, phase: task.phase,
        clients: visible, totalCount: visible.length, finishedCount: done.length };
    }

    return {
      schemaVersion: snap.schemaVersion || 1,
      regions: snap.regions || ["0", "11"],
      regionsCatalog: parser.REGIONS,
      ipMode: snap.ipMode || "0",
      concurrency: snap.concurrency === undefined ? 30 : snap.concurrency,
      commandPreview: snap.commandPreview || "unlock-test -region 0,11 -conc 30 -show-active=false 2>/dev/null",
      updatedAt: snap.updatedAt,
      activeTask: publicTask(snap.activeTask),
      lastTask: publicTask(snap.lastTask),
      nodes: filteredNodes,
      telemetry: isAdmin ? snap.telemetry : { lastError: snap.telemetry.lastError ? "Last probe failed; administrator diagnostics required" : null }
    };
  }

  function getDebugInfo() {
    const snap = loadSnapshotFromDisk();
    return {
      time: new Date().toISOString(),
      storageFile: getStorageFilePath(),
      storageExists: fs.existsSync(getStorageFilePath()),
      activeTask: taskForDisplay(snap.activeTask),
      lastTask: taskForDisplay(snap.lastTask),
      configSignature: snap.configSignature,
      commandPreview: snap.commandPreview,
      regions: snap.regions,
      telemetry: snap.telemetry,
      nodeCount: Object.keys(snap.nodes || {}).length,
      nodeSummaries: Object.keys(snap.nodes || {}).map(function (uuid) {
        const n = snap.nodes[uuid];
        return {
          uuid: uuid,
          name: n.name,
          exitCode: n.exitCode,
          updatedAt: n.updatedAt,
          servicesCount: Array.isArray(n.services) ? n.services.length : 0,
          unlockedCount: Array.isArray(n.services) ? n.services.filter(function (s) { return s.unlocked; }).length : 0,
          webSshDisabled: Boolean(n.webSshDisabled),
          error: n.error || null,
          rawPreview: (n.rawOutput !== undefined ? n.rawOutput : (n.rawOutputSnippet || "")).slice(0, 160)
        };
      }),
      recentLogs: memoryLogs.slice(-40)
    };
  }

  function shutdown() {
    isUnloaded = true;
    stopPolling();
  }

  return {
    loadSnapshotFromDisk: loadSnapshotFromDisk,
    saveSnapshotToDisk: saveSnapshotToDisk,
    normalizeConfig: normalizeConfig,
    buildRemoteCommand: buildRemoteCommand,
  buildRecoveryCommand: buildRecoveryCommand,
    checkNodeWebSsh: checkNodeWebSsh,
    triggerProbe: triggerProbe,
    syncConfigAndMaybeProbe: syncConfigAndMaybeProbe,
    getPublicSnapshot: getPublicSnapshot,
    getDebugInfo: getDebugInfo,
    refreshClientMetadata: refreshClientMetadata,
    shutdown: shutdown
  };
}

module.exports = {
  normalizeConfig: normalizeConfig,
  buildRemoteCommand: buildRemoteCommand,
  buildRecoveryCommand: buildRecoveryCommand,
  createProbeManager: createProbeManager
};
