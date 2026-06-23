import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'generate_requirements_report.js');

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

function _run(repoRoot, extraArgs = null) {
  const cmd = [_SCRIPT, '--repo-root', repoRoot];
  if (extraArgs) cmd.push(...extraArgs);
  return spawnSync(process.execPath, cmd, { encoding: 'utf-8' });
}

function _makeSrJson(tmpPath, entries) {
  const dataDir = join(tmpPath, '.ai', 'blueteam', 'data');
  mkdirSync(dataDir, { recursive: true });
  const reportsDir = join(tmpPath, '.ai', 'blueteam', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const p = join(dataDir, 'security_requirements.json');
  writeFileSync(p, JSON.stringify({
    schema_version: '1.2',
    last_updated: '2026-03-08',
    generated_by_assessments: [
      'threat_model',
      'asvs_level2_security_assessment',
    ],
    requirements: entries,
  }), 'utf-8');
  return p;
}

function _minimalSr(sid, priority) {
  return {
    id: sid,
    title: `Test requirement ${sid}`,
    priority,
    requirement_text: `The system MUST do ${sid}.`,
    acceptance_criteria: [`${sid} is satisfied`],
    sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: `FINDING-${sid.slice(-3)}` }],
    related_code_change_ids: [],
    kill_chain_ids: [],
    cas_rules: [],
    asvs_requirements: [],
  };
}

describe('test_generate_requirements_report', () => {
  it('test_exec_summary_counts_match_json_entries', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalSr('SR-001', 'critical'),
      _minimalSr('SR-002', 'critical'),
      _minimalSr('SR-003', 'high'),
      _minimalSr('SR-004', 'medium'),
      _minimalSr('SR-005', 'low'),
    ];
    _makeSrJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0, `Script failed:\n${result.stderr}`);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('| Critical | 2 |'));
    assert.ok(md.includes('| High | 1 |'));
    assert.ok(md.includes('| Medium | 1 |'));
    assert.ok(md.includes('| Low | 1 |'));
    assert.ok(md.includes('| **Total** | **5** |'));
  });

  it('test_all_sr_ids_appear_in_output', () => {
    const tmp = makeTmp();
    const entries = [];
    for (let i = 1; i <= 7; i++) {
      entries.push(_minimalSr(`SR-${String(i).padStart(3, '0')}`, 'high'));
    }
    _makeSrJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    for (let i = 1; i <= 7; i++) {
      const sid = `SR-${String(i).padStart(3, '0')}`;
      assert.ok(md.includes(sid), `${sid} not found in output`);
    }
  });

  it('test_priority_sections_present_only_for_populated_priorities', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalSr('SR-001', 'critical'),
      _minimalSr('SR-002', 'medium'),
    ];
    _makeSrJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('### Critical Priority'));
    assert.ok(md.includes('### Medium Priority'));
    assert.ok(!md.includes('### High Priority'));
    assert.ok(!md.includes('### Low Priority'));
  });

  it('test_detail_section_generated_for_every_entry', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalSr('SR-001', 'critical'),
      _minimalSr('SR-002', 'high'),
      _minimalSr('SR-003', 'low'),
    ];
    _makeSrJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    for (const e of entries) {
      assert.ok(md.includes(`### ${e.id} \u2014`), `Detail section for ${e.id} not found`);
    }
  });

  it('test_empty_json_produces_zero_total', () => {
    const tmp = makeTmp();
    _makeSrJson(tmp, []);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('| **Total** | **0** |'));
  });

  it('test_script_exits_one_when_json_missing', () => {
    const tmp = makeTmp();
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.toLowerCase().includes('not found') ||
      result.stderr.toLowerCase().includes('error')
    );
  });

  it('test_entries_key_accepted_as_fallback', () => {
    const tmp = makeTmp();
    const dataDir = join(tmp, '.ai', 'blueteam', 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(tmp, '.ai', 'blueteam', 'reports'), { recursive: true });
    writeFileSync(join(dataDir, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-01-01',
      generated_by_assessments: [],
      entries: [_minimalSr('SR-001', 'high')],
    }), 'utf-8');
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);
    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('SR-001'));
  });

  it('test_acceptance_criteria_appear_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalSr('SR-001', 'high');
    entry.acceptance_criteria = ['First criterion', 'Second criterion'];
    _makeSrJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('First criterion'));
    assert.ok(md.includes('Second criterion'));
  });

  it('test_generated_by_label_includes_all_assessments', () => {
    const tmp = makeTmp();
    const dataDir = join(tmp, '.ai', 'blueteam', 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(tmp, '.ai', 'blueteam', 'reports'), { recursive: true });
    writeFileSync(join(dataDir, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.2',
      last_updated: '2026-03-08',
      generated_by_assessments: [
        'threat_model',
        'asvs_level2_security_assessment',
        'dr_resilience_analysis',
      ],
      requirements: [],
    }), 'utf-8');
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('Threat Model'));
    assert.ok(md.includes('ASVS Level 2'));
    assert.ok(md.includes('DR Resilience'));
  });

  it('test_application_name_appears_as_subtitle', () => {
    const tmp = makeTmp();
    const dataDir = join(tmp, '.ai', 'blueteam', 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(tmp, '.ai', 'blueteam', 'reports'), { recursive: true });
    writeFileSync(join(dataDir, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.2',
      application: 'IAM-Devops (Identity Infrastructure)',
      generated_by_assessments: [],
      requirements: [],
    }), 'utf-8');
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(
      md.includes('IAM-Devops (Identity Infrastructure)'),
      'application name from JSON must appear in generated MD subtitle'
    );
    assert.ok(
      !md.includes('Child Care'),
      'hardcoded CCDS subtitle must not appear — use application field from JSON'
    );
  });

  it('test_generated_at_date_fallback_for_last_updated', () => {
    const tmp = makeTmp();
    const dataDir = join(tmp, '.ai', 'blueteam', 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(tmp, '.ai', 'blueteam', 'reports'), { recursive: true });
    writeFileSync(join(dataDir, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.2',
      generated_at_date: '2026-03-09',
      generated_by_assessments: [],
      requirements: [],
    }), 'utf-8');
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(
      md.includes('2026-03-09'),
      'generated_at_date must be used as the Last Updated date when last_updated is absent'
    );
  });

  it('test_canonical_cross_reference_keys_populated', () => {
    const tmp = makeTmp();
    const entry = _minimalSr('SR-001', 'high');
    entry.cas_rules = ['SEC-001', 'WAF-001'];
    entry.asvs_refs = ['V6.4.1', 'V14.4.1'];
    _makeSrJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(md.includes('SEC-001'), 'cas_rules values must appear in quick-reference table');
    assert.ok(md.includes('WAF-001'), 'cas_rules values must appear in quick-reference table');
    assert.ok(md.includes('V6.4.1'), 'asvs_refs values must appear in quick-reference table');
  });

  it('test_normative_text_appears_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalSr('SR-001', 'critical');
    entry.normative_text = 'The system SHALL enforce TLS 1.2 minimum.';
    _makeSrJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'security_requirements.md'), 'utf-8');
    assert.ok(
      md.includes('The system SHALL enforce TLS 1.2 minimum.'),
      'normative_text must appear in the detail section when requirement_text is absent'
    );
  });
});
