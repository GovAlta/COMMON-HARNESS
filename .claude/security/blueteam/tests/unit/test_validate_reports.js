import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, unlinkSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Absolute path to the script under test
const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'validate_reports.js');

// The nine required pairs (md_name, html_name) mirroring EXPECTED_PAIRS in the script
const _REQUIRED_PAIRS = [
  ['threat_model.md', 'threat_model.html'],
  ['asvs_level2_security_assessment.md', 'asvs_level2_security_assessment.html'],
  ['cybersecurity_architecture_standard_compliance.md', 'cybersecurity_architecture_standard_compliance.html'],
  ['security-classification.md', 'security-classification.html'],
  ['application_map.md', 'application_map.html'],
  ['cross_domain_kill_chains.md', 'cross_domain_kill_chains.html'],
  ['dr_resilience_assessment.md', 'dr_resilience_assessment.html'],
  ['security_overview.md', 'security_overview.html'],
  ['security_unit_test_coverage.md', 'security_unit_test_coverage.html'],
];

function _run(repoRoot) {
  return spawnSync(process.execPath, [_SCRIPT, '--repo-root', repoRoot], {
    encoding: 'utf-8',
  });
}

function _reportsDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'reports');
}

function _dataDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'data');
}

function _makeOverviewHtml(reportsDir, linkedFiles) {
  const linkTags = linkedFiles.map(f => `<a href="${f}">${f}</a>`).join('\n');
  writeFileSync(
    join(reportsDir, 'security_overview.html'),
    `<!DOCTYPE html><html><body>${linkTags}</body></html>`,
    'utf-8'
  );
}

function _makeDataArtifacts(tmpPath) {
  const dd = _dataDir(tmpPath);
  mkdirSync(dd, { recursive: true });

  writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({
    schema_version: '1.0', generated_by_assessments: [], changes: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'security_requirements.json'), JSON.stringify({
    schema_version: '1.0', generated_by_assessments: [], requirements: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'verification_tests.json'), JSON.stringify({
    schema_version: '1.0', tests: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({
    schema_version: '1.0', chains: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'dr_resilience_assessment.json'), JSON.stringify({
    schema_version: '1.0',
    assessment_name: 'dr_resilience_analysis',
    overall_score: 0, overall_rating: 'critical', overall_risk: 'critical',
    dimensions: [], rto_rpo: {}, gaps: [], recommendations: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'security-scan-results.json'), JSON.stringify({
    schema_version: '1.0', findings: [],
  }), 'utf-8');
  writeFileSync(join(dd, 'app_topology.json'), JSON.stringify({
    schema_version: '1.0', canvas_width: 660,
    zones: [{ id: 'internet', label: 'Internet', fill: '#f0f0f8', label_color: '#445' }],
    components: [], connections: [],
  }), 'utf-8');
}

function _makeAllRequired(tmpPath) {
  const rd = _reportsDir(tmpPath);
  mkdirSync(rd, { recursive: true });

  for (const [mdName, htmlName] of _REQUIRED_PAIRS) {
    writeFileSync(join(rd, mdName), `# ${mdName}\n`, 'utf-8');
    if (htmlName !== 'security_overview.html') {
      writeFileSync(join(rd, htmlName), `<html>${htmlName}</html>`, 'utf-8');
    }
  }

  const presentHtml = _REQUIRED_PAIRS
    .filter(([, html]) => html !== 'security_overview.html')
    .map(([, html]) => html);
  _makeOverviewHtml(rd, presentHtml);
  _makeDataArtifacts(tmpPath);
  return tmpPath;
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

describe('test_validate_reports', () => {
  // Test 1
  it('test_all_required_present_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0, `Expected exit 0. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.ok(result.stdout.includes('PASS'), 'Expected PASS in stdout');
    assert.ok(!result.stdout.includes('FAIL'), `Unexpected FAIL in stdout:\n${result.stdout}`);
  });

  // Test 2
  it('test_missing_required_md_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_reportsDir(tmp), 'threat_model.md'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('threat_model.md'));
    assert.ok(result.stdout.includes('FAIL') || result.stdout.includes('MISSING'));
  });

  // Test 3
  it('test_missing_required_html_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_reportsDir(tmp), 'threat_model.html'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('threat_model.html'));
  });

  // Test 4
  it('test_optional_md_without_html_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_reportsDir(tmp), 'security_requirements.md'), '# Security Requirements\n', 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('security_requirements.html'));
  });

  // Test 5
  it('test_optional_pair_both_present_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const rd = _reportsDir(tmp);
    writeFileSync(join(rd, 'security_requirements.md'), '# Security Requirements\n', 'utf-8');
    writeFileSync(join(rd, 'security_requirements.html'), '<html></html>', 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
  });

  // Test 6
  it('test_broken_overview_link_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(
      join(_reportsDir(tmp), 'security_overview.html'),
      '<html><body><a href="threat_model.html">TM</a><a href="ghost_report.html">Ghost</a></body></html>',
      'utf-8'
    );
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('ghost_report.html'));
  });

  // Test 7
  it('test_missing_reports_directory_no_traceback', () => {
    const tmp = makeTmp();
    const result = _run(tmp);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes('Traceback (most recent call last)'));
  });

  // Test 8
  it('test_missing_overview_html_reports_error', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_reportsDir(tmp), 'security_overview.html'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes('Traceback (most recent call last)'));
    assert.ok(result.stdout.includes('security_overview.html'));
  });

  // Test 9
  it('test_data_artifacts_present_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS All required data artifacts present'));
  });

  // Test 10
  it('test_code_changes_json_missing_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_dataDir(tmp), 'code_changes.json'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('code_changes.json'));
    assert.ok(result.stdout.includes('MISSING DATA'));
  });

  // Test 11
  it('test_kill_chains_json_missing_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_dataDir(tmp), 'kill_chains.json'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('kill_chains.json'));
    assert.ok(result.stdout.includes('MISSING DATA'));
  });

  // Test 12
  it('test_verification_tests_json_missing_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_dataDir(tmp), 'verification_tests.json'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('verification_tests.json'));
    assert.ok(result.stdout.includes('MISSING DATA'));
  });

  // Test 13
  it('test_dr_json_missing_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    unlinkSync(join(_dataDir(tmp), 'dr_resilience_assessment.json'));
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('dr_resilience_assessment.json'));
    assert.ok(result.stdout.includes('MISSING DATA'));
  });

  // Test 14
  it('test_primary_report_absent_no_artifact_check', () => {
    const tmp = makeTmp();
    const rd = _reportsDir(tmp);
    mkdirSync(rd, { recursive: true });
    const dd = _dataDir(tmp);
    mkdirSync(dd, { recursive: true });
    writeFileSync(join(rd, 'application_map.md'), '# App Map\n', 'utf-8');
    writeFileSync(join(rd, 'application_map.html'), '<html></html>', 'utf-8');
    const result = _run(tmp);
    assert.ok(!result.stdout.includes('MISSING DATA'));
  });

  // Test 15
  it('test_topology_zones_missing_fill_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'app_topology.json'), JSON.stringify({
      schema_version: '1.0', canvas_width: 660,
      zones: [{ id: 'internet', label: 'Internet' }],
      components: [], connections: [],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('TOPOLOGY ERROR'));
    assert.ok(result.stdout.includes('internet'));
  });

  // Test 16
  it('test_topology_zones_with_fill_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('TOPOLOGY ERROR'));
  });

  // Test 17
  it('test_mojibake_in_json_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const mojibakeJson = '{"schema_version":"1.0","overall_resilience_label":"Partial \\u00e2\\u20ac\\u201d Key gaps"}';
    writeFileSync(join(_dataDir(tmp), 'dr_resilience_assessment.json'), mojibakeJson, 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('MOJIBAKE'));
    assert.ok(result.stdout.includes('dr_resilience_assessment.json'));
  });

  // Test 18
  it('test_mojibake_multiple_sequences_all_reported', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const mojibakeJson = '{"schema_version":"1.0","a":"foo \\u00e2\\u20ac\\u201d bar","b":"don\\u00e2\\u20ac\\u2122t"}';
    writeFileSync(join(_dataDir(tmp), 'dr_resilience_assessment.json'), mojibakeJson, 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('MOJIBAKE'));
    assert.ok(result.stdout.includes('em dash'));
    assert.ok(result.stdout.includes('right single quote'));
  });

  // Test 19
  it('test_mojibake_clean_json_passes', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS No mojibake found in data artifacts'));
    assert.ok(!result.stdout.includes('MOJIBAKE'));
  });

  // Test 20
  it('test_dr_json_wrong_key_names_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'dr_resilience_assessment.json'), JSON.stringify({
      schema_version: '1.0',
      overall_resilience_score: 'C',
      overall_resilience_label: 'Partial',
      resilience_gaps: [],
      recommendations: [],
      dimensions: [],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SCHEMA ERROR'));
    assert.ok(result.stdout.includes('dr_resilience_assessment.json'));
    assert.ok(result.stdout.includes("'overall_score'"));
    assert.ok(result.stdout.includes("'gaps'"));
  });

  // Test 21
  it('test_cc_json_missing_changes_key_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', code_changes: [],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SCHEMA ERROR'));
    assert.ok(result.stdout.includes('code_changes.json'));
  });

  // Test 22
  it('test_kc_json_missing_chains_key_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'kill_chains.json'), JSON.stringify({
      schema_version: '1.0', kill_chains: [],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SCHEMA ERROR'));
    assert.ok(result.stdout.includes('kill_chains.json'));
  });

  // Test 23
  it('test_artifact_structure_all_correct_passes', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS All present data artifacts have required structure'));
    assert.ok(!result.stdout.includes('SCHEMA ERROR'));
  });

  // Test 24
  it('test_cc_replacement_code_missing_emits_warn', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [
        { id: 'CC-001', title: 'Fix SQL injection', priority: 'critical', file_path: 'src/db.ts', line_reference: '42', description: 'Replace string concat', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: '', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }] },
        { id: 'CC-002', title: 'Fix auth bypass', priority: 'high', file_path: 'src/auth.ts', line_reference: '17', description: 'Remove mock-login', change_type: 'remove', related_requirement_ids: ['SR-002'], replacement_code: null, sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-002' }] },
        { id: 'CC-003', title: 'Fix CORS', priority: 'medium', file_path: 'src/app.ts', line_reference: '5', description: 'Restrict CORS', change_type: 'fix', related_requirement_ids: [], replacement_code: "headers.append('Access-Control-Allow-Origin', origin)", sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-003' }] },
      ],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('WARN'));
    assert.ok(result.stdout.includes('CC-001'));
    assert.ok(result.stdout.includes('CC-002'));
    assert.ok(result.stdout.toLowerCase().includes('replacement_code'));
  });

  // Test 25
  it('test_cc_replacement_code_all_populated_no_warn', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [
        { id: 'CC-001', title: 'Fix SQL injection', priority: 'critical', file_path: 'src/db.ts', line_reference: '42', description: 'Replace string concat', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: "db.prepare('SELECT * FROM t WHERE id = ?').get(id)", sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }] },
        { id: 'CC-002', title: 'Fix auth bypass', priority: 'high', file_path: 'src/app.ts', line_reference: '5', description: 'Add helmet', change_type: 'add', related_requirement_ids: ['SR-002'], replacement_code: "require('helmet')(app)", sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-002' }] },
      ],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('missing replacement_code'));
  });

  // Test 26
  it('test_non_canonical_assessment_name_in_cc_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{ id: 'CC-001', title: 'Fix hardcoded secret', priority: 'critical', replacement_code: 'use_vault()', sources: [{ assessment: 'asvs_level2', finding_id: 'FINDING-001' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SOURCE NAME ERROR'));
    assert.ok(result.stdout.includes('asvs_level2'));
    assert.ok(result.stdout.includes('CC-001'));
  });

  // Test 27
  it('test_non_canonical_assessment_name_in_sr_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0',
      generated_by_assessments: ['cybersecurity_architecture_standard_compliance'],
      requirements: [{ id: 'SR-001', title: 'Enforce WAF', priority: 'high', sources: [{ assessment: 'cybersecurity_architecture_standards', finding_id: 'WAF-001' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SOURCE NAME ERROR'));
    assert.ok(result.stdout.includes('cybersecurity_architecture_standards'));
    assert.ok(result.stdout.includes('SR-001'));
  });

  // Test 28
  it('test_all_canonical_assessment_names_pass', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    const canonical = ['threat_model', 'asvs_level2_security_assessment', 'cybersecurity_architecture_standard_compliance', 'dr_resilience_analysis', 'cybersecurity_tool_use', 'kill_chain_aggregator'];
    const ccEntries = canonical.map((name, i) => ({
      id: `CC-${String(i + 1).padStart(3, '0')}`, title: `Fix ${name}`, priority: 'medium',
      file_path: `src/file_${i}.ts`, line_reference: String(i + 1), description: `Fix issue from ${name}`,
      change_type: 'fix', related_requirement_ids: [], replacement_code: 'fixed()',
      sources: [{ assessment: name, finding_id: `F-${String(i + 1).padStart(3, '0')}` }],
    }));
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: canonical, changes: ccEntries,
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS All sources[].assessment values are canonical'));
    assert.ok(!result.stdout.includes('SOURCE NAME ERROR'));
  });

  // Test 29
  it('test_cc_wrong_alias_file_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix hardcoded GUID', priority: 'critical', replacement_code: 'use_data_group()', file: 'irules/config.tcl', line_reference: '8-60', description: 'Replace GUID', change_type: 'refactor', related_requirement_ids: ['SR-001'], sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('"file"'));
    assert.ok(result.stdout.includes('"file_path"'));
    assert.ok(result.stdout.includes('CC-001'));
  });

  // Test 30
  it('test_cc_wrong_alias_line_range_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix debug log', priority: 'high', replacement_code: '# removed log', file_path: 'irules/config.tcl', line_range: '9', description: 'Remove debug log', change_type: 'remove', related_requirement_ids: ['SR-004'], sources: [{ assessment: 'threat_model', finding_id: 'T-003' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('"line_range"'));
    assert.ok(result.stdout.includes('"line_reference"'));
  });

  // Test 31
  it('test_cc_wrong_alias_change_description_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix IP disclosure', priority: 'medium', replacement_code: 'respond 403', file_path: 'irules/config.tcl', line_reference: null, change_description: 'Remove IP from body', change_type: 'fix', related_requirement_ids: ['SR-008'], sources: [{ assessment: 'threat_model', finding_id: 'T-004' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('"change_description"'));
    assert.ok(result.stdout.includes('"description"'));
  });

  // Test 32
  it('test_cc_missing_change_type_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Add .gitignore', priority: 'high', replacement_code: '# .gitignore', file_path: '.gitignore', line_reference: null, description: 'Create gitignore', related_requirement_ids: ['SR-012'], sources: [{ assessment: 'threat_model', finding_id: 'T-010' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('change_type'));
  });

  // Test 33
  it('test_cc_invalid_change_type_value_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix cookie', priority: 'medium', replacement_code: 'Secure', file_path: 'irules/cookie.tcl', line_reference: '113-120', description: 'Add Secure attr', change_type: 'patch', related_requirement_ids: ['SR-006'], sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-004' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('change_type'));
    assert.ok(result.stdout.includes('fix'));
  });

  // Test 34
  it('test_cc_missing_related_requirement_ids_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix WAF mode', priority: 'critical', replacement_code: '--mode Prevention', file_path: 'script.ps1', line_reference: '30', description: 'Set Prevention', change_type: 'fix', sources: [{ assessment: 'threat_model', finding_id: 'T-007' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CC FIELD ERROR'));
    assert.ok(result.stdout.includes('related_requirement_ids'));
  });

  // Test 35
  it('test_sr_wrong_alias_related_code_changes_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      requirements: [{ id: 'SR-001', title: 'Store GUIDs', priority: 'critical', normative_text: 'GUIDs SHALL be in data groups.', acceptance_criteria: ['No GUIDs in source'], related_code_changes: ['CC-001'], sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SR FIELD ERROR'));
    assert.ok(result.stdout.includes('"related_code_changes"'));
    assert.ok(result.stdout.includes('"related_code_change_ids"'));
    assert.ok(result.stdout.includes('SR-001'));
  });

  // Test 36
  it('test_canonical_cc_sr_fields_pass', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Fix hardcoded GUID', priority: 'critical', replacement_code: 'use_data_group()', file_path: 'irules/config.tcl', line_reference: '8-60', description: 'Replace GUIDs', change_type: 'refactor', related_requirement_ids: ['SR-001'], sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }],
    }), 'utf-8');
    writeFileSync(join(dd, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0', generated_by_assessments: ['threat_model'],
      requirements: [{ id: 'SR-001', title: 'Store GUIDs securely', priority: 'critical', normative_text: 'GUIDs SHALL be in data groups.', acceptance_criteria: ['No GUIDs in source'], related_code_change_ids: ['CC-001'], sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }],
    }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS All CC/SR entry field names are canonical'));
    assert.ok(!result.stdout.includes('CC FIELD ERROR'));
    assert.ok(!result.stdout.includes('SR FIELD ERROR'));
  });

  // Test 37 - CAS table arithmetic correct
  it('test_cas_table_arithmetic_correct_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_reportsDir(tmp), 'cybersecurity_architecture_standard_compliance.md'),
      '# CAS\n\n## Compliance Score Summary\n| Category | Compliant | Non-Compliant |\n|---|---|---|\n| AUTH | 1 | 2 |\n| MFA  | 1 | 1 |\n| **Total** | **2** | **3** |\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS CAS compliance Total row arithmetic correct'));
  });

  // Test 38 - CAS table arithmetic wrong
  it('test_cas_table_arithmetic_wrong_total_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_reportsDir(tmp), 'cybersecurity_architecture_standard_compliance.md'),
      '# CAS\n\n## Compliance Score Summary\n| Category | Compliant | Non-Compliant |\n|---|---|---|\n| AUTH | 1 | 2 |\n| MFA  | 1 | 1 |\n| **Total** | **3** | **3** |\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CAS ARITHMETIC ERROR'));
  });

  // Test 39 - ASVS chapter summary correct
  it('test_asvs_chapter_summary_correct_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_reportsDir(tmp), 'asvs_level2_security_assessment.md'),
      '# ASVS\n\n## Chapter Assessment Summary\n| Chapter | Name | Result |\n|---|---|---|\n| V1 | Architecture | FAIL |\n| V2 | Auth | PARTIAL |\n| V3 | Session | FAIL |\n\n**Chapter Summary:** 2 FAIL | 1 PARTIAL\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS ASVS chapter summary footer counts match chapter table'));
  });

  // Test 40 - ASVS chapter summary wrong
  it('test_asvs_chapter_summary_wrong_count_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_reportsDir(tmp), 'asvs_level2_security_assessment.md'),
      '# ASVS\n\n## Chapter Assessment Summary\n| Chapter | Name | Result |\n|---|---|---|\n| V1 | Architecture | FAIL |\n| V2 | Auth | PARTIAL |\n\n**Chapter Summary:** 3 FAIL | 1 PARTIAL\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('ASVS CHAPTER SUMMARY ERROR'));
  });

  // Test 41 - Kill chain elevation count correct
  it('test_kill_chain_elevation_count_correct_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({
      schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test Chain', severity: 'critical', scope: 'cross_domain', priority_elevations: [
        { artifact_type: 'CC', artifact_id: 'CC-001', previous_priority: 'High', elevated_to: 'Critical', rationale: 'test' },
        { artifact_type: 'SR', artifact_id: 'SR-001', previous_priority: 'High', elevated_to: 'Critical', rationale: 'test' },
      ] }],
    }), 'utf-8');
    writeFileSync(join(_reportsDir(tmp), 'cross_domain_kill_chains.md'),
      '# Kill Chains\n\n## Priority Elevations\n| Artifact | Previous Priority | Elevated To | Chain | Rationale |\n|---|---|---|---|---|\n| CC-001 | High | Critical | KC-001 | test |\n| SR-001 | High | Critical | KC-001 | test |\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS Kill chain elevation counts match'));
  });

  // Test 42 - Kill chain elevation count mismatch
  it('test_kill_chain_elevation_count_mismatch_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({
      schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test Chain', severity: 'critical', scope: 'cross_domain', priority_elevations: [
        { artifact_type: 'CC', artifact_id: 'CC-001', previous_priority: 'High', elevated_to: 'Critical', rationale: 'test' },
        { artifact_type: 'CC', artifact_id: 'CC-002', previous_priority: 'High', elevated_to: 'Critical', rationale: 'test' },
        { artifact_type: 'SR', artifact_id: 'SR-001', previous_priority: 'High', elevated_to: 'Critical', rationale: 'test' },
      ] }],
    }), 'utf-8');
    writeFileSync(join(_reportsDir(tmp), 'cross_domain_kill_chains.md'),
      '# Kill Chains\n\n## Priority Elevations\n| Artifact | Previous Priority | Elevated To | Chain | Rationale |\n|---|---|---|---|---|\n| CC-001 | High | Critical | KC-001 | test |\n| SR-001 | High | Critical | KC-001 | test |\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('ELEVATION COUNT MISMATCH'));
  });

  // Test 43 - Kill chain overview IDs correct
  it('test_kill_chain_overview_ids_correct_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({
      schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test Chain', severity: 'critical', scope: 'cross_domain', priority_elevations: [] }],
    }), 'utf-8');
    writeFileSync(join(_reportsDir(tmp), 'security_overview.md'),
      '# Security Overview\n\n## Attack Chains\n| KC-001 | Test Chain | Critical | Cross-Domain |\n\n## Next Section\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS Kill chain IDs/severities in overview match kill_chains.json'));
  });

  // Test 44 - Kill chain overview IDs mismatch
  it('test_kill_chain_overview_ids_mismatch_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({
      schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test Chain', severity: 'critical', scope: 'cross_domain', priority_elevations: [] }],
    }), 'utf-8');
    writeFileSync(join(_reportsDir(tmp), 'security_overview.md'),
      '# Security Overview\n\n## Attack Chains\n| KC-099 | Wrong Chain | Critical | Cross-Domain |\n\n## Next Section\n',
      'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('KC MISMATCH'));
  });

  // Test 45 - mojibake in code_changes.json
  it('test_mojibake_in_code_changes_json_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'),
      '{"schema_version":"1.0","generated_by_assessments":[],"changes":[{"id":"CC-001","description":"Fix auth bypass \\u00e2\\u20ac\\u201d critical"}]}', 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('MOJIBAKE'));
    assert.ok(result.stdout.includes('code_changes.json'));
  });

  // Test 46 - mojibake in security_requirements.json
  it('test_mojibake_in_security_requirements_json_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_requirements.json'),
      '{"schema_version":"1.0","generated_by_assessments":[],"requirements":[{"id":"SR-001","rationale":"Protect data \\u00e2\\u20ac\\u201d required"}]}', 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('MOJIBAKE'));
    assert.ok(result.stdout.includes('security_requirements.json'));
  });

  // Test 47 - mojibake in security-scan-results.json
  it('test_mojibake_in_security_scan_results_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security-scan-results.json'),
      '{"schema_version":"1.0","findings":[{"id":"SECRET-001","details":"SECRET \\u00e2\\u20ac\\u201d committed"}]}', 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('MOJIBAKE'));
    assert.ok(result.stdout.includes('security-scan-results.json'));
  });

  // Test 48 - generated_by_assessments complete passes
  it('test_generated_by_assessments_complete_passes', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], changes: [{ id: 'CC-001', description: 'Fix mock auth guard', file_path: 'apps/api-internal/src/auth.ts', line_reference: 'L12', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: '// fixed', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }] }), 'utf-8');
    writeFileSync(join(dd, 'security_requirements.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], requirements: [{ id: 'SR-001', description: 'Remove mock auth bypass', priority: 'critical', related_code_change_ids: ['CC-001'], sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS generated_by_assessments[] is complete'));
    assert.ok(!result.stdout.includes('GENERATED_BY_MISSING'));
  });

  // Test 49 - generated_by_missing in code_changes
  it('test_generated_by_missing_in_code_changes_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], changes: [{ id: 'CC-012', description: 'Enforce production auth guard', file_path: 'apps/api-internal/src/auth.ts', line_reference: 'L12', change_type: 'fix', related_requirement_ids: ['SR-014'], replacement_code: '// fixed', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }, { assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'AUTH-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('GENERATED_BY_MISSING'));
    assert.ok(result.stdout.includes('code_changes.json'));
    assert.ok(result.stdout.includes('cybersecurity_architecture_standard_compliance'));
  });

  // Test 50 - generated_by_missing in security_requirements
  it('test_generated_by_missing_in_security_requirements_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'security_requirements.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], requirements: [{ id: 'SR-014', description: 'Enforce AUTH-001 production-only guard', priority: 'critical', related_code_change_ids: ['CC-012'], sources: [{ assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'AUTH-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('GENERATED_BY_MISSING'));
    assert.ok(result.stdout.includes('security_requirements.json'));
    assert.ok(result.stdout.includes('cybersecurity_architecture_standard_compliance'));
  });

  // Test 51 - generated_by_missing in both files
  it('test_generated_by_missing_in_both_files_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    const casSource = { assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'AUTH-001' };
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], changes: [{ id: 'CC-012', description: 'Enforce production auth guard', file_path: 'apps/api-internal/src/auth.ts', line_reference: 'L12', change_type: 'fix', related_requirement_ids: ['SR-014'], replacement_code: '// fixed', sources: [casSource] }] }), 'utf-8');
    writeFileSync(join(dd, 'security_requirements.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model'], requirements: [{ id: 'SR-014', description: 'Enforce AUTH-001 production-only guard', priority: 'critical', related_code_change_ids: ['CC-012'], sources: [casSource] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    const count = (result.stdout.match(/GENERATED_BY_MISSING/g) || []).length;
    assert.ok(count >= 2);
    assert.ok(result.stdout.includes('code_changes.json'));
    assert.ok(result.stdout.includes('security_requirements.json'));
  });

  // Test 52 - generated_by superset does not fail
  it('test_generated_by_superset_does_not_fail', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance', 'asvs_level2_security_assessment'], changes: [{ id: 'CC-001', description: 'Fix auth bypass', file_path: 'apps/api-internal/src/auth.ts', line_reference: 'L12', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: '// fixed', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('GENERATED_BY_MISSING'));
  });

  // Test 53 - kill chain backprop passes when sources complete
  it('test_kill_chain_backprop_passes_when_sources_complete', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({ schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test cross-domain chain', severity: 'critical', scope: 'cross_domain', source_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'], chain_breaking_fix: { related_code_change_ids: ['CC-001'], related_requirement_ids: [] }, attack_path: [], priority_elevations: [] }] }), 'utf-8');
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'], changes: [{ id: 'CC-001', description: 'Fix allowlist bypass', file_path: 'apps/api/src/auth.ts', line_reference: 'L42', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: '// fixed', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }, { assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'AUTH-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS Kill chain sources back-propagated to CC entries'));
  });

  // Test 54 - kill chain backprop warns when source missing
  it('test_kill_chain_backprop_warns_when_source_missing', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    const dd = _dataDir(tmp);
    writeFileSync(join(dd, 'kill_chains.json'), JSON.stringify({ schema_version: '1.0', chains: [{ id: 'KC-001', title: 'Test cross-domain chain', severity: 'critical', scope: 'cross_domain', source_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'], chain_breaking_fix: { related_code_change_ids: ['CC-001'], related_requirement_ids: [] }, attack_path: [], priority_elevations: [] }] }), 'utf-8');
    writeFileSync(join(dd, 'code_changes.json'), JSON.stringify({ schema_version: '1.0', generated_by_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'], changes: [{ id: 'CC-001', description: 'Fix allowlist bypass', file_path: 'apps/api/src/auth.ts', line_reference: 'L42', change_type: 'fix', related_requirement_ids: ['SR-001'], replacement_code: '// fixed', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('WARN'));
    assert.ok(result.stdout.includes('CC-001'));
    assert.ok(result.stdout.includes('cybersecurity_architecture_standard_compliance'));
  });

  // Test 55 - SA gap enum values canonical
  it('test_sa_gap_enum_values_canonical_exits_zero', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify({ schema_version: '1.0', assessment_name: 'security_architecture_design', last_updated: '2026-03-21', application_name: 'Test App', mode: 'describe', profile: 'internal', profile_confidence: 'high', data_classification: 'protected_b', gaps: [{ id: 'SA-001', category: 'authorization_model', severity: 'High', title: 'No RBAC', description: '...', evidence: '...', recommendation: '...', status: 'open', related_requirement_ids: [] }, { id: 'SA-002', category: 'data_protection', severity: 'Medium', title: 'No field encryption', description: '...', evidence: '...', recommendation: '...', status: 'open', related_requirement_ids: [] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('PASS security_architecture.json enum values are canonical'));
  });

  // Test 56 - SA gap non-canonical category
  it('test_sa_gap_non_canonical_category_exits_one', () => {
    const tmp = makeTmp();
    _makeAllRequired(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify({ schema_version: '1.0', assessment_name: 'security_architecture_design', last_updated: '2026-03-21', application_name: 'Test App', mode: 'describe', profile: 'dual', profile_confidence: 'high', data_classification: 'protected_b', gaps: [{ id: 'SA-001', category: 'Authorization', severity: 'High', title: 'Missing RBAC', description: '...', evidence: '...', recommendation: '...', status: 'open', related_requirement_ids: [] }, { id: 'SA-002', category: 'Configuration', severity: 'Low', title: 'Gitignore gap', description: '...', evidence: '...', recommendation: '...', status: 'open', related_requirement_ids: [] }, { id: 'SA-003', category: 'perimeter', severity: 'Medium', title: 'No API gateway', description: '...', evidence: '...', recommendation: '...', status: 'open', related_requirement_ids: [] }] }), 'utf-8');
    const result = _run(tmp);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('FAIL Non-canonical enum value(s) in security_architecture.json'));
    assert.ok(result.stdout.includes('SA-001'));
    assert.ok(result.stdout.includes('SA-002'));
    const catErrorLines = result.stdout.split('\n').filter(ln => ln.includes('category='));
    const sa003Errors = catErrorLines.filter(ln => ln.includes('SA-003'));
    assert.equal(sa003Errors.length, 0, 'SA-003 has canonical category and must not appear');
    assert.ok(result.stdout.includes('silently excluded from the Gap Severity Distribution table'));
  });
});
