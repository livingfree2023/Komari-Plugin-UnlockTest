#!/usr/bin/env node
// tools/upload_plugin.js
// 自动化通过 Komari 分片上传 API 安装/更新插件
// 用法: node tools/upload_plugin.js <KOMARI_HOST> <ZIP_FILE> <SESSION_COOKIE>

const fs = require("fs");
const path = require("path");

const host = (process.argv[2] || "https://komari.leohou.org").replace(/\/$/, "");
const zipPath = process.argv[3] || path.join(__dirname, "../dist/unlock-test.zip");
const cookie = process.argv[4] || "";

if (!fs.existsSync(zipPath)) {
  console.error("ZIP file not found:", zipPath);
  process.exit(1);
}

const fileBuf = fs.readFileSync(zipPath);
const fileSize = fileBuf.length;
const fileName = path.basename(zipPath);

async function main() {
  console.log(`Uploading ${fileName} (${fileSize} bytes) to ${host}...`);

  const headers = {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {})
  };

  // Step 1: Init
  const initResp = await fetch(`${host}/api/admin/upload/init`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      purpose: "plugin",
      filename: fileName,
      size: fileSize
    })
  });
  const initData = await initResp.json();
  if (initData.status !== "success" || !initData.data || !initData.data.upload_id) {
    console.error("Init failed:", initData);
    process.exit(1);
  }

  const uploadId = initData.data.upload_id;
  const chunkSize = initData.data.chunk_size || 5 * 1024 * 1024;
  console.log(`Upload initialized. Upload ID: ${uploadId}`);

  // Step 2: Upload Chunks
  const totalChunks = Math.ceil(fileSize / chunkSize);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const chunkBuf = fileBuf.subarray(start, end);

    const form = new FormData();
    form.append("upload_id", uploadId);
    form.append("chunk_index", String(i));
    form.append("chunk_data", new Blob([chunkBuf]), fileName);

    const chunkResp = await fetch(`${host}/api/admin/upload/chunk`, {
      method: "POST",
      headers: cookie ? { Cookie: cookie } : {},
      body: form
    });
    const chunkData = await chunkResp.json();
    if (chunkData.status !== "success") {
      console.error(`Chunk ${i} failed:`, chunkData);
      process.exit(1);
    }
    console.log(`Uploaded chunk ${i + 1}/${totalChunks}`);
  }

  // Step 3: Merge & Finalize
  const mergeResp = await fetch(`${host}/api/admin/upload/merge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ upload_id: uploadId })
  });
  const mergeData = await mergeResp.json();
  if (mergeData.status === "success") {
    console.log("Plugin installed and loaded successfully!", mergeData.message || "");
  } else {
    console.error("Merge failed:", mergeData);
  }
}

main().catch(err => {
  console.error("Upload error:", err);
  process.exit(1);
});
