// plugin/lib/parser.js
// MediaUnlockTest 真实 CLI 输出解析器与区域/服务注册表
// 严格对齐 https://github.com/HsukqiLee/MediaUnlockTest (cli/main.go, cli/ui.go, pkg/providers/lists.go)

const REGIONS = [
  { id: "0", key: "Globe", nameZh: "跨国平台", nameEn: "Global" },
  { id: "1", key: "Taiwan", nameZh: "台湾平台", nameEn: "Taiwan" },
  { id: "2", key: "HongKong", nameZh: "香港平台", nameEn: "Hong Kong" },
  { id: "3", key: "Japan", nameZh: "日本平台", nameEn: "Japan" },
  { id: "4", key: "Korea", nameZh: "韩国平台", nameEn: "Korea" },
  { id: "5", key: "NorthAmerica", nameZh: "北美平台", nameEn: "North America" },
  { id: "6", key: "SouthAmerica", nameZh: "南美平台", nameEn: "South America" },
  { id: "7", key: "Europe", nameZh: "欧洲平台", nameEn: "Europe" },
  { id: "8", key: "Africa", nameZh: "非洲平台", nameEn: "Africa" },
  { id: "9", key: "SouthEastAsia", nameZh: "东南亚平台", nameEn: "Southeast Asia" },
  { id: "10", key: "Oceania", nameZh: "大洋洲平台", nameEn: "Oceania" },
  { id: "11", key: "AI", nameZh: "AI 平台", nameEn: "AI" }
];

const REGION_BY_KEY = {};
const REGION_BY_ID = {};
for (let i = 0; i < REGIONS.length; i++) {
  const r = REGIONS[i];
  REGION_BY_KEY[r.key.toLowerCase()] = r;
  REGION_BY_ID[r.id] = r;
}

// 简称映射表（用于浮层 Logo 卡片紧凑展示）
const DISPLAY_NAME_MAP = {
  "Amazon Prime Video": "Prime Video",
  "Bilibili Anime": "Bilibili",
  "Google Play Store": "Google Play",
  "Spotify Registration": "Spotify",
  "TVBAnywhere+": "TVBAnywhere",
  "Wikipedia Editability": "Wikipedia",
  "X (formerly Twitter)": "X / Twitter",
  "Youtube CDN": "YouTube CDN",
  "Youtube Premium": "YouTube",
  "YouTube Premium": "YouTube",
  "Bahamut Anime": "Bahamut",
  "FOD (Fuji TV)": "FOD",
  "J:COM On Demand": "J:COM",
  "Karaoke@DAM": "DAM",
  "Pretty Derby Japan": "UmaMusume",
  "Princess Connect Re:Dive Japan": "Priconne",
  "Project Sekai: Colorful Stage": "PJSK",
  "Rakuten Magazine": "Rakuten Mag",
  "DirecTV Stream": "DirecTV",
  "ParamountPlus": "Paramount+",
  "Peacock TV": "Peacock",
  "Discovery+ UK": "Discovery+ UK",
  "Movistar Plus+": "Movistar+",
  "NPO Start Plus": "NPO Start+",
  "SBS on Demand": "SBS",
  "OpenAI ChatGPT": "ChatGPT",
  "Anthropic Claude": "Claude",
  "Microsoft Copilot": "Copilot",
  "Google Gemini": "Gemini",
  "Quora Poe": "Poe",
  "Perplexity AI": "Perplexity",
  "Mistral AI": "Mistral",
  "x.AI Grok": "Grok",
  "ByteDance Coze": "Coze",
  "DeepSeek": "DeepSeek",
  "Moonshot Kimi": "Kimi",
  "Dola AI": "Dola"
};

// 欧洲与东南亚子国家分隔符
const SUB_COUNTRY_CODES = {
  "GB": true, "FR": true, "DE": true, "NL": true,
  "ES": true, "IT": true, "CH": true, "RU": true,
  "SG": true, "TH": true, "ID": true, "VN": true,
  "MY": true, "IN": true
};

// 剥离 ANSI 颜色码与回车控制符
function stripAnsi(str) {
  if (!str) return "";
  return String(str)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\r/g, "");
}

function getShortDisplayName(name) {
  if (!name) return "";
  return DISPLAY_NAME_MAP[name] || name;
}

// 解析单条服务状态字符串（来自 cli/ui.go ShowSingleResult）
function parseStatusValue(serviceName, rawStatus) {
  const s = (rawStatus || "").trim();
  if (!s) {
    return { status: "UNKNOWN", unlocked: false, region: "", info: "", raw: s };
  }

  // YES 或 YES (Region: US)
  if (/^YES\b/i.test(s)) {
    const regMatch = s.match(/\(Region:\s*([A-Za-z0-9_-]+)\)/i);
    return {
      status: "YES",
      unlocked: true,
      region: regMatch ? regMatch[1].toUpperCase() : "",
      info: "",
      raw: s
    };
  }

  // Restricted 或 Restricted (Originals Only)
  if (/^Restricted\b/i.test(s)) {
    const infoMatch = s.match(/^Restricted\s*\(([^)]+)\)/i);
    const info = infoMatch ? infoMatch[1].trim() : "";
    return {
      status: "RESTRICTED",
      unlocked: false,
      region: "RESTR",
      info: info,
      raw: s
    };
  }

  // NO 或 NO (Region: XX) 或 NO (Info: ...)
  if (/^NO\b/i.test(s)) {
    const regMatch = s.match(/\(Region:\s*([A-Za-z0-9_-]+)\)/i);
    const infoMatch = s.match(/\(Info:\s*([^)]+)\)/i);
    return {
      status: "NO",
      unlocked: false,
      region: regMatch ? regMatch[1].toUpperCase() : "NO",
      info: infoMatch ? infoMatch[1].trim() : "",
      raw: s
    };
  }

  // Banned
  if (/^Banned\b/i.test(s)) {
    const infoMatch = s.match(/^Banned\s*\(([^)]+)\)/i);
    return {
      status: "BANNED",
      unlocked: false,
      region: "BAN",
      info: infoMatch ? infoMatch[1].trim() : "",
      raw: s
    };
  }

  // ERR / Failed / Unexpected
  if (/^(ERR|Failed|Unexpected)\b/i.test(s)) {
    return {
      status: "ERR",
      unlocked: false,
      region: "ERR",
      info: s,
      raw: s
    };
  }

  // Youtube CDN / Netflix CDN 等直接输出地区/机场三字码的情况 (cli/ui.go line 117)
  if (/CDN$/i.test(serviceName) && /^[A-Za-z0-9_-]{2,12}$/.test(s)) {
    return {
      status: "YES",
      unlocked: true,
      region: s.toUpperCase(),
      info: "",
      raw: s
    };
  }

  // --table 模式下直接输出地区码（如 US, JP, SG, TW）
  if (/^[A-Z]{2,5}$/.test(s) && s !== "ERR" && s !== "NO") {
    return {
      status: "YES",
      unlocked: true,
      region: s,
      info: "",
      raw: s
    };
  }

  return {
    status: "UNKNOWN",
    unlocked: false,
    region: "",
    info: s,
    raw: s
  };
}

// 解析标准 ShowFinalResult() 与 --table 完整输出
function parseUnlockTestOutput(rawOutput) {
  const cleaned = stripAnsi(rawOutput || "");
  const lines = cleaned.split("\n");

  const meta = {
    testTime: "",
    ipv4: "",
    ipv4Region: "",
    ipv4Isp: "",
    ipv6: "",
    ipv6Region: "",
    ipv6Isp: "",
    statsText: ""
  };

  let currentIpContext = 0;
  let currentRegionObj = null;
  let currentIpStack = "auto"; // "4" | "6" | "auto"
  let currentSubCountry = "";

  // key: regionId + "::" + serviceName
  const serviceMap = {};
  const serviceOrder = [];

  function ensureServiceEntry(regionObj, serviceName, subCountry) {
    const rId = regionObj ? regionObj.id : "0";
    const rKey = regionObj ? regionObj.key : "Globe";
    const mapKey = rId + "::" + serviceName;
    if (!serviceMap[mapKey]) {
      serviceMap[mapKey] = {
        id: serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: serviceName,
        displayName: getShortDisplayName(serviceName),
        regionId: rId,
        regionKey: rKey,
        subCountry: subCountry || "",
        ipv4: null,
        ipv6: null,
        auto: null,
        unlocked: false,
        region: ""
      };
      serviceOrder.push(mapKey);
    }
    return serviceMap[mapKey];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 提取头部元信息
    if (line.indexOf("IPv4 地址：") === 0 || line.indexOf("IPv4 地址:") === 0) {
      meta.ipv4 = line.replace(/^IPv4\s*地址[：:]\s*/, "").trim();
      currentIpContext = 4;
      continue;
    }
    if (line.indexOf("IPv6 地址：") === 0 || line.indexOf("IPv6 地址:") === 0) {
      meta.ipv6 = line.replace(/^IPv6\s*地址[：:]\s*/, "").trim();
      currentIpContext = 6;
      continue;
    }
    if (line.indexOf("地区：") === 0) {
      const regVal = line.replace(/^地区[：:]\s*/, "").trim();
      if (currentIpContext === 4 && !meta.ipv4Region) meta.ipv4Region = regVal;
      else if (currentIpContext === 6 && !meta.ipv6Region) meta.ipv6Region = regVal;
      continue;
    }
    if (line.indexOf("ISP：") === 0) {
      const ispVal = line.replace(/^ISP[：:]\s*/, "").trim();
      if (currentIpContext === 4 && !meta.ipv4Isp) meta.ipv4Isp = ispVal;
      else if (currentIpContext === 6 && !meta.ipv6Isp) meta.ipv6Isp = ispVal;
      continue;
    }
    if (line.indexOf("测试时间:") === 0 || line.indexOf("测试时间：") === 0) {
      meta.testTime = line.replace(/^测试时间[：:]\s*/, "").trim();
      continue;
    }
    if (line.indexOf("性能统计:") === 0) {
      meta.statsText = line.replace(/^性能统计:\s*/, "").trim();
      continue;
    }

    // 匹配区域分隔标题: [ Globe (IPv4) ] ====================
    const dividerMatch = line.match(/^\[\s*([A-Za-z]+)\s*(?:\((IPv4|IPv6|Auto)\))?\s*\]\s*=*$/i);
    if (dividerMatch) {
      const tag = dividerMatch[1];
      const ipTag = dividerMatch[2] || "";
      if (SUB_COUNTRY_CODES[tag.toUpperCase()] && !ipTag) {
        currentSubCountry = tag.toUpperCase();
        continue;
      }
      const reg = REGION_BY_KEY[tag.toLowerCase()];
      if (reg) {
        currentRegionObj = reg;
        currentSubCountry = "";
        if (/ipv4/i.test(ipTag)) currentIpStack = "4";
        else if (/ipv6/i.test(ipTag)) currentIpStack = "6";
        else currentIpStack = "auto";
      }
      continue;
    }

    // 忽略韩国无 IPv6 提示或尾部统计行
    if (
      line.indexOf("No Korean platform supports IPv6") >= 0 ||
      line.indexOf("检测完毕") >= 0 ||
      line.indexOf("正在检测") === 0 ||
      line.indexOf("正在测试") === 0 ||
      line.indexOf("等待测试开始") === 0 ||
      line.indexOf("当天运行共") === 0 ||
      line.indexOf("[ 项目地址:") === 0 ||
      line.indexOf("[ 使用方式:") === 0
    ) {
      continue;
    }

    // 若当前在某个区域分组下，解析服务结果行
    if (currentRegionObj) {
      // ShowFinalResult 格式: "%-25s %s" -> 服务名与结果之间至少有 1~多个空格，且结果以已知状态开头或 CDN 代码结尾
      const lineMatch = line.match(
        /^(.+?)\s{2,}(YES\b.*|NO\b.*|Restricted\b.*|Banned\b.*|ERR\b.*|Failed\b.*|Unexpected\b.*|[A-Za-z0-9_-]{2,12})$/i
      ) || line.match(
        /^(.+?)\s+(YES(?:\s*\(Region:\s*[A-Za-z0-9_-]+\))?|NO(?:\s*\((?:Region|Info):[^)]+\))?|Restricted(?:\s*\([^)]+\))?|Banned(?:\s*\([^)]+\))?|ERR(?:\s*\([^)]+\))?|Failed|Unexpected)$/i
      );

      if (lineMatch) {
        const svcName = lineMatch[1].trim();
        const rawResult = lineMatch[2].trim();
        const parsedStatus = parseStatusValue(svcName, rawResult);
        const entry = ensureServiceEntry(currentRegionObj, svcName, currentSubCountry);

        if (currentIpStack === "4") {
          entry.ipv4 = parsedStatus;
        } else if (currentIpStack === "6") {
          entry.ipv6 = parsedStatus;
        } else {
          entry.auto = parsedStatus;
        }
      }
    }
  }

  // 汇总每个服务的综合双栈状态
  const services = [];
  for (let i = 0; i < serviceOrder.length; i++) {
    const key = serviceOrder[i];
    const item = serviceMap[key];
    const v4 = item.ipv4;
    const v6 = item.ipv6;
    const auto = item.auto;

    const unlockedV4 = Boolean(v4 && v4.unlocked);
    const unlockedV6 = Boolean(v6 && v6.unlocked);
    const unlockedAuto = Boolean(auto && auto.unlocked);

    item.unlocked = unlockedV4 || unlockedV6 || unlockedAuto;

    // 确定底部显示的区域缩写小字
    let regionCode = "";
    if (unlockedV4 && v4.region) {
      regionCode = v4.region;
    } else if (unlockedV6 && v6.region) {
      regionCode = v6.region;
    } else if (unlockedAuto && auto.region) {
      regionCode = auto.region;
    } else if (item.subCountry && item.unlocked) {
      regionCode = item.subCountry;
    } else if (!item.unlocked) {
      // 未解锁时若返回了明确区域（例如 NO (Region: CN)）或状态缩写
      if (v4 && v4.region && v4.region !== "NO") regionCode = v4.region;
      else if (v6 && v6.region && v6.region !== "NO") regionCode = v6.region;
      else if (v4 && v4.status === "RESTRICTED") regionCode = "RESTR";
      else if (v6 && v6.status === "RESTRICTED") regionCode = "RESTR";
      else regionCode = "NO";
    }

    item.region = regionCode;
    services.push(item);
  }

  return {
    meta: meta,
    services: services
  };
}

module.exports = {
  REGIONS: REGIONS,
  REGION_BY_ID: REGION_BY_ID,
  REGION_BY_KEY: REGION_BY_KEY,
  stripAnsi: stripAnsi,
  getShortDisplayName: getShortDisplayName,
  parseStatusValue: parseStatusValue,
  parseUnlockTestOutput: parseUnlockTestOutput
};
