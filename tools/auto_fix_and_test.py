#!/usr/bin/env python3
# tools/auto_fix_and_test.py
# 自动化执行：上传最新插件 -> 远程触发探测 -> 轮询快照直至成功输出服务结果

import os
import sys
import json
import time
import urllib.request
import urllib.error

HOST = "https://komari.leohou.org"
API_KEY = "komari-WYfvToYPfT8joBHWrSJbb0MuhwKFmBq0"
TARGET_UUID = "8b6e4305-bbd8-4d2a-8086-91fe62409bc4"
ZIP_PATH = os.path.join(os.path.dirname(__file__), "../dist/unlock-test.zip")

auth_header = f"Bearer {API_KEY}"
headers_json = {
    "Content-Type": "application/json",
    "Authorization": auth_header,
    "User-Agent": "Komari-AutoTest/1.0"
}

# 1. 上传插件
print(f"📦 [1/3] 正在上传最新插件包 {ZIP_PATH} ...")
with open(ZIP_PATH, "rb") as f:
    zip_bytes = f.read()

init_req = urllib.request.Request(
    f"{HOST}/api/admin/upload/init",
    data=json.dumps({"purpose": "plugin", "filename": "unlock-test.zip", "size": len(zip_bytes)}).encode(),
    headers=headers_json,
    method="POST"
)
with urllib.request.urlopen(init_req) as resp:
    init_data = json.loads(resp.read().decode())
upload_id = init_data["data"]["upload_id"]

boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
body = bytearray()
def add_field(name, value):
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
    body.extend(f"{value}\r\n".encode())

add_field("upload_id", upload_id)
add_field("chunk_index", "0")
body.extend(f"--{boundary}\r\n".encode())
body.extend(b'Content-Disposition: form-data; name="chunk_data"; filename="unlock-test.zip"\r\nContent-Type: application/zip\r\n\r\n')
body.extend(zip_bytes)
body.extend(b"\r\n")
body.extend(f"--{boundary}--\r\n".encode())

chunk_req = urllib.request.Request(
    f"{HOST}/api/admin/upload/chunk",
    data=bytes(body),
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Authorization": auth_header},
    method="POST"
)
with urllib.request.urlopen(chunk_req) as resp:
    _ = resp.read()

merge_req = urllib.request.Request(
    f"{HOST}/api/admin/upload/merge",
    data=json.dumps({"upload_id": upload_id}).encode(),
    headers=headers_json,
    method="POST"
)
with urllib.request.urlopen(merge_req) as resp:
    merge_data = json.loads(resp.read().decode())
print(f"✅ [1/3] 插件上传并热重载成功: {merge_data.get('message', 'OK')}")

time.sleep(1.5)

# 2. 远程触发 SG.OCI 探测
print(f"🚀 [2/3] 正在远程下发 SG.OCI ({TARGET_UUID}) 探测指令 ...")
probe_req = urllib.request.Request(
    f"{HOST}/api/plugin/unlock-test/probe",
    data=json.dumps({"clients": [TARGET_UUID]}).encode(),
    headers=headers_json,
    method="POST"
)
try:
    with urllib.request.urlopen(probe_req) as resp:
        probe_res = json.loads(resp.read().decode())
        print(f"✅ [2/3] 任务已创建: TaskID={probe_res.get('data', {}).get('taskId', 'unknown')}")
except urllib.error.HTTPError as e:
    print(f"❌ 下发失败: {e.code} - {e.read().decode()}")
    sys.exit(1)

# 3. 轮询结果
print(f"⏳ [3/3] 正在轮询节点执行结果 ...")
start = time.time()
for tick in range(1, 25):
    time.sleep(2.5)
    elapsed = int(time.time() - start)
    snap_req = urllib.request.Request(f"{HOST}/api/plugin/unlock-test/snapshot", headers=headers_json)
    try:
        with urllib.request.urlopen(snap_req) as resp:
            data = json.loads(resp.read().decode()).get("data", {})
            active = data.get("activeTask")
            node = data.get("nodes", {}).get(TARGET_UUID, {})
            services = node.get("services", [])
            exit_code = node.get("exitCode")

            print(f"  [{tick}] ({elapsed}s) 活跃任务: {bool(active)}, exitCode: {exit_code}, 服务数: {len(services)}")

            if len(services) > 0:
                print(f"\n🎉🎉🎉 探测圆满成功！节点 {node.get('name', TARGET_UUID)} 成功解析出 {len(services)} 个服务:")
                unlocked_count = len([s for s in services if s.get('unlocked')])
                print(f"📊 解锁统计: {unlocked_count} / {len(services)} 项已解锁\n")
                for s in services:
                    flag = "✅ YES" if s.get("unlocked") else "❌ NO "
                    reg = f"[{s.get('region')}]" if s.get("region") else ""
                    print(f"  {flag} {s.get('displayName', s.get('name')):<16} {reg}")
                sys.exit(0)

            if not active and tick >= 4:
                err = node.get("error", "")
                raw = node.get("rawOutputSnippet", "")
                print(f"\n⚠️ 任务已结束但服务数为0: exitCode={exit_code}, error={err}")
                if raw:
                    print(f"终端输出片断:\n{raw}")
                sys.exit(0)
    except Exception as e:
        print(f"  [{tick}] 轮询出错: {e}")

print("⏱️ 轮询超时")
