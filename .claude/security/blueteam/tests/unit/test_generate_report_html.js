import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'generate_report_html.js');

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'bt-test-'));
}

function _writeMd(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function _run(repoRoot, extraArgs = null) {
  const cmd = [_SCRIPT, '--repo-root', repoRoot];
  if (extraArgs) cmd.push(...extraArgs);
  return spawnSync(process.execPath, cmd, { encoding: 'utf-8' });
}

function _reportsDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'reports');
}

function _dataDir(repoRoot) {
  return join(repoRoot, '.ai', 'blueteam', 'data');
}

describe('test_generate_report_html', () => {
  it('test_basic_conversion', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Test Security Report\n\n' +
      '## Executive Summary\n\n' +
      'This is a test report.\n\n' +
      '## Findings\n\n' +
      'No findings.\n';
    _writeMd(join(_reportsDir(tmp), 'test_report.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0,
      `Script exited non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );

    const outHtml = join(_reportsDir(tmp), 'test_report.html');
    assert.ok(existsSync(outHtml), 'Expected test_report.html to be created');

    const content = readFileSync(outHtml, 'utf-8');
    assert.ok(content.toLowerCase().includes('<html'), 'Output file should contain an <html element');
    assert.ok(
      content.includes('<!DOCTYPE html>') || content.toLowerCase().includes('<!doctype html>')
    );
  });

  it('test_sidebar_toc_built', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Level 2 Security Assessment\n\n' +
      '## Executive Summary\n\nSummary text here.\n\n' +
      '## Authentication\n\nAuth findings here.\n\n' +
      '## Session Management\n\nSession findings here.\n\n' +
      '## Access Control\n\nAccess control findings here.\n\n' +
      '## Input Validation\n\nInput validation findings here.\n';
    _writeMd(join(_reportsDir(tmp), 'asvs_report.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs_report.html'), 'utf-8');
    assert.ok(content.includes('class="toc-sidebar"'), 'Sidebar nav element not found in output');
    assert.ok(content.includes('Executive Summary'));
    assert.ok(content.includes('Authentication'));
    assert.ok(content.includes('Session Management'));
  });

  it('test_severity_badges_injected', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Threat Model\n\n' +
      '## STRIDE Analysis\n\n' +
      '| Threat | Severity | Description |\n' +
      '|--------|----------|-------------|\n' +
      '| SQL Injection | Critical | Attacker can dump the DB |\n' +
      '| Weak passwords | High | Brute-force possible |\n' +
      '| Missing rate limit | Medium | DoS vector |\n' +
      '| Verbose errors | Low | Information leak |\n';
    _writeMd(join(_reportsDir(tmp), 'threat_model.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'threat_model.html'), 'utf-8');
    assert.ok(content.includes('badge-critical'), 'badge-critical class missing');
    assert.ok(content.includes('badge-high'), 'badge-high class missing');
    assert.ok(content.includes('badge-medium'), 'badge-medium class missing');
    assert.ok(content.includes('badge-low'), 'badge-low class missing');
  });

  it('test_show_fix_from_code_changes', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Level 2 Security Assessment\n\n' +
      '## SQL Injection\n\n' +
      '**Change ID:** CC-001 \u2192 see `code_changes.json`\n\n' +
      'Use parameterized queries throughout.\n';
    _writeMd(join(_reportsDir(tmp), 'asvs_report.md'), mdContent);

    const ccData = {
      schema_version: '1.0',
      last_updated: '2026-03-05',
      generated_by_assessments: ['asvs_level2_security_assessment'],
      changes: [{
        id: 'CC-001',
        title: 'Replace string concatenation with parameterized query',
        priority: 'critical',
        file_path: 'src/routes/search.ts',
        line_reference: '42',
        change_type: 'fix',
        description: 'SQL injection via string concatenation. Use prepared statements.',
        current_code_summary: 'String concatenation in query builder at line 42',
        replacement_code: "db.prepare('SELECT * FROM users WHERE id = ?').get(id)",
        sources: [{ assessment: 'asvs_level2_security_assessment', finding_id: 'FINDING-001' }],
        cas_rules: [],
        asvs_requirements: ['V5.3.4'],
        related_requirement_ids: ['SR-001'],
      }],
    };
    mkdirSync(_dataDir(tmp), { recursive: true });
    writeFileSync(join(_dataDir(tmp), 'code_changes.json'), JSON.stringify(ccData, null, 2), 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs_report.html'), 'utf-8');
    const hasShowFix = content.includes('Show fix') || content.includes('show-fix') || content.includes('finding-detail');
    assert.ok(hasShowFix,
      `Expected a 'Show fix' expandable block for CC-001 but none found.\n` +
      `Relevant stdout: ${result.stdout}`
    );
  });

  it('test_security_overview_excluded', () => {
    const tmp = makeTmp();
    _writeMd(
      join(_reportsDir(tmp), 'test_report.md'),
      '# Test Report\n\n## Summary\n\nSome text.\n'
    );
    _writeMd(
      join(_reportsDir(tmp), 'security_overview.md'),
      '# Security Overview\n\nThis should be excluded.\n'
    );

    const result = _run(tmp);
    assert.equal(result.status, 0);

    assert.ok(
      existsSync(join(_reportsDir(tmp), 'test_report.html')),
      'test_report.html should have been created'
    );
    assert.ok(
      !existsSync(join(_reportsDir(tmp), 'security_overview.html')),
      'security_overview.html should NOT be created by generate_report_html.js'
    );
  });

  it('test_missing_reports_dir_handled_gracefully', () => {
    const tmp = makeTmp();
    const result = _run(tmp);

    assert.ok(
      !result.stderr.includes('Traceback (most recent call last)'),
      'Script raised an unhandled exception (traceback found in stderr)'
    );
    // No .html files should be produced when reports dir is missing
    assert.ok(
      !existsSync(join(tmp, '.ai', 'blueteam', 'reports')),
      'No reports directory should exist and no .html files should be produced'
    );
  });

  it('test_redacted_chip', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Secrets Scan Report\n\n' +
      '## Detected Secrets\n\n' +
      "The endpoint returned the patient's PHN: [REDACTED-PHN] in the response body.\n\n" +
      'An API key was found: [REDACTED-APIKEY].\n';
    _writeMd(join(_reportsDir(tmp), 'secrets_report.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'secrets_report.html'), 'utf-8');
    assert.ok(content.includes('redacted-chip'),
      "Expected 'redacted-chip' CSS class in output HTML for [REDACTED-*] tokens"
    );
    assert.ok(content.includes('REDACTED-PHN'), 'REDACTED-PHN token should appear in the output');
    assert.ok(content.includes('REDACTED-APIKEY'), 'REDACTED-APIKEY token should appear in the output');
    assert.ok(content.includes('<span class="redacted-chip">'),
      'Expected a <span class="redacted-chip"> element wrapping redacted tokens'
    );
  });

  it('test_coverage_bars_main_table_becomes_cards', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Security Unit Test Coverage Report\n\n' +
      '## Security Control Coverage\n\n' +
      '> **Denominator:** 11 in-scope testable controls \u2014 8 infrastructure-only\n' +
      '> findings are excluded from this metric.\n\n' +
      '| Metric | Pre-Existing Coverage | With Generated Tests Adopted |\n' +
      '|--------|----------------------|------------------------------|\n' +
      '| **Controls Covered** | 1 / 11 (9%) | 11 / 11 (100%) |\n' +
      '| *of which: Partial* | 1 | \u2014 |\n' +
      '| **Coverage Gain** | \u2014 | \u2191 +91 pp (+10 controls) |\n' +
      '| **Security Tests** | 0 pre-existing | +24 tests written |\n';
    _writeMd(join(_reportsDir(tmp), 'security_unit_test_coverage.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'security_unit_test_coverage.html'), 'utf-8');
    assert.ok(content.includes('display:flex'),
      'Expected a flex card container'
    );
    assert.ok(content.includes('font-size:40px'),
      'Expected 40 px headline font for the % value'
    );
    assert.ok(content.includes('9%'), 'Expected pre-existing 9% value in coverage card');
    assert.ok(content.includes('100%'), 'Expected projected 100% value in coverage card');
    assert.ok(content.includes('#c0392b'),
      'Expected red (#c0392b) for the pre-existing 9% coverage bar'
    );
    assert.ok(content.includes('#1e8449'),
      'Expected green (#1e8449) for the projected 100% coverage bar'
    );
  });

  it('test_coverage_bars_per_stack_adds_inline_bars', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Security Unit Test Coverage Report\n\n' +
      '## Security Control Coverage\n\n' +
      '**Per Stack:**\n\n' +
      '| Stack | In-Scope | Pre-Existing | With Generated Tests |\n' +
      '|-------|----------|--------------|----------------------|\n' +
      '| Backend (XUnit) | 9 | 0 / 9 (0%) | 9 / 9 (100%) |\n' +
      '| Frontend (Jest) | 2 | 1 / 2 (50%) | 2 / 2 (100%) |\n';
    _writeMd(join(_reportsDir(tmp), 'security_unit_test_coverage.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'security_unit_test_coverage.html'), 'utf-8');
    assert.ok(content.includes('<table>'),
      'Expected a <table> element for the per-stack table'
    );
    assert.ok(content.includes('Backend (XUnit)'), 'Backend stack row missing');
    assert.ok(content.includes('Frontend (Jest)'), 'Frontend stack row missing');
    assert.ok(content.includes('height:6px'),
      'Expected inline progress bar (height:6px) injected into % cells'
    );
  });

  it('test_new_header_repo_strip_present', () => {
    const tmp = makeTmp();
    _writeMd(
      join(_reportsDir(tmp), 'test_report.md'),
      '# Test Report\n\n## Section\n\nContent.\n'
    );
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const html = readFileSync(join(_reportsDir(tmp), 'test_report.html'), 'utf-8');
    assert.ok(html.includes('class="repo-strip"'), 'repo-strip div should be present');
    assert.ok(html.includes('height:12px'), 'repo-strip height should be 12px');
  });

  it('test_new_header_app_name_promoted_to_h1', () => {
    const tmp = makeTmp();
    _writeMd(
      join(_reportsDir(tmp), 'test_report.md'),
      '# Threat Model Assessment\n\n' +
      '**Application Name:** Acme Application\n\n' +
      '## Findings\n\nNo findings.\n'
    );
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const html = readFileSync(join(_reportsDir(tmp), 'test_report.html'), 'utf-8');
    assert.ok(html.includes('<h1>Acme Application</h1>'), 'app name should be the H1');
    assert.ok(
      html.includes('class="report-type">Threat Model Assessment'),
      'report title should be in .report-type subtitle div'
    );
  });

  it('test_new_header_fallback_app_name_not_em_dash', () => {
    const tmp = makeTmp();
    _writeMd(
      join(_reportsDir(tmp), 'test_report.md'),
      '# ASVS Level 2 Assessment\n\n## Findings\n\nNo findings.\n'
    );
    const result = _run(tmp);
    assert.equal(result.status, 0);
    const html = readFileSync(join(_reportsDir(tmp), 'test_report.html'), 'utf-8');
    const h1Match = html.match(/<h1>([^<]+)<\/h1>/);
    assert.ok(h1Match !== null, 'H1 element should be present in the header');
    assert.notEqual(h1Match[1].trim(), '\u2014',
      'H1 must not be the bare em-dash — repo name fallback should apply'
    );
  });

  it('test_verification_block_injected_from_artifact', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Threat Model\n\n' +
      '## Findings\n\n' +
      '### FINDING-001: SQL Injection in Search\n\n' +
      'Attackers can inject SQL via the q parameter.\n';
    _writeMd(join(_reportsDir(tmp), 'threat_model.md'), mdContent);

    const vtData = {
      schema_version: '1.0',
      tests: [{
        finding_id: 'FINDING-001',
        title: 'Confirm SQL injection behavior',
        assessment: 'threat_model',
        safety_level: 'safe-readonly',
        command_template: "curl -sS \"https://[HOST]/search?q=' OR 1=1--\"",
        expected_vulnerable_result: 'Response includes records unrelated to caller scope.',
        expected_mitigated_result: 'Request rejected or returns scoped results only.',
        evidence_to_capture: ['HTTP status', 'Response body excerpt'],
        validation_status: 'not-tested',
      }],
    };
    mkdirSync(_dataDir(tmp), { recursive: true });
    writeFileSync(join(_dataDir(tmp), 'verification_tests.json'), JSON.stringify(vtData, null, 2), 'utf-8');

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'threat_model.html'), 'utf-8');
    assert.ok(content.includes('verification-detail'));
    assert.ok(content.includes('Confirm SQL injection behavior'));
    assert.ok(content.includes('Command Template'));
    assert.ok(content.includes('SAFE-READONLY'));
  });

  it('test_fail_verdict_uses_badge_fail_not_badge_critical', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Assessment\n\n' +
      '## Results\n\n' +
      '| Requirement | Verdict | Risk |\n' +
      '|-------------|---------|------|\n' +
      '| V2.1.1 Passwords | Fail | Critical |\n' +
      '| V2.1.2 Lockout | Pass | High |\n' +
      '| V2.1.3 Hints | FAIL | Medium |\n';
    _writeMd(join(_reportsDir(tmp), 'asvs.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs.html'), 'utf-8');
    assert.ok(content.includes('badge-fail'), 'Expected badge-fail for Fail verdict');

    const cells = content.match(/<td>(.*?)<\/td>/gs) || [];
    const failCells = cells.filter(c => c.includes('badge-fail'));
    const critCells = cells.filter(c => c.includes('badge-critical'));
    assert.equal(failCells.length, 2, `Expected 2 badge-fail cells (Fail + FAIL), got ${failCells.length}`);
    assert.equal(critCells.length, 1, `Expected 1 badge-critical cell (Critical risk), got ${critCells.length}`);
    assert.ok(!critCells[0].includes('badge-fail'), 'badge-fail leaked into the Critical risk cell');
  });

  it('test_severity_bar_two_groups', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Assessment\n\n' +
      '## Requirements\n\n' +
      '| ID | Verdict | Risk |\n' +
      '|----|---------|------|\n' +
      '| V2.1.1 | Fail | Critical |\n' +
      '| V2.1.2 | Pass | High |\n' +
      '| V2.1.3 | Fail | Medium |\n' +
      '| V2.1.4 | Pass | Low |\n';
    _writeMd(join(_reportsDir(tmp), 'asvs.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs.html'), 'utf-8');
    assert.ok(content.includes('Verdicts:'), "Severity bar must show 'Verdicts:' group label");
    assert.ok(content.includes('Risk level:'), "Severity bar must show 'Risk level:' group label");

    const m = content.match(/<div class="severity-bar">([\s\S]*?)<\/div>/);
    assert.ok(m, 'severity-bar div not found');
    const bar = m[1];
    assert.ok(bar.includes('Verdicts:'));
    assert.ok(bar.includes('Risk level:'));
    assert.ok(bar.includes('sev-fail'), 'Failed chip missing from severity bar (sev-fail)');
    assert.ok(bar.includes('sev-pass'), 'Pass chip missing from severity bar (sev-pass)');
    assert.ok(bar.includes('sev-critical'), 'Critical chip missing from severity bar (sev-critical)');
    assert.ok(bar.includes('sev-high'), 'High chip missing from severity bar (sev-high)');
  });

  it('test_severity_bar_risk_only_no_verdict_group', () => {
    const tmp = makeTmp();
    const mdContent =
      '# Threat Model\n\n' +
      '## Findings\n\n' +
      '| Finding | Severity | Description |\n' +
      '|---------|----------|-------------|\n' +
      '| SQL Injection | Critical | Raw query |\n' +
      '| CORS | High | Wildcard origin |\n' +
      '| Missing headers | Medium | No CSP |\n';
    _writeMd(join(_reportsDir(tmp), 'threat_model.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'threat_model.html'), 'utf-8');
    const m = content.match(/<div class="severity-bar">([\s\S]*?)<\/div>/);
    assert.ok(m, 'severity-bar div not found');
    const bar = m[1];
    assert.ok(bar.includes('Risk level:'), 'Risk level group label expected');
    assert.ok(!bar.includes('Verdicts:'), 'Verdicts group must be absent when no Pass/Fail cells');
  });

  it('test_assumed_compliant_capital_c_uses_badge_assumed', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Assessment\n\n' +
      '## V9 Communication Security\n\n' +
      '| Req ID | Result | Risk | Finding |\n' +
      '|--------|--------|------|---------|\n' +
      '| V9.1.1 | **Assumed Compliant** | High | Cloud LZ TLS at perimeter |\n' +
      '| V9.1.2 | Pass | High | TLS 1.2+ enforced |\n';
    _writeMd(join(_reportsDir(tmp), 'asvs.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(
      assumedCells.some(c => c.includes('Assumed Compliant')),
      "'Assumed Compliant' cell must have badge-assumed, not badge-pass"
    );
    const passCells = cells.filter(c => c.includes('badge-pass'));
    assert.ok(
      !passCells.some(c => c.includes('Assumed')),
      "'Assumed Compliant' cell must not leak into badge-pass via \\bCompliant\\b"
    );
  });

  it('test_waived_verdict_uses_badge_assumed', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Assessment\n\n' +
      '## V2 Authentication\n\n' +
      '| Req ID | Result | Risk | Finding |\n' +
      '|--------|--------|------|---------|\n' +
      '| V2.1.1-V2.1.12 | **Waived** | \u2014 | Auth delegated to Keycloak |\n' +
      '| V2.2.1 | Fail | High | No rate limiting |\n' +
      '| V2.2.4 | Pass | Critical | No auth bypass found |\n';
    _writeMd(join(_reportsDir(tmp), 'asvs.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(
      assumedCells.some(c => c.includes('Waived')),
      "'Waived' in a table cell must produce badge-assumed for the N/A/Waived chip"
    );
    const passCells = cells.filter(c => c.includes('badge-pass'));
    const failCells = cells.filter(c => c.includes('badge-fail'));
    assert.ok(!passCells.some(c => c.includes('Waived')), 'Waived must not be badge-pass');
    assert.ok(!failCells.some(c => c.includes('Waived')), 'Waived must not be badge-fail');
  });

  it('test_na_verdict_uses_badge_assumed', () => {
    const tmp = makeTmp();
    const mdContent =
      '# ASVS Assessment\n\n' +
      '## V1 Architecture\n\n' +
      '| Req ID | Result | Risk | Finding |\n' +
      '|--------|--------|------|---------|\n' +
      '| V1.1.3 | N/A | Low | Not verifiable via code review |\n' +
      '| V1.1.2 | Pass | Medium | Threat model exists |\n' +
      '| V1.2.2 | Fail | High | finrep-api no auth |\n';
    _writeMd(join(_reportsDir(tmp), 'asvs.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'asvs.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(assumedCells.length >= 1, 'Expected at least 1 badge-assumed cell from the N/A verdict');

    const m = content.match(/<div class="severity-bar">([\s\S]*?)<\/div>/);
    assert.ok(m, 'severity-bar div not found');
    const bar = m[1];
    assert.ok(bar.includes('sev-assumed'),
      'N/A verdict should produce sev-assumed chip in the severity bar Verdicts group'
    );
  });

  it('test_not_applicable_uses_badge_assumed', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 16: AI/LLM\n\n' +
      '| Rule | Verdict | Evidence |\n' +
      '|------|---------|----------|\n' +
      '| AI-001 | NOT APPLICABLE | No AI features present |\n' +
      '| ENC-002 | NOT APPLICABLE | No PHN/SIN data |\n' +
      '| AUTH-001 | COMPLIANT | Keycloak OIDC |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(
      assumedCells.some(c => c.includes('Not Applicable')),
      "'NOT APPLICABLE' verdict cell must produce badge-assumed with 'Not Applicable' text"
    );
    const passCells = cells.filter(c => c.includes('badge-pass'));
    const critCells = cells.filter(c => c.includes('badge-critical'));
    assert.ok(
      !passCells.some(c => c.includes('Not Applicable')),
      'NOT APPLICABLE must not produce badge-pass'
    );
    assert.ok(
      !critCells.some(c => c.includes('Not Applicable')),
      'NOT APPLICABLE must not produce badge-critical'
    );
  });

  it('test_non_compliant_no_cascade_to_badge_pass', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 1: Auth\n\n' +
      '| Rule | Verdict | Severity |\n' +
      '|------|---------|----------|\n' +
      '| AUTH-004 | NON-COMPLIANT | Critical |\n' +
      '| AUTH-001 | COMPLIANT | \u2014 |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const failCells = cells.filter(c => c.includes('badge-fail'));
    assert.ok(failCells.length >= 1, 'Expected at least 1 badge-fail cell for NON-COMPLIANT');

    const nonCompliantCell = failCells.find(c => c.includes('Non-Compliant') || c.includes('Non-'));
    assert.ok(nonCompliantCell !== undefined, "Could not find a badge-fail cell containing 'Non-Compliant'");
    assert.ok(!nonCompliantCell.includes('badge-pass'),
      'NON-COMPLIANT cell must not also contain badge-pass'
    );
  });

  it('test_compliant_all_caps_uses_badge_pass', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 1: Auth\n\n' +
      '| Rule | Verdict | Evidence |\n' +
      '|------|---------|----------|\n' +
      '| AUTH-001 | COMPLIANT | Keycloak OIDC configured |\n' +
      '| AUTH-002 | COMPLIANT | Enterprise IdP federation |\n' +
      '| AUTH-003 | NOT VERIFIABLE | No partner auth flows found |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const passCells = cells.filter(c => c.includes('badge-pass'));
    assert.equal(passCells.length, 2, `Expected 2 badge-pass cells (COMPLIANT x 2), got ${passCells.length}`);

    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(
      assumedCells.some(c => c.includes('Not Verifiable')),
      "'NOT VERIFIABLE' cell must produce badge-assumed"
    );
  });

  it('test_partial_compliant_uses_badge_assumed', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 7: Logging\n\n' +
      '| Rule | Verdict | Evidence |\n' +
      '|------|---------|----------|\n' +
      '| LOG-005 | PARTIAL COMPLIANT | Timestamp/severity present; user identity inconsistent |\n' +
      '| LOG-007 | COMPLIANT | Application Insights configured |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const assumedCells = cells.filter(c => c.includes('badge-assumed'));
    assert.ok(
      assumedCells.some(c => c.includes('Partial Compliant')),
      "'PARTIAL COMPLIANT' verdict cell must produce badge-assumed"
    );
    const passCells = cells.filter(c => c.includes('badge-pass'));
    const partialInPass = passCells.filter(c => c.includes('Partial'));
    assert.equal(partialInPass.length, 0,
      'PARTIAL COMPLIANT cell must not contain badge-pass'
    );
  });

  it('test_non_compliant_uses_badge_fail_not_badge_critical', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 1: Auth\n\n' +
      '| Rule | Verdict | Risk |\n' +
      '|------|---------|------|\n' +
      '| AUTH-004 | NON-COMPLIANT | Critical |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    const cells = content.match(/<td>([\s\S]*?)<\/td>/gs) || [];
    const failCells = cells.filter(c => c.includes('badge-fail') && c.includes('Non-Compliant'));
    assert.ok(failCells.length >= 1,
      'NON-COMPLIANT verdict must produce badge-fail, not badge-critical'
    );
    for (const cell of failCells) {
      assert.ok(!cell.includes('badge-critical'),
        'NON-COMPLIANT verdict cell must not contain badge-critical'
      );
    }
    const riskCells = cells.filter(c => c.includes('badge-critical') && c.includes('Critical'));
    assert.ok(riskCells.length >= 1,
      "Risk column value 'Critical' must still produce badge-critical"
    );
  });

  it('test_severity_bar_excludes_two_column_tables', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Finding Detail\n\n' +
      '| Field | Value |\n' +
      '|-------|-------|\n' +
      '| Rule | AUTH-004 |\n' +
      '| Verdict | NON-COMPLIANT |\n\n' +
      '## Section Summary\n\n' +
      '| Rule | Verdict | Risk |\n' +
      '|------|---------|------|\n' +
      '| AUTH-001 | COMPLIANT | Low |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    assert.ok(content.includes('class="severity-bar"'), 'Severity bar must be present');
    assert.ok(content.includes('class="sev-chip sev-pass"'),
      'Pass/Compliant chip must appear'
    );
    assert.ok(!content.includes('class="sev-chip sev-fail"'),
      'Failed chip must not appear'
    );
  });

  it('test_chip_source_annotation_takes_precedence_over_3col_heuristic', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Sub-requirement Detail\n\n' +
      '| Sub-rule | Status | Evidence |\n' +
      '|----------|--------|----------|\n' +
      '| LOG-001a | NON-COMPLIANT | No audit log found |\n\n' +
      '## Section 18: Compliance Summary\n\n' +
      '<!-- chip-source -->\n' +
      '| Field | Value |\n' +
      '|-------|-------|\n' +
      '| Overall Verdict | COMPLIANT |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    assert.ok(content.includes('class="sev-chip sev-pass"'),
      'Pass chip must appear'
    );
    assert.ok(!content.includes('class="sev-chip sev-fail"'),
      'Failed chip must not appear'
    );
  });

  it('test_chip_source_annotation_works_with_heading_between_comment_and_table', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Sub-requirement Detail\n\n' +
      '| Sub-rule | Status | Evidence |\n' +
      '|----------|--------|----------|\n' +
      '| LOG-001a | NON-COMPLIANT | No audit log found |\n\n' +
      '<!-- chip-source -->\n' +
      '## 18. Full CAS Rule Assessment Summary\n\n' +
      '| Rule ID | Rule Topic | Verdict | Priority |\n' +
      '|---------|-----------|---------|----------|\n' +
      '| AUTH-001 | Authentication | COMPLIANT | \u2014 |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    assert.ok(content.includes('class="sev-chip sev-pass"'),
      'Pass chip must appear'
    );
    assert.ok(!content.includes('class="sev-chip sev-fail"'),
      'Failed chip must not appear'
    );
  });

  it('test_partial_compliant_with_risk_priority_produces_spurious_risk_chip', () => {
    const tmp = makeTmp();
    const mdContent =
      '# CAS Compliance Report\n\n' +
      '## Section 18: CAS Compliance Summary Table\n\n' +
      '<!-- chip-source -->\n' +
      '| CAS Rule | Domain | Verdict | Finding ID | Priority |\n' +
      '|----------|--------|---------|------------|----------|\n' +
      '| LOG-005 | Logging | PARTIAL COMPLIANT | \u2014 | Medium |\n';
    _writeMd(join(_reportsDir(tmp), 'cas.md'), mdContent);

    const result = _run(tmp);
    assert.equal(result.status, 0);

    const content = readFileSync(join(_reportsDir(tmp), 'cas.html'), 'utf-8');
    assert.ok(content.includes('badge-assumed'),
      'badge-assumed must appear for PARTIAL COMPLIANT'
    );
    assert.ok(content.includes('badge-medium'),
      "badge-medium must appear for 'Medium' in Priority cell"
    );
    assert.ok(content.includes('class="sev-chip sev-medium"'),
      'Medium risk chip must appear in the chip bar'
    );
  });
});
