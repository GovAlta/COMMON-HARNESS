#!/usr/bin/env node
// Technology fingerprinting. Dispatch: httpx + whatweb (richest) → Node header/body sniffing.
// Native fallback uses headers (Server, X-Powered-By) + HTML body signatures.

import { whichBin, runBin, requireArg, httpFetch } from "./_runner.js";

function tryHttpx(url) {
  if (!whichBin("httpx")) return null;
  const res = runBin("httpx", ["-u", url, "-tech-detect", "-status-code", "-title", "-server", "-json", "-silent"], { timeout: 30000 });
  if (!res.stdout) return null;
  for (const line of res.stdout.trim().split(/\r?\n/)) {
    try { return JSON.parse(line); } catch { /* continue */ }
  }
  return null;
}

function tryWhatweb(url) {
  if (!whichBin("whatweb")) return null;
  const res = runBin("whatweb", ["--log-json=-", "-a3", url], { timeout: 60000 });
  if (!res.stdout) return null;
  for (const line of res.stdout.trim().split(/\r?\n/)) {
    try { return JSON.parse(line); } catch { /* continue */ }
  }
  return null;
}

function normalizeHttpx(data) {
  const techs = [];
  for (const tech of (data.tech || [])) {
    techs.push({ name: tech, version: "", category: "detected", confidence: "high", source: "httpx", cpe: "" });
  }
  return {
    techs,
    extra: {
      title: data.title || "",
      status_code: data.status_code ?? null,
      server: data.webserver || "",
      content_type: data.content_type || "",
    },
  };
}

function normalizeWhatweb(data) {
  const techs = [];
  const plugins = data.plugins || {};
  for (const [name, p] of Object.entries(plugins)) {
    if (["IP", "Country", "HTTPServer"].includes(name)) continue;
    const v = (p.version && p.version.length) ? p.version[0] : "";
    techs.push({ name, version: v, category: "detected", confidence: "medium", source: "whatweb", cpe: "" });
  }
  return techs;
}

function tryBinary(url) {
  const httpxData = tryHttpx(url);
  const whatwebData = tryWhatweb(url);
  if (!httpxData && !whatwebData) return null;

  const allTechs = {};
  const meta = { target: url, source: "binary" };

  if (httpxData) {
    const { techs, extra } = normalizeHttpx(httpxData);
    Object.assign(meta, extra);
    for (const t of techs) {
      const key = t.name.toLowerCase();
      if (!allTechs[key]) allTechs[key] = t;
    }
  }
  if (whatwebData) {
    const techs = normalizeWhatweb(whatwebData);
    for (const t of techs) {
      const key = t.name.toLowerCase();
      const existing = allTechs[key];
      if (!existing) allTechs[key] = t;
      else if (!existing.version && t.version) existing.version = t.version;
    }
  }
  meta.technologies = Object.values(allTechs);
  return meta;
}

// Body signatures: regex → {name, category, confidence, versionGroup?}
const BODY_SIGNATURES = [
  { re: /__VUE_DEVTOOLS_GLOBAL_HOOK__|<div id="app">[\s\S]{0,200}data-v-/i, name: "Vue.js", category: "framework", confidence: "high" },
  { re: /__REACT_DEVTOOLS_GLOBAL_HOOK__|<div id="root">|data-reactroot|react-dom/i, name: "React", category: "framework", confidence: "high" },
  { re: /ng-version="([\d.]+)"/i, name: "Angular", category: "framework", confidence: "high", versionGroup: 1 },
  { re: /ng-app|ng-controller/i, name: "AngularJS", category: "framework", confidence: "medium" },
  { re: /data-svelte|svelte-/i, name: "Svelte", category: "framework", confidence: "medium" },
  { re: /Drupal\.settings|drupal\.org/i, name: "Drupal", category: "cms", confidence: "high" },
  { re: /\/wp-content\/|\/wp-includes\/|wp-emoji-release/i, name: "WordPress", category: "cms", confidence: "high" },
  { re: /Joomla!|\/components\/com_/i, name: "Joomla", category: "cms", confidence: "high" },
  { re: /csrf-param|rails\.js|data-turbolinks/i, name: "Ruby on Rails", category: "framework", confidence: "high" },
  { re: /<meta name="generator" content="([^"]+)"/i, name: null, category: "cms", confidence: "high", generator: true },
  { re: /jquery[.-]([\d.]+)(?:\.min)?\.js/i, name: "jQuery", category: "library", confidence: "high", versionGroup: 1 },
  { re: /bootstrap[.-]?([\d.]+)?(?:\.min)?\.css/i, name: "Bootstrap", category: "library", confidence: "medium", versionGroup: 1 },
  { re: /tailwindcss|class="[^"]*\b(?:flex|grid|bg-|text-|p-\d|m-\d)/, name: "Tailwind CSS", category: "library", confidence: "low" },
  { re: /__NEXT_DATA__|\/_next\//, name: "Next.js", category: "framework", confidence: "high" },
  { re: /__nuxt|\/_nuxt\//, name: "Nuxt.js", category: "framework", confidence: "high" },
  { re: /Express|x-powered-by[^a-z]+express/i, name: "Express", category: "framework", confidence: "high" },
];

// Header signatures
function fromHeaders(headers) {
  const techs = [];
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];

  const server = lower.server || "";
  if (server) {
    // Try to split product / version, e.g. "nginx/1.18.0" or "Apache/2.4.41 (Ubuntu)"
    const m = server.match(/^([a-zA-Z0-9_-]+)(?:\/([\d.]+))?/);
    if (m) {
      techs.push({ name: m[1], version: m[2] || "", category: "web-server", confidence: "high", source: "header:Server", cpe: "" });
    }
  }
  const xpb = lower["x-powered-by"];
  if (xpb) {
    const m = xpb.match(/^([a-zA-Z0-9_.-]+)(?:[/ ]([\d.]+))?/);
    if (m) {
      techs.push({ name: m[1], version: m[2] || "", category: "framework", confidence: "high", source: "header:X-Powered-By", cpe: "" });
    }
  }
  const aspver = lower["x-aspnet-version"] || lower["x-aspnetmvc-version"];
  if (aspver) {
    techs.push({ name: "ASP.NET", version: aspver, category: "framework", confidence: "high", source: "header:X-AspNet-Version", cpe: "" });
  }
  const via = lower["via"];
  if (via && /varnish/i.test(via)) {
    techs.push({ name: "Varnish", version: "", category: "cache", confidence: "medium", source: "header:Via", cpe: "" });
  }
  const cf = lower["cf-ray"];
  if (cf) {
    techs.push({ name: "Cloudflare", version: "", category: "cdn", confidence: "high", source: "header:CF-Ray", cpe: "" });
  }
  return techs;
}

function fromBody(body) {
  const techs = [];
  if (!body) return techs;
  for (const sig of BODY_SIGNATURES) {
    const m = body.match(sig.re);
    if (!m) continue;
    if (sig.generator) {
      const name = m[1].trim();
      techs.push({ name, version: "", category: sig.category, confidence: sig.confidence, source: "body:generator", cpe: "" });
      continue;
    }
    const version = sig.versionGroup ? (m[sig.versionGroup] || "") : "";
    techs.push({ name: sig.name, version, category: sig.category, confidence: sig.confidence, source: "body:signature", cpe: "" });
  }
  return techs;
}

function getTitle(body) {
  const m = body && body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim().slice(0, 200) : "";
}

async function tryNative(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = `http://${url}`;
  const res = await httpFetch(url, { timeout: 15000 });
  if (!res.ok) {
    return { target: url, source: "node:fetch", error: res.error || "fetch failed", technologies: [] };
  }
  const headerTechs = fromHeaders(res.headers || {});
  const bodyTechs = fromBody(res.body || "");
  const merged = {};
  for (const t of [...headerTechs, ...bodyTechs]) {
    const key = (t.name || "").toLowerCase();
    if (!key) continue;
    if (!merged[key]) merged[key] = t;
    else if (!merged[key].version && t.version) merged[key].version = t.version;
  }
  return {
    target: url,
    source: "node:fetch",
    status_code: res.status,
    title: getTitle(res.body),
    server: (res.headers || {}).server || "",
    content_type: (res.headers || {})["content-type"] || "",
    technologies: Object.values(merged),
  };
}

async function fingerprint(url) {
  const fromBin = tryBinary(url);
  if (fromBin && fromBin.technologies && fromBin.technologies.length) return fromBin;
  return await tryNative(url);
}

const url = requireArg(process.argv, "tech_fingerprint.js", "<url>");
fingerprint(url)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target: url }, null, 2));
    process.exit(2);
  });
