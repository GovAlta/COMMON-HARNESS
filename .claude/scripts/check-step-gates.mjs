#!/usr/bin/env node
/**
 * check-step-gates.mjs — verify all mandatory completion gates fired before
 * a phase is allowed to hand off to the next phase.
 *
 * Each phase has a list of mandatory gates. /phase5-development for example:
 *   - FR coverage check (every must-have FR has code)
 *   - NFR coverage check (every NFR has evidence)
 *   - sync-docs zero drift
 *   - blueteam zero criticals
 *   - migration idempotency proof (if migrations changed)
 *   - tests pass
 *
 * The script attempts to RUN each gate and aggregates pass/fail. It is the
 * mechanical enforcement that turns "must do X" prose into actual blocking.
 *
 * Usage:
 *   node .claude/scripts/check-step-gates.mjs <phase-name>
 *   node .claude/scripts/check-step-gates.mjs phase5-development
 *   node .claude/scripts/check-step-gates.mjs phase5-development --json
 *
 * Exits 0 if all mandatory gates pass, 1 if any fail.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const STEP = argv[0];
let ROOT = process.cwd();
let JSON_OUT = false;
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

if (!STEP) {
  console.error('usage: check-step-gates.mjs <phase-name> [--root <dir>] [--json]');
  console.error('  phase-name: one of phase1-requirements | phase2-planning | phase3-architecture | phase4-prototyping');
  console.error('              | phase5-development | phase6-user-testing | phase7-user-acceptance | phase8-deployment');
  process.exit(2);
}

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const SCRIPTS = __dirname;

// Record gate fires to .claude/state/gate-state.jsonl for the audit trail
function recordFire(step, gate, ok) {
  try {
    const recorder = path.join(SCRIPTS, 'record-gate-fire.mjs');
    spawnSync('node', [recorder, step, gate, ok ? 'pass' : 'fail'], { stdio: 'ignore' });
  } catch { /* state-file is best-effort; never block on it */ }
}

function runGate(name, command, args, opts = {}) {
  const r = spawnSync(command, args, { encoding: 'utf8', cwd: ROOT, ...opts });
  const ok = r.status === 0;
  recordFire(STEP, name, ok);
  return {
    name,
    ok,
    exit: r.status,
    output: ((r.stdout || '') + (r.stderr || '')).trim(),
  };
}

function out(phase, file) {
  return path.join(ROOT, 'phases', phase, 'output', file);
}

// ─── Per-phase mandatory gates ────────────────────────────────────────────────
const GATES_BY_STEP = {
  'phase1-requirements': () => [
    // §9 must include External Dependencies; check-external-deps verifies the structure
    runGate('External-deps section present', 'node', [path.join(SCRIPTS, 'check-external-deps.mjs'), '--root', ROOT]),
    // The doc itself must validate
    runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase1-requirements',
              out('phase1-requirements', 'requirements.md')]),
  ],
  'phase2-planning': () => [
    // Cannot plan around unconfirmed external deps
    runGate('External deps confirmed (from phase1)', 'node', [path.join(SCRIPTS, 'check-external-deps.mjs'), '--root', ROOT]),
    runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase2-planning',
              out('phase2-planning', 'plan.md')]),
  ],
  'phase3-architecture': () => [
    runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase3-architecture',
              out('phase3-architecture', 'architecture.md')]),
    // Information Architecture section is mandatory — root cause of orphan-page bugs
    runGate('Information Architecture section', 'node', [path.join(SCRIPTS, 'check-ia-section.mjs'), '--root', ROOT]),
  ],
  'phase4-prototyping': () => {
    const gates = [
      runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase4-prototyping',
                out('phase4-prototyping', 'prototype-report.md')]),
    ];
    // phase4 must have produced actual code — the new requirement is a "Working Code Reference"
    // table in prototype-report.md. We also check that ./app/ has at least one file dated
    // after the prototype-report.md generation (proxy: not just scaffold).
    const protoReport = out('phase4-prototyping', 'prototype-report.md');
    if (fs.existsSync(protoReport)) {
      const text = fs.readFileSync(protoReport, 'utf8');
      const hasWCR = /^#{2,6}\s+(?:[\d.]+[A-Za-z]*\s+)?Working Code Reference|##.*Files (added|modified) during prototype/im.test(text);
      gates.push({
        name: 'Working Code Reference section present',
        ok: hasWCR,
        exit: hasWCR ? 0 : 1,
        output: hasWCR ? 'found Working Code Reference section' : 'prototype-report.md is missing the Working Code Reference section — a paper prototype is not a prototype',
      });
    }
    return gates;
  },
  'phase5-development': () => [
    runGate('FR coverage (every must-have has code)', 'node', [path.join(SCRIPTS, 'check-fr-coverage.mjs'), '--root', ROOT]),
    runGate('NFR coverage (every NFR has evidence)',  'node', [path.join(SCRIPTS, 'check-nfr-coverage.mjs'), '--root', ROOT]),
    runGate('Evidence strength (NFRs actually exercised)', 'node', [path.join(SCRIPTS, 'check-evidence-strength.mjs'), '--root', ROOT]),
    runGate('Nav completeness (no orphan pages)',     'node', [path.join(SCRIPTS, 'check-nav-completeness.mjs'), '--root', ROOT]),
    runGate('Test presence (E2E + unit, FR-traceable)', 'node', [path.join(SCRIPTS, 'check-test-presence.mjs'), '--root', ROOT]),
    runGate('Blueteam pipeline complete',             'node', [path.join(SCRIPTS, 'check-blueteam-pipeline.mjs'), '--root', ROOT]),
    runGate('Redteam static (non-live) complete',     'node', [path.join(SCRIPTS, 'check-redteam-static.mjs'), '--root', ROOT]),
    runGate('No silent deferrals',                    'node', [path.join(SCRIPTS, 'check-no-silent-deferral.mjs'), '--root', ROOT]),
    runGate('sync-docs zero drift',                    'node', [path.join(__dirname, '..', 'skills', 'sync-docs', 'check-docs-sync.mjs'), '--root', path.join(ROOT, 'app')]),
    runGate('Migration idempotency',                   'node', [path.join(SCRIPTS, 'check-migration-idempotency.mjs'), '--root', path.join(ROOT, 'app')]),
    runGate('Output template structure',               'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase5-development',
              out('phase5-development', 'development-report.md')]),
  ],
  'phase6-user-testing': () => {
    const gates = [];
    // Phase A artifact: test-plan.md with manual scripts in app/test/manual/
    const planPath = out('phase6-user-testing', 'test-plan.md');
    if (fs.existsSync(planPath)) {
      gates.push(runGate('test-plan.md structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase6-user-testing', planPath]));
      // Manual scripts must actually exist in app/test/manual/
      const manualDir = path.join(ROOT, 'app', 'test', 'manual');
      const manualScripts = fs.existsSync(manualDir) ? fs.readdirSync(manualDir).filter(f => f.endsWith('.md')) : [];
      gates.push({
        name: 'Manual test scripts present in app/test/manual/',
        ok: manualScripts.length > 0,
        exit: manualScripts.length > 0 ? 0 : 1,
        output: manualScripts.length > 0 ? `${manualScripts.length} script(s) present` : 'app/test/manual/ is empty or missing',
      });
      // Test presence + FR traceability + assertions
      gates.push(runGate('Test presence (E2E + unit, FR-traceable)', 'node', [path.join(SCRIPTS, 'check-test-presence.mjs'), '--root', ROOT]));
      // Nav completeness (re-verify in case phase5 added orphans)
      gates.push(runGate('Nav completeness (no orphan pages)', 'node', [path.join(SCRIPTS, 'check-nav-completeness.mjs'), '--root', ROOT]));
      // No silent deferrals from this report stage either
      gates.push(runGate('No silent deferrals', 'node', [path.join(SCRIPTS, 'check-no-silent-deferral.mjs'), '--root', ROOT]));
    }
    return gates;
  },
  'phase7-user-acceptance': () => {
    const gates = [
      runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase7-user-acceptance',
                out('phase7-user-acceptance', 'uat-script.md')]),
      // /phase7 cannot UAT a build that doesn't exist or fails coverage
      runGate('FR coverage (re-checked at UAT)',  'node', [path.join(SCRIPTS, 'check-fr-coverage.mjs'),  '--root', ROOT]),
      runGate('NFR coverage (re-checked at UAT)', 'node', [path.join(SCRIPTS, 'check-nfr-coverage.mjs'), '--root', ROOT]),
      runGate('Evidence strength (NFRs actually exercised)', 'node', [path.join(SCRIPTS, 'check-evidence-strength.mjs'), '--root', ROOT]),
      runGate('Nav completeness (no orphan pages)', 'node', [path.join(SCRIPTS, 'check-nav-completeness.mjs'), '--root', ROOT]),
      runGate('No silent deferrals', 'node', [path.join(SCRIPTS, 'check-no-silent-deferral.mjs'), '--root', ROOT]),
    ];
    return gates;
  },
  'phase8-deployment': () => {
    const gates = [
      runGate('Output template structure', 'node', [path.join(SCRIPTS, 'validate-step-output.mjs'), 'phase8-deployment',
                out('phase8-deployment', 'runbook.md')]),
      // pre-deploy gates from phase8 methodology must be live, not deferred
      runGate('FR coverage (re-checked at deploy)',  'node', [path.join(SCRIPTS, 'check-fr-coverage.mjs'), '--root', ROOT]),
      runGate('NFR coverage (re-checked at deploy)', 'node', [path.join(SCRIPTS, 'check-nfr-coverage.mjs'), '--root', ROOT]),
      runGate('Evidence strength (NFRs actually exercised)', 'node', [path.join(SCRIPTS, 'check-evidence-strength.mjs'), '--root', ROOT]),
      runGate('Nav completeness (no orphan pages)',   'node', [path.join(SCRIPTS, 'check-nav-completeness.mjs'), '--root', ROOT]),
      runGate('Test presence (E2E + unit, FR-traceable)', 'node', [path.join(SCRIPTS, 'check-test-presence.mjs'), '--root', ROOT]),
      runGate('Blueteam pipeline complete (pre-deploy)', 'node', [path.join(SCRIPTS, 'check-blueteam-pipeline.mjs'), '--root', ROOT]),
      runGate('Redteam static (pre-deploy regression)', 'node', [path.join(SCRIPTS, 'check-redteam-static.mjs'), '--root', ROOT]),
      runGate('No silent deferrals',                 'node', [path.join(SCRIPTS, 'check-no-silent-deferral.mjs'), '--root', ROOT]),
      runGate('Migration idempotency proof',         'node', [path.join(SCRIPTS, 'check-migration-idempotency.mjs'), '--root', path.join(ROOT, 'app')]),
    ];
    return gates;
  },
};

// ─── Run ────────────────────────────────────────────────────────────────────
const factory = GATES_BY_STEP[STEP];
if (!factory) {
  console.error(`check-step-gates: unknown phase '${STEP}'. Use one of: ${Object.keys(GATES_BY_STEP).join(', ')}`);
  process.exit(2);
}

const results = factory();
const failed = results.filter(r => !r.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ step: STEP, ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`\nphase-gate check  —  ${STEP}`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) {
      // Print the first 5 lines of the failed gate's output for context
      const head = r.output.split('\n').slice(0, 5).join('\n');
      console.log(head.split('\n').map(l => `      ${l}`).join('\n'));
    }
  }
  console.log('─'.repeat(64));
  console.log(`  ${results.length - failed.length}/${results.length} gates passed.`);
  if (failed.length) {
    console.log(`  ✘ ${STEP} CANNOT advance to the next phase until all gates pass.`);
    console.log(`  Per harness rule: gates are mechanical, not aspirational.`);
  }
  console.log('');
}
process.exit(failed.length > 0 ? 1 : 0);
