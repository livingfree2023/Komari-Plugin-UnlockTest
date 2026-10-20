#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
DIST_DIR="$ROOT_DIR/dist"
ZIP_FILE="$DIST_DIR/unlock-test.zip"
ROOT_ZIP="$ROOT_DIR/unlock-test.zip"
MANIFEST="$PLUGIN_DIR/komari-plugin.json"
V1_FILE="$ROOT_DIR/v1.json"

# 1. 沿袭 NetForecast 版本命名规则 (YY.MMDD.Patch) 并在每次本地打包时自增末位版本号
python3 - << 'EOF'
import json
import os
from datetime import datetime

root_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in locals() else os.getcwd()
manifest_path = os.path.join(root_dir, "plugin", "komari-plugin.json")

today_prefix = datetime.now().strftime("%y.%m%d.")

try:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
except Exception as e:
    print(f"Error reading manifest: {e}")
    exit(1)

cur_ver = str(manifest.get("version", "")).strip()
if cur_ver.startswith(today_prefix):
    try:
        patch = int(cur_ver[len(today_prefix):]) + 1
    except ValueError:
        patch = 1
    new_ver = f"{today_prefix}{patch}"
else:
    new_ver = f"{today_prefix}1"

manifest["version"] = new_ver
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"[*] Version bumped: {cur_ver} -> {new_ver}")
EOF

mkdir -p "$DIST_DIR"
rm -f "$ZIP_FILE" "$ROOT_ZIP"

find "$PLUGIN_DIR" -name ".DS_Store" -delete 2>/dev/null || true

cd "$PLUGIN_DIR"
zip -r -q "$ZIP_FILE" komari-plugin.json script.js lib assets pages -x "*.DS_Store*" -x "__MACOSX*"
cp "$ZIP_FILE" "$ROOT_ZIP"
cd "$ROOT_DIR"

if command -v shasum >/dev/null 2>&1; then
  SHA256=$(shasum -a 256 "$ZIP_FILE" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$ZIP_FILE" | awk '{print $1}')
else
  SHA256="unknown"
fi

# 2. 同步更新 v1.json 中的版本号、发布下载链接及 SHA-256 校验码
python3 - << EOF
import json
import os
from datetime import datetime, timezone

root_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in locals() else os.getcwd()
manifest_path = os.path.join(root_dir, "plugin", "komari-plugin.json")
v1_path = os.path.join(root_dir, "v1.json")

with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)
ver = manifest.get("version")

try:
    with open(v1_path, "r", encoding="utf-8") as f:
        v1 = json.load(f)
    v1["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if "plugins" in v1 and len(v1["plugins"]) > 0:
        p = v1["plugins"][0]
        p["version"] = ver
        p["download"] = f"https://github.com/livingfree2023/Komari-Plugin-UnlockTest/releases/download/v{ver}/unlock-test.zip"
        p["sha256"] = "$SHA256"
    with open(v1_path, "w", encoding="utf-8") as f:
        json.dump(v1, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[*] Updated v1.json (version={ver}, sha256=$SHA256)")
except Exception as e:
    print(f"Notice: could not update v1.json: {e}")
EOF

echo "Built package: $ZIP_FILE"
echo "Root package:  $ROOT_ZIP"
echo "SHA-256:       $SHA256"
