// Exact service-name mapping. Native SVG assets live in brand-icons.js; unmatched services use local SVG badges.
(function (global) {
  "use strict";

  const NATIVE_BY_NAME = {
    "amazon prime video": "dashboard/prime-video-alt",
    "apple": "simple/apple",
    "bilibili anime": "simple/bilibili",
    "bing": "dashboard/bing",
    "dazn": "simple/dazn",
    "disney+": "dashboard/disney-plus",
    "google play store": "simple/googleplay",
    "netflix": "simple/netflix",
    "netflix cdn": "simple/netflix",
    "reddit": "simple/reddit",
    "spotify registration": "simple/spotify",
    "steam": "simple/steam",
    "tiktok": "simple/tiktok",
    "wikipedia editability": "simple/wikipedia",
    "x (formerly twitter)": "simple/x",
    "youtube cdn": "simple/youtube",
    "youtube premium": "simple/youtube",
    "linetv": "simple/line",
    "rakuten magazine": "simple/rakuten",
    "rakuten tv jp": "simple/rakuten",
    "rakuten tv eu": "simple/rakuten",
    "max": "simple/max",
    "nba tv": "simple/nba",
    "dmm": "simple/dmm",
    "hulu japan": "dashboard/hulu",
    "niconico": "simple/niconico",
    "naver tv": "simple/naver",
    "cbc gem": "simple/cbc",
    "crunchyroll": "simple/crunchyroll",
    "fox": "simple/fox",
    "fubo tv": "simple/fubo",
    "hulu": "dashboard/hulu",
    "nbc tv": "simple/nbc",
    "paramountplus": "simple/paramountplus",
    "peacock tv": "dashboard/peacock",
    "starz": "simple/starz",
    "tubi tv": "simple/tubi",
    "viaplay": "simple/viaplay",
    "itvx": "simple/itvx",
    "channel 4": "simple/channel4",
    "zdf": "simple/zdf",
    "sky go": "simple/sky",
    "sky de": "simple/sky",
    "sky ch": "simple/sky",
    "sky go nz": "simple/sky",
    "movistar plus+": "simple/movistar",
    "openai chatgpt": "lobe/openai",
    "anthropic claude": "lobe/claude-color",
    "microsoft copilot": "lobe/copilot-color",
    "google gemini": "lobe/gemini-color",
    "quora poe": "lobe/poe",
    "perplexity ai": "lobe/perplexity-color",
    "mistral ai": "lobe/mistral-color",
    "x.ai grok": "lobe/grok",
    "bytedance coze": "lobe/coze",
    "deepseek": "lobe/deepseek-color",
    "moonshot kimi": "lobe/kimi-color"
  };

  const DRAWN_SVGS = {
    iqiyi: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#00BE06" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#00BE06" font-size="8.5" font-weight="bold" font-family="monospace">iQIYI</text></svg>',
    wetv: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#FF6A00" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#FF6A00" font-size="8.5" font-weight="bold" font-family="monospace">WeTV</text></svg>',
    viu: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#FACC15" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#FACC15" font-size="9.5" font-weight="bold" font-family="monospace">Viu</text></svg>',
    bahamut: '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#00B4D8" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#00B4D8" font-size="8.5" font-weight="bold" font-family="monospace">Baha</text></svg>',
    abema: '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#F43F5E" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F43F5E" font-size="7.5" font-weight="bold" font-family="monospace">ABEMA</text></svg>',
    bbc: '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#EC4899" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F472B6" font-size="9" font-weight="bold" font-family="monospace">BBC</text></svg>',
    dola: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#EC4899" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F472B6" font-size="8.5" font-weight="bold" font-family="monospace">Dola</text></svg>'
  };

  const DRAWN_BY_NAME = {
    "iqiyi": "iqiyi",
    "wetv": "wetv",
    "viu.com": "viu",
    "viu.tv": "viu",
    "bahamut anime": "bahamut",
    "abema": "abema",
    "bbc iplayer": "bbc",
    "dola ai": "dola"
  };

  function getServiceSVG(serviceName) {
    const name = String(serviceName || "").trim().toLowerCase().replace(/\s+/g, " ");
    const nativeKey = NATIVE_BY_NAME[name];
    const native = nativeKey && global.KomariUnlockBrandIcons && global.KomariUnlockBrandIcons[nativeKey];
    if (native && native.svg) return native.svg;

    const drawn = DRAWN_SVGS[DRAWN_BY_NAME[name]];
    if (drawn) return drawn;

    const clean = String(serviceName || "SVC").replace(/[^A-Za-z0-9+]/g, "");
    const abbr = clean.slice(0, 4).toUpperCase() || "SVC";
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="2" y="4" width="20" height="16" rx="3.5" stroke="currentColor" stroke-width="1.8"/>' +
      '<text x="12" y="14.8" text-anchor="middle" fill="currentColor" font-size="7.5" font-weight="bold" font-family="monospace">' +
      abbr + '</text></svg>';
  }

  global.KomariUnlockLogos = { getServiceSVG: getServiceSVG };
})(window);
