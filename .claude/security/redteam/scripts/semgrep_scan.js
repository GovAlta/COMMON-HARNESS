#!/usr/bin/env node
// Semgrep SAST scanner. Dispatch: semgrep binary / `npx semgrep` → documented manual install.
// Usage: node semgrep_scan.js <target-path> [--config p/ci]

import { execFileSync } from "node:child_process";
import { whichBin } from "../tools/recon/_runner.js";

function tryBinary(target, config) {
  const args = ["--config", config, "--json", "--quiet", "--error", "--no-rewrite-rule-ids", target];
  let stdout = "";
  // Try `semgrep` first, fall back to `npx --yes semgrep`
  const tryRun = (cmd, runArgs) => {
    try {
      stdout = execFileSync(cmd, runArgs, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, timeout: 300000, stdio: ["pipe", "pipe", "pipe"] });
      return true;
    } catch (e) {
      // semgrep exits non-zero when findings exist; still has stdout JSON
      if (e.stdout) { stdout = e.stdout.toString(); return true; }
      return false;
    }
  };

  if (whichBin("semgrep")) {
    if (tryRun("semgrep", args)) return stdout;
  }
  // Try via npx (works if semgrep is published as npm pkg — it isn't, but it's worth probing)
  // Actually semgrep isn't a node package, so skip npx.
  return null;
}

function parseFindings(jsonStr, target) {
  let data;
  try { data = JSON.parse(jsonStr); }
  catch { return { tool: "semgrep", target, total_findings: 0, findings: [], error: "semgrep JSON parse failed" }; }
  const findings = [];
  for (const r of (data.results || [])) {
    const sev = (r.extra && r.extra.severity) ? r.extra.severity.toLowerCase() : "info";
    findings.push({
      file_path: r.path || "",
      line: (r.start && r.start.line) || 0,
      end_line: (r.end && r.end.line) || 0,
      rule: r.check_id || "",
      severity: sev,
      message: (r.extra && r.extra.message) || "",
      masked_match: ((r.extra && r.extra.lines) || "").slice(0, 200),
    });
  }
  return { tool: "semgrep", target, total_findings: findings.length, findings };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    process.stderr.write("Usage: node semgrep_scan.js <target-path> [--config p/ci]\n");
    process.exit(1);
  }
  const target = argv[0];
  const configIdx = argv.indexOf("--config");
  const config = (configIdx >= 0 && argv[configIdx + 1]) ? argv[configIdx + 1] : "p/ci";

  const stdout = tryBinary(target, config);
  if (stdout) {
    console.log(JSON.stringify(parseFindings(stdout, target), null, 2));
    return;
  }
  console.log(JSON.stringify({
    tool: "semgrep",
    target,
    status: "not_installed",
    total_findings: 0,
    findings: [],
    install_instructions: [
      "Semgrep is a Python tool, not bundled with Node.",
      "Install via pipx: pipx install semgrep",
      "Or via pip:    python -m pip install --user semgrep",
      "Or via brew:   brew install semgrep",
      "Then re-run: node scripts/semgrep_scan.js <target>",
    ],
  }, null, 2));
}

try { main(); }
catch (e) {
  console.log(JSON.stringify({ tool: "semgrep", error: e.message }, null, 2));
  process.exit(2);
}
