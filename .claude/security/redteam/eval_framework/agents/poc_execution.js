/**
 * Evaluation checks for POC-EXECUTION agent deliverables (JSON format).
 */

import { CheckResult, EvalContext } from '../types.js';
import { AgentEvalConfig, register_agent } from './index.js';

// -- Constants ---------------------------------------------------------------

const REPORT_REQUIRED_KEYS = [
    'metadata', 'executive_summary', 'common_variables',
    'chaining_register', 'poc_entries', 'chain_entries',
    'summary_matrix', 'not_exploitable', 'final_summary',
];

const METADATA_REQUIRED_KEYS = ['target', 'run_id', 'date', 'assessor'];

const EXEC_SUMMARY_REQUIRED_KEYS = [
    'overall_risk_rating', 'assessment_scope', 'key_statistics',
    'top_findings', 'critical_attack_chains', 'immediate_remediation_priorities',
];

const POC_ENTRY_REQUIRED_FIELDS = [
    'poc_id', 'title', 'severity', 'vulnerability',
    'source', 'sink', 'poc_commands', 'analysis',
    'why_it_works', 'met_status', 'chaining_artifacts',
];

const CHAIN_ENTRY_REQUIRED_FIELDS = [
    'chain_id', 'title', 'severity', 'summary',
    'prerequisites', 'steps', 'compound_script',
    'execution_result', 'analysis',
];

const MATRIX_ENTRY_REQUIRED_FIELDS = [
    'poc_id', 'vulnerability', 'severity', 'effort',
    'vector', 'executed', 'met_status',
];

const CHAINING_ENTRY_REQUIRED_FIELDS = [
    'extracted_by', 'data_type', 'value', 'enables', 'chained',
];

const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

// -- Helpers -----------------------------------------------------------------

function _cr(name, passed, score, details, suggestions = []) {
    return [new CheckResult({
        name, passed, score: Math.max(0.0, Math.min(1.0, score)),
        details, category: 'objective', suggestions,
    })];
}

function _getReport(ctx) {
    if (!ctx.json_data) return null;
    return ctx.json_data.poc_report || ctx.json_data;
}

function _getEntries(ctx) {
    const report = _getReport(ctx);
    if (!report) return [];
    return report.poc_entries || [];
}

function _getChains(ctx) {
    const report = _getReport(ctx);
    if (!report) return [];
    return report.chain_entries || [];
}

// -- Structure Checks --------------------------------------------------------

function check_top_level_structure(ctx) {
    const report = _getReport(ctx);
    if (!report) {
        return _cr('top_level_structure', false, 0.0,
            'No poc_report key found in JSON.',
            ['Wrap output in {"poc_report": {...}}']);
    }
    const found = REPORT_REQUIRED_KEYS.filter(k => k in report);
    const missing = REPORT_REQUIRED_KEYS.filter(k => !(k in report));
    const score = found.length / REPORT_REQUIRED_KEYS.length;
    if (missing.length) {
        return _cr('top_level_structure', false, score,
            `${found.length}/${REPORT_REQUIRED_KEYS.length} keys present. Missing: ${JSON.stringify(missing)}.`,
            missing.map(k => `Add missing key: ${k}`));
    }
    return _cr('top_level_structure', true, 1.0,
        `All ${REPORT_REQUIRED_KEYS.length} required keys present.`);
}

function check_metadata(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('metadata', false, 0.0, 'No report data.');
    const meta = report.metadata || {};
    const found = METADATA_REQUIRED_KEYS.filter(k => meta[k]);
    const missing = METADATA_REQUIRED_KEYS.filter(k => !meta[k]);
    const score = found.length / METADATA_REQUIRED_KEYS.length;
    if (missing.length) {
        return _cr('metadata', false, score,
            `Metadata: ${found.length}/${METADATA_REQUIRED_KEYS.length} fields. Missing: ${JSON.stringify(missing)}.`);
    }
    return _cr('metadata', true, 1.0,
        `Metadata complete: target=${(meta.target || '').slice(0, 60)}.`);
}

function check_executive_summary(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('executive_summary', false, 0.0, 'No report data.');
    const es = report.executive_summary || {};
    if (!es || !Object.keys(es).length) {
        return _cr('executive_summary', false, 0.0,
            'No executive_summary section.',
            ['Add executive_summary with risk rating, stats, findings.']);
    }

    let score = 0.0;
    const issues = [];

    const foundKeys = EXEC_SUMMARY_REQUIRED_KEYS.filter(k => k in es);
    score += 0.3 * foundKeys.length / EXEC_SUMMARY_REQUIRED_KEYS.length;
    for (const k of EXEC_SUMMARY_REQUIRED_KEYS) {
        if (!(k in es)) issues.push(`Missing key: ${k}`);
    }

    const stats = es.key_statistics || {};
    const sev = stats.severity_breakdown || {};
    const hasSev = ['critical', 'high', 'medium', 'low'].every(k => k in sev);
    if (hasSev) score += 0.2; else issues.push('severity_breakdown missing or incomplete');

    const findings = es.top_findings || [];
    if (findings.length >= 2) score += 0.2;
    else issues.push(`Only ${findings.length} top_findings (need 2+)`);

    const chains = es.critical_attack_chains || [];
    const priorities = es.immediate_remediation_priorities || [];
    if (chains.length) score += 0.15; else issues.push('No critical_attack_chains');
    if (priorities.length) score += 0.15; else issues.push('No immediate_remediation_priorities');

    return _cr('executive_summary', score >= 0.7, score,
        `Executive summary: ${foundKeys.length}/${EXEC_SUMMARY_REQUIRED_KEYS.length} keys, ` +
        `${findings.length} finding(s), ${chains.length} chain(s), ` +
        `${priorities.length} priorit(ies).`,
        issues.slice(0, 5));
}

function check_common_variables(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('common_variables', false, 0.0, 'No report data.');
    const cv = report.common_variables || {};
    if (!cv || !Object.keys(cv).length) {
        return _cr('common_variables', false, 0.0,
            'No common_variables section.',
            ['Add common_variables with at least BASE_URL.']);
    }

    const hasBaseUrl = 'BASE_URL' in cv;
    const numVars = Object.keys(cv).length;
    const score = 0.6 * (hasBaseUrl ? 1 : 0) + 0.4 * Math.min(numVars / 3, 1.0);

    if (hasBaseUrl) {
        return _cr('common_variables', true, score,
            `${numVars} variable(s) defined including BASE_URL.`);
    }
    return _cr('common_variables', false, score,
        `${numVars} variable(s) but BASE_URL missing.`,
        ['Add BASE_URL to common_variables.']);
}

// -- PoC Quality Checks ------------------------------------------------------

function check_poc_id_integrity(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) {
        return _cr('poc_id_integrity', false, 0.0,
            'No poc_entries found.',
            ['Add poc_entries array with PoC objects.']);
    }

    const ids = entries.map(e => e.poc_id || '');
    const uniqueIds = new Set(ids);
    const duplicates = [...uniqueIds].filter(pid => ids.filter(i => i === pid).length > 1);
    const malformed = ids.filter(pid => !/^PoC-\d+[a-z]?$/.test(pid));

    const issues = [];
    let score = 1.0;
    if (duplicates.length) {
        score -= 0.4;
        issues.push(`Duplicate IDs: ${JSON.stringify(duplicates.sort())}`);
    }
    if (malformed.length) {
        score -= 0.3;
        issues.push(`Malformed IDs: ${JSON.stringify(malformed)}`);
    }

    return _cr('poc_id_integrity', score >= 0.7, Math.max(0.0, score),
        `${ids.length} PoC entries, ${uniqueIds.size} unique IDs. ` +
        `${duplicates.length} duplicate(s), ${malformed.length} malformed.`,
        issues);
}

function check_poc_entry_completeness(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('poc_entry_completeness', false, 0.0, 'No poc_entries found.');

    let complete = 0;
    const incomplete = [];

    for (const entry of entries) {
        const missing = POC_ENTRY_REQUIRED_FIELDS.filter(f => !(f in entry));
        if (!missing.length) {
            complete++;
        } else {
            incomplete.push(`${entry.poc_id || '?'}: missing ${JSON.stringify(missing)}`);
        }
    }

    const score = complete / entries.length;
    return _cr('poc_entry_completeness', score >= 0.8, score,
        `${complete}/${entries.length} entries have all ${POC_ENTRY_REQUIRED_FIELDS.length} required fields.`,
        incomplete.slice(0, 5));
}

function check_poc_commands_present(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('poc_commands_present', false, 0.0, 'No poc_entries found.');

    let pocsWithCmds = 0;
    let totalCmds = 0;
    let cmdsWithResults = 0;

    for (const entry of entries) {
        const cmds = entry.poc_commands || [];
        if (cmds.length) {
            pocsWithCmds++;
            totalCmds += cmds.length;
            for (const cmd of cmds) {
                const result = cmd.execution_result || {};
                if (result.response_body || result.status_code != null) {
                    cmdsWithResults++;
                }
            }
        }
    }

    const coverage = entries.length ? pocsWithCmds / entries.length : 0;
    const resultRate = totalCmds ? cmdsWithResults / totalCmds : 0;
    const score = 0.4 * Math.min(coverage / 0.7, 1.0) + 0.6 * resultRate;

    return _cr('poc_commands_present', totalCmds >= 3 && resultRate >= 0.5, score,
        `${totalCmds} command(s) across ${pocsWithCmds}/${entries.length} PoCs, ` +
        `${cmdsWithResults}/${totalCmds} with execution results.`);
}

function check_execution_evidence(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('execution_evidence', false, 0.0, 'No poc_entries found.');

    let statusCodesFound = 0;
    let bodiesFound = 0;
    let totalResults = 0;

    for (const entry of entries) {
        for (const cmd of (entry.poc_commands || [])) {
            const result = cmd.execution_result || {};
            totalResults++;
            if (result.status_code != null) statusCodesFound++;
            const body = result.response_body || '';
            if (body && body.length > 10) bodiesFound++;
        }
    }

    if (totalResults === 0) {
        return _cr('execution_evidence', false, 0.0,
            'No execution results found.',
            ['Add execution_result with status_code and response_body to poc_commands.']);
    }

    const statusRate = statusCodesFound / totalResults;
    const bodyRate = bodiesFound / totalResults;
    const score = 0.5 * statusRate + 0.5 * bodyRate;

    return _cr('execution_evidence', score >= 0.6, score,
        `${statusCodesFound}/${totalResults} results have status_code, ` +
        `${bodiesFound}/${totalResults} have substantive response_body.`);
}

function check_source_sink_refs(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('source_sink_refs', false, 0.0, 'No poc_entries found.');

    let completeRefs = 0;
    const uniqueFiles = new Set();

    for (const entry of entries) {
        const src = entry.source || {};
        const snk = entry.sink || {};
        const srcOk = !!(src.file_path && src.code);
        const snkOk = !!(snk.file_path && snk.code);
        if (srcOk && snkOk) completeRefs++;
        if (src.file_path) uniqueFiles.add(src.file_path);
        if (snk.file_path) uniqueFiles.add(snk.file_path);
    }

    const refRate = entries.length ? completeRefs / entries.length : 0;
    const fileScore = Math.min(uniqueFiles.size / 5, 1.0);
    const score = 0.6 * refRate + 0.4 * fileScore;

    return _cr('source_sink_refs', score >= 0.6, score,
        `${completeRefs}/${entries.length} entries have complete source+sink refs. ` +
        `${uniqueFiles.size} unique file(s) referenced.`);
}

function check_analysis_quality(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('analysis_quality', false, 0.0, 'No poc_entries found.');

    let good = 0;
    const issues = [];

    for (const entry of entries) {
        const pocId = entry.poc_id || '?';
        const analysis = entry.analysis || {};
        const why = entry.why_it_works || '';

        const hasConfirmed = 'confirmed' in analysis;
        const hasMarkers = (analysis.markers || []).length >= 2;
        const hasWhy = why.length >= 50;

        if (hasConfirmed && hasMarkers && hasWhy) {
            good++;
        } else {
            const missing = [];
            if (!hasConfirmed) missing.push('analysis.confirmed');
            if (!hasMarkers) missing.push('markers (need 2+)');
            if (!hasWhy) missing.push('why_it_works (need 50+ chars)');
            issues.push(`${pocId}: ${missing.join(', ')}`);
        }
    }

    const score = good / entries.length;
    return _cr('analysis_quality', score >= 0.7, score,
        `${good}/${entries.length} entries have full analysis ` +
        `(confirmed + markers + why_it_works).`,
        issues.slice(0, 5));
}

// -- MET Checks --------------------------------------------------------------

function check_met_compliance(ctx) {
    const entries = _getEntries(ctx);
    if (!entries.length) return _cr('met_compliance', false, 0.0, 'No poc_entries found.');

    let satisfied = 0;
    let partial = 0;
    let missingMet = 0;
    const partialWithoutBlocker = [];

    for (const entry of entries) {
        const pocId = entry.poc_id || '?';
        const met = entry.met_status || '';
        if (!met) { missingMet++; continue; }
        const metLower = met.toLowerCase();
        if (metLower.includes('satisfied')) {
            satisfied++;
        } else if (metLower.includes('partial') || metLower.includes('not reached')) {
            partial++;
            if (met.length < 20) partialWithoutBlocker.push(pocId);
        }
    }

    const total = entries.length;
    const tracked = satisfied + partial;
    let score = 0.0;
    score += 0.5 * (total ? tracked / total : 0);
    score += 0.3 * Math.min(satisfied / Math.max(total * 0.5, 1), 1.0);
    score += 0.2 * (partialWithoutBlocker.length === 0 ? 1.0 : 0.5);

    return _cr('met_compliance', score >= 0.5, score,
        `MET: ${satisfied} satisfied, ${partial} partial, ${missingMet} missing. ` +
        `${partialWithoutBlocker.length} partial(s) lack blocker detail.`,
        partialWithoutBlocker.map(pid => `${pid} needs blocker explanation`));
}

// -- Chaining Checks ---------------------------------------------------------

function check_chaining_register(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('chaining_register', false, 0.0, 'No report data.');
    const cr = report.chaining_register || [];
    if (!cr.length) {
        return _cr('chaining_register', false, 0.0,
            'No chaining_register entries.',
            ['Add chaining_register with extracted artifacts.']);
    }

    let complete = 0;
    let chainedCount = 0;

    for (const item of cr) {
        const missing = CHAINING_ENTRY_REQUIRED_FIELDS.filter(f => !(f in item));
        if (!missing.length) complete++;
        if (item.chained) chainedCount++;
    }

    const fieldRate = complete / cr.length;
    const chainedRate = cr.length ? chainedCount / cr.length : 0;
    const score = 0.5 * fieldRate + 0.3 * chainedRate + 0.2 * Math.min(cr.length / 3, 1.0);

    return _cr('chaining_register', score >= 0.5, score,
        `${cr.length} register entries, ${complete} complete, ` +
        `${chainedCount} marked as chained.`);
}

function check_compound_chains(ctx) {
    const chains = _getChains(ctx);
    if (!chains.length) {
        return _cr('compound_chains', false, 0.0,
            'No chain_entries found.',
            ['Add chain_entries with Chain-XX demonstrations.']);
    }

    let complete = 0;
    const incomplete = [];

    for (const chain of chains) {
        const chainId = chain.chain_id || '?';
        const missing = CHAIN_ENTRY_REQUIRED_FIELDS.filter(f => !(f in chain));

        const hasSteps = (chain.steps || []).length >= 2;
        const hasScript = (chain.compound_script || '').length >= 20;
        const hasResult = (chain.execution_result || '').length >= 20;

        if (!missing.length && hasSteps && hasScript && hasResult) {
            complete++;
        } else {
            const problems = [];
            if (missing.length) problems.push(`missing fields: ${JSON.stringify(missing)}`);
            if (!hasSteps) problems.push('needs 2+ steps');
            if (!hasScript) problems.push('compound_script too short');
            if (!hasResult) problems.push('execution_result too short');
            incomplete.push(`${chainId}: ${problems.join('; ')}`);
        }
    }

    const score = 0.5 * Math.min(chains.length / 2, 1.0) + 0.5 * (complete / chains.length);

    return _cr('compound_chains', score >= 0.5, score,
        `${chains.length} chain(s), ${complete}/${chains.length} fully complete.`,
        incomplete.slice(0, 5));
}

// -- Summary Checks ----------------------------------------------------------

function check_summary_matrix(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('summary_matrix', false, 0.0, 'No report data.');
    const matrix = report.summary_matrix || [];
    if (!matrix.length) {
        return _cr('summary_matrix', false, 0.0,
            'No summary_matrix entries.',
            ['Add summary_matrix array with entry per PoC.']);
    }

    let complete = 0;
    for (const item of matrix) {
        const missing = MATRIX_ENTRY_REQUIRED_FIELDS.filter(f => !(f in item));
        if (!missing.length) complete++;
    }

    const matrixIds = new Set(matrix.map(item => item.poc_id));
    const entryIds = new Set(_getEntries(ctx).map(e => e.poc_id));
    let coverage;
    if (entryIds.size) {
        let overlap = 0;
        for (const id of matrixIds) { if (entryIds.has(id)) overlap++; }
        coverage = overlap / entryIds.size;
    } else {
        coverage = matrix.length ? 1.0 : 0.0;
    }

    const fieldRate = complete / matrix.length;
    const score = 0.5 * coverage + 0.5 * fieldRate;

    return _cr('summary_matrix', score >= 0.7, score,
        `${matrix.length} matrix entries, ${complete} complete, ` +
        `${Math.round(coverage * 100)}% coverage of PoC entries.`);
}

function check_not_exploitable(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('not_exploitable', false, 0.0, 'No report data.');
    const ne = report.not_exploitable || [];

    if (!ne.length) {
        return _cr('not_exploitable', true, 0.8,
            'No not_exploitable entries (acceptable if all findings were exploitable).');
    }

    const required = ['finding', 'source', 'blocker', 'met_status'];
    let complete = 0;
    for (const item of ne) {
        const missing = required.filter(f => !item[f]);
        if (!missing.length) complete++;
    }

    const score = ne.length ? complete / ne.length : 1.0;
    return _cr('not_exploitable', score >= 0.7, score,
        `${ne.length} not-exploitable entries, ${complete} with all required fields.`);
}

function check_final_summary(ctx) {
    const report = _getReport(ctx);
    if (!report) return _cr('final_summary', false, 0.0, 'No report data.');
    const fs = report.final_summary || {};
    if (!fs || !Object.keys(fs).length) {
        return _cr('final_summary', false, 0.0,
            'No final_summary section.',
            ['Add final_summary with aggregate statistics.']);
    }

    const required = [
        'total_vulnerabilities_analyzed', 'pocs_generated',
        'executed_safely', 'severity_breakdown',
        'met_satisfied', 'met_partial', 'met_blocked',
        'chains_executed', 'chains_blocked',
    ];
    const found = required.filter(k => k in fs);
    let score = found.length / required.length;

    const entries = _getEntries(ctx);
    const pocsGenerated = fs.pocs_generated || 0;
    if (entries.length && pocsGenerated > 0) {
        if (Math.abs(pocsGenerated - entries.length) > 2) {
            score -= 0.1;
        }
    }

    return _cr('final_summary', score >= 0.7, Math.max(0.0, score),
        `Final summary: ${found.length}/${required.length} fields present. ` +
        `pocs_generated=${pocsGenerated}, actual entries=${entries.length}.`);
}

// -- Judge Configuration -----------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `\
You are a senior offensive security engineer evaluating the output of an
automated PoC Execution agent. This agent's job is to:
1. Take vulnerability findings from upstream analysis agents
2. Develop and execute live proof-of-concept exploits
3. Demonstrate compound attack chains
4. Maintain a Chaining Register of extracted artifacts
5. Track Minimum Exploitation Tier (MET) compliance

The deliverable is a JSON report with PoC entries (each with commands,
live execution results, and analysis), compound chain entries, a chaining
register, and a summary matrix.

## What Makes a Good PoC Execution Report

A HIGH-QUALITY report:
- Demonstrates **real exploitation with live results**, not theoretical claims
- Shows **actual HTTP responses** with status codes and response bodies
- Provides **executable commands** that reproduce findings
- Builds **compound attack chains** showing realistic multi-step scenarios
- Maintains a **disciplined chaining register** feeding artifacts forward
- Traces **source->sink code paths** with file paths and line references
- Properly marks **MET satisfaction** with evidence
- Documents **non-exploitable findings** with clear reasoning
- Marks **destructive PoCs** as unsafe and does not execute them

A POOR report:
- Claims vulnerabilities without showing live execution evidence
- Has commands that don't match the analysis
- Lacks HTTP status codes and response bodies
- Has no compound chains or chaining register
- Missing file path code references in source/sink
- No MET tracking
- Executes destructive payloads without safety marking

## Scoring Rubric (per criterion)

5 = Exceptional: Live proof with clear evidence. Senior pentester would trust these results.
4 = Good: Solid execution evidence with minor gaps.
3 = Adequate: Basic PoCs present but lacking depth or rigor.
2 = Below Expectations: Mostly theoretical, weak evidence.
1 = Poor: No real execution, boilerplate claims.

Evaluate honestly and critically. The purpose is to drive continuous improvement. Do not make suggestions that will not add measureable improvement. Do not make suggestions for the sake of making suggestions.
`;

const JUDGE_CRITERIA_PROMPT = `\
1. **Exploitation Rigor** (max 5):
   Do PoCs demonstrate real exploitation with live results, not theoretical claims?
   Are MET requirements met or are blockers properly documented? Are multiple
   attack variants explored (escalation, bypass, blind injection)?

2. **Evidence Quality** (max 5):
   Are executable commands provided? Are HTTP responses shown with
   status codes and response bodies? Is the confirmed boolean accurate?
   Can a reader reproduce the findings from the commands alone?

3. **Attack Chain Depth** (max 5):
   Are compound chains demonstrated end-to-end with compound scripts?
   Do they show realistic multi-step attacker scenarios (e.g., unauth -> admin ->
   data extraction)? Are chain prerequisites and steps documented?

4. **Chaining Discipline** (max 5):
   Is the chaining register actively maintained? Are extracted artifacts
   (cookies, tokens, IDs) fed into downstream PoCs? Is every entry marked with
   chained status?

5. **Code-Grounded Analysis** (max 5):
   Do why_it_works explanations trace exact code paths with file:line references?
   Are source/sink objects populated with file paths and code snippets?
   Is the vulnerability cause explained at the code level, not just the
   behavior level?

6. **Safety and Completeness** (max 5):
   Are destructive PoCs properly marked and NOT executed? Is the summary matrix
   accurate and complete (all PoC entries accounted for)? Are non-exploitable
   findings documented with clear reasoning and blockers?
`;

// -- Check Lists -------------------------------------------------------------

const _JSON_CHECKS = [
    // Structure
    check_top_level_structure,
    check_metadata,
    check_executive_summary,
    check_common_variables,
    // PoC quality
    check_poc_id_integrity,
    check_poc_entry_completeness,
    check_poc_commands_present,
    check_execution_evidence,
    check_source_sink_refs,
    check_analysis_quality,
    // MET
    check_met_compliance,
    // Chaining
    check_chaining_register,
    check_compound_chains,
    // Summary
    check_summary_matrix,
    check_not_exploitable,
    check_final_summary,
];

// -- Registration ------------------------------------------------------------

register_agent(new AgentEvalConfig({
    agent_name: 'poc',
    display_name: 'POC EXECUTION',
    deliverable_format: 'json',
    objective_checks_json: _JSON_CHECKS,
    judge_system_prompt: JUDGE_SYSTEM_PROMPT,
    judge_criteria_prompt: JUDGE_CRITERIA_PROMPT,
}));
