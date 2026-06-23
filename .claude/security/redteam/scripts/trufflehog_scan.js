#!/usr/bin/env node
// Secret-detection scanner. Dispatch: trufflehog binary → Node-native regex sweep.
// Native fallback walks the target dir applying a built-in pattern list.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { whichBin } from "../tools/recon/_runner.js";

function mask(s) {
  if (!s) return "";
  if (s.length <= 8) return s[0] + "***";
  return s.slice(0, 4) + "***" + s.slice(-4);
}

const PATTERNS = [
  { rule: "aws_access_key_id", re: /\bAKIA[0-9A-Z]{16}\b/g, severity: "critical" },
  { rule: "aws_secret_access_key", re: /\b(?:aws_?secret(?:_access)?_?key)[^a-zA-Z0-9]{1,4}([A-Za-z0-9/+=]{40})\b/gi, severity: "critical" },
  { rule: "github_token", re: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g, severity: "critical" },
  { rule: "github_pat_classic", re: /\b[a-f0-9]{40}\b/g, severity: "low" }, // weak — flag as low
  { rule: "google_api_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high" },
  { rule: "google_oauth", re: /\b[0-9]{12}-[a-z0-9_]{32}\.apps\.googleusercontent\.com\b/g, severity: "high" },
  { rule: "slack_token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,72}\b/g, severity: "high" },
  { rule: "slack_webhook", re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, severity: "high" },
  { rule: "stripe_secret", re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/g, severity: "critical" },
  { rule: "stripe_publishable", re: /\bpk_(?:live|test)_[A-Za-z0-9]{24,}\b/g, severity: "low" },
  { rule: "openai_key", re: /\bsk-[A-Za-z0-9]{20,60}T3BlbkFJ[A-Za-z0-9]{20,60}\b/g, severity: "critical" },
  { rule: "openai_project_key", re: /\bsk-proj-[A-Za-z0-9_-]{30,}\b/g, severity: "critical" },
  { rule: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, severity: "critical" },
  { rule: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: "medium" },
  { rule: "pem_private_key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: "critical" },
  { rule: "ssh_private_key", re: /-----BEGIN OPENSSH PRIVATE KEY-----/g, severity: "critical" },
  { rule: "generic_api_key", re: /\b(?:api[_-]?key|apikey|secret|token|password)[\s:='"]{1,5}([A-Za-z0-9._-]{16,80})\b/gi, severity: "medium" },
  { rule: "azure_storage_key", re: /\b[A-Za-z0-9+/=]{88}\b/g, severity: "low" },
  { rule: "twilio_sid", re: /\bAC[a-f0-9]{32}\b/g, severity: "medium" },
  { rule: "twilio_token", re: /\bSK[a-f0-9]{32}\b/g, severity: "high" },
];

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".nuxt", "coverage", ".cache", "vendor"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".tar", ".gz", ".tgz", ".woff", ".woff2", ".ttf", ".ico", ".mp4", ".mov", ".webm", ".wasm", ".lock", ".min.js", ".min.css"]);
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(fp);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;
      yield fp;
    }
  }
}

function scanFile(filePath, findings) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return; }
  if (stat.size > MAX_FILE_SIZE) return;
  let content;
  try { content = fs.readFileSync(filePath, "utf-8"); } catch { return; }
  if (!content) return;

  const lines = content.split(/\r?\n/);
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(content)) !== null) {
      const idx = m.index;
      // Find line number
      let ln = 1;
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        count += lines[i].length + 1;
        if (count >= idx) { ln = i + 1; break; }
      }
      const raw = m[1] || m[0];
      findings.push({
        file_path: filePath,
        line: ln,
        rule: p.rule,
        severity: p.severity,
        masked_match: mask(raw),
      });
      // Cap per-pattern matches per file to 10
      if (findings.filter((f) => f.file_path === filePath && f.rule === p.rule).length >= 10) break;
    }
  }
}

function tryBinary(target) {
  if (!whichBin("trufflehog")) return null;
  try {
    const out = execFileSync("trufflehog", ["filesystem", target, "--json", "--no-update"], {
      encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, timeout: 300000, stdio: ["pipe", "pipe", "pipe"],
    });
    const findings = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        findings.push({
          file_path: (r.SourceMetadata && r.SourceMetadata.Data && r.SourceMetadata.Data.Filesystem && r.SourceMetadata.Data.Filesystem.file) || "",
          line: (r.SourceMetadata && r.SourceMetadata.Data && r.SourceMetadata.Data.Filesystem && r.SourceMetadata.Data.Filesystem.line) || 0,
          rule: r.DetectorName || "",
          severity: r.Verified ? "critical" : "high",
          masked_match: mask(r.Raw || ""),
        });
      } catch { /* skip */ }
    }
    return { tool: "trufflehog", target, total_findings: findings.length, findings, source: "trufflehog-binary" };
  } catch (e) {
    return null;
  }
}

function tryNative(target) {
  const findings = [];
  let scanned = 0;
  for (const f of walk(target)) {
    scanFile(f, findings);
    scanned++;
    if (scanned > 5000) break; // safety cap
  }
  return { tool: "trufflehog", target, total_findings: findings.length, files_scanned: scanned, findings, source: "node:regex" };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    process.stderr.write("Usage: node trufflehog_scan.js <target-path>\n");
    process.exit(1);
  }
  const target = argv[0];
  if (!fs.existsSync(target)) {
    console.log(JSON.stringify({ tool: "trufflehog", target, error: "target path does not exist" }, null, 2));
    process.exit(2);
  }
  const result = tryBinary(target) || tryNative(target);
  console.log(JSON.stringify(result, null, 2));
}

try { main(); }
catch (e) {
  console.log(JSON.stringify({ tool: "trufflehog", error: e.message }, null, 2));
  process.exit(2);
}
