#!/usr/bin/env node
/**
 * BlueTeam skill regression test orchestrator.
 *
 * usage: run_tests.js [--prepare] [--check] [--unit] [--all] [--status]
 *                     [--diff] [--accept] [--lint-assertions] [--list]
 *                     [--skill SKILL] [--fixture PATH]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

const SKILLS = {
  application_map: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/application_map.yaml',
    skill_file: '../skills/01-application-map.md',
    output_files: ['.ai/blueteam/data/application_map.json'],
    requires: [],
  },
  application_and_data_store_classification: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/application_and_data_store_classification.yaml',
    skill_file: '../skills/02-security-classification.md',
    output_files: [
      '.ai/blueteam/data/security-classification.yaml',
      '.ai/blueteam/data/security-classification-details.yaml',
      '.ai/blueteam/reports/security-classification.md',
      '.ai/blueteam/reports/security-classification.html',
    ],
    requires: ['application_map'],
  },
  threat_model: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/threat_model.yaml',
    skill_file: '../skills/04-threat-model.md',
    output_files: [
      '.ai/blueteam/reports/threat_model.md',
      '.ai/blueteam/data/code_changes.json',
    ],
    requires: ['application_map', 'application_and_data_store_classification'],
  },
  asvs: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/asvs.yaml',
    skill_file: '../skills/05-asvs-level2-assessment.md',
    output_files: [
      '.ai/blueteam/reports/asvs_level2_security_assessment.md',
      '.ai/blueteam/data/security_requirements.json',
    ],
    requires: ['application_map'],
  },
  cas: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/cas.yaml',
    skill_file: '../skills/06-cas-compliance.md',
    output_files: [
      '.ai/blueteam/reports/cas_compliance.md',
      '.ai/blueteam/data/code_changes.json',
    ],
    requires: ['application_map'],
  },
  kill_chain: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/kill_chain.yaml',
    skill_file: '../skills/07-kill-chain-aggregator.md',
    output_files: [
      '.ai/blueteam/reports/cross_domain_kill_chains.md',
      '.ai/blueteam/data/kill_chains.json',
      '.ai/blueteam/reports/security_requirements.md',
    ],
    requires: ['threat_model', 'asvs', 'cas'],
  },
  risk_acceptance: {
    fixture: 'risk_acceptance_app',
    assertions: 'integration/assertions/risk_acceptance.yaml',
    skill_file: '../skills/05-asvs-level2-assessment.md',
    output_files: [
      '.ai/blueteam/reports/asvs_level2_security_assessment.md',
      '.ai/blueteam/reports/risk_register.md',
    ],
    requires: [],
  },
  security_unit_test: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/security_unit_test.yaml',
    skill_file: '../skills/09-security-unit-tests.md',
    output_files: [
      '.ai/blueteam/reports/security_unit_test_coverage.md',
      '.ai/blueteam/reports/security_unit_test_coverage.html',
    ],
    requires: ['asvs', 'cas'],
  },
  dr_resilience: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/dr_resilience.yaml',
    skill_file: '../skills/10-dr-resilience.md',
    output_files: [
      '.ai/blueteam/data/dr_resilience_assessment.json',
      '.ai/blueteam/reports/dr_resilience_assessment.md',
      '.ai/blueteam/reports/dr_resilience_assessment.html',
    ],
    requires: ['application_map'],
  },
  overview_report: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/overview_report.yaml',
    skill_file: '../skills/12-security-overview-report.md',
    output_files: ['.ai/blueteam/reports/security_overview.html'],
    requires: ['threat_model', 'asvs', 'cas', 'kill_chain', 'dr_resilience', 'security_unit_test'],
  },
  preflight: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/preflight.yaml',
    skill_file: '../shared/skills/preflight.md',
    output_files: [],
    requires: [],
  },
  requirements_map: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/requirements_map.yaml',
    skill_file: '../skills/13-requirements-map.md',
    output_files: [
      '.ai/blueteam/data/application_map.json',
      '.ai/blueteam/data/app_topology.json',
      '.ai/blueteam/reports/application_map.md',
    ],
    requires: [],
  },
  security_architecture: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/security_architecture.yaml',
    skill_file: '../skills/03-security-architecture.md',
    output_files: [
      '.ai/blueteam/data/security_architecture.json',
      '.ai/blueteam/reports/security_architecture.md',
      '.ai/blueteam/reports/security_architecture.html',
    ],
    requires: ['application_map'],
  },
  cybersecurity_tool_use: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/cybersecurity_tool_use.yaml',
    skill_file: '../skills/08-tool-scanning.md',
    output_files: [],
    requires: [],
  },
  asvs_builder: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/asvs_builder.yaml',
    skill_file: '../skills/14-asvs-compliant-builder.md',
    output_files: [],
    requires: [],
  },
  cas_builder: {
    fixture: 'basic_webapp',
    assertions: 'integration/assertions/cas_builder.yaml',
    skill_file: '../skills/15-cas-compliant-builder.md',
    output_files: [],
    requires: [],
  },
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function getTestsDir() {
  return __dirname;
}

function getSkillVersion(skillFilePath) {
  let p = skillFilePath;
  if (!resolve(p).startsWith('/') && !resolve(p).match(/^[A-Za-z]:\\/)) {
    p = join(getTestsDir(), p);
  } else if (!resolve(p) === p) {
    p = join(getTestsDir(), p);
  }
  // Resolve relative paths
  if (!existsSync(p)) {
    p = join(getTestsDir(), skillFilePath);
  }
  if (!existsSync(p)) return 'unknown';
  try {
    const content = readFileSync(p, 'utf-8');
    const lines = content.split('\n');
    let inFrontmatter = false;
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (i === 0 && stripped === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (stripped === '---') {
          inFrontmatter = false;
          continue;
        }
        const m = stripped.match(/^version\s*:\s*(.+)$/i);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
      const hm = stripped.match(/^#+\s*[Vv]ersion[:\s]+(\S+)/);
      if (hm) return hm[1].trim();
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function printSeparator(char = '\u2500', width = 60) {
  console.log(char.repeat(width));
}

function _dependencyOrder() {
  const ordered = [];
  const seen = new Set();

  function visit(name) {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dep of (SKILLS[name].requires || [])) {
      if (dep in SKILLS) visit(dep);
    }
    ordered.push(name);
  }

  for (const skillName of Object.keys(SKILLS)) {
    visit(skillName);
  }
  return ordered;
}

function _resolveAssertionsPath(skillName) {
  return join(getTestsDir(), SKILLS[skillName].assertions);
}

function _countAssertions(assertionsPath) {
  if (!existsSync(assertionsPath)) return 0;
  try {
    const doc = yaml.load(readFileSync(assertionsPath, 'utf-8'));
    return (doc.assertions || []).length;
  } catch {
    return 0;
  }
}

function _loadAssertionMeta(assertionsPath) {
  if (!existsSync(assertionsPath)) return {};
  try {
    const doc = yaml.load(readFileSync(assertionsPath, 'utf-8'));
    return {
      skill_version: String(doc.skill_version || 'unknown'),
      last_validated: String(doc.last_validated || 'unknown'),
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Mode implementations
// ---------------------------------------------------------------------------

function modeList() {
  printSeparator();
  const header = `${'SKILL'.padEnd(20)} ${'FIXTURE'.padEnd(22)} ${'ASSERTIONS FILE'.padEnd(45)} ${'COUNT'.padStart(5)}`;
  console.log(header);
  printSeparator('-');
  for (const name of _dependencyOrder()) {
    const info = SKILLS[name];
    const ap = _resolveAssertionsPath(name);
    const count = _countAssertions(ap);
    const shortPath = info.assertions;
    console.log(
      `${name.padEnd(20)} ${info.fixture.padEnd(22)} ${shortPath.padEnd(45)} ${String(count).padStart(5)}`
    );
  }
  printSeparator();
}

function modePrepare(skillName, outputDir = null) {
  if (!(skillName in SKILLS)) {
    console.log(`ERROR: Unknown skill '${skillName}'. Use --list to see available skills.`);
    process.exit(1);
  }

  const info = SKILLS[skillName];
  const fixtureName = info.fixture;
  const setupScript = join(getTestsDir(), 'fixtures', 'setup.js');

  const cmd = [process.execPath, setupScript, fixtureName];
  if (outputDir) {
    cmd.push('--output-dir', outputDir);
  }

  printSeparator();
  console.log(`  Preparing fixture '${fixtureName}' for skill '${skillName}'...`);
  const result = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf-8' });
  if (result.status !== 0) {
    console.log(`ERROR: setup.js failed:\n${result.stderr}`);
    process.exit(1);
  }

  // Last non-empty line is the fixture path
  const lines = (result.stdout || '').split('\n').map(l => l.trim()).filter(l => l);
  const fixturePath = lines.length > 0 ? lines[lines.length - 1] : '';
  console.log((result.stdout || '').trimEnd());

  const skillFile = join(getTestsDir(), info.skill_file);
  printSeparator();
  console.log();
  console.log('  NEXT STEPS:');
  console.log(`  1. Open a new Claude Code session pointed at: ${fixturePath}`);
  console.log(`  2. Run the skill: @${skillFile.split(/[\\/]/).pop()}`);
  if (info.requires.length > 0) {
    console.log(`     (Prerequisite outputs required: ${info.requires.join(', ')})`);
  }
  console.log();
  console.log('  3. After the skill completes, run:');
  console.log(`     node run_tests.js --check --skill ${skillName} --fixture "${fixturePath}"`);
  console.log();

  return fixturePath;
}

async function modeCheck(skillName, fixturePath, diffMode = false) {
  if (!(skillName in SKILLS)) {
    console.log(`ERROR: Unknown skill '${skillName}'.`);
    return 1;
  }

  // Dynamic import for checker
  const { run_checks, print_results, print_diff_results } = await import('./integration/checker.js');

  const info = SKILLS[skillName];
  const assertionsPath = _resolveAssertionsPath(skillName);
  const skillFile = join(getTestsDir(), info.skill_file);

  const result = run_checks({
    skillName,
    fixturePath,
    assertionsPath,
    skillFile,
  });

  if (diffMode) {
    print_diff_results(result);
  } else {
    print_results(result);
  }

  if (result.failed.length > 0) {
    const stableStructural = result.failed.filter(
      r => r.category === 'STABLE' || r.category === 'STRUCTURAL'
    );
    if (stableStructural.length > 0) return 1;
    return 2;
  }
  return 0;
}

function modeUnit() {
  const unitDir = join(getTestsDir(), 'unit');
  printSeparator();
  console.log('  Running unit tests with node:test...');
  printSeparator();
  const result = spawnSync(process.execPath, ['--test', unitDir], {
    cwd: getTestsDir(),
    stdio: 'inherit',
  });
  return result.status;
}

async function modeAll() {
  const order = _dependencyOrder();
  const summary = [];
  const fixtureCache = {};

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  for (const skillName of order) {
    const info = SKILLS[skillName];
    const fixtureName = info.fixture;

    printSeparator('=');
    console.log(`  SKILL: ${skillName}  (fixture: ${fixtureName})`);
    printSeparator('=');

    let fixturePath;
    if (fixtureName in fixtureCache) {
      fixturePath = fixtureCache[fixtureName];
      console.log(`  Reusing fixture: ${fixturePath}`);
    } else {
      fixturePath = modePrepare(skillName);
      fixtureCache[fixtureName] = fixturePath;
    }

    console.log();
    const response = await question("  Press ENTER when skill run is complete (or type 'skip' to skip check)...\n");

    if (response.trim().toLowerCase() === 'skip') {
      summary.push([skillName, fixturePath, -1]);
      continue;
    }

    const exitCode = await modeCheck(skillName, fixturePath);
    summary.push([skillName, fixturePath, exitCode]);
  }

  rl.close();

  printSeparator('=');
  console.log('  SUMMARY');
  printSeparator('-');
  for (const [skillName, fixturePath, ec] of summary) {
    let status;
    if (ec === -1) status = 'SKIPPED';
    else if (ec === 0) status = 'PASS';
    else if (ec === 1) status = 'FAIL (structural)';
    else status = 'FAIL (behavioral)';
    console.log(`  ${skillName.padEnd(20)} ${status}`);
  }
  printSeparator('=');
}

function modeStatus() {
  printSeparator();
  console.log(
    `  ${'SKILL'.padEnd(20)} ${'ASSERT_VER'.padEnd(12)} ${'SKILL_VER'.padEnd(12)} ${'MATCH'.padEnd(8)} LAST_VALIDATED`
  );
  printSeparator('-');
  for (const name of _dependencyOrder()) {
    const info = SKILLS[name];
    const ap = _resolveAssertionsPath(name);
    const meta = _loadAssertionMeta(ap);
    const assertionVer = meta.skill_version || 'unknown';
    const lastValidated = meta.last_validated || 'unknown';
    const skillVer = getSkillVersion(info.skill_file);

    let match, matchSym;
    if (assertionVer === 'unknown' || skillVer === 'unknown') {
      match = 'unknown';
      matchSym = '?';
    } else if (assertionVer === skillVer) {
      match = 'OK';
      matchSym = '\u2713';
    } else {
      match = 'MISMATCH';
      matchSym = '\u2717';
    }

    console.log(
      `  ${name.padEnd(20)} ${assertionVer.padEnd(12)} ${skillVer.padEnd(12)} ` +
      `${matchSym} ${match.padEnd(7)} ${lastValidated}`
    );
  }
  printSeparator();
}

async function modeAccept(skillName, fixturePath) {
  if (!(skillName in SKILLS)) {
    console.log(`ERROR: Unknown skill '${skillName}'.`);
    process.exit(1);
  }

  const { run_checks, print_results } = await import('./integration/checker.js');

  const info = SKILLS[skillName];
  const assertionsPath = _resolveAssertionsPath(skillName);
  const skillFile = join(getTestsDir(), info.skill_file);

  const result = run_checks({
    skillName,
    fixturePath,
    assertionsPath,
    skillFile,
  });
  print_results(result);

  const today = new Date().toISOString().slice(0, 10);
  console.log();
  console.log(`  This will update '${assertionsPath}' last_validated to today (${today}).`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const response = await new Promise(resolve => rl.question('  Continue? [y/N] ', resolve));
  rl.close();

  if (response.trim().toLowerCase() !== 'y') {
    console.log('  Aborted.');
    return;
  }

  let content = readFileSync(assertionsPath, 'utf-8');
  content = content.replace(
    /^last_validated:\s*.+$/m,
    `last_validated: "${today}"`
  );

  const { writeFileSync } = await import('node:fs');
  writeFileSync(assertionsPath, content, 'utf-8');
  console.log(`  Updated last_validated to ${today} in ${assertionsPath}.`);
}

function modeLintAssertions() {
  const requiredTop = new Set(['skill_version', 'last_validated', 'fixture', 'assertions']);
  const requiredAssertion = new Set(['id', 'category', 'description', 'type']);
  const validCategories = new Set(['STABLE', 'STRUCTURAL', 'BEHAVIORAL']);

  let issuesFound = false;

  printSeparator();
  console.log('  Linting assertion YAML files...');
  printSeparator('-');

  for (const name of _dependencyOrder()) {
    const ap = _resolveAssertionsPath(name);
    if (!existsSync(ap)) {
      console.log(`  [MISSING] ${name}: ${ap}`);
      issuesFound = true;
      continue;
    }

    let doc;
    try {
      doc = yaml.load(readFileSync(ap, 'utf-8'));
    } catch (exc) {
      console.log(`  [YAML ERROR] ${name}: ${exc.message}`);
      issuesFound = true;
      continue;
    }

    const fileIssues = [];

    const docKeys = new Set(Object.keys(doc));
    for (const key of requiredTop) {
      if (!docKeys.has(key)) {
        fileIssues.push(`Missing top-level field: '${key}'`);
      }
    }

    const assertions = doc.assertions;
    if (!Array.isArray(assertions)) {
      fileIssues.push("'assertions' is not a list");
    } else {
      for (let i = 0; i < assertions.length; i++) {
        const a = assertions[i];
        if (a === null || typeof a !== 'object' || Array.isArray(a)) {
          fileIssues.push(`Assertion ${i} is not a dict`);
          continue;
        }
        const aKeys = new Set(Object.keys(a));
        for (const key of requiredAssertion) {
          if (!aKeys.has(key)) {
            fileIssues.push(
              `Assertion ${i} (${a.id || '?'}): missing field '${key}'`
            );
          }
        }
        const cat = a.category || '';
        if (!validCategories.has(cat)) {
          fileIssues.push(
            `Assertion ${i} (${a.id || '?'}): ` +
            `invalid category '${cat}' (must be one of ${JSON.stringify([...validCategories])})`
          );
        }
      }
    }

    if (fileIssues.length > 0) {
      console.log(`  [ISSUES] ${name} (${ap.split(/[\\/]/).pop()}):`);
      for (const issue of fileIssues) {
        console.log(`           - ${issue}`);
      }
      issuesFound = true;
    } else {
      const count = assertions.length;
      console.log(`  [OK]     ${name} (${ap.split(/[\\/]/).pop()}) \u2014 ${count} assertion(s)`);
    }
  }

  printSeparator();
  if (issuesFound) {
    console.log('  Lint FAILED \u2014 issues found above.');
    process.exit(1);
  } else {
    console.log('  Lint PASSED \u2014 all assertion files are valid.');
  }
}

// ---------------------------------------------------------------------------
// CLI — manual argument parsing (same interface as the Python version)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    prepare: false,
    check: false,
    unit: false,
    all: false,
    status: false,
    diff: false,
    accept: false,
    lintAssertions: false,
    list: false,
    skill: null,
    fixture: null,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--prepare':       args.prepare = true; break;
      case '--check':         args.check = true; break;
      case '--unit':          args.unit = true; break;
      case '--all':           args.all = true; break;
      case '--status':        args.status = true; break;
      case '--diff':          args.diff = true; break;
      case '--accept':        args.accept = true; break;
      case '--lint-assertions': args.lintAssertions = true; break;
      case '--list':          args.list = true; break;
      case '--skill':         args.skill = argv[++i]; break;
      case '--fixture':       args.fixture = argv[++i]; break;
      case '-h': case '--help':
        console.log(
          'usage: run_tests.js [-h] [--prepare] [--check] [--unit] [--all] [--status]\n' +
          '                    [--diff] [--accept] [--lint-assertions] [--list]\n' +
          '                    [--skill SKILL] [--fixture PATH]'
        );
        process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    modeList();
    return;
  }

  if (args.lintAssertions) {
    modeLintAssertions();
    return;
  }

  if (args.status) {
    modeStatus();
    return;
  }

  if (args.unit) {
    process.exit(modeUnit());
  }

  if (args.all) {
    await modeAll();
    return;
  }

  if (args.prepare) {
    if (!args.skill) {
      console.log('ERROR: --prepare requires --skill SKILL');
      process.exit(1);
    }
    modePrepare(args.skill, args.fixture);
    return;
  }

  if (args.check) {
    if (!args.skill) {
      console.log('ERROR: --check requires --skill SKILL');
      process.exit(1);
    }
    if (!args.fixture) {
      console.log('ERROR: --check requires --fixture PATH');
      process.exit(1);
    }
    process.exit(await modeCheck(args.skill, args.fixture, false));
  }

  if (args.diff) {
    if (!args.skill) {
      console.log('ERROR: --diff requires --skill SKILL');
      process.exit(1);
    }
    if (!args.fixture) {
      console.log('ERROR: --diff requires --fixture PATH');
      process.exit(1);
    }
    process.exit(await modeCheck(args.skill, args.fixture, true));
  }

  if (args.accept) {
    if (!args.skill) {
      console.log('ERROR: --accept requires --skill SKILL');
      process.exit(1);
    }
    if (!args.fixture) {
      console.log('ERROR: --accept requires --fixture PATH');
      process.exit(1);
    }
    await modeAccept(args.skill, args.fixture);
    return;
  }

  // No mode selected — print help
  console.log(
    'usage: run_tests.js [-h] [--prepare] [--check] [--unit] [--all] [--status]\n' +
    '                    [--diff] [--accept] [--lint-assertions] [--list]\n' +
    '                    [--skill SKILL] [--fixture PATH]'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
