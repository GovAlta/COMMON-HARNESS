#!/usr/bin/env node
// OWASP ZAP wrapper. Dispatch: --report <path> → parse HTML; --auto-docker → run zap-baseline in Docker.
// Otherwise prints a "How to run ZAP" guide and exits with status=manual_run_required.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { whichBin } from "../tools/recon/_runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const out = { target: null, report: null, autoDocker: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--report") { out.report = args[++i]; }
    else if (a === "--auto-docker") { out.autoDocker = true; }
    else if (!out.target) { out.target = a; }
  }
  return out;
}

async function parseReport(reportPath) {
  const zapParse = await import(`file://${path.join(__dirname, "zap_parse.js").replace(/\\/g, "/")}`);
  // zap_parse exports nothing — it runs on import. Instead spawn it.
  // Simpler: just exec it.
  const out = execFileSync(process.execPath, [path.join(__dirname, "zap_parse.js"), reportPath], {
    encoding: "utf-8", maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function autoDocker(target) {
  if (!whichBin("docker")) {
    return {
      status: "docker_unavailable",
      target,
      instructions: ["Docker not on PATH. Install Docker Desktop or pass --report <path> to parse an existing HTML report."],
    };
  }
  const reportFile = path.resolve(`zap_report_${Date.now()}.html`);
  try {
    execFileSync("docker", [
      "run", "--rm",
      "-v", `${path.dirname(reportFile)}:/zap/wrk/:rw`,
      "-t", "owasp/zap2docker-stable",
      "zap-baseline.py", "-t", target,
      "-r", path.basename(reportFile),
    ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 1800000 });
  } catch (e) {
    // zap-baseline returns non-zero when findings exist; report may still have been written
    if (!fs.existsSync(reportFile)) {
      return { status: "docker_run_failed", target, error: (e.stderr || e.message || "").toString().slice(0, 1000) };
    }
  }
  return { status: "ran", target, report_path: reportFile };
}

const MANUAL_GUIDE = [
  "ZAP is a heavyweight scanner; this wrapper does not bundle it. To run ZAP:",
  "1. Install Docker.",
  "2. Run: docker run -t owasp/zap2docker-stable zap-baseline.py -t <target-url> -r zap_report.html",
  "3. After it finishes, pass the report back: node scripts/zap_scan.js --report zap_report.html",
  "4. Or run this script with --auto-docker once Docker is installed: node scripts/zap_scan.js <target> --auto-docker",
  "Alternative: install ZAP locally from https://www.zaproxy.org/download/ and use the GUI or API.",
];

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.report) {
    if (!fs.existsSync(opts.report)) {
      console.log(JSON.stringify({ tool: "zap", error: `report file not found: ${opts.report}` }, null, 2));
      process.exit(2);
    }
    const parsed = await parseReport(opts.report);
    console.log(JSON.stringify({ tool: "zap", source: "report_parse", ...parsed }, null, 2));
    return;
  }

  if (opts.autoDocker) {
    if (!opts.target) {
      console.log(JSON.stringify({ tool: "zap", error: "--auto-docker requires <target> argument" }, null, 2));
      process.exit(1);
    }
    const r = autoDocker(opts.target);
    if (r.status === "ran" && r.report_path && fs.existsSync(r.report_path)) {
      const parsed = await parseReport(r.report_path);
      console.log(JSON.stringify({ tool: "zap", source: "auto_docker", report_path: r.report_path, ...parsed }, null, 2));
      return;
    }
    console.log(JSON.stringify({ tool: "zap", ...r }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    tool: "zap",
    status: "manual_run_required",
    target: opts.target,
    instructions: MANUAL_GUIDE,
  }, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ tool: "zap", error: e.message }, null, 2));
  process.exit(2);
});
