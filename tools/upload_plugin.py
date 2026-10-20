#!/usr/bin/env python3
# tools/upload_plugin.py
# 自动化通过 Komari 分片上传 API 安装/更新插件
# 使用标准库 urllib，零外部依赖

import sys
import os
import json
import urllib.request
import urllib.error

HOST = (sys.argv[1] if len(sys.argv) > 1 else "https://komari.leohou.org").rstrip("/")
ZIP_PATH = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "../dist/unlock-test.zip")
API_KEY = sys.argv[3] if len(sys.argv) > 3 else "komari-WYfvToYPfT8joBHWrSJbb0MuhwKFmBq0"

if not os.path.isfile(ZIP_PATH):
    print(f"Error: file not found: {ZIP_PATH}", file=sys.stderr)
    sys.exit(1)

with open(ZIP_PATH, "rb") as f:
    file_bytes = f.read()

file_size = len(file_bytes)
file_name = os.path.basename(ZIP_PATH)

print(f"📦 正在上传插件 {file_name} ({file_size} bytes) 至 {HOST} ...")

auth_header = f"Bearer {API_KEY}" if not API_KEY.startswith("Bearer ") else API_KEY

# Step 1: Init upload
init_url = f"{HOST}/api/admin/upload/init"
init_payload = json.dumps({
    "purpose": "plugin",
    "filename": file_name,
    "size": file_size
}).encode("utf-8")

req = urllib.request.Request(
    init_url,
    data=init_payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": auth_header,
        "User-Agent": "Komari-Plugin-Uploader/1.0"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as resp:
        init_res = json.loads(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"❌ Init failed: HTTP {e.code} - {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)

if init_res.get("status") != "success" or not init_res.get("data", {}).get("upload_id"):
    print(f"❌ Init failed: {init_res}", file=sys.stderr)
    sys.exit(1)

upload_id = init_res["data"]["upload_id"]
chunk_size = init_res["data"].get("chunk_size", 5 * 1024 * 1024)
print(f"✅ 上传已初始化 (Upload ID: {upload_id}, 分片大小: {chunk_size} 字节)")

# Step 2: Upload chunk (unlock-test.zip is ~50KB, single chunk)
boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
body = bytearray()

def add_field(name, value):
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
    body.extend(f"{value}\r\n".encode("utf-8"))

add_field("upload_id", upload_id)
add_field("chunk_index", "0")

body.extend(f"--{boundary}\r\n".encode("utf-8"))
body.extend(f'Content-Disposition: form-data; name="chunk_data"; filename="{file_name}"\r\n'.encode("utf-8"))
body.extend(b"Content-Type: application/zip\r\n\r\n")
body.extend(file_bytes)
body.extend(b"\r\n")
body.extend(f"--{boundary}--\r\n".encode("utf-8"))

chunk_url = f"{HOST}/api/admin/upload/chunk"
req_chunk = urllib.request.Request(
    chunk_url,
    data=bytes(body),
    headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": auth_header,
        "User-Agent": "Komari-Plugin-Uploader/1.0"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req_chunk) as resp:
        chunk_res = json.loads(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"❌ Chunk upload failed: HTTP {e.code} - {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)

print(f"✅ 分片上传完成: {chunk_res.get('message', 'OK')}")

# Step 3: Merge & Apply
merge_url = f"{HOST}/api/admin/upload/merge"
merge_payload = json.dumps({"upload_id": upload_id}).encode("utf-8")

req_merge = urllib.request.Request(
    merge_url,
    data=merge_payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": auth_header,
        "User-Agent": "Komari-Plugin-Uploader/1.0"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req_merge) as resp:
        merge_res = json.loads(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"❌ Merge failed: HTTP {e.code} - {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)

if merge_res.get("status") == "success":
    print(f"🎉 插件安装与热重载成功: {merge_res.get('message', '')}")
    print(json.dumps(merge_res.get("data", {}), indent=2, ensure_ascii=False))
else:
    print(f"❌ Merge failed: {merge_res}", file=sys.stderr)
    sys.exit(1)
