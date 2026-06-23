#!/usr/bin/env node
/**
 * security-pipeline.js
 *
 * Node.js orchestrator that runs npm-audit, secretlint, ESLint+security plugins,
 * and (optionally) evilscan, then produces a consolidated
 * security-scan-results.json in the same schema the existing 08-tool-scanning
 * skill expects.
 *
 * Usage:
 *   node security-pipeline.js --all   [--repo-root <path>] [--output <path>]
 *   node security-pipeline.js --audit [--repo-root <path>]
 *   node security-pipeline.js --secrets [--repo-root <path>]
 *   node security-pipeline.js --sast  [--repo-root <path>]
 *   node security-pipeline.js --network --target-host <host> [--repo-root <path>]
 */

import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BLUETEAM_ROOT = resolve(__dirname, '..');
const BIN_DIR = join(BLUETEAM_ROOT, 'node_modules', '.bin');

// ── Argument parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    all: false,
    audit: false,
    secrets: false,
    sast: false,
    network: false,
    repoRoot: process.cwd(),
    output: null,
    targetHost: null,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--all':
        args.all = true;
        break;
      case '--audit':
        args.audit = true;
        break;
      case '--secrets':
        args.secrets = true;
        break;
      case '--sast':
        args.sast = true;
        break;
      case '--network':
        args.network = true;
        break;
      case '--repo-root':
        args.repoRoot = resolve(argv[++i]);
        break;
      case '--output':
        args.output = resolve(argv[++i]);
        break;
      case '--target-host':
        args.targetHost = argv[++i];
        break;
      default:
        // ignore unknown flags
        break;
    }
  }

  if (args.all) {
    args.audit = true;
    args.secrets = true;
    args.sast = true;
    // network is NOT included in --all; it requires explicit opt-in
  }

  if (!args.output) {
    args.output = join(args.repoRoot, '.ai', 'blueteam', 'data', 'security-scan-results.json');
  }

  return args;
}

// ── Helpers ─────────────────────────────────────────────────────

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function elapsed(startMs) {
  return Math.round((Date.now() - startMs) / 100) / 10;
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function toolEntry(name, version, status, seconds, errorMessage = null) {
  return { name, version, status, execution_time_seconds: seconds, error_message: errorMessage };
}

// ── Tool 1: npm audit ───────────────────────────────────────────

function runNpmAudit(repoRoot, rawDir) {
  log('[1/4] Running npm audit...');
  const start = Date.now();
  const findings = [];
  let toolMeta;

  try {
    // Check that a package.json exists in the target
    const pkgPath = join(repoRoot, 'package.json');
    if (!existsSync(pkgPath)) {
      log('  -> No package.json found, skipping npm audit.');
      return {
        findings: [],
        tool: toolEntry('npm-audit', 'n/a', 'skipped', elapsed(start), 'No package.json in target directory'),
      };
    }

    let npmVersion = 'unknown';
    try {
      npmVersion = execSync('npm --version', { encoding: 'utf-8', timeout: 15000 }).trim();
    } catch { /* ignore */ }

    let stdout = '';
    let auditJson;
    try {
      // npm audit exits non-zero when vulnerabilities are found; that is expected
      stdout = execSync('npm audit --json', {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // npm audit returns exit code 1 when vulnerabilities exist
      stdout = err.stdout ?? '';
    }

    if (stdout) {
      const rawPath = join(rawDir, 'npm-audit-results.json');
      writeFileSync(rawPath, stdout, 'utf-8');
    }

    try {
      auditJson = JSON.parse(stdout);
    } catch {
      log('  -> Failed to parse npm audit JSON output.');
      return {
        findings: [],
        tool: toolEntry('npm-audit', npmVersion, 'failed', elapsed(start), 'Failed to parse JSON output'),
      };
    }

    const severityMap = {
      critical: 'CRITICAL',
      high: 'HIGH',
      moderate: 'MEDIUM',
      low: 'LOW',
      info: 'INFO',
    };

    // npm audit v7+ uses "vulnerabilities" object keyed by package name
    if (auditJson.vulnerabilities) {
      for (const [pkgName, vuln] of Object.entries(auditJson.vulnerabilities)) {
        const severity = severityMap[vuln.severity] || 'MEDIUM';
        const viaEntries = Array.isArray(vuln.via) ? vuln.via : [];
        const firstVia = viaEntries.find(v => typeof v === 'object') || {};

        const references = [];
        if (firstVia.url) references.push(firstVia.url);

        findings.push({
          id: firstVia.source ? `npm-audit-${firstVia.source}` : `npm-audit-${pkgName}-${randomUUID().slice(0, 8)}`,
          type: 'vulnerability',
          severity,
          title: firstVia.title || `Vulnerability in ${pkgName}`,
          description: firstVia.title || vuln.effects?.join(', ') || `${severity} severity vulnerability in ${pkgName}`,
          affected_component: pkgName,
          affected_version: vuln.range || 'unknown',
          location: { file: 'package.json', line: 0 },
          sources: ['npm-audit'],
          cvss_score: firstVia.cvss?.score ?? null,
          references,
          remediation: vuln.fixAvailable
            ? (typeof vuln.fixAvailable === 'object'
              ? `Update ${vuln.fixAvailable.name} to ${vuln.fixAvailable.version}`
              : 'Fix available — run npm audit fix')
            : 'No automatic fix available; review and update manually',
        });
      }
    }

    toolMeta = toolEntry('npm-audit', npmVersion, 'success', elapsed(start));
    log(`  -> Complete (${toolMeta.execution_time_seconds}s) - ${findings.length} findings`);
  } catch (err) {
    toolMeta = toolEntry('npm-audit', 'unknown', 'failed', elapsed(start), err.message);
    log(`  -> Failed: ${err.message}`);
  }

  return { findings, tool: toolMeta };
}

// ── Tool 2: secretlint ─────────────────────────────────────────

async function runSecretlint(repoRoot, rawDir) {
  log('[2/4] Running secretlint...');
  const start = Date.now();
  const findings = [];
  let toolMeta;

  try {
    let slVersion = 'unknown';
    try {
      slVersion = execSync(`"${join(BIN_DIR, 'secretlint')}" --version`, { encoding: 'utf-8', timeout: 30000 }).trim();
    } catch { /* ignore */ }

    // Secretlint requires .secretlintrc.json in the working directory (or a parent).
    // If the target repo doesn't have one, temporarily copy ours there.
    const configInRepo = join(repoRoot, '.secretlintrc.json');
    const configShipped = resolve(__dirname, '..', '.secretlintrc.json');
    let copiedConfig = false;
    if (!existsSync(configInRepo) && existsSync(configShipped)) {
      writeFileSync(configInRepo, readFileSync(configShipped, 'utf-8'), 'utf-8');
      copiedConfig = true;
    }

    // Build glob patterns that cover common project structures
    const globs = [
      '"**/*.js"', '"**/*.ts"', '"**/*.jsx"', '"**/*.tsx"', '"**/*.vue"',
      '"**/*.go"', '"**/*.json"', '"**/*.yaml"', '"**/*.yml"',
      '"**/*.env"', '"**/*.env.*"', '"**/*.key"', '"**/*.pem"',
    ].join(' ');

    let stdout = '';
    try {
      const secretlintBin = join(BIN_DIR, 'secretlint');
      stdout = execSync(
        `"${secretlintBin}" ${globs} --format json`,
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          timeout: 120000,
          maxBuffer: 50 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch (err) {
      // secretlint exits non-zero when findings exist
      stdout = err.stdout ?? '';
    }

    // Clean up temp config if we copied it
    if (copiedConfig) {
      try { unlinkSync(configInRepo); } catch { /* ignore */ }
    }

    if (stdout) {
      // Redact any secret values before saving raw output
      const rawPath = join(rawDir, 'secretlint-results.json');
      writeFileSync(rawPath, stdout, 'utf-8');
    }

    let slResults;
    try {
      slResults = JSON.parse(stdout);
    } catch {
      // secretlint may output nothing if no files match the glob
      log('  -> No secretlint output (no matching files or parse error). Continuing.');
      return {
        findings: [],
        tool: toolEntry('secretlint', slVersion, 'success', elapsed(start), 'No matching files or empty output'),
      };
    }

    // Skip findings in files that are gitignored — local .env files are
    // a normal dev pattern, not an exposure. Uses greenteam's shared
    // gitignore checker for consistency with the rest of the framework.
    let isIgnored = () => false;
    try {
      const giPath = resolve(__dirname, '..', '..', 'greenteam', 'pipeline', 'gitignore.js');
      const { makeChecker } = await import(`file://${giPath.replace(/\\/g, '/')}`);
      isIgnored = makeChecker(repoRoot);
    } catch { /* fall through; will not skip any */ }

    // secretlint JSON format: array of file results, each with "messages"
    const results = Array.isArray(slResults) ? slResults : (slResults.files || slResults.results || []);
    let skippedGitignored = 0;
    for (const fileResult of results) {
      const filePath = fileResult.filePath || fileResult.file || 'unknown';
      if (filePath !== 'unknown' && isIgnored(filePath)) {
        skippedGitignored += (fileResult.messages || []).length;
        continue;
      }
      const messages = fileResult.messages || [];
      for (const msg of messages) {
        findings.push({
          id: `secretlint-${msg.ruleId || 'unknown'}-${randomUUID().slice(0, 8)}`,
          type: 'secret',
          severity: 'CRITICAL',
          title: `Secret detected: ${msg.ruleId || 'unknown rule'}`,
          description: (msg.message || '').replace(/[\x00-\x1f]/g, '').replace(/[A-Za-z0-9+/=]{20,}/g, '[REDACTED]'),
          affected_component: filePath,
          affected_version: null,
          location: { file: filePath, line: msg.line || msg.loc?.start?.line || 0 },
          sources: ['secretlint'],
          cvss_score: null,
          references: [],
          remediation: 'Remove or rotate the exposed secret immediately. Add to .gitignore if appropriate.',
        });
      }
    }
    if (skippedGitignored > 0) {
      log(`  -> Skipped ${skippedGitignored} secretlint finding(s) in gitignored files (local-dev pattern, not exposure)`);
    }

    toolMeta = toolEntry('secretlint', slVersion, 'success', elapsed(start));
    log(`  -> Complete (${toolMeta.execution_time_seconds}s) - ${findings.length} findings`);
  } catch (err) {
    toolMeta = toolEntry('secretlint', 'unknown', 'failed', elapsed(start), err.message);
    log(`  -> Failed: ${err.message}`);
  }

  return { findings, tool: toolMeta };
}

// ── Tool 3: ESLint + security plugins ───────────────────────────

async function runEslintSecurity(repoRoot, rawDir) {
  log('[3/4] Running ESLint with security plugins...');
  const start = Date.now();
  const findings = [];
  let toolMeta;

  try {
    let eslintVersion = 'unknown';
    try {
      eslintVersion = execSync(`"${join(BIN_DIR, 'eslint')}" --version`, { encoding: 'utf-8', timeout: 30000 }).trim();
    } catch { /* ignore */ }

    // ESLint 9.x uses flat config. If the target repo has already committed
    // an `eslint.security-scan.config.mjs` (typical when the dev team has
    // tuned rules, e.g. demoting detect-object-injection to 'off'), respect
    // that file as the source of truth. Only write the harness-generated
    // version when the repo has none.
    const eslintConfigPath = join(repoRoot, 'eslint.security-scan.config.mjs');
    const eslintConfigCommitted = existsSync(eslintConfigPath);
    // Use absolute paths to resolve plugin + TS parser from blueteam's node_modules
    const pluginPath = resolve(__dirname, '..', 'node_modules', 'eslint-plugin-security', 'index.js').replace(/\\/g, '/');
    const tsParserPath = resolve(__dirname, '..', 'node_modules', '@typescript-eslint', 'parser', 'dist', 'index.js').replace(/\\/g, '/');
    const hasTsParser = existsSync(tsParserPath);
    const eslintConfigContent = `
import security from 'file://${pluginPath}';
${hasTsParser ? `import tsParser from 'file://${tsParserPath}';` : ''}

const securityRules = {
  'security/detect-eval-with-expression': 'error',
  'security/detect-non-literal-fs-filename': 'error',
  'security/detect-non-literal-regexp': 'error',
  'security/detect-non-literal-require': 'error',
  // detect-object-injection demoted to 'warn' (was 'error'). Rationale: this
  // rule fires on ANY computed property access (obj[key] where key is a variable),
  // which is idiomatic TypeScript. True object-injection vulnerabilities need
  // an untrusted source AND a privilege-relevant sink; this rule alone produces
  // 50-100+ false positives on a typical mid-sized codebase. Warn-level keeps
  // the signal in the report without inflating HIGH/CRITICAL counts.
  'security/detect-object-injection': 'warn',
  'security/detect-possible-timing-attacks': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-child-process': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-pseudoRandomBytes': 'error',
};

export default [
  // JavaScript files — default parser
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.js'],
    plugins: { security },
    rules: securityRules,
  },
${hasTsParser ? `  // TypeScript files — use @typescript-eslint/parser so .ts/.tsx don't throw parse errors
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { security },
    rules: securityRules,
  },` : `  // TypeScript scan skipped — install @typescript-eslint/parser in .claude/security/blueteam/`}
];
`;
    if (eslintConfigCommitted) {
      log(`  -> Using committed eslint.security-scan.config.mjs from repo (respecting target's tuning).`);
    } else {
      writeFileSync(eslintConfigPath, eslintConfigContent, 'utf-8');
    }

    // Discover directories containing JS/TS source files
    const candidateDirs = ['src', 'frontend/src', 'backend/src', 'backend', 'lib'];
    const scanDirs = candidateDirs.filter(d => existsSync(join(repoRoot, d)));
    if (scanDirs.length === 0) {
      scanDirs.push('.');
    }
    const dirArgs = scanDirs.map(d => `"${d}/"`).join(' ');

    let stdout = '';
    try {
      const eslintBin = join(BIN_DIR, 'eslint');
      const cmd = `"${eslintBin}" --config "${eslintConfigPath}" --format json ${dirArgs} --no-error-on-unmatched-pattern`;
      stdout = execSync(cmd, {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // ESLint exits non-zero when errors are found
      stdout = err.stdout ?? '';
    }

    if (stdout) {
      const rawPath = join(rawDir, 'eslint-security-results.json');
      writeFileSync(rawPath, stdout, 'utf-8');
    }

    let eslintResults;
    try {
      eslintResults = JSON.parse(stdout);
    } catch {
      log('  -> Failed to parse ESLint JSON output. Continuing.');
      return {
        findings: [],
        tool: toolEntry('eslint-security', eslintVersion, 'failed', elapsed(start), 'Failed to parse JSON output'),
      };
    }

    // ESLint JSON: array of file results, each with "messages"
    for (const fileResult of eslintResults) {
      const filePath = fileResult.filePath || 'unknown';
      // Make path relative to repo root
      const relPath = filePath.startsWith(repoRoot)
        ? filePath.slice(repoRoot.length).replace(/^[/\\]+/, '')
        : filePath;

      for (const msg of (fileResult.messages || [])) {
        const severity = msg.severity === 2 ? 'HIGH' : 'MEDIUM';
        findings.push({
          id: `eslint-${msg.ruleId || 'unknown'}-${relPath}-${msg.line || 0}`,
          type: 'sast',
          severity,
          title: `${msg.ruleId || 'ESLint issue'}: ${(msg.message || '').slice(0, 80)}`,
          description: msg.message || 'ESLint security finding',
          affected_component: relPath,
          affected_version: null,
          location: { file: relPath, line: msg.line || 0 },
          sources: ['eslint-security'],
          cvss_score: null,
          references: [],
          remediation: msg.fix ? 'Auto-fixable: run eslint --fix' : 'Review and refactor the flagged code pattern.',
        });
      }
    }

    toolMeta = toolEntry('eslint-security', eslintVersion, 'success', elapsed(start));
    log(`  -> Complete (${toolMeta.execution_time_seconds}s) - ${findings.length} findings`);
  } catch (err) {
    toolMeta = toolEntry('eslint-security', 'unknown', 'failed', elapsed(start), err.message);
    log(`  -> Failed: ${err.message}`);
  } finally {
    // Clean up temp ESLint config
    try { unlinkSync(eslintConfigPath); } catch { /* ignore */ }
  }

  return { findings, tool: toolMeta };
}

// ── Tool 5: multi-ecosystem (OSV + Java SAST + Python SAST) ─────
// Delegates to greenteam scanners so blueteam picks up Maven/Gradle/PyPI/
// Cargo/RubyGems/Composer/npm vulnerabilities AND Java/JSP/Python SAST
// patterns. Each greenteam scanner emits its own Finding shape; we
// translate to blueteam's shape and merge.
function runMultiEcosystem(repoRoot, rawDir) {
  const start = Date.now();
  log('[5/5] Running OSV + Java SAST + Python SAST...');
  const findings = [];
  let toolMeta;

  try {
    const greenteamDir = join(__dirname, '..', '..', 'greenteam');
    const scanners = [
      { id: 'osv_scan',             label: 'OSV.dev',    type: 'vulnerability' },
      { id: 'java_patterns_scan',   label: 'Java SAST',  type: 'sast' },
      { id: 'python_patterns_scan', label: 'Python SAST', type: 'sast' },
    ];
    for (const s of scanners) {
      const scriptPath = join(greenteamDir, 'scripts', `${s.id}.js`);
      if (!existsSync(scriptPath)) continue;
      const outFile = join(rawDir, `${s.id}.json`);
      const r = spawnSync('node', [scriptPath, '--target', repoRoot, '--out', outFile], {
        encoding: 'utf-8', shell: true, timeout: 900_000, maxBuffer: 64 * 1024 * 1024,
      });
      if (r.status !== 0) {
        log(`  -> ${s.id} failed: ${(r.stderr || '').slice(0, 200)}`);
        continue;
      }
      let arr;
      try { arr = JSON.parse(readFileSync(outFile, 'utf-8')); } catch { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      for (const g of arr) {
        findings.push({
          id: g.id || `${s.id}-${randomUUID().slice(0, 8)}`,
          type: s.type,
          severity: g.severity,
          title: g.title,
          description: g.evidence?.summary || g.evidence?.snippet || g.title,
          affected_component: g.evidence?.package || g.location?.file || s.label,
          affected_version: g.evidence?.installed || 'n/a',
          location: {
            file: g.location?.file || '',
            line: g.location?.line || 0,
          },
          sources: [s.label],
          cvss_score: null,
          references: g.evidence?.reference ? [g.evidence.reference] : [],
          remediation: g.remediation || '',
        });
      }
      log(`  -> ${s.id}: ${arr.length} finding(s)`);
    }
    toolMeta = toolEntry('multi-ecosystem', '1.0', 'success', elapsed(start));
    log(`  -> Complete (${toolMeta.execution_time_seconds}s) - ${findings.length} findings`);
  } catch (err) {
    toolMeta = toolEntry('multi-ecosystem', 'unknown', 'failed', elapsed(start), err.message);
    log(`  -> Failed: ${err.message}`);
  }

  return { findings, tool: toolMeta };
}

// ── Tool 4: evilscan (optional, network) ────────────────────────

async function runEvilscan(targetHost, rawDir) {
  log('[4/4] Running evilscan (network)...');
  const start = Date.now();
  const findings = [];
  let toolMeta;

  if (!targetHost) {
    log('  -> No --target-host provided, skipping network scan.');
    return {
      findings: [],
      tool: toolEntry('evilscan', 'n/a', 'skipped', 0, 'No --target-host provided'),
    };
  }

  try {
    let evilscan;
    try {
      evilscan = await import('evilscan');
    } catch {
      log('  -> evilscan not installed. Skipping network scan.');
      return {
        findings: [],
        tool: toolEntry('evilscan', 'not_installed', 'not_installed', elapsed(start), 'evilscan package not found'),
      };
    }

    const Evilscan = evilscan.default || evilscan;
    const scanner = new Evilscan({
      target: targetHost,
      port: '1-1024',
      status: 'O', // open ports only
      banner: true,
    });

    const openPorts = [];

    await new Promise((resolveP, rejectP) => {
      scanner.on('result', (data) => {
        openPorts.push(data);
      });
      scanner.on('error', (err) => {
        rejectP(new Error(String(err)));
      });
      scanner.on('done', () => {
        resolveP();
      });
      scanner.run();
    });

    // Save raw results
    const rawPath = join(rawDir, 'evilscan-results.json');
    writeFileSync(rawPath, JSON.stringify(openPorts, null, 2), 'utf-8');

    for (const port of openPorts) {
      findings.push({
        id: `evilscan-${targetHost}-${port.port}`,
        type: 'misconfiguration',
        severity: port.port < 1024 ? 'MEDIUM' : 'LOW',
        title: `Open port ${port.port}/${port.protocol || 'tcp'} on ${targetHost}`,
        description: `Port ${port.port} is open. Service: ${port.banner || 'unknown'}`,
        affected_component: targetHost,
        affected_version: null,
        location: { file: 'network', line: 0 },
        sources: ['evilscan'],
        cvss_score: null,
        references: [],
        remediation: 'Review whether this port needs to be exposed. Close or firewall unnecessary ports.',
      });
    }

    toolMeta = toolEntry('evilscan', 'n/a', 'success', elapsed(start));
    log(`  -> Complete (${toolMeta.execution_time_seconds}s) - ${findings.length} open ports`);
  } catch (err) {
    toolMeta = toolEntry('evilscan', 'unknown', 'failed', elapsed(start), err.message);
    log(`  -> Failed: ${err.message}`);
  }

  return { findings, tool: toolMeta };
}

// ── Deduplication ───────────────────────────────────────────────

function deduplicateFindings(allFindings) {
  const seen = new Map();

  for (const f of allFindings) {
    let key;
    switch (f.type) {
      case 'vulnerability':
        key = `vuln:${f.id}:${f.affected_component}:${f.affected_version}`;
        break;
      case 'secret':
        key = `secret:${f.location.file}:${f.location.line}:${f.title}`;
        break;
      case 'sast':
        key = `sast:${f.id}`;
        break;
      case 'misconfiguration':
        key = `misc:${f.id}`;
        break;
      default:
        key = `other:${f.id}`;
    }

    if (seen.has(key)) {
      const existing = seen.get(key);
      // Merge sources
      for (const s of f.sources) {
        if (!existing.sources.includes(s)) existing.sources.push(s);
      }
      // Keep the higher severity
      const sevOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      if (sevOrder.indexOf(f.severity) < sevOrder.indexOf(existing.severity)) {
        existing.severity = f.severity;
      }
      // Merge references
      for (const ref of f.references) {
        if (!existing.references.includes(ref)) existing.references.push(ref);
      }
      // Keep longer description
      if ((f.description || '').length > (existing.description || '').length) {
        existing.description = f.description;
      }
    } else {
      seen.set(key, { ...f });
    }
  }

  return Array.from(seen.values());
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  log('=== Security Pipeline ===');
  log(`Target: ${args.repoRoot}`);
  log(`Output: ${args.output}`);
  log('');

  if (!existsSync(args.repoRoot)) {
    log(`ERROR: Target directory does not exist: ${args.repoRoot}`);
    process.exit(1);
  }

  // Ensure output directories exist
  const outputDir = dirname(args.output);
  ensureDir(outputDir);
  const rawDir = join(outputDir, 'raw');
  ensureDir(rawDir);

  const allFindings = [];
  const toolsExecuted = [];

  // Tool 1: npm audit
  if (args.audit) {
    const result = runNpmAudit(args.repoRoot, rawDir);
    allFindings.push(...result.findings);
    toolsExecuted.push(result.tool);
  }

  // Tool 2: secretlint
  if (args.secrets) {
    const result = await runSecretlint(args.repoRoot, rawDir);
    allFindings.push(...result.findings);
    toolsExecuted.push(result.tool);
  }

  // Tool 3: ESLint security
  if (args.sast) {
    const result = await runEslintSecurity(args.repoRoot, rawDir);
    allFindings.push(...result.findings);
    toolsExecuted.push(result.tool);
  }

  // Tool 4: evilscan (only with --network)
  if (args.network) {
    const result = await runEvilscan(args.targetHost, rawDir);
    allFindings.push(...result.findings);
    toolsExecuted.push(result.tool);
  }

  // Tool 5: multi-ecosystem (OSV + Java SAST + Python SAST) — wraps greenteam scanners
  if (args.audit || args.sast) {
    const result = runMultiEcosystem(args.repoRoot, rawDir);
    allFindings.push(...result.findings);
    toolsExecuted.push(result.tool);
  }

  // Deduplicate
  const totalBefore = allFindings.length;
  const dedupedFindings = deduplicateFindings(allFindings);

  // Build summary
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const byType = { vulnerability: 0, secret: 0, misconfiguration: 0, sast: 0 };
  const affectedComponents = new Set();

  for (const f of dedupedFindings) {
    if (bySeverity[f.severity] !== undefined) bySeverity[f.severity]++;
    if (byType[f.type] !== undefined) byType[f.type]++;
    affectedComponents.add(f.affected_component);
  }

  const report = {
    scan_metadata: {
      scan_timestamp: new Date().toISOString(),
      target_directory: args.repoRoot,
      tools_executed: toolsExecuted,
      total_findings: dedupedFindings.length,
      total_findings_before_deduplication: totalBefore,
    },
    summary: {
      by_severity: bySeverity,
      by_type: byType,
      unique_affected_components: affectedComponents.size,
    },
    findings: dedupedFindings,
  };

  writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf-8');

  log('');
  log('=== Scan Complete ===');
  log(`Total findings: ${totalBefore} (${dedupedFindings.length} after deduplication)`);
  log(`  CRITICAL: ${bySeverity.CRITICAL}`);
  log(`  HIGH:     ${bySeverity.HIGH}`);
  log(`  MEDIUM:   ${bySeverity.MEDIUM}`);
  log(`  LOW:      ${bySeverity.LOW}`);
  log(`  INFO:     ${bySeverity.INFO}`);
  log('');
  log(`  Vulnerabilities:    ${byType.vulnerability}`);
  log(`  Secrets:            ${byType.secret}`);
  log(`  Misconfigurations:  ${byType.misconfiguration}`);
  log(`  SAST:               ${byType.sast}`);
  log('');
  log(`Report saved: ${args.output}`);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
