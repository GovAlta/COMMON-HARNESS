#!/usr/bin/env node
// HTTP security header audit. Dispatch: Node-native httpFetch (no binary needed).
// Audits HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.

import { httpFetch, requireArg } from "./_runner.js";

const SECURITY_HEADERS = [
  ["Strict-Transport-Security", "high", "Add HSTS header to prevent protocol downgrade and cookie hijacking"],
  ["Content-Security-Policy", "high", "Add CSP to mitigate XSS and data injection attacks"],
  ["X-Content-Type-Options", "medium", "Add 'nosniff' to prevent MIME-type sniffing"],
  ["X-Frame-Options", "medium", "Add DENY or SAMEORIGIN to prevent clickjacking"],
  ["X-XSS-Protection", "low", "Add '1; mode=block' for legacy browser XSS protection"],
  ["Referrer-Policy", "medium", "Add policy to control information leakage via Referer header"],
  ["Permissions-Policy", "medium", "Add policy to restrict browser feature access"],
  ["Cross-Origin-Opener-Policy", "low", "Add COOP to isolate browsing context"],
  ["Cross-Origin-Resource-Policy", "low", "Add CORP to prevent cross-origin reads"],
  ["Cross-Origin-Embedder-Policy", "low", "Add COEP to prevent loading cross-origin resources"],
];

const INFO_LEAK_HEADERS = ["Server", "X-Powered-By", "X-AspNet-Version", "X-AspNetMvc-Version"];

function assessHeader(name, value) {
  const n = name.toLowerCase();
  if (n === "strict-transport-security") {
    if (!/max-age=/i.test(value)) return "misconfigured";
    try {
      const maxAge = parseInt(value.toLowerCase().split("max-age=")[1].split(";")[0].trim(), 10);
      return maxAge >= 31536000 ? "secure" : "weak";
    } catch { return "weak"; }
  }
  if (n === "content-security-policy") {
    if (/unsafe-inline|unsafe-eval/.test(value)) return "weak";
    if (value.split(/\s+/).includes("*")) return "weak";
    return "secure";
  }
  if (n === "x-content-type-options") return /nosniff/i.test(value) ? "secure" : "misconfigured";
  if (n === "x-frame-options") {
    const v = value.trim().toUpperCase();
    return (v === "DENY" || v === "SAMEORIGIN") ? "secure" : "weak";
  }
  if (n === "referrer-policy") {
    const secure = ["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];
    return secure.includes(value.trim().toLowerCase()) ? "secure" : "weak";
  }
  return "secure";
}

async function audit(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = `http://${url}`;
  const res = await httpFetch(url, { method: "GET", timeout: 15000, followRedirects: true });
  if (!res.ok) return { target_url: url, error: res.error || "fetch failed", headers_present: [], headers_missing: [], information_leakage: [] };

  const headers = res.headers || {};
  // Node lowercases header names; preserve original capitalization for display
  const normalized = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }

  const present = [], missing = [];
  for (const [name, risk, recommendation] of SECURITY_HEADERS) {
    const val = normalized[name.toLowerCase()];
    if (val) {
      present.push({ name, value: val, assessment: assessHeader(name, val) });
    } else {
      missing.push({ name, risk, recommendation });
    }
  }

  const infoLeaks = [];
  for (const leak of INFO_LEAK_HEADERS) {
    const v = normalized[leak.toLowerCase()];
    if (v) infoLeaks.push({ header: leak, value: v });
  }

  return {
    target_url: url,
    final_url: res.finalUrl || url,
    status_code: res.status,
    source: "node:fetch",
    headers_present: present,
    headers_missing: missing,
    information_leakage: infoLeaks,
    all_headers: normalized,
  };
}

const url = requireArg(process.argv, "http_headers.js", "<url>");
audit(url)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target_url: url }, null, 2));
    process.exit(2);
  });
