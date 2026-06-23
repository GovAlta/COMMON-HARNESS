import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'check_skill_coverage.js');

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

function _run(blueteamRoot) {
  return spawnSync(process.execPath, [_SCRIPT, '--blueteam', blueteamRoot], {
    encoding: 'utf-8',
  });
}

function _writeValidator(scriptsDir, expected, optional) {
  function fmtPairs(names) {
    if (names.length === 0) return '[]';
    const inner = names
      .map(n => `    ("${n}", "${n.replace('.md', '.html')}"),`)
      .join('\n');
    return `[\n${inner}\n]`;
  }
  const content =
    `EXPECTED_PAIRS: list[tuple[str, str]] = ${fmtPairs(expected)}\n` +
    `OPTIONAL_PAIRS: list[tuple[str, str]] = ${fmtPairs(optional)}\n`;
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, 'validate_reports.py'), content, 'utf-8');
}

function _writeSkill(skillsDir, name, artifacts) {
  const lines = [
    '---',
    `id: ${name}`,
    `name: ${name}`,
    'version: 1.0.0',
    'outputs:',
  ];
  for (const artifact of artifacts) {
    lines.push(`  - artifact: ${artifact}`);
    lines.push('    format: markdown');
  }
  lines.push('---');
  lines.push(`# ${name}`);
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(skillsDir, `${name}_skill.md`), lines.join('\n') + '\n', 'utf-8');
}

describe('test_check_skill_coverage', () => {
  it('test_consistent_exits_zero', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md', 'security-classification.md'],
      ['security_requirements.md']
    );
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);
    _writeSkill(tmp, 'classification', ['.ai/blueteam/reports/security-classification.md']);
    _writeSkill(tmp, 'kill_chain', ['.ai/blueteam/reports/security_requirements.md']);

    const result = _run(tmp);

    assert.equal(result.status, 0,
      `Expected exit 0 for consistent skill/validator pair.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(result.stdout.includes('All skill outputs and validator pairs are consistent'));
  });

  it('test_expected_pair_no_owner_exits_one', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md', 'orphan_report.md'],
      []
    );
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);

    const result = _run(tmp);

    assert.equal(result.status, 1,
      `Expected exit 1 when EXPECTED_PAIRS entry has no skill owner.\n` +
      `stdout:\n${result.stdout}`
    );
    assert.ok(result.stdout.includes('orphan_report.md'));
    assert.ok(result.stdout.includes('FAIL'));
  });

  it('test_skill_output_not_in_validator_exits_one', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md'],
      []
    );
    _writeSkill(tmp, 'threat_model', [
      '.ai/blueteam/reports/threat_model.md',
      '.ai/blueteam/reports/unknown_extra.md',
    ]);

    const result = _run(tmp);

    assert.equal(result.status, 1,
      `Expected exit 1 when skill output is unknown to validator.\n` +
      `stdout:\n${result.stdout}`
    );
    assert.ok(result.stdout.includes('unknown_extra.md'));
    assert.ok(result.stdout.includes('WARN'));
  });

  it('test_optional_no_owner_exits_zero', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md'],
      ['optional_extra.md']
    );
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);

    const result = _run(tmp);

    assert.equal(result.status, 0,
      `Expected exit 0 when only an optional pair lacks a skill owner.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(result.stdout.includes('INFO'));
    assert.ok(result.stdout.includes('optional_extra.md'));
  });

  it('test_missing_validator_exits_one_no_traceback', () => {
    const tmp = makeTmp();
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);

    const result = _run(tmp);

    assert.notEqual(result.status, 0, 'Expected non-zero exit when validator is missing');
    assert.ok(
      !result.stderr.includes('Traceback (most recent call last)'),
      'Script raised an unhandled exception'
    );
  });

  it('test_empty_both_exits_zero', () => {
    const tmp = makeTmp();
    _writeValidator(join(tmp, 'scripts'), [], []);

    const result = _run(tmp);

    assert.equal(result.status, 0,
      `Expected exit 0 when both skills and expected pairs are empty.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });

  it('test_skill_with_json_only_outputs_not_flagged', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md'],
      []
    );
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);

    const jsonOnlyLines = [
      '---',
      'id: tool_scanner',
      'name: tool_scanner',
      'version: 1.0.0',
      'outputs:',
      '  - artifact: .ai/blueteam/data/security-scan-results.json',
      '    format: json',
      '---',
      '# tool_scanner',
    ];
    writeFileSync(
      join(tmp, 'tool_scanner_skill.md'),
      jsonOnlyLines.join('\n') + '\n',
      'utf-8'
    );

    const result = _run(tmp);

    assert.equal(result.status, 0,
      `Expected exit 0 when JSON-only skill present.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });

  it('test_skill_multiple_md_outputs_all_registered', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['security-classification.md'],
      ['security_requirements.md']
    );
    _writeSkill(tmp, 'kill_chain', [
      '.ai/blueteam/reports/security-classification.md',
      '.ai/blueteam/reports/security_requirements.md',
    ]);

    const result = _run(tmp);

    assert.equal(result.status, 0,
      `Expected exit 0 when all multi-output skill files are registered.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(result.stdout.includes('kill_chain_skill.md'));
  });

  it('test_expected_pair_owned_shows_ok', () => {
    const tmp = makeTmp();
    _writeValidator(
      join(tmp, 'scripts'),
      ['threat_model.md'],
      []
    );
    _writeSkill(tmp, 'threat_model', ['.ai/blueteam/reports/threat_model.md']);

    const result = _run(tmp);

    assert.ok(result.stdout.includes('OK'));
    assert.ok(result.stdout.includes('threat_model.md'));
    assert.ok(!result.stdout.includes('FAIL'));
  });
});
