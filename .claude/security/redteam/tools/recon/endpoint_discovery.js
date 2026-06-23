#!/usr/bin/env node
// Endpoint/directory discovery. Dispatch: feroxbuster (optional) + robots.txt + sitemap.xml + bundled wordlist.
// Native fallback uses an 80-path wordlist that covers admin/API/health/debug routes.

import { whichBin, runBin, requireArg, httpFetch, poolMap } from "./_runner.js";

// 80 common interesting paths — admin/API/health/debug/config/source-control
const COMMON_PATHS = [
  // Source-control / config leakage
  "/.env", "/.env.local", "/.env.production", "/.env.bak",
  "/.git/config", "/.git/HEAD", "/.gitignore",
  "/.svn/entries", "/.hg/store",
  "/.aws/credentials", "/.npmrc", "/.dockerenv",
  "/config.json", "/config.yaml", "/config.yml", "/settings.json",
  "/web.config", "/appsettings.json", "/appsettings.Production.json",
  "/composer.json", "/composer.lock", "/package.json", "/package-lock.json",
  // API surfaces
  "/api", "/api/", "/api/v1", "/api/v2", "/api/v3",
  "/api/docs", "/api/swagger", "/api/openapi", "/api/spec",
  "/swagger.json", "/swagger-ui.html", "/swagger-ui/",
  "/openapi.json", "/openapi.yaml",
  "/graphql", "/graphiql", "/playground",
  // Admin / auth
  "/admin", "/admin/", "/admin/login", "/administrator",
  "/login", "/signin", "/sign-in", "/auth", "/auth/login",
  "/wp-admin/", "/wp-login.php", "/wp-content/", "/wp-includes/",
  "/phpmyadmin/", "/pma/", "/myadmin/",
  // Health / debug
  "/health", "/healthz", "/livez", "/readyz",
  "/status", "/server-status", "/server-info",
  "/metrics", "/debug", "/debug/pprof/",
  "/actuator", "/actuator/health", "/actuator/env", "/actuator/mappings",
  "/console", "/_console",
  // Well-known
  "/.well-known/security.txt", "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  // Backup / dumps
  "/backup", "/backup.zip", "/backup.sql", "/dump.sql", "/db.sql",
  "/.bash_history", "/.ssh/id_rsa",
  // Misc
  "/robots.txt", "/sitemap.xml", "/crossdomain.xml", "/clientaccesspolicy.xml",
  "/test", "/staging", "/dev", "/internal",
];

const INTERESTING_PATTERNS = [
  "admin", "debug", "console", "swagger", "graphql",
  "actuator", "metrics", "status", ".env", ".git",
  "backup", "dump", "config", "secret", "token",
  "api/docs", "openapi", "phpmyadmin", "wp-admin",
];

async function fetchRobotsTxt(baseUrl) {
  const url = new URL("/robots.txt", baseUrl).href;
  const r = await httpFetch(url, { timeout: 8000 });
  if (!r.ok || r.status !== 200 || !r.body) return [];
  const paths = [];
  for (const line of r.body.split(/\r?\n/)) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("disallow:") || lower.startsWith("allow:") || lower.startsWith("sitemap:")) {
      const colon = trimmed.indexOf(":");
      const p = trimmed.slice(colon + 1).trim();
      if (p && p !== "/" && !p.startsWith("#")) {
        try {
          paths.push({
            url: new URL(p, baseUrl).href,
            source: "robots.txt",
            directive: trimmed.split(":")[0].trim().toLowerCase(),
            status_code: 0,
          });
        } catch { /* malformed line */ }
      }
    }
  }
  return paths;
}

async function fetchSitemap(baseUrl) {
  const url = new URL("/sitemap.xml", baseUrl).href;
  const r = await httpFetch(url, { timeout: 8000 });
  if (!r.ok || r.status !== 200 || !r.body) return [];
  const out = [];
  const re = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(r.body)) !== null && out.length < 200) {
    out.push({ url: m[1].trim(), source: "sitemap.xml", status_code: 0 });
  }
  return out;
}

function tryFeroxbuster(baseUrl) {
  if (!whichBin("feroxbuster")) return [];
  const res = runBin("feroxbuster", [
    "-u", baseUrl, "--json", "--depth", "2", "--threads", "10",
    "--time-limit", "120s", "--no-state", "--quiet", "--auto-tune",
    "--status-codes", "200,201,204,301,302,307,308,401,403,405,500",
  ], { timeout: 180000 });
  if (!res.stdout) return [];
  const endpoints = [];
  for (const line of res.stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e.type === "response") {
        endpoints.push({
          url: e.url || "",
          status_code: e.status || 0,
          content_length: e.content_length || 0,
          content_type: "",
          source: "feroxbuster",
        });
      }
    } catch { /* skip */ }
  }
  return endpoints;
}

async function probeCommonPaths(baseUrl) {
  const found = await poolMap(COMMON_PATHS, 16, async (p) => {
    const u = `${baseUrl}${p}`;
    const r = await httpFetch(u, { method: "GET", timeout: 5000, maxBytes: 4096, followRedirects: false });
    if (r.ok && r.status && [200, 301, 302, 401, 403].includes(r.status)) {
      return {
        url: u,
        status_code: r.status,
        content_length: (r.headers && r.headers["content-length"]) ? parseInt(r.headers["content-length"], 10) : (r.body ? r.body.length : 0),
        content_type: (r.headers && r.headers["content-type"]) || "",
        source: "common_path_check",
      };
    }
    return null;
  });
  return found.filter(Boolean);
}

async function discover(baseUrl) {
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) baseUrl = `http://${baseUrl}`;
  baseUrl = baseUrl.replace(/\/+$/, "");

  const all = [];
  const errors = [];

  try {
    all.push(...(await fetchRobotsTxt(baseUrl)));
  } catch (e) { errors.push(`robots.txt: ${e.message}`); }

  try {
    all.push(...(await fetchSitemap(baseUrl)));
  } catch (e) { errors.push(`sitemap.xml: ${e.message}`); }

  try {
    all.push(...tryFeroxbuster(baseUrl));
  } catch (e) { errors.push(`feroxbuster: ${e.message}`); }

  try {
    all.push(...(await probeCommonPaths(baseUrl)));
  } catch (e) { errors.push(`common-path: ${e.message}`); }

  // De-duplicate
  const seen = new Set();
  const unique = [];
  for (const ep of all) {
    const u = ep.url || "";
    if (u && !seen.has(u)) {
      seen.add(u);
      ep.interesting = INTERESTING_PATTERNS.some((pat) => u.toLowerCase().includes(pat));
      unique.push(ep);
    }
  }

  return {
    target: baseUrl,
    total_discovered: unique.length,
    endpoints: unique,
    errors: errors.length ? errors : null,
  };
}

const url = requireArg(process.argv, "endpoint_discovery.js", "<url>");
discover(url)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target: url }, null, 2));
    process.exit(2);
  });
