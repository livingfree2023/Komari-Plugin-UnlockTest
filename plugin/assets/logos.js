// plugin/assets/logos.js
// 流媒体与 AI 服务品牌矢量 Logo 图标库 + 自适应高对比度徽章生成器

(function (global) {
  "use strict";

  const BRAND_SVGS = {
    "netflix": '<svg viewBox="0 0 24 24" fill="none"><path fill="#E50914" d="M5.4 2h3.7l5.8 14.3V2h3.7v20h-3.6L9.1 7.6V22H5.4V2z"/></svg>',
    "disney": '<svg viewBox="0 0 24 24" fill="none"><path fill="#38BDF8" d="M12 3C6.5 3 2 6.5 2 11c0 3.2 2.3 6 5.8 7.3-.2-1.1-.1-2.5.4-3.7l1.8-4.6h2.2l-1.7 4.4c-.3.9-.2 1.8.3 2.3.5.5 1.4.7 2.4.5 2.6-.5 4.6-2.5 4.6-4.9 0-3-3.1-5.3-7.8-5.3-2.5 0-4.7.8-6 2.1L2.8 7.6C4.7 5.8 8.1 3 12 3z"/><path stroke="#38BDF8" stroke-width="2" stroke-linecap="round" d="M19 4v4m-2-2h4"/></svg>',
    "youtube": '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4.5" width="20" height="15" rx="4" fill="#FF0000"/><path fill="#FFFFFF" d="M10 9l5.5 3L10 15V9z"/></svg>',
    "tiktok": '<svg viewBox="0 0 24 24" fill="none"><path fill="#25F4EE" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.7a5.7 5.7 0 1 0 4.9 5.6V9a7.4 7.4 0 0 0 4.3 1.4V7.3c-1.2 0-2.4-.5-3.2-1.5z"/></svg>',
    "spotify": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1ED760"/><path stroke="#090D16" stroke-width="1.8" stroke-linecap="round" d="M7.5 9.5c3.2-1 6.8-.8 9.5.8M8 12.8c2.6-.8 5.6-.6 7.8.7M8.8 15.8c2-.5 4.2-.4 6 .5"/></svg>',
    "prime": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="13" rx="3" stroke="#00A8E1" stroke-width="2"/><path fill="#00A8E1" d="M9.5 9v6l5-3-5-3z"/><path stroke="#00A8E1" stroke-width="1.6" stroke-linecap="round" d="M7 16.2c3 1.5 7 1.5 10 0"/></svg>',
    "apple": '<svg viewBox="0 0 24 24" fill="none"><path fill="#E2E8F0" d="M16.5 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.6 0-1.7-.8-2.8-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.2 1 8.3.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2-.8-2-3.4zM14.5 6.5c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z"/></svg>',
    "bilibili": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6.5" width="18" height="13" rx="3" stroke="#00A1D6" stroke-width="2"/><path stroke="#00A1D6" stroke-width="2" stroke-linecap="round" d="M8 3.5l2.5 3M16 3.5l-2.5 3M8.5 11.5v2M15.5 11.5v2"/></svg>',
    "steam": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#60A5FA" stroke-width="2"/><circle cx="15" cy="9.5" r="2.5" stroke="#60A5FA" stroke-width="1.8"/><circle cx="9.5" cy="15.5" r="2" fill="#60A5FA"/><path stroke="#60A5FA" stroke-width="2" stroke-linecap="round" d="M4 13.5l5.5 2 4-4"/></svg>',
    "bing": '<svg viewBox="0 0 24 24" fill="none"><path fill="#38BDF8" d="M6 3v14.5L10.5 21l7.5-4.3v-4.2L11.5 9v4.3l3.2 1.8-4.2 2.4V5.2L6 3z"/></svg>',
    "google": '<svg viewBox="0 0 24 24" fill="none"><path fill="#34D399" d="M5 3.8v16.4c0 .6.7 1 1.2.6l12.6-8.2c.5-.3.5-1 0-1.3L6.2 3.2C5.7 2.8 5 3.2 5 3.8z"/></svg>',
    "reddit": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="7.5" stroke="#FF4500" stroke-width="2"/><circle cx="9.5" cy="12" r="1.2" fill="#FF4500"/><circle cx="14.5" cy="12" r="1.2" fill="#FF4500"/><path stroke="#FF4500" stroke-width="1.8" stroke-linecap="round" d="M9.5 15.5c1.5 1 3.5 1 5 0M12 5.5l1.5-2.5 3 .8"/></svg>',
    "x": '<svg viewBox="0 0 24 24" fill="none"><path fill="#F8FAFC" d="M4 3h4.2l4.1 5.8L16.8 3H20l-6.4 8.1L20.5 21h-4.2l-4.5-6.3L6.8 21H3.6l6.7-8.6L4 3z"/></svg>',
    "wikipedia": '<svg viewBox="0 0 24 24" fill="none"><path stroke="#E2E8F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 6l4 12 3.5-8.5L14 18l3-8.5M14.5 6l3 12L21 6"/></svg>',
    "iqiyi": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#00BE06" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#00BE06" font-size="8.5" font-weight="bold" font-family="monospace">iQIYI</text></svg>',
    "wetv": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#FF6A00" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#FF6A00" font-size="8.5" font-weight="bold" font-family="monospace">WeTV</text></svg>',
    "viu": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="#FACC15" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#FACC15" font-size="9.5" font-weight="bold" font-family="monospace">Viu</text></svg>',
    "dazn": '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke="#F8FAFC" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F8FAFC" font-size="8" font-weight="bold" font-family="monospace">DAZN</text></svg>',
    "chatgpt": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#10A37F" stroke-width="2"/><path stroke="#10A37F" stroke-width="1.8" stroke-linecap="round" d="M12 6.5v11M6.5 12h11M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6"/></svg>',
    "claude": '<svg viewBox="0 0 24 24" fill="none"><path fill="#D97757" d="M12 2.5l2.6 6.9 6.9 2.6-6.9 2.6-2.6 6.9-2.6-6.9-6.9-2.6 6.9-2.6L12 2.5z"/></svg>',
    "gemini": '<svg viewBox="0 0 24 24" fill="none"><path fill="#60A5FA" d="M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10z"/></svg>',
    "copilot": '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="8" height="13" rx="3.5" stroke="#38BDF8" stroke-width="2"/><rect x="12.5" y="5.5" width="8" height="13" rx="3.5" stroke="#A78BFA" stroke-width="2"/></svg>',
    "perplexity": '<svg viewBox="0 0 24 24" fill="none"><path stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M7 4.5h10v15H7z"/></svg>',
    "grok": '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="#F8FAFC" stroke-width="2"/><path stroke="#F8FAFC" stroke-width="2.2" stroke-linecap="round" d="M7.5 16.5l9-9"/></svg>',
    "deepseek": '<svg viewBox="0 0 24 24" fill="none"><path stroke="#3B82F6" stroke-width="2" stroke-linecap="round" d="M4 13c2-4.5 6.5-7 11.5-5.5 2.5.8 4.5 2.8 4.5 5.5s-2.5 5-6 5c-4 0-6.5-2.5-6.5-5 0-2 1.8-3.5 4-3.5 1.8 0 3 1.2 3 2.5"/></svg>',
    "poe": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="4" stroke="#A855F7" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#A855F7" font-size="9.5" font-weight="bold" font-family="monospace">Poe</text></svg>',
    "mistral": '<svg viewBox="0 0 24 24" fill="none"><path fill="#F97316" d="M4 5h4v4H4V5zm12 0h4v4h-4V5zM4 9h6v4H4V9zm10 0h6v4h-6V9zm-4 4h4v4h-4v-4zM4 15h4v4H4v-4zm12 0h4v4h-4v-4z"/></svg>',
    "coze": '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="4" stroke="#6366F1" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#818CF8" font-size="8.5" font-weight="bold" font-family="monospace">Coze</text></svg>',
    "kimi": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#38BDF8" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#38BDF8" font-size="8.5" font-weight="bold" font-family="monospace">Kimi</text></svg>',
    "dola": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#EC4899" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F472B6" font-size="8.5" font-weight="bold" font-family="monospace">Dola</text></svg>',
    "bahamut": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#00B4D8" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#00B4D8" font-size="8.5" font-weight="bold" font-family="monospace">Baha</text></svg>',
    "abema": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#F43F5E" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F43F5E" font-size="7.5" font-weight="bold" font-family="monospace">ABEMA</text></svg>',
    "dmm": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#EF4444" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#EF4444" font-size="9" font-weight="bold" font-family="monospace">DMM</text></svg>',
    "hulu": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#1CE783" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#1CE783" font-size="9" font-weight="bold" font-family="monospace">hulu</text></svg>',
    "max": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#3B82F6" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#60A5FA" font-size="9.5" font-weight="bold" font-family="monospace">max</text></svg>',
    "bbc": '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke="#EC4899" stroke-width="2"/><text x="12" y="15" text-anchor="middle" fill="#F472B6" font-size="9" font-weight="bold" font-family="monospace">BBC</text></svg>'
  };

  function getServiceSVG(serviceName) {
    const lower = String(serviceName || "").toLowerCase();
    if (lower.indexOf("netflix") >= 0) return BRAND_SVGS.netflix;
    if (lower.indexOf("disney") >= 0) return BRAND_SVGS.disney;
    if (lower.indexOf("youtube") >= 0) return BRAND_SVGS.youtube;
    if (lower.indexOf("tiktok") >= 0) return BRAND_SVGS.tiktok;
    if (lower.indexOf("spotify") >= 0) return BRAND_SVGS.spotify;
    if (lower.indexOf("prime video") >= 0 || lower.indexOf("amazon") >= 0) return BRAND_SVGS.prime;
    if (lower.indexOf("apple") >= 0) return BRAND_SVGS.apple;
    if (lower.indexOf("bilibili") >= 0) return BRAND_SVGS.bilibili;
    if (lower.indexOf("steam") >= 0) return BRAND_SVGS.steam;
    if (lower.indexOf("bing") >= 0) return BRAND_SVGS.bing;
    if (lower.indexOf("google play") >= 0) return BRAND_SVGS.google;
    if (lower.indexOf("reddit") >= 0) return BRAND_SVGS.reddit;
    if (lower === "x" || lower.indexOf("twitter") >= 0) return BRAND_SVGS.x;
    if (lower.indexOf("wikipedia") >= 0) return BRAND_SVGS.wikipedia;
    if (lower.indexOf("iqiyi") >= 0) return BRAND_SVGS.iqiyi;
    if (lower.indexOf("wetv") >= 0) return BRAND_SVGS.wetv;
    if (lower.indexOf("viu") >= 0) return BRAND_SVGS.viu;
    if (lower.indexOf("dazn") >= 0) return BRAND_SVGS.dazn;
    if (lower.indexOf("chatgpt") >= 0 || lower.indexOf("openai") >= 0) return BRAND_SVGS.chatgpt;
    if (lower.indexOf("claude") >= 0 || lower.indexOf("anthropic") >= 0) return BRAND_SVGS.claude;
    if (lower.indexOf("gemini") >= 0) return BRAND_SVGS.gemini;
    if (lower.indexOf("copilot") >= 0) return BRAND_SVGS.copilot;
    if (lower.indexOf("perplexity") >= 0) return BRAND_SVGS.perplexity;
    if (lower.indexOf("grok") >= 0) return BRAND_SVGS.grok;
    if (lower.indexOf("deepseek") >= 0) return BRAND_SVGS.deepseek;
    if (lower.indexOf("poe") >= 0) return BRAND_SVGS.poe;
    if (lower.indexOf("mistral") >= 0) return BRAND_SVGS.mistral;
    if (lower.indexOf("coze") >= 0) return BRAND_SVGS.coze;
    if (lower.indexOf("kimi") >= 0) return BRAND_SVGS.kimi;
    if (lower.indexOf("dola") >= 0) return BRAND_SVGS.dola;
    if (lower.indexOf("bahamut") >= 0) return BRAND_SVGS.bahamut;
    if (lower.indexOf("abema") >= 0) return BRAND_SVGS.abema;
    if (lower.indexOf("dmm") >= 0) return BRAND_SVGS.dmm;
    if (lower.indexOf("hulu") >= 0) return BRAND_SVGS.hulu;
    if (lower === "max") return BRAND_SVGS.max;
    if (lower.indexOf("bbc") >= 0) return BRAND_SVGS.bbc;

    // 自适应生成高对比度矢量文字徽章（覆盖所有地区性长尾平台）
    const clean = String(serviceName || "SVC").replace(/[^A-Za-z0-9+]/g, "");
    const abbr = clean.slice(0, 4).toUpperCase() || "SVC";
    return (
      '<svg viewBox="0 0 24 24" fill="none">' +
      '<rect x="2" y="4" width="20" height="16" rx="3.5" stroke="#38BDF8" stroke-width="1.8"/>' +
      '<text x="12" y="14.8" text-anchor="middle" fill="#E2E8F0" font-size="7.5" font-weight="bold" font-family="monospace">' +
      abbr +
      "</text></svg>"
    );
  }

  global.KomariUnlockLogos = {
    getServiceSVG: getServiceSVG
  };
})(window);
