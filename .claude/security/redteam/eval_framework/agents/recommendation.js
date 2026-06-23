/**
 * Evaluation checks for RECOMMENDATION agent deliverables (JSON format).
 */

import { CheckResult, EvalContext } from '../types.js';
import { AgentEvalConfig, register_agent } from './index.js';

// -- Constants ---------------------------------------------------------------

const MIN_ENTRIES = 3;

const REPORT_REQUIRED_KEYS = [
    'metadata', 'priority_implementation_order',
    'remediation_entries', 'attack_chain_coverage_matrix',
];

const METADATA_REQUIRED_KEYS = [
    'source_poc_report', 'generated', 'total_entries', 'severity_breakdown',
];

const SEVERITY_BREAKDOWN_KEYS = ['critical', 'high', 'medium', 'low'];

const ENTRY_REQUIRED_FIELDS = [
    'rem_id', 'title', 'severity', 'related_poc_ids', 'quick_win',
    'verified', 'root_cause', 'affected_files', 'recommended_changes',
    'verification_steps', 'impact_assessment',
];

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const VALID_ROLES = new Set(['source', 'sink', 'config', 'migration', 'shared', 'test']);

// -- Helper ------------------------------------------------------------------

function _cr(name, passed, score, details, suggestions = []) {
    return [new CheckResult({
        name, passed, score: Math.max(0.0, Math.min(1.0, score)),
        details, category: 'objective', suggestions,
    })];
}

function _getReport(ctx) {
    const data = ctx.json_data;
    if (!data) return null;
    return data.remediation_report || data;
}

function _getEntries(ctx) {
    const report = _getReport(ctx);
    if (!report) return [];
    return report.remediation_entries || [];
}

// -- Schema/Structure Checks -------------------------------------------------

function check_top_level_structure(ctx) {
    const data = ctx.json_data;
    if (!data) {
        return _cr('top_level_structure', false, 0.0,
            'No JSON data found.',
            ['Deliverable must be a valid JSON object.']);
    }

    let report = data.remediation_report;
    if (!report || typeof report !== 'object') {
        report = data;
        if (!REPORT_REQUIRED_KEYS.some(k => k in report)) {
            return _cr('top_level_structure', false, 0.0,
                'Missing remediation_report key or required sub-keys.',
                ['JSON must have top-level remediation_report object.']);
        }
    }

    const missing = REPORT_REQUIRED_KEYS.filter(k => !(k in report));
    const found = REPORT_REQUIRED_KEYS.length - missing.length;
    const score = found / REPORT_REQUIRED_KEYS.length;

    if (missing.length) {
        return _cr('top_level_structure', false, score,
            `${found}/${REPORT_REQUIRED_KEYS.length} required keys present. Missing: ${JSON.stringify(missing)}.`,
            missing.map(k => `Add key: ${k}`));
    }
    return _cr('top_level_structure', true, 1.0,
        `All ${REPORT_REQUIRED_KEYS.length} required keys present.`);
}

function check_metadata(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('metadata', false, 0.0, 'No report data.');

    const meta = report.metadata || {};
    if (!meta || !Object.keys(meta).length) {
        return _cr('metadata', false, 0.0,
            'metadata section missing.',
            ['Add metadata with source_poc_report, generated, total_entries, severity_breakdown.']);
    }

    const missing = METADATA_REQUIRED_KEYS.filter(k => !(k in meta));
    let score = 0.0;

    const fieldScore = (METADATA_REQUIRED_KEYS.length - missing.length) / METADATA_REQUIRED_KEYS.length;
    score += 0.5 * fieldScore;

    const breakdown = meta.severity_breakdown || {};
    const sevMissing = SEVERITY_BREAKDOWN_KEYS.filter(k => !(k in breakdown));
    if (!sevMissing.length && typeof breakdown === 'object') score += 0.3;
    else if (Object.keys(breakdown).length) score += 0.15;

    const total = meta.total_entries || 0;
    const sevSum = SEVERITY_BREAKDOWN_KEYS.reduce((s, k) => s + (breakdown[k] || 0), 0);
    if (total > 0 && sevSum === total) score += 0.2;
    else if (total > 0 && sevSum > 0) score += 0.1;

    const issues = [];
    if (missing.length) issues.push(`Missing metadata fields: ${JSON.stringify(missing)}`);
    if (sevMissing.length) issues.push(`Missing severity keys: ${JSON.stringify(sevMissing)}`);
    if (total > 0 && sevSum !== total) issues.push(`Severity sum (${sevSum}) != total_entries (${total})`);

    return _cr('metadata', score >= 0.7, score,
        `Metadata: ${METADATA_REQUIRED_KEYS.length - missing.length}/${METADATA_REQUIRED_KEYS.length} fields, ` +
        `severity sum ${sevSum === total ? 'matches' : 'mismatches'} total_entries.`,
        issues);
}

function check_entry_count(ctx) {
    const entries = _getEntries(ctx);
    const count = entries.length;
    if (count >= MIN_ENTRIES) {
        const score = Math.min(1.0, 0.5 + 0.5 * Math.min(count, 15) / 15);
        return _cr('entry_count', true, score,
            `${count} remediation entries (minimum: ${MIN_ENTRIES}).`);
    } else {
        return _cr('entry_count', false, MIN_ENTRIES ? count / MIN_ENTRIES : 0,
            `Only ${count} entries (need at least ${MIN_ENTRIES}).`,
            ['Add more remediation entries.']);
    }
}

function check_entry_required_fields(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('entry_required_fields', false, 0.0, 'No entries to check.');

    let complete = 0;
    const incompleteExamples = [];
    for (const entry of entries) {
        const missing = ENTRY_REQUIRED_FIELDS.filter(f => !(f in entry));
        if (!missing.length) {
            complete++;
        } else {
            incompleteExamples.push(`${entry.rem_id || '?'}: missing ${missing.join(', ')}`);
        }
    }

    const score = complete / entries.length;
    return _cr('entry_required_fields', score >= 0.8, score,
        `${complete}/${entries.length} entries have all ${ENTRY_REQUIRED_FIELDS.length} required fields.`,
        incompleteExamples.slice(0, 5));
}

// -- Remediation Quality Checks ----------------------------------------------

function check_root_cause_depth(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('root_cause_depth', false, 0.0, 'No entries to check.');

    let withRefs = 0;
    const shallow = [];
    for (const entry of entries) {
        const rootCause = entry.root_cause || '';
        const hasFileline = /[\w.-]+\.\w{1,4}:\d+/.test(rootCause);
        const hasPath = /`[^`]*[/\\][^`]*`/.test(rootCause);
        const hasDepth = rootCause.length >= 50;

        if ((hasFileline || hasPath) && hasDepth) {
            withRefs++;
        } else {
            const remId = entry.rem_id || '?';
            const issues = [];
            if (!hasFileline && !hasPath) issues.push('no file references');
            if (!hasDepth) issues.push('too short');
            shallow.push(`${remId}: ${issues.join(', ')}`);
        }
    }

    const score = entries.length ? withRefs / entries.length : 0;
    return _cr('root_cause_depth', score >= 0.7, score,
        `${withRefs}/${entries.length} root causes have file references and depth.`,
        shallow.slice(0, 5));
}

function check_code_changes_substance(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('code_changes_substance', false, 0.0, 'No entries to check.');

    let substantive = 0;
    const thin = [];
    for (const entry of entries) {
        const changes = entry.recommended_changes || [];
        if (!changes.length) {
            thin.push(`${entry.rem_id || '?'}: no changes`);
            continue;
        }

        let entryOk = true;
        for (const change of changes) {
            const current = change.current_code || '';
            const replacement = change.replacement_code || '';
            const explanation = change.explanation || '';
            if (current.length < 20 || replacement.length < 20 || explanation.length < 10) {
                entryOk = false;
                break;
            }
        }

        if (entryOk) substantive++;
        else thin.push(`${entry.rem_id || '?'}: code blocks too short or missing explanation`);
    }

    const score = entries.length ? substantive / entries.length : 0;
    return _cr('code_changes_substance', score >= 0.7, score,
        `${substantive}/${entries.length} entries have substantive code changes ` +
        `(current_code, replacement_code >20 chars, explanation).`,
        thin.slice(0, 5));
}

function check_verification_dual_vector(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('verification_dual_vector', false, 0.0, 'No entries to check.');

    let dual = 0;
    const missingType = [];
    for (const entry of entries) {
        const steps = entry.verification_steps || [];
        const types = new Set(steps.filter(s => typeof s === 'object' && s).map(s => s.type));
        const hasNeg = types.has('negative');
        const hasPos = types.has('positive');

        if (hasNeg && hasPos) {
            dual++;
        } else {
            const remId = entry.rem_id || '?';
            const needs = [];
            if (!hasNeg) needs.push('negative');
            if (!hasPos) needs.push('positive');
            missingType.push(`${remId}: missing ${needs.join(', ')} verification`);
        }
    }

    const score = entries.length ? dual / entries.length : 0;
    return _cr('verification_dual_vector', score >= 0.6, score,
        `${dual}/${entries.length} entries have both negative and positive verification.`,
        missingType.slice(0, 5));
}

function check_affected_files_populated(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('affected_files_populated', false, 0.0, 'No entries to check.');

    let valid = 0;
    const issues = [];
    for (const entry of entries) {
        const files = entry.affected_files || [];
        if (!files.length) {
            issues.push(`${entry.rem_id || '?'}: no affected_files`);
            continue;
        }

        let allValid = true;
        for (const af of files) {
            const hasPath = !!af.file_path;
            const hasRole = af.role ? VALID_ROLES.has(af.role) : false;
            if (!hasPath || !hasRole) { allValid = false; break; }
        }

        if (allValid) valid++;
        else issues.push(`${entry.rem_id || '?'}: invalid file_path or role`);
    }

    const score = entries.length ? valid / entries.length : 0;
    return _cr('affected_files_populated', score >= 0.7, score,
        `${valid}/${entries.length} entries have valid affected_files (path + role).`,
        issues.slice(0, 5));
}

function check_verified_status(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('verified_status', false, 0.0, 'No entries to check.');

    const verifiedCount = entries.filter(e => e.verified === true).length;
    const score = entries.length ? verifiedCount / entries.length : 0;
    return _cr('verified_status', score >= 0.5, score,
        `${verifiedCount}/${entries.length} entries are verified against codebase.`,
        verifiedCount === entries.length ? []
            : ['Ensure agent reads actual files and sets verified: true.']);
}

// -- Prioritization Checks ---------------------------------------------------

function check_priority_order(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('priority_order', false, 0.0, 'No report data.');

    const prio = report.priority_implementation_order || [];
    const entries = report.remediation_entries || [];

    if (!prio.length) {
        return _cr('priority_order', false, 0.0,
            'priority_implementation_order missing or empty.',
            ['Add priority_implementation_order array with rationale per entry.']);
    }

    let complete = 0;
    for (const p of prio) {
        const hasId = !!p.rem_id;
        const hasRationale = !!p.rationale && p.rationale.length > 10;
        const hasDeploy = 'deploy_together_with' in p;
        if (hasId && hasRationale && hasDeploy) complete++;
    }

    const fieldScore = prio.length ? complete / prio.length : 0;
    const countMatch = prio.length === entries.length;
    const countScore = countMatch ? 1.0 : 0.5;
    const score = 0.6 * fieldScore + 0.4 * countScore;

    const details = `${complete}/${prio.length} priority entries complete ` +
        `(rem_id + rationale + deploy_together_with). ` +
        `Count ${countMatch ? 'matches' : 'mismatches'} ` +
        `remediation_entries (${prio.length} vs ${entries.length}).`;

    return _cr('priority_order', score >= 0.6, score, details,
        countMatch ? []
            : [`Priority order has ${prio.length} entries but ${entries.length} remediations exist.`]);
}

function check_severity_ordering(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('severity_ordering', false, 0.0, 'No report data.');

    const prio = report.priority_implementation_order || [];
    const entries = report.remediation_entries || [];

    if (!prio.length || !entries.length) {
        return _cr('severity_ordering', false, 0.0, 'Priority order or entries missing.');
    }

    const sevMap = {};
    for (const e of entries) {
        sevMap[e.rem_id || ''] = e.severity || 'LOW';
    }

    const orderedSevs = prio.map(p => {
        const sev = sevMap[p.rem_id || ''] || 'LOW';
        return SEVERITY_RANK[sev] !== undefined ? SEVERITY_RANK[sev] : 3;
    });

    let violations = 0;
    for (let i = 0; i < orderedSevs.length - 1; i++) {
        if (orderedSevs[i] > orderedSevs[i + 1] + 1) {
            violations++;
        }
    }

    if (!orderedSevs.length) {
        return _cr('severity_ordering', false, 0.0, 'No priority entries with severity.');
    }

    const score = Math.max(0.0, 1.0 - violations / Math.max(orderedSevs.length - 1, 1));
    return _cr('severity_ordering', score >= 0.7, score,
        `Priority ordering: ${violations} severity violation(s) ` +
        `across ${orderedSevs.length} entries.`,
        violations ? [`Reorder: CRITICAL > HIGH > MEDIUM > LOW (found ${violations} out-of-order entries).`] : []);
}

// -- Attack Chain Coverage Checks --------------------------------------------

function check_chain_coverage(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('chain_coverage', false, 0.0, 'No report data.');

    const matrix = report.attack_chain_coverage_matrix || [];
    if (!matrix.length) {
        return _cr('chain_coverage', false, 0.0,
            'attack_chain_coverage_matrix missing or empty.',
            ['Add attack chain coverage matrix.']);
    }

    let valid = 0;
    const issues = [];
    for (const chain of matrix) {
        const hasName = !!chain.attack_chain;
        const brokenBy = chain.broken_by || [];
        const hasBroken = brokenBy.length > 0 && brokenBy.every(
            r => typeof r === 'string' && /^REM-\d+/.test(r));
        const hasMitigated = 'fully_mitigated' in chain;
        const hasGaps = 'gaps' in chain;

        if (hasName && hasBroken && hasMitigated && hasGaps) {
            valid++;
        } else {
            const missing = [];
            if (!hasName) missing.push('attack_chain name');
            if (!hasBroken) missing.push('broken_by REM-XX refs');
            if (!hasMitigated) missing.push('fully_mitigated');
            if (!hasGaps) missing.push('gaps');
            const chainName = (chain.attack_chain || '?').slice(0, 40);
            issues.push(`${chainName}: missing ${missing.join(', ')}`);
        }
    }

    const score = matrix.length ? valid / matrix.length : 0;
    return _cr('chain_coverage', score >= 0.7, score,
        `${valid}/${matrix.length} chain coverage entries are complete.`,
        issues.slice(0, 5));
}

function check_chain_gaps_documented(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('chain_gaps_documented', false, 0.0, 'No report data.');

    const matrix = report.attack_chain_coverage_matrix || [];
    if (!matrix.length) {
        return _cr('chain_gaps_documented', true, 0.5,
            'No chain coverage matrix to check gaps.');
    }

    const unmitigated = matrix.filter(c => c.fully_mitigated === false);
    if (!unmitigated.length) {
        return _cr('chain_gaps_documented', true, 1.0,
            'All chains are fully mitigated — no gaps to document.');
    }

    const documented = unmitigated.filter(c =>
        c.gaps !== null && c.gaps !== undefined && String(c.gaps).trim()
    ).length;
    const score = unmitigated.length ? documented / unmitigated.length : 1.0;

    return _cr('chain_gaps_documented', score >= 0.8, score,
        `${documented}/${unmitigated.length} unmitigated chains have documented gaps.`,
        documented < unmitigated.length
            ? ['Document gaps for chains with fully_mitigated: false.']
            : []);
}

// -- Traceability Check ------------------------------------------------------

function check_poc_traceability(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('poc_traceability', false, 0.0, 'No entries to check.');

    let traceable = 0;
    const issues = [];
    for (const entry of entries) {
        const pocIds = entry.related_poc_ids || [];
        const validIds = pocIds.filter(p => typeof p === 'string' && /^PoC-\d+/.test(p));
        if (validIds.length) {
            traceable++;
        } else {
            issues.push(`${entry.rem_id || '?'}: no valid PoC-XX references`);
        }
    }

    const score = entries.length ? traceable / entries.length : 0;
    return _cr('poc_traceability', score >= 0.8, score,
        `${traceable}/${entries.length} entries trace to valid PoC IDs.`,
        issues.slice(0, 5));
}

// -- Judge Configuration -----------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `\
You are a senior application security engineer and remediation architect evaluating
the output of an automated Recommendation agent. This agent consumes PoC execution
reports and produces structured JSON remediation plans.

The deliverable is a JSON object containing:
- Metadata (provenance, severity counts)
- Priority implementation order (deployment sequence with rationale)
- Remediation entries (each with root cause, code changes, verification steps, impact)
- Attack chain coverage matrix (which remediations break which chains)

## What Makes a Good Remediation Report

A HIGH-QUALITY report:
- Provides **copy-pasteable production-ready code fixes** (not vague "add validation")
- Traces **root causes to exact file:line references** with code-level explanations
- Includes **dual-vector verification** (negative: attack blocked, positive: legit use works)
- Orders remediations by **severity and deployment dependencies**
- Maps every remediation to the **attack chains it breaks**
- Assesses **functional impact and rollback risk** honestly
- Has verified=true for entries where the agent read the actual source code

A POOR report:
- Contains placeholder code ("add proper validation here")
- Has generic root causes without file references
- Missing verification steps or only tests one direction
- No priority ordering or deployment dependency analysis
- Missing attack chain coverage mapping
- Unrealistic rollback risk assessments
- verified=false with no justification

## Scoring Rubric (per criterion)

5 = Exceptional: A developer could apply every fix immediately from this report alone.
4 = Good: Solid code changes with minor gaps in context or verification.
3 = Adequate: Fixes are mostly there but need supplemental investigation.
2 = Below Expectations: Vague or incomplete. Developer needs significant extra work.
1 = Poor: Placeholder code, missing root causes, not actionable.

Evaluate honestly and critically. The purpose is to drive continuous improvement.
`;

const JUDGE_CRITERIA_PROMPT = `\
1. **Remediation Precision** (max 5):
   Are fixes copy-pasteable production-ready code, or vague/placeholder?
   Do current_code blocks match actual source (verifiable against the codebase)?
   Are replacement_code blocks complete, correct, and well-explained?

2. **Root Cause Analysis** (max 5):
   Does root_cause explain the fundamental vulnerability with file:line references?
   Is the explanation at the code level (specific functions, data flows), not just
   behavioral ("input is not validated")?

3. **Verification Rigor** (max 5):
   Do verification steps cover both negative (attack blocked) and positive
   (legitimate use still works)? Are commands concrete and executable (curl, etc.)?
   Are expected results specific enough to automate?

4. **Priority and Deployment Logic** (max 5):
   Is the implementation order sound (critical before medium)? Are deploy_together_with
   dependencies correct and justified? Could a team follow this order in production?

5. **Attack Chain Coverage** (max 5):
   Are all chains from the PoC report covered in the matrix? Is broken_by accurate?
   Are gaps documented for partially mitigated chains? Does the matrix give confidence
   that all critical attack paths will be closed?

6. **Practical Usability** (max 5):
   Could a developer apply these fixes from the report alone without needing to
   re-investigate? Are rollback risks assessed realistically? Is functional_impact
   documented clearly for each fix? Are quick_win flags accurate?
`;

// -- Check Lists -------------------------------------------------------------

const _JSON_CHECKS = [
    // Schema/structure
    check_top_level_structure,
    check_metadata,
    check_entry_count,
    check_entry_required_fields,
    // Remediation quality
    check_root_cause_depth,
    check_code_changes_substance,
    check_verification_dual_vector,
    check_affected_files_populated,
    check_verified_status,
    // Prioritization
    check_priority_order,
    check_severity_ordering,
    // Attack chain coverage
    check_chain_coverage,
    check_chain_gaps_documented,
    // Traceability
    check_poc_traceability,
];

// -- Registration ------------------------------------------------------------

register_agent(new AgentEvalConfig({
    agent_name: 'recommendation',
    display_name: 'RECOMMENDATION',
    deliverable_format: 'json',
    objective_checks_json: _JSON_CHECKS,
    judge_system_prompt: JUDGE_SYSTEM_PROMPT,
    judge_criteria_prompt: JUDGE_CRITERIA_PROMPT,
}));
