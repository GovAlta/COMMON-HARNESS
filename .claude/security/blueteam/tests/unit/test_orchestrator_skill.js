import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _ORCHESTRATOR = resolve(
  __dirname, '..', '..', '..', '..', '..',
  'Factory Agent', 'Security', 'blue-security-orchestrator.md'
);

const _SA_REF = 'security-architecture-design';
const _SA_FILE = 'skills/03-security-architecture.md';

let orchestratorText;

describe('test_orchestrator_skill', () => {
  before(() => {
    assert.ok(
      existsSync(_ORCHESTRATOR),
      `Orchestrator file not found: ${_ORCHESTRATOR}\n` +
      'Ensure blue-security-orchestrator.md exists in ' +
      'Security/ relative to the harness root.'
    );
    orchestratorText = readFileSync(_ORCHESTRATOR, 'utf-8');
  });

  it('test_orchestrator_file_exists', () => {
    assert.ok(existsSync(_ORCHESTRATOR), `Missing: ${_ORCHESTRATOR}`);
  });

  it('test_sa_ref_in_frontmatter', () => {
    const lines = orchestratorText.split('\n');
    let inFrontmatter = false;
    const frontmatterLines = [];
    let dashCount = 0;
    for (const line of lines) {
      if (line.trim() === '---') {
        dashCount++;
        if (dashCount === 1) {
          inFrontmatter = true;
          continue;
        }
        if (dashCount === 2) {
          break;
        }
      }
      if (inFrontmatter) {
        frontmatterLines.push(line);
      }
    }
    const frontmatter = frontmatterLines.join('\n');
    assert.ok(
      frontmatter.includes(_SA_REF),
      `'${_SA_REF}' not found in YAML frontmatter references block`
    );
  });

  it('test_sa_ref_in_appendix_a', () => {
    assert.ok(
      orchestratorText.includes(`ref:${_SA_REF}`),
      `'ref:${_SA_REF}' not found in orchestrator — expected in Appendix A table`
    );
    assert.ok(
      orchestratorText.includes(_SA_FILE),
      `'${_SA_FILE}' not found in orchestrator — expected in Appendix A table`
    );
  });

  it('test_sa_ref_in_operation_3_menu', () => {
    const op3Start = orchestratorText.indexOf('### Operation 3: Individual Skill');
    const op3End = orchestratorText.indexOf('### Operation 4:', op3Start);
    assert.notEqual(op3Start, -1, 'Operation 3 section not found in orchestrator');
    const op3Section = op3End !== -1
      ? orchestratorText.slice(op3Start, op3End)
      : orchestratorText.slice(op3Start);
    assert.ok(
      op3Section.includes(_SA_REF),
      `'${_SA_REF}' not found in Operation 3 skill menu`
    );
  });

  it('test_sa_in_operation_5_state_table', () => {
    const op5Start = orchestratorText.indexOf('### Operation 5: Resume / Continue');
    const op5End = orchestratorText.indexOf('### Operation 6:', op5Start);
    assert.notEqual(op5Start, -1, 'Operation 5 section not found in orchestrator');
    const op5Section = op5End !== -1
      ? orchestratorText.slice(op5Start, op5End)
      : orchestratorText.slice(op5Start);
    assert.ok(
      op5Section.includes('Security Architecture Design'),
      'Security Architecture Design row not found in Operation 5 state table'
    );
    assert.ok(
      op5Section.includes('security_architecture.json'),
      "'security_architecture.json' output artifact not listed in Operation 5 state table"
    );
  });

  it('test_sa_in_operation_1_steps', () => {
    const op1Start = orchestratorText.indexOf('### Operation 1: Full Assessment');
    const op1End = orchestratorText.indexOf('### Operation 2:', op1Start);
    assert.notEqual(op1Start, -1, 'Operation 1 section not found in orchestrator');
    const op1Section = op1End !== -1
      ? orchestratorText.slice(op1Start, op1End)
      : orchestratorText.slice(op1Start);
    assert.ok(
      op1Section.includes(_SA_REF),
      `'${_SA_REF}' not referenced in Operation 1 full assessment steps`
    );
  });
});
