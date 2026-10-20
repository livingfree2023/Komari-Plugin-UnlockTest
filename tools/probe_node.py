#!/usr/bin/env python3
# tools/probe_node.py
# 远程触发单个或全部节点探测并输出实时进度与结果

import sys
import os
import json
import time
import urllib.request
import urllib.error

HOST = (sys.argv[1] if len(sys.argv) > 1 else "https://komari.leohou.org").rstrip("/")
TARGET_UUID = sys.argv[2] if len(sys.argv) > 2 else "8b6e4305-bbd8-4d2a-8086-91fe62409bc4"
API_KEY = sys.argv[3] if len(sys.argv) > 3 else "komari-WYfvToYPfT8joBHWrSJbb0MuhwKFmBq0"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "User-Agent": "Komari-Plugin-Probe/1.0"
}

print(f"🎯 目标主机: {HOST}")
print(f"🎯 探测节点 UUID: {TARGET_UUID}")

# Step 1: POST /api/plugin/unlock-test/probe
probe_url = f"{HOST}/api/plugin/unlock-test/probe"
payload = json.dumps({
    "clients": [TARGET_UUID] if TARGET_UUID and TARGET_UUID != "all" else []
}).encode("utf-8")

req = urllib.request.Request(probe_url, data=payload, headers=headers, method="POST")

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print(f"🚀 探测任务已下发: {result}")
except Exception as e:
    print(f"❌ 触发失败: {e}")
    sys.exit(1)

# Step 2: Poll snapshot
snap_url = f"{HOST}/api/plugin/unlock-test/snapshot"
debug_url = f"{HOST}/api/plugin/unlock-test/debug"

print("⏳ 正在轮询节点执行结果...")
start_time = time.time()
for tick in range(1, 20):
    time.sleep(2.5)
    elapsed = int(time.time() - start_time)
    try:
        with urllib.request.urlopen(urllib.request.Request(snap_url, headers=headers)) as resp:
            data = json.loads(resp.read().decode("utf-8")).get("data", {})
            active = data.get("activeTask")
            node = data.get("nodes", {}).get(TARGET_UUID, {})
            svc_count = len(node.get("services", []))
            unlocked_count = len([s for s in node.get("services", []) if s.get("unlocked")])
            exit_code = node.get("exitCode")

            print(f"  [{tick}] ({elapsed}s) 活跃任务: {bool(active)}, exitCode: {exit_code}, 服务数: {svc_count} (已解锁: {unlocked_count})")

            if svc_count > 0:
                print(f"\n🎉 探测成功！节点 {node.get('name', TARGET_UUID)} 共解析出 {svc_count} 个服务 (已解锁 {unlocked_count} 个):")
                for s in node.get("services", []):
                    status_text = "✅ YES" if s.get("unlocked") else "❌ NO "
                    region_str = f"({s.get('region')})" if s.get('region') else ""
                    print(f"   {status_text} {s.get('name'):<26} {region_str}")
                sys.exit(0)

            if not active and tick > 2:
                # 任务已结束但无服务
                print(f"\n⚠️ 任务已结束，但未解析出服务。ExitCode: {exit_code}, Error: {node.get('error')}")
                if node.get("rawOutputSnippet"):
                    print("终端原始输出:\n" + node.get("rawOutputSnippet"))
                sys.exit(0)

    except Exception as e:
        print(f"  [{tick}] 轮询出错: {e}")

print("⏱️ 轮询超时。")
