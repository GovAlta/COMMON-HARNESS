#!/usr/bin/env node
// Dependency vulnerability scanner. Dispatch: osv-scanner binary → OSV.dev REST API fallback.
// Native fallback reads package-lock.json / pnpm-lock.yaml and queries https://api.osv.dev/v1/query.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { whichBin } from "../tools/recon/_runner.js";

function postJSON(url, payload, timeout = 15000) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(payload));
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      timeout,
      headers: { "Content-Type": "application/json", "Content-Length": data.length },
    }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve({ ok: true, data: JSON.parse(body), status: res.statusCode }); }
        catch (e) { resolve({ ok: false, error: e.message }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.write(data);
    req.end();
  });
}

function readPackageLock(dir) {
  const fp = path.join(dir, "package-lock.json");
  if (!fs.existsSync(fp)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const deps = [];
    // npm v7+ uses "packages": { "node_modules/...": {version, ...} }
    if (json.packages) {
      for (const [k, v] of Object.entries(json.packages)) {
        if (!k || k === "") continue;
        const name = k.startsWith("node_modules/") ? k.slice("node_modules/".length) : k;
        if (v && v.version) deps.push({ name, version: v.version, ecosystem: "npm" });
      }
    } else if (json.dependencies) {
      // npm v6 format
      const walk = (obj) => {
        for (const [name, v] of Object.entries(obj || {})) {
          if (v && v.version) deps.push({ name, version: v.version, ecosystem: "npm" });
          if (v && v.dependencies) walk(v.dependencies);
        }
      };
      walk(json.dependencies);
    }
    return deps;
  } catch { return null; }
}

function readPnpmLock(dir) {
  const fp = path.join(dir, "pnpm-lock.yaml");
  if (!fs.existsSync(fp)) return null;
  try {
    const text = fs.readFileSync(fp, "utf-8");
    const deps = [];
    // Very lightweight pnpm-lock parser: lines like "  /pkg@1.2.3:" or "  /@scope/pkg@1.2.3:"
    const re = /^\s+\/((?:@[^/]+\/)?[^@/]+)@([\d.]+(?:-[A-Za-z0-9.-]+)?)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      deps.push({ name: m[1], version: m[2], ecosystem: "npm" });
    }
    return deps;
  } catch { return null; }
}

function readRequirementsTxt(dir) {
  const fp = path.join(dir, "requirements.txt");
  if (!fs.existsSync(fp)) return null;
  try {
    const text = fs.readFileSync(fp, "utf-8");
    const deps = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.split("#")[0].trim();
      const m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*==\s*([A-Za-z0-9_.\-]+)/);
      if (m) deps.push({ name: m[1], version: m[2], ecosystem: "PyPI" });
    }
    return deps;
  } catch { return null; }
}

function readGoSum(dir) {
  const fp = path.join(dir, "go.sum");
  if (!fs.existsSync(fp)) return null;
  try {
    const text = fs.readFileSync(fp, "utf-8");
    const deps = [];
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([^\s]+)\s+v([^\s/]+)/);
      if (m) {
        const key = `${m[1]}@${m[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          deps.push({ name: m[1], version: `v${m[2]}`, ecosystem: "Go" });
        }
      }
    }
    return deps;
  } catch { return null; }
}

function tryBinary(target) {
  if (!whichBin("osv-scanner")) return null;
  try {
    const out = execFileSync("osv-scanner", ["--format", "json", target], {
      encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, timeout: 300000, stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(out);
    const findings = [];
    for (const r of (data.results || [])) {
      for (const pkg of (r.packages || [])) {
        for (const v of (pkg.vulnerabilities || [])) {
          findings.push({
            ecosystem: (pkg.package && pkg.package.ecosystem) || "",
            name: (pkg.package && pkg.package.name) || "",
            version: (pkg.package && pkg.package.version) || "",
            vuln_id: v.id || "",
            aliases: v.aliases || [],
            severity: (v.database_specific && v.database_specific.severity) || "",
            summary: v.summary || "",
          });
        }
      }
    }
    return { tool: "osv-scanner", target, total_findings: findings.length, findings, source: "osv-scanner-binary" };
  } catch (e) {
    if (e.stdout) {
      // exit-on-finding case
      try {
        const data = JSON.parse(e.stdout.toString());
        const findings = [];
        for (const r of (data.results || [])) {
          for (const pkg of (r.packages || [])) {
            for (const v of (pkg.vulnerabilities || [])) {
              findings.push({
                ecosystem: (pkg.package && pkg.package.ecosystem) || "",
                name: (pkg.package && pkg.package.name) || "",
                version: (pkg.package && pkg.package.version) || "",
                vuln_id: v.id || "",
                severity: (v.database_specific && v.database_specific.severity) || "",
                summary: v.summary || "",
              });
            }
          }
        }
        return { tool: "osv-scanner", target, total_findings: findings.length, findings, source: "osv-scanner-binary" };
      } catch { /* fall through */ }
    }
    return null;
  }
}

async function tryNative(target) {
  let deps = readPackageLock(target);
  let manifest = "package-lock.json";
  if (!deps || deps.length === 0) { deps = readPnpmLock(target); manifest = "pnpm-lock.yaml"; }
  if (!deps || deps.length === 0) { deps = readRequirementsTxt(target); manifest = "requirements.txt"; }
  if (!deps || deps.length === 0) { deps = readGoSum(target); manifest = "go.sum"; }
  if (!deps || deps.length === 0) {
    return {
      tool: "osv-scanner",
      target,
      total_findings: 0,
      findings: [],
      source: "node:osv-api",
      note: "No supported lockfile found (package-lock.json, pnpm-lock.yaml, requirements.txt, go.sum)",
    };
  }
  // Deduplicate
  const seen = new Set();
  deps = deps.filter((d) => {
    const key = `${d.name}@${d.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cap at 200 packages to avoid hammering the API
  const sliced = deps.slice(0, 200);
  const findings = [];
  // Batch: OSV supports a single-query endpoint; loop with mild concurrency
  const BATCH = 8;
  for (let i = 0; i < sliced.length; i += BATCH) {
    const batch = sliced.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((dep) =>
      postJSON("https://api.osv.dev/v1/query", { package: { name: dep.name, ecosystem: dep.ecosystem }, version: dep.version })
        .then((r) => ({ dep, r }))
    ));
    for (const { dep, r } of results) {
      if (!r.ok || !r.data || !r.data.vulns) continue;
      for (const v of r.data.vulns) {
        findings.push({
          ecosystem: dep.ecosystem,
          name: dep.name,
          version: dep.version,
          vuln_id: v.id || "",
          aliases: v.aliases || [],
          severity: (v.database_specific && v.database_specific.severity) || (v.severity && v.severity[0] && v.severity[0].score) || "",
          summary: v.summary || "",
          published: v.published || "",
        });
      }
    }
  }

  return {
    tool: "osv-scanner",
    target,
    manifest_used: manifest,
    packages_scanned: sliced.length,
    total_findings: findings.length,
    findings,
    source: "node:osv-api",
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    process.stderr.write("Usage: node osv_scan.js <target-path>\n");
    process.exit(1);
  }
  const target = path.resolve(argv[0]);
  if (!fs.existsSync(target)) {
    console.log(JSON.stringify({ tool: "osv-scanner", target, error: "target path does not exist" }, null, 2));
    process.exit(2);
  }
  const result = tryBinary(target) || (await tryNative(target));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ tool: "osv-scanner", error: e.message }, null, 2));
  process.exit(2);
});
