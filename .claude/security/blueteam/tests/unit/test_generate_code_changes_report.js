import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'generate_code_changes_report.js');

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

function _run(repoRoot, extraArgs = null) {
  const cmd = [_SCRIPT, '--repo-root', repoRoot];
  if (extraArgs) cmd.push(...extraArgs);
  return spawnSync(process.execPath, cmd, { encoding: 'utf-8' });
}

function _makeCcJson(tmpPath, entries, { key = 'changes' } = {}) {
  const dataDir = join(tmpPath, '.ai', 'blueteam', 'data');
  mkdirSync(dataDir, { recursive: true });
  const reportsDir = join(tmpPath, '.ai', 'blueteam', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const p = join(dataDir, 'code_changes.json');
  writeFileSync(p, JSON.stringify({
    schema_version: '1.2',
    last_updated: '2026-03-08',
    generated_by_assessments: [
      'threat_model',
      'asvs_level2_security_assessment',
    ],
    [key]: entries,
  }), 'utf-8');
  return p;
}

function _minimalCc(cid, priority) {
  return {
    id: cid,
    title: `Test change ${cid}`,
    priority,
    change_type: 'fix',
    file_path: `src/module/${cid.toLowerCase()}.py`,
    line_reference: '10-20',
    description: `Remediate ${cid}.`,
    current_code_summary: `Current code for ${cid}.`,
    replacement_code: '',
    related_requirement_ids: [],
    affected_files: [],
    sources: [
      { assessment: 'threat_model', finding_id: `TM-${cid.slice(-3)}` },
    ],
  };
}

describe('test_generate_code_changes_report', () => {
  it('test_exec_summary_counts_match_json_entries', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalCc('CC-001', 'critical'),
      _minimalCc('CC-002', 'critical'),
      _minimalCc('CC-003', 'high'),
      _minimalCc('CC-004', 'medium'),
      _minimalCc('CC-005', 'low'),
    ];
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0, `Script failed:\n${result.stderr}`);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('| Critical | 2 |'));
    assert.ok(md.includes('| High | 1 |'));
    assert.ok(md.includes('| Medium | 1 |'));
    assert.ok(md.includes('| Low | 1 |'));
    assert.ok(md.includes('| **Total** | **5** |'));
  });

  it('test_all_cc_ids_appear_in_output', () => {
    const tmp = makeTmp();
    const entries = [];
    for (let i = 1; i <= 7; i++) {
      entries.push(_minimalCc(`CC-${String(i).padStart(3, '0')}`, 'high'));
    }
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    for (let i = 1; i <= 7; i++) {
      const cid = `CC-${String(i).padStart(3, '0')}`;
      assert.ok(md.includes(cid), `${cid} not found in output`);
    }
  });

  it('test_priority_sections_present_only_for_populated_priorities', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalCc('CC-001', 'critical'),
      _minimalCc('CC-002', 'medium'),
    ];
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('### Critical Priority'));
    assert.ok(md.includes('### Medium Priority'));
    assert.ok(!md.includes('### High Priority'));
    assert.ok(!md.includes('### Low Priority'));
  });

  it('test_detail_section_generated_for_every_entry', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalCc('CC-001', 'critical'),
      _minimalCc('CC-002', 'high'),
      _minimalCc('CC-003', 'low'),
    ];
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    for (const e of entries) {
      assert.ok(md.includes(`### ${e.id} \u2014`), `Detail section for ${e.id} not found`);
    }
  });

  it('test_replacement_code_rendered_as_fenced_block', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.replacement_code = 'def secure_function():\n    return sanitize(input)';
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('```'));
    assert.ok(md.includes('def secure_function():'));
  });

  it('test_replacement_code_absent_no_fenced_block', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.replacement_code = '';
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(!md.includes('```'));
  });

  it('test_affected_files_extra_listed_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.file_path = 'src/auth/login.py';
    entry.affected_files = ['src/auth/login.py', 'src/auth/session.py', 'tests/test_auth.py'];
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('session.py'));
    assert.ok(md.includes('test_auth.py'));
    assert.ok(md.includes('Also affects'));
  });

  it('test_priority_elevation_note_appears_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'critical');
    entry.priority_elevation_note = 'Elevated by Kill Chain KC-01 (lateral movement chain).';
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('Elevated by Kill Chain'));
    assert.ok(md.includes('Elevation note:'));
  });

  it('test_cas_rules_appear_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.cas_rules = ['CAS-5.1', 'CAS-7.3'];
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('CAS-5.1'));
    assert.ok(md.includes('CAS-7.3'));
  });

  it('test_asvs_refs_appear_in_detail', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.asvs_requirements = ['V2.1.1', 'V3.4.2'];
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('V2.1.1'));
    assert.ok(md.includes('V3.4.2'));
  });

  it('test_cas_rules_aggregated_from_sources', () => {
    const tmp = makeTmp();
    const entry = _minimalCc('CC-001', 'high');
    entry.sources = [
      {
        assessment: 'cybersecurity_architecture_standard_compliance',
        finding_id: 'CAS-F-001',
        cas_rules: ['CAS-4.2', 'CAS-9.1'],
      },
    ];
    _makeCcJson(tmp, [entry]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('CAS-4.2'));
    assert.ok(md.includes('CAS-9.1'));
  });

  it('test_empty_json_produces_zero_total', () => {
    const tmp = makeTmp();
    _makeCcJson(tmp, []);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
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
    _makeCcJson(tmp, [_minimalCc('CC-001', 'high')], { key: 'entries' });
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);
    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('CC-001'));
  });

  it('test_items_key_accepted_as_fallback', () => {
    const tmp = makeTmp();
    _makeCcJson(tmp, [_minimalCc('CC-001', 'high')], { key: 'items' });
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);
    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('CC-001'));
  });

  it('test_no_html_flag_suppresses_html_generation', () => {
    const tmp = makeTmp();
    _makeCcJson(tmp, [_minimalCc('CC-001', 'medium')]);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);
    const htmlPath = join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.html');
    assert.ok(!existsSync(htmlPath), 'HTML file should not be created with --no-html');
  });

  it('test_entries_sorted_by_priority_then_id', () => {
    const tmp = makeTmp();
    const entries = [
      _minimalCc('CC-003', 'low'),
      _minimalCc('CC-001', 'critical'),
      _minimalCc('CC-002', 'high'),
    ];
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    const posCritical = md.indexOf('CC-001');
    const posHigh = md.indexOf('CC-002');
    const posLow = md.indexOf('CC-003');
    assert.ok(posCritical < posHigh && posHigh < posLow, 'Priority ordering incorrect');
  });

  it('test_generated_by_label_includes_assessments', () => {
    const tmp = makeTmp();
    const dataDir = join(tmp, '.ai', 'blueteam', 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(tmp, '.ai', 'blueteam', 'reports'), { recursive: true });
    writeFileSync(join(dataDir, 'code_changes.json'), JSON.stringify({
      schema_version: '1.2',
      last_updated: '2026-03-08',
      generated_by_assessments: [
        'threat_model',
        'asvs_level2_security_assessment',
        'cybersecurity_architecture_standard_compliance',
      ],
      changes: [],
    }), 'utf-8');
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('Threat Model'));
    assert.ok(md.includes('ASVS Level 2'));
    assert.ok(md.includes('CAS Compliance'));
  });

  it('test_change_type_labels_rendered_correctly', () => {
    const tmp = makeTmp();
    const entries = [
      { ..._minimalCc('CC-001', 'high'), change_type: 'fix' },
      { ..._minimalCc('CC-002', 'high'), change_type: 'add' },
      { ..._minimalCc('CC-003', 'high'), change_type: 'remove' },
      { ..._minimalCc('CC-004', 'high'), change_type: 'refactor' },
    ];
    _makeCcJson(tmp, entries);
    const result = _run(tmp, ['--no-html']);
    assert.equal(result.status, 0);

    const md = readFileSync(join(tmp, '.ai', 'blueteam', 'reports', 'code_changes.md'), 'utf-8');
    assert.ok(md.includes('Fix'));
    assert.ok(md.includes('Add'));
    assert.ok(md.includes('Remove'));
    assert.ok(md.includes('Refactor'));
  });
});
