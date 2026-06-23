import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'generate_overview_html.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

function _dataDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'data');
}

function _reportsDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'reports');
}

function _overviewHtml(repoRoot) {
  return join(_reportsDir(repoRoot), 'security_overview.html');
}

function _run(repoRoot) {
  return spawnSync(process.execPath, [_SCRIPT, '--repo-root', repoRoot], {
    encoding: 'utf-8',
  });
}

function makeMinimalArtifacts(tmpPath) {
  const data = _dataDir(tmpPath);
  mkdirSync(data, { recursive: true });

  // code_changes.json
  writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
    schema_version: '1.0',
    last_updated: '2026-03-05',
    generated_by_assessments: ['asvs_level2_security_assessment'],
    changes: [{
      id: 'CC-001',
      title: 'Fix SQL injection in search endpoint',
      priority: 'critical',
      file_path: 'src/routes/search.ts',
      line_reference: '42',
      change_type: 'fix',
      description: 'Use parameterized queries to prevent SQL injection.',
      current_code_summary: 'String concatenation in query builder at line 42',
      replacement_code: "db.prepare('SELECT * FROM t WHERE id = ?').get(id)",
      acceptance_criteria: 'No string concatenation in queries',
      sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
      cas_rules: [],
      asvs_requirements: ['V5.3.4'],
      related_requirement_ids: ['SR-001'],
    }],
  }, null, 2), 'utf-8');

  // security_requirements.json
  writeFileSync(join(data, 'security_requirements.json'), JSON.stringify({
    schema_version: '1.0',
    last_updated: '2026-03-05',
    generated_by_assessments: ['asvs_level2_security_assessment'],
    requirements: [{
      id: 'SR-001',
      title: 'Parameterized queries required',
      priority: 'critical',
      description: 'All DB queries must use prepared statements',
      requirement_text: 'The system MUST use parameterized queries for all database operations.',
      rationale: 'SQL injection via string concatenation can expose all data.',
      acceptance_criteria: 'Code review confirms no string concat',
      sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
      related_code_change_ids: ['CC-001'],
    }],
  }, null, 2), 'utf-8');

  // kill_chains.json
  writeFileSync(join(data, 'kill_chains.json'), JSON.stringify({
    schema_version: '1.0',
    last_updated: '2026-03-05',
    application_name: 'Test App',
    generated_by: 'kill_chain_aggregator',
    source_assessments_present: ['asvs_level2_security_assessment'],
    chains: [{
      id: 'KC-001',
      title: 'SQL Injection to Data Exfiltration',
      severity: 'critical',
      attacker_type: 'Cybercriminal',
      ai_enabled_variant: 'AI-assisted payload generation',
      scope: 'single_assessment',
      source_assessments: ['asvs_level2_security_assessment'],
      attack_path: [
        {
          step: 1,
          attacker_action: 'Submit malicious SQL payload via search parameter',
          finding_refs: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
          att_ck_tactic: 'TA0001 Initial Access',
        },
        {
          step: 2,
          attacker_action: 'Dump all rows from the users table',
          finding_refs: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
          att_ck_tactic: 'TA0009 Collection',
        },
      ],
      chain_breaking_fix: {
        description: 'Parameterize all queries to eliminate injection surface',
        related_requirement_ids: ['SR-001'],
        related_code_change_ids: ['CC-001'],
      },
      participating_requirement_ids: ['SR-001'],
      participating_code_change_ids: ['CC-001'],
      priority_elevations: [],
    }],
  }, null, 2), 'utf-8');

  // verification_tests.json
  writeFileSync(join(data, 'verification_tests.json'), JSON.stringify({
    schema_version: '1.0',
    last_updated: '2026-03-05',
    tests: [
      {
        finding_id: 'FINDING-001',
        title: 'Verify SQLi behavior',
        assessment: 'asvs_level2_security_assessment',
        safety_level: 'safe-readonly',
        command_template: "curl -sS \"https://[HOST]/search?q=' OR 1=1--\"",
        expected_vulnerable_result: 'Unscoped records returned',
        expected_mitigated_result: 'Rejected or safely parameterized',
        validation_status: 'not-tested',
      },
      {
        finding_id: 'KC-001',
        title: 'Verify chain broken after fix',
        assessment: 'kill_chain_aggregator',
        safety_level: 'safe-authz',
        command_template: "curl -sS -H \"Authorization: Bearer [TOKEN]\" \"https://[HOST]/export\"",
        expected_vulnerable_result: 'Cross-tenant data leak',
        expected_mitigated_result: '403 or scoped dataset',
        validation_status: 'passed',
      },
    ],
  }, null, 2), 'utf-8');

  // security-classification.yaml
  writeFileSync(join(data, 'security-classification.yaml'),
    'classification: Protected A\napp_name: Test App\n', 'utf-8');

  // risk_acceptances.json
  writeFileSync(join(data, 'risk_acceptances.json'), JSON.stringify({
    schema_version: '1.0',
    acceptances: [],
  }, null, 2), 'utf-8');

  return tmpPath;
}

function _writeUtCoverageMd(repoRoot) {
  const reports = _reportsDir(repoRoot);
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, 'security_unit_test_coverage.md'),
    '# Security Unit Test Coverage Report\n\n' +
    '**Project:** Test App\n\n' +
    '---\n\n' +
    '## Security Control Coverage\n\n' +
    '> **Denominator:** 11 in-scope testable controls \u2014 8 infrastructure-only\n' +
    '> findings are excluded from this metric.\n\n' +
    '| Metric | Pre-Existing Coverage | With Generated Tests Adopted |\n' +
    '|--------|----------------------|------------------------------|\n' +
    '| **Controls Covered** | 1 / 11 (9%) | 11 / 11 (100%) |\n' +
    '| *of which: Partial* | 1 | \u2014 |\n' +
    '| **Coverage Gain** | \u2014 | \u2191 +91 pp (+10 controls) |\n' +
    '| **Security Tests** | 0 pre-existing | +24 tests written |\n\n' +
    '**Per Stack:**\n\n' +
    '| Stack | In-Scope | Pre-Existing | With Generated Tests |\n' +
    '|-------|----------|--------------|----------------------|\n' +
    '| Backend (XUnit) | 9 | 0 / 9 (0%) | 9 / 9 (100%) |\n' +
    '| Frontend (Jest) | 2 | 1 / 2 (50%) | 2 / 2 (100%) |\n\n' +
    '---\n\n' +
    '## Executive Summary\n\n' +
    '| Stack | Test Files Added | Pre-Existing Security Tests | Tests Written' +
    ' | Tests Passed | Tests Failed | Run Status |\n' +
    '|-------|-----------------|----------------------------|---------------|' +
    '-------------|-------------|-----------|\n' +
    '| Frontend (Jest / RTL) | 1 | 0 | 10 | 10 | 0 | PASS |\n' +
    '| Backend (.NET / XUnit) | 1 | 0 | 14 | \u2014 | \u2014 | NOT RUN |\n' +
    '| **Total** | **2** | **pre_existing_security_tests_total: 0**' +
    ' | **24** | **10** | **0** | **Partial** |\n\n' +
    '## Environment Discovery\n\n' +
    '- **pre_existing_security_tests:** 0\n\n' +
    '## Omit Markers Scan\n\n' +
    'No security-test-omit markers found.\n\n' +
    '## Existing Test Coverage vs Security Findings\n\n' +
    'Coverage details here.\n\n' +
    '## New Security Tests Written\n\n' +
    'New tests here.\n',
    'utf-8'
  );
}

function _saJson(gaps = null, profile = 'internal') {
  return {
    schema_version: '1.0',
    last_updated: '2026-03-20',
    assessment_name: 'security_architecture_design',
    application_name: 'Test App',
    mode: 'describe',
    profile,
    profile_confidence: 'high',
    profile_basis: 'Enterprise IdP auth driver detected',
    gaps: gaps || [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('test_generate_overview_html', () => {
  it('test_overview_html_created', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0,
      `Script exited non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(existsSync(_overviewHtml(tmp)), 'security_overview.html was not created');
  });

  it('test_ten_tabs_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    const panelCount = content.split('id="panel-').length - 1;
    assert.ok(panelCount >= 9,
      `Expected at least 9 tab panels but found ${panelCount}.`
    );
  });

  it('test_risk_register_tab_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('panel-risk-register'),
      "'panel-risk-register' not found in security_overview.html."
    );
  });

  it('test_finding_cards_rendered', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('CC-001'),
      'CC-001 from code_changes.json not found in security_overview.html'
    );
  });

  it('test_kill_chain_rendered', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('KC-001'),
      'KC-001 from kill_chains.json not found in security_overview.html'
    );
  });

  it('test_missing_optional_artifacts_graceful', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{
        id: 'CC-001',
        title: 'Fix hardcoded secret',
        priority: 'critical',
        file_path: 'src/config/index.ts',
        line_reference: '10',
        change_type: 'fix',
        description: 'Remove hardcoded JWT secret.',
        current_code_summary: 'Hard-coded string at line 10',
        replacement_code: 'process.env.JWT_SECRET',
        sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
        cas_rules: [],
        asvs_requirements: [],
        related_requirement_ids: [],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: Minimal App\n', 'utf-8');

    const result = _run(tmp);
    assert.ok(!result.stderr.includes('Traceback (most recent call last)'),
      'Unhandled exception in script when optional artifacts are absent'
    );
    assert.equal(result.status, 0,
      `Script exited non-zero with only code_changes.json present.\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(existsSync(_overviewHtml(tmp)),
      'security_overview.html should be created even when kill_chains.json is absent'
    );
  });

  it('test_classification_extracted', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Protected A'),
      "Expected 'Protected A' (from security-classification.yaml) to appear in output HTML"
    );
  });

  it('test_priority_sort_order', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [
        { id: 'CC-001', title: 'Medium severity fix', priority: 'medium', file_path: 'src/routes/users.ts', line_reference: '10', change_type: 'fix', description: 'Fix missing rate limit.', current_code_summary: 'No rate limit at line 10', replacement_code: 'applyRateLimit(router)', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] },
        { id: 'CC-002', title: 'Critical severity fix', priority: 'critical', file_path: 'src/auth/login.ts', line_reference: '20', change_type: 'fix', description: 'Remove hardcoded admin password.', current_code_summary: 'Hard-coded password at line 20', replacement_code: 'process.env.ADMIN_PASS', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-002' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] },
        { id: 'CC-003', title: 'High severity fix', priority: 'high', file_path: 'src/routes/search.ts', line_reference: '30', change_type: 'fix', description: 'Add input validation.', current_code_summary: 'No validation at line 30', replacement_code: 'validate(req.body)', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-003' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] },
      ],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: Sort Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('CC-001'), 'CC-001 not found in output');
    assert.ok(content.includes('CC-002'), 'CC-002 not found in output');
    assert.ok(content.includes('CC-003'), 'CC-003 not found in output');

    const posCc001 = content.indexOf('CC-001');
    const posCc002 = content.indexOf('CC-002');
    const posCc003 = content.indexOf('CC-003');
    assert.ok(posCc002 < posCc003,
      `CC-002 (critical) should appear before CC-003 (high)`
    );
    assert.ok(posCc003 < posCc001,
      `CC-003 (high) should appear before CC-001 (medium)`
    );
  });

  it('test_p_scale_priority_normalized', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [
        { id: 'CC-001', title: 'Critical fix written with P0 priority', priority: 'P0', file_path: 'src/auth/index.ts', line_reference: '1', change_type: 'fix', description: 'Critical auth bypass.', current_code_summary: 'No auth check at line 1', replacement_code: 'requireAuth(req)', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] },
        { id: 'CC-002', title: 'High fix written with P1 priority', priority: 'P1', file_path: 'src/routes/api.ts', line_reference: '10', change_type: 'fix', description: 'High severity finding.', current_code_summary: 'Missing validation at line 10', replacement_code: 'validate(req.body)', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-002' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] },
      ],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: P-Scale Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0,
      `Script exited non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(
      result.stdout.includes('Overall risk: Critical') || content.includes('Critical'),
      "Overview must show 'Critical' overall risk when CC item has priority='P0'"
    );
    assert.ok(!result.stdout.includes('Overall risk: P0'),
      "Script stdout shows 'Overall risk: P0' — P-scale normalization is broken."
    );
    assert.ok(!result.stdout.includes('Overall risk: Informational'),
      "Script stdout shows 'Overall risk: Informational'"
    );
  });

  it('test_overall_risk_from_cc_priority', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{ id: 'CC-001', title: 'Critical auth bypass', priority: 'critical', file_path: 'src/auth.ts', line_reference: '5', change_type: 'fix', description: 'Auth bypass.', current_code_summary: 'No guard at line 5', replacement_code: 'guardAuth()', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: Risk Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Overall risk: Critical'),
      `Expected 'Overall risk: Critical' in stdout.\nstdout: ${result.stdout}`
    );
  });

  it('test_count_table_nonzero', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.ok(result.stdout.includes('Code changes: 1'),
      `Expected 'Code changes: 1' in script stdout.\nstdout: ${result.stdout}`
    );
    assert.ok(result.stdout.includes('Security requirements: 1'),
      `Expected 'Security requirements: 1' in script stdout.\nstdout: ${result.stdout}`
    );
  });

  it('test_overview_shows_verification_summary_not_commands', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Verification Coverage'));
    assert.ok(content.includes('Verification Status'));
    assert.ok(content.includes('Not Tested'));
    assert.ok(content.includes('Passed'));
    assert.ok(!content.includes('curl -sS'));
  });

  it('test_unit_test_coverage_card_shows_pct_with_link', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _writeUtCoverageMd(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Unit Test Cvg'),
      "'Unit Test Cvg' card label not found"
    );
    assert.ok(/metric-val[^>]*>9%/.test(content),
      "Expected '9%' as the metric-val in the Unit Test Cvg card"
    );
    assert.ok(content.includes('security_unit_test_coverage.html'),
      'Expected a link to security_unit_test_coverage.html'
    );
    assert.ok(content.includes('badge-critical'),
      'Expected badge-critical CSS class for a 9% pre-existing coverage value'
    );
  });

  it('test_unit_tests_tab_present_when_coverage_report_exists', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _writeUtCoverageMd(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('panel-unit-tests'),
      "'panel-unit-tests' not found"
    );
    const panelCount = content.split('id="panel-').length - 1;
    assert.ok(panelCount >= 11,
      `Expected at least 11 tab panels, found ${panelCount}`
    );
  });

  it('test_unit_tests_tab_content', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _writeUtCoverageMd(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('9% pre-existing security test coverage'));
    assert.ok(content.includes('Pre-Existing Coverage (committed tests)'));
    assert.ok(content.includes('With Generated Tests Adopted'));
    assert.ok(content.includes('Backend (XUnit)'));
    assert.ok(content.includes('Frontend (Jest)'));
    assert.ok(content.includes('Not Run') || content.includes('NOT RUN'));
    assert.ok(content.includes('View full Unit Test Coverage report'));
  });

  it('test_unit_tests_tab_absent_without_coverage_report', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(!content.includes('panel-unit-tests'),
      "panel-unit-tests should NOT appear when security_unit_test_coverage.md is absent"
    );
    assert.ok(content.includes('Unit Test Cvg'),
      "'Unit Test Cvg' card label should still appear"
    );
    assert.ok(/metric-val[^>]*>N\/A/.test(content),
      "Expected 'N/A' as the metric-val"
    );
  });

  it('test_threat_model_verdict_critical', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['threat_model'],
      changes: [{ id: 'CC-001', title: 'Critical auth bypass from threat model', priority: 'critical', file_path: 'src/auth.ts', line_reference: '5', change_type: 'fix', description: 'Auth bypass identified in threat model.', current_code_summary: 'No guard', replacement_code: 'guardAuth()', sources: [{ assessment: 'threat_model', finding_id: 'T-001' }], cas_rules: [], asvs_requirements: [], related_requirement_ids: [] }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: TM Verdict Test\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Critical Exposure'),
      "Expected 'Critical Exposure' in the threat model tab verdict"
    );
    assert.ok(!content.includes('Manageable Exposure'),
      "Threat model tab shows 'Manageable Exposure' despite a critical-priority finding"
    );
  });

  it('test_new_header_repo_strip_in_overview', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const html = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(html.includes('class="repo-strip"'), 'repo-strip div should be present in overview');
    assert.ok(html.includes('height:12px'), 'repo-strip height should be 12px');
  });

  it('test_new_header_overview_app_name_in_h1', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const html = readFileSync(_overviewHtml(tmp), 'utf-8');
    const h1 = html.match(/<h1>([^<]+)<\/h1>/);
    assert.ok(h1 !== null, 'H1 element should be present in the overview header');
    assert.notEqual(h1[1].trim(), '\u2014',
      'H1 must not be the bare em-dash'
    );
    assert.ok(html.includes('class="report-type">Security Assessment Overview'),
      "'Security Assessment Overview' should appear in the .report-type subtitle div"
    );
  });

  it('test_asvs_and_cas_verdict_cards_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('ASVS Level 2'), "'ASVS Level 2' metric card label not found");
    assert.ok(content.includes('CAS'), "'CAS' metric card label not found");
    assert.ok(content.includes('Fail'), "Expected 'Fail' ASVS verdict");
    assert.ok(content.includes('href="#panel-asvs"'),
      "ASVS Level 2 card must have href='#panel-asvs'"
    );
    assert.ok(content.includes('N/A'), "Expected 'N/A' for CAS when CAS was not run");
    assert.ok(!content.includes('href="#panel-cas"'),
      "CAS card must NOT have href='#panel-cas' when CAS has not run"
    );
  });

  it('test_cas_verdict_card_non_compliant_with_link', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0',
      last_updated: '2026-03-07',
      generated_by_assessments: ['cybersecurity_architecture_standard_compliance'],
      changes: [{
        id: 'CC-001', title: 'Missing AUTHZ control', priority: 'critical',
        file_path: 'src/api.ts', line_reference: '10', change_type: 'fix',
        description: 'No authorization check on admin endpoint.',
        current_code_summary: 'No guard at line 10',
        replacement_code: "requireRole('admin')",
        sources: [{ assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'CAS-001' }],
        cas_rules: ['AUTHZ-001'], asvs_requirements: [], related_requirement_ids: [],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: CAS Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('CAS'), "'CAS' card label not found");
    assert.ok(content.includes('Fail'), "Expected 'Fail' CAS verdict");
    assert.ok(content.includes('href="#panel-cas"'),
      "CAS card must have href='#panel-cas'"
    );
    assert.ok(content.includes('ASVS Level 2'), "'ASVS Level 2' card label not found");
    assert.ok(content.includes('N/A'), "Expected 'N/A' ASVS verdict when ASVS not run");
    assert.ok(!content.includes('href="#panel-asvs"'),
      "ASVS card must NOT have href='#panel-asvs' when ASVS has not run"
    );
  });

  it('test_assessment_tab_banner_uses_item_not_finding', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(
      /\d+\s+code change\(s\)\s+and\s+\d+\s+security requirement\(s\)\s+from\b/.test(content),
      "Assessment panel banner must say 'N code change(s) and M security requirement(s) from X assessment'"
    );
    assert.ok(
      !/\d+\s+finding\(s\)\s+from\b/.test(content),
      "Assessment panel banner must not use 'N finding(s) from'"
    );
  });

  it('test_risk_register_tab_absent_without_ra_data', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{
        id: 'CC-001', title: 'Fix SQL injection', priority: 'critical',
        file_path: 'src/db.py', line_reference: '42', change_type: 'fix',
        description: 'Parameterise SQL query.',
        current_code_summary: 'f-string in SQL',
        replacement_code: 'cursor.execute(sql, (val,))',
        sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'F-001' }],
        cas_rules: [], asvs_requirements: [], related_requirement_ids: [],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: No-RA App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(!content.includes('panel-risk-register'),
      'panel-risk-register must NOT appear when risk_acceptances.json is absent.'
    );
  });

  it('test_dr_tab_potential_gaps_heading_scoped_to_repo', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    const drArtifact = {
      schema_version: '1.0', last_updated: '2026-03-08',
      assessment_name: 'dr_resilience_analysis', application_name: 'Test App',
      overall_score: 20, overall_rating: 'critical', overall_risk: 'critical',
      dimensions: [{ key: 'backup', label: 'Backup Implementation', score: 0, max_score: 20, summary: 'No backup config found.', evidence: [] }],
      rto_rpo: { rto_defined: false, rpo_defined: false, rto_values: [], rpo_values: [], notes: '' },
      gaps: [{
        id: 'DRG-001', title: 'No backup configuration or scripts for any data store found in repo',
        severity: 'critical', category: 'backup',
        current_state: 'Zero backup scripts in repository.',
        target_state: 'Backup policies documented.',
        evidence_paths: [], business_impact: 'Data loss risk.',
      }],
      recommendations: [{
        id: 'DRR-001', priority: 'p1', timeline: '1-2 weeks',
        title: 'Confirm backup policies', description: 'Engage infrastructure team.',
        addresses_gap_ids: ['DRG-001'], estimated_effort: '1-2 days',
      }],
      metadata: {
        repo_commit: null, tools_used: ['manual-review'], assumptions: [],
        cloud_evidence_summary: {
          providers_observed: [], providers_declared: [],
          controls_observed_count: 0, controls_declared_count: 0, controls_assumed_count: 0,
        },
      },
    };
    writeFileSync(join(data, 'dr_resilience_assessment.json'), JSON.stringify(drArtifact, null, 2), 'utf-8');
    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['dr_resilience_analysis'], changes: [],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Potential Gaps (given evidence in repo)'),
      "DR tab must show 'Potential Gaps (given evidence in repo)' heading."
    );
    assert.ok(!content.includes('<h3>Potential Gaps</h3>'),
      "The unqualified '<h3>Potential Gaps</h3>' heading must not appear."
    );
  });

  it('test_remediation_tab_contains_report_links', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('code_changes.html'),
      "'code_changes.html' not found in security_overview.html."
    );
    assert.ok(content.includes('security_requirements.html'),
      "'security_requirements.html' not found in security_overview.html."
    );
  });

  it('test_remediation_tab_sr_xref_links', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('security_requirements.html#SR-001'),
      "'security_requirements.html#SR-001' not found"
    );
  });

  it('test_remediation_tab_current_code_summary_block', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('<details'), 'No <details> element found');
    assert.ok(content.includes('String concatenation in query builder at line 42'),
      'current_code_summary text not found'
    );
  });

  it('test_remediation_tab_summary_table', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('remed-summary'), "'remed-summary' CSS class not found");
    assert.ok(content.includes('#CC-001'), "'#CC-001' anchor link not found");
  });

  it('test_remediation_tab_hotspot_table_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('hotspot-table'), "'hotspot-table' CSS class not found");
    assert.ok(content.includes('search.ts'), "'search.ts' not found");
  });

  it('test_remediation_tab_hotspot_multi_file_ordering', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [
        { id: 'CC-001', title: 'Fix auth bypass in login', priority: 'critical', file_path: 'src/auth/login.ts', line_reference: '10', change_type: 'fix', description: 'Fix auth bypass.', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }], related_requirement_ids: [] },
        { id: 'CC-002', title: 'Fix token validation in login', priority: 'high', file_path: 'src/auth/login.ts', line_reference: '55', change_type: 'fix', description: 'Fix token validation.', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-002' }], related_requirement_ids: [] },
        { id: 'CC-003', title: 'Fix path traversal in API', priority: 'medium', file_path: 'src/routes/api.ts', line_reference: '30', change_type: 'fix', description: 'Fix path traversal.', sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-003' }], related_requirement_ids: [] },
      ],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected A\napp_name: Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');

    const posLogin = content.indexOf('login.ts');
    const posApi = content.indexOf('api.ts');
    assert.notEqual(posLogin, -1, "'login.ts' not found");
    assert.notEqual(posApi, -1, "'api.ts' not found");
    assert.ok(posLogin < posApi,
      "login.ts (2 findings) must appear before api.ts (1 finding)"
    );
    assert.ok(content.includes('hotspot-count-multi'),
      "'hotspot-count-multi' CSS class not found"
    );
  });

  it('test_remediation_tab_hotspot_assessment_short_names', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('ASVS'),
      "'ASVS' short name not found"
    );

    // Test 2: threat_model → TM
    const tmp2 = join(tmp, 'tm_fixture');
    mkdirSync(tmp2);
    const data2 = _dataDir(tmp2);
    mkdirSync(data2, { recursive: true });

    writeFileSync(join(data2, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['threat_model'],
      changes: [{
        id: 'CC-001', title: 'Fix spoofing in auth flow', priority: 'high',
        file_path: 'src/auth/session.ts', line_reference: '20', change_type: 'fix',
        description: 'Fix spoofing.',
        sources: [{ assessment: 'threat_model', finding_id: 'FINDING-001' }],
        related_requirement_ids: [],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data2, 'security-classification.yaml'),
      'classification: Protected A\napp_name: Test App\n', 'utf-8');

    const result2 = _run(tmp2);
    assert.equal(result2.status, 0);
    const content2 = readFileSync(_overviewHtml(tmp2), 'utf-8');
    assert.ok(content2.includes('TM'), "'TM' short name not found for threat_model fixture.");
  });

  it('test_tool_scan_adds_cybersecurity_tool_use_not_security_tool_scans', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const data = _dataDir(tmp);

    writeFileSync(join(data, 'security-scan-results.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['cybersecurity_tool_use'],
      findings: [],
    }), 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0,
      `Expected exit 0 with valid scan artifact.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Security Tool Scans'),
      "'Security Tool Scans' label not found"
    );
    const rowMatch = content.match(/Security Tool Scans[\s\S]*?badge-assumed[\s\S]*?Not Run/);
    assert.equal(rowMatch, null,
      "Security Tool Scans row shows 'Not Run'"
    );
  });

  it('test_verification_tests_does_not_add_phantom_assessment', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    const data = _dataDir(tmp);

    writeFileSync(join(data, 'verification_tests.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-08',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      tests: [],
    }), 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    const countMatch = content.match(/(\d+)\s+completed assessment/);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      assert.ok(count <= 3,
        `assessments_run count is ${count} — phantom 'verification_tests' entry may still be inflating the count`
      );
    }
  });

  it('test_asvs_not_run_when_absent_from_both_generated_by_assessments', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'],
      changes: [{
        id: 'CC-001', title: 'Gate mock auth endpoint', priority: 'critical',
        file_path: 'src/auth/mock.ts', line_reference: '12', change_type: 'fix',
        description: 'Add AUTH_DRIVER guard.',
        current_code_summary: 'No env guard at line 12',
        replacement_code: "if (process.env.AUTH_DRIVER !== 'mock') return res.status(404).end()",
        sources: [
          { assessment: 'threat_model', finding_id: 'T-001' },
          { assessment: 'cybersecurity_architecture_standard_compliance', finding_id: 'CAS-001' },
        ],
        cas_rules: ['AUTH-001'], asvs_requirements: [], related_requirement_ids: ['SR-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['threat_model', 'cybersecurity_architecture_standard_compliance'],
      requirements: [{
        id: 'SR-001', title: 'Gate mock auth endpoint behind AUTH_DRIVER=mock', priority: 'critical',
        requirement_text: 'The mock endpoint MUST be gated behind AUTH_DRIVER=mock.',
        rationale: 'Ungated mock endpoint allows unauthenticated access.',
        acceptance_criteria: 'Endpoint returns 404 when AUTH_DRIVER != mock',
        sources: [{ assessment: 'threat_model', finding_id: 'T-001' }],
        related_code_change_ids: ['CC-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: Regression Test App\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(!content.includes('href="#panel-asvs"'),
      "ASVS metric card must NOT have href='#panel-asvs' when ASVS absent from generated_by_assessments"
    );
    assert.ok(content.includes('ASVS Level 2 assessment has not been run for this repository.'),
      "Expected 'ASVS Level 2 assessment has not been run for this repository.' in the ASVS panel"
    );
  });

  it('test_asvs_registered_when_present_in_code_changes_only', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{
        id: 'CC-001', title: 'Use parameterized queries', priority: 'critical',
        file_path: 'src/db/queries.ts', line_reference: '25', change_type: 'fix',
        description: 'Replace string-concatenated SQL.',
        current_code_summary: 'String concat at line 25',
        replacement_code: "db.query('SELECT * FROM t WHERE id = $1', [id])",
        sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'V5-001' }],
        cas_rules: [], asvs_requirements: ['V5.3.4'], related_requirement_ids: ['SR-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['threat_model'],
      requirements: [{
        id: 'SR-001', title: 'Parameterized queries required', priority: 'critical',
        requirement_text: 'All DB queries MUST use parameterized statements.',
        rationale: 'SQL injection via string concatenation.',
        acceptance_criteria: 'No string concat in queries',
        sources: [{ assessment: 'threat_model', finding_id: 'T-002' }],
        related_code_change_ids: ['CC-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: Union Test App A\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('href="#panel-asvs"'),
      "ASVS metric card must link to #panel-asvs (union behavior)"
    );
    assert.ok(!content.includes('ASVS Level 2 assessment has not been run for this repository.'),
      "ASVS panel must NOT show the 'not run' message (union behavior)"
    );
  });

  it('test_asvs_registered_when_present_in_security_requirements_only', () => {
    const tmp = makeTmp();
    const data = _dataDir(tmp);
    mkdirSync(data, { recursive: true });

    writeFileSync(join(data, 'code_changes.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['threat_model'],
      changes: [{
        id: 'CC-001', title: 'Enable MFA on admin accounts', priority: 'high',
        file_path: 'src/admin/auth.ts', line_reference: '5', change_type: 'add',
        description: 'Require TOTP second factor for admin logins.',
        current_code_summary: 'No MFA requirement at line 5',
        replacement_code: 'requireMFA(req.user)',
        sources: [{ assessment: 'threat_model', finding_id: 'T-003' }],
        cas_rules: [], asvs_requirements: [], related_requirement_ids: ['SR-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security_requirements.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-15',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      requirements: [{
        id: 'SR-001', title: 'Multi-factor authentication for admin access', priority: 'high',
        requirement_text: 'Admin logins MUST require a second factor (TOTP).',
        rationale: 'Single-factor admin accounts are high-value attack targets.',
        acceptance_criteria: 'Admin login fails without valid TOTP code',
        sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'V2-001' }],
        related_code_change_ids: ['CC-001'],
      }],
    }, null, 2), 'utf-8');
    writeFileSync(join(data, 'security-classification.yaml'),
      'classification: Protected B\napp_name: Union Test App B\n', 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('href="#panel-asvs"'),
      "ASVS metric card must link to #panel-asvs (union behavior)"
    );
    assert.ok(!content.includes('ASVS Level 2 assessment has not been run for this repository.'),
      "ASVS panel must NOT show the 'not run' message (union behavior)"
    );
  });

  it('test_security_arch_tab_present_when_sa_json_exists', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'),
      JSON.stringify(_saJson()), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('panel-security-arch'),
      "'panel-security-arch' not found"
    );
  });

  it('test_security_arch_tab_absent_without_sa_json', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(!content.includes('panel-security-arch'),
      "'panel-security-arch' found when security_architecture.json is absent"
    );
  });

  it('test_security_arch_tab_shows_profile_and_gaps', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-20',
      assessment_name: 'security_architecture_design',
      application_name: 'Test App', mode: 'describe',
      profile: 'public', profile_confidence: 'medium',
      profile_basis: 'SAML driver found',
      gaps: [{ id: 'SA-001', category: 'authorization_model',
        severity: 'High', title: 'No RBAC defined',
        description: '...', evidence: '...',
        recommendation: '...', status: 'open' }],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('SA-001'), "'SA-001' not found");
    assert.ok(content.toLowerCase().includes('public'), "'public' profile not found");
  });

  it('test_sast_type_in_filter_bar_when_sast_findings_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security-scan-results.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-20',
      generated_by_assessments: ['cybersecurity_tool_use'],
      scan_metadata: { tools_executed: [{ name: 'semgrep', version: '1.70.0', status: 'success' }] },
      findings: [{
        id: 'javascript.express.path-traversal', type: 'sast', severity: 'HIGH',
        title: 'Path traversal via user input',
        description: 'User-controlled path reaches readFile.',
        affected_component: 'src/routes/files.ts',
        location: { file: 'src/routes/files.ts', line: 42 },
        sources: ['semgrep'], references: [],
        remediation: 'Validate file path against allowlist.',
      }],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('sast'), "'sast' not found in filter bar");
  });

  it('test_semgrep_not_installed_notice_shown', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security-scan-results.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-20',
      generated_by_assessments: ['cybersecurity_tool_use'],
      scan_metadata: { tools_executed: [
        { name: 'trivy', version: '0.50.0', status: 'success' },
        { name: 'semgrep', version: 'not_installed', status: 'not_installed', error_message: 'semgrep not found on PATH' },
      ] },
      findings: [],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Semgrep'), "'Semgrep' not found");
    assert.ok(
      content.toLowerCase().includes('not installed') || content.toLowerCase().includes('not_installed'),
      'Semgrep not-installed notice not found'
    );
  });

  it('test_sa_metric_card_shows_aligned_when_no_gaps', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'),
      JSON.stringify(_saJson([])), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Aligned'),
      "'Aligned' not found — Architecture metric card must show 'Aligned' when no gaps."
    );
  });

  it('test_sa_metric_card_shows_gap_count_and_links_to_tab', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify(_saJson([
      { id: 'SA-001', category: 'authorization_model', severity: 'High',
        title: 'No RBAC defined', description: '...', evidence: '...',
        recommendation: '...', status: 'open' },
    ])), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('1 gap'), "'1 gap' not found");
    assert.ok(
      content.includes('href="#panel-security-arch"') || content.includes('panel-security-arch'),
      "Architecture metric card must link to #panel-security-arch"
    );
  });

  it('test_sa_metric_card_shows_na_without_sa_json', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Architecture'),
      "'Architecture' label not found"
    );
  });

  it('test_sa_verdict_row_in_assessment_table_when_sa_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'),
      JSON.stringify(_saJson([])), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Security Architecture'),
      "'Security Architecture' not found in assessment verdicts table"
    );
    const afterSa = content.split('Security Architecture')[1];
    assert.ok(!afterSa.slice(0, 200).includes('Not Run'),
      "Security Architecture verdict row must NOT show 'Not Run'"
    );
  });

  it('test_sa_tab_severity_badges_use_correct_css_class', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-21',
      assessment_name: 'security_architecture_design',
      application_name: 'Test App', mode: 'describe',
      profile: 'internal', profile_confidence: 'high',
      profile_basis: 'Enterprise IdP detected',
      gaps: [
        { id: 'SA-001', category: 'authorization_model', severity: 'High', title: 'No RBAC', description: '...', evidence: '...', recommendation: '...', status: 'open' },
        { id: 'SA-002', category: 'logging', severity: 'Critical', title: 'No audit log', description: '...', evidence: '...', recommendation: '...', status: 'open' },
      ],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('badge-high'), "'badge-high' not found");
    assert.ok(content.includes('badge-critical'), "'badge-critical' not found");
    assert.ok(!content.includes('sev-high'), "'sev-high' found — wrong CSS class");
    assert.ok(!content.includes('sev-critical'), "'sev-critical' found — wrong CSS class");
  });

  it('test_sa_tab_gap_severity_distribution_table_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'security_architecture.json'), JSON.stringify({
      schema_version: '1.0', last_updated: '2026-03-21',
      assessment_name: 'security_architecture_design',
      application_name: 'Test App', mode: 'describe',
      profile: 'public', profile_confidence: 'medium',
      profile_basis: 'SAML driver found',
      gaps: [
        { id: 'SA-001', category: 'authorization_model', severity: 'High', title: 'No RBAC defined', description: '...', evidence: '...', recommendation: '...', status: 'open' },
        { id: 'SA-002', category: 'logging', severity: 'Medium', title: 'Partial audit coverage', description: '...', evidence: '...', recommendation: '...', status: 'open' },
      ],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('Gap Severity Distribution'),
      "'Gap Severity Distribution' heading not found"
    );
    assert.ok(content.includes('Gap Details'), "'Gap Details' heading not found");
    assert.ok(content.split('SA-001').length - 1 >= 2,
      'SA-001 must appear in both the distribution table and details table.'
    );
  });

  it('test_remediation_tab_risk_acceptance_howto_present', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('RISK_ACCEPTED'),
      "Remediation tab must contain 'RISK_ACCEPTED' inline marker example."
    );
    assert.ok(content.includes('risk_acceptances.json'),
      'Remediation tab must reference risk_acceptances.json.'
    );
    assert.ok(
      content.toLowerCase().includes('non-suppressible') || content.includes('Non-suppressible'),
      'Remediation tab must mention non-suppressible findings.'
    );
    const hotspotPos = content.indexOf('File Hotspots');
    const howtoPos = content.indexOf('RISK_ACCEPTED');
    assert.notEqual(hotspotPos, -1, "'File Hotspots' heading not found.");
    assert.ok(howtoPos > hotspotPos,
      'Risk acceptance guidance must appear after File Hotspots.'
    );
  });

  it('test_risk_register_tab_howto_present_when_register_absent', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'risk_acceptances.json'),
      JSON.stringify({ acceptances: [] }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('panel-risk-register'),
      'Risk Register tab must be rendered when risk_acceptances.json is present.'
    );
    assert.ok(content.includes('RISK_ACCEPTED'),
      'Risk Register tab must include the RISK_ACCEPTED inline marker example.'
    );
  });

  it('test_risk_register_tab_howto_present_when_register_has_entries', () => {
    const tmp = makeTmp();
    makeMinimalArtifacts(tmp);
    writeFileSync(join(_dataDir(tmp), 'risk_acceptances.json'), JSON.stringify({
      acceptances: [{
        id: 'RA-001', finding_id: 'CC-001',
        title: 'Accepted test risk', rationale: 'Low impact in this context',
        accepted_by: 'test@gov.ab.ca', expiry_date: '2027-01-01',
        severity_at_acceptance: 'medium', status: 'active',
      }],
    }), 'utf-8');
    _run(tmp);
    const content = readFileSync(_overviewHtml(tmp), 'utf-8');
    assert.ok(content.includes('RA-001'),
      'Accepted risk entry must appear in the Risk Register tab.'
    );
    assert.ok(content.includes('RISK_ACCEPTED'),
      'Risk Register tab must include the RISK_ACCEPTED how-to guidance alongside entries.'
    );
  });
});
