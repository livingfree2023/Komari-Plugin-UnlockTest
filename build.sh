#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
DIST_DIR="$ROOT_DIR/dist"
ZIP_FILE="$DIST_DIR/unlock-test.zip"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_FILE"

cd "$PLUGIN_DIR"
zip -r -q "$ZIP_FILE" komari-plugin.json script.js lib assets -x "*.DS_Store*"

if command -v shasum >/dev/null 2>&1; then
  SHA256=$(shasum -a 256 "$ZIP_FILE" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$ZIP_FILE" | awk '{print $1}')
else
  SHA256="unknown"
fi

echo "Built package: $ZIP_FILE"
echo "SHA-256:       $SHA256"

if [ -f "$ROOT_DIR/tools/upload_plugin.py" ] && [ -n "$KOMARI_AUTO_UPLOAD" ]; then
  python3 "$ROOT_DIR/tools/upload_plugin.py"
fi
