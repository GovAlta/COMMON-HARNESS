/**
 * Evaluation checks for CODE-ANALYSIS agent deliverables (JSON format).
 */

import { CheckResult, EvalContext } from '../types.js';
import { path_in_index } from '../filetree.js';
import { AgentEvalConfig, register_agent } from './index.js';

// -- Constants ---------------------------------------------------------------

const MIN_EXECUTIVE_SUMMARY_CHARS = 200;
const MIN_ANALYSIS_CHARS = 150;

const SECURITY_TERMS = [
    'vulnerable', 'attack', 'auth', 'endpoint', 'risk', 'security',
    'injection', 'exposure', 'sensitive', 'credential',
];

const REQUIRED_TOP_LEVEL_FIELDS = [
    'executive_summary', 'technology_stack', 'authentication',
    'attack_surface', 'critical_file_paths', 'xss_sinks', 'ssrf_sinks',
];

const OPTIONAL_TOP_LEVEL_FIELDS = [
    'data_security', 'infrastructure_security', 'codebase_overview',
];

const CRITICAL_FILE_PATH_CATEGORIES = [
    'configuration', 'authentication_authorization', 'api_routing',
    'dependency_manifests',
];

// -- Helper ------------------------------------------------------------------

function _cr(name, passed, score, details, suggestions = []) {
    return [new CheckResult({
        name, passed, score: Math.max(0.0, Math.min(1.0, score)),
        details, category: 'objective', suggestions,
    })];
}

function _countTermHits(text, terms) {
    const lower = text.toLowerCase();
    return terms.filter(t => lower.includes(t.toLowerCase())).length;
}

// -- JSON Checks -------------------------------------------------------------

function check_schema_required_fields(ctx) {
    const { code_analysis_output_schema } = await_import_schemas();
    const data = ctx.json_data;
    if (!data) return _cr('schema_required_fields', false, 0.0, 'No JSON data.');

    const required = code_analysis_output_schema.required || [];
    const missing = required.filter(f => !(f in data));
    if (missing.length) {
        return _cr('schema_required_fields', false,
            1 - missing.length / required.length,
            `Missing required fields: ${JSON.stringify(missing)}`,
            missing.map(f => `Populate "${f}".`));
    }
    return _cr('schema_required_fields', true, 1.0,
        `All ${required.length} required fields present.`);
}

// Lazy import for output_schemas to avoid circular issues
let _cachedSchemas = null;
function await_import_schemas() {
    if (!_cachedSchemas) {
        // Dynamic import would be async; use a sync approach with pre-loaded schema
        // The required fields are known constants, so inline them
        _cachedSchemas = {
            code_analysis_output_schema: {
                required: REQUIRED_TOP_LEVEL_FIELDS,
            },
        };
    }
    return _cachedSchemas;
}

function check_executive_summary(ctx) {
    const data = ctx.json_data || {};
    const summary = data.executive_summary || '';
    const length = summary.length;

    if (length < MIN_EXECUTIVE_SUMMARY_CHARS) {
        return _cr(
            'executive_summary_substance', false,
            MIN_EXECUTIVE_SUMMARY_CHARS ? length / MIN_EXECUTIVE_SUMMARY_CHARS : 0,
            `Executive summary too short (${length} chars, need ${MIN_EXECUTIVE_SUMMARY_CHARS}+).`,
            ['Expand with specific security posture, key attack surfaces, critical findings.'],
        );
    }

    const hits = _countTermHits(summary, SECURITY_TERMS);
    const termCoverage = hits / SECURITY_TERMS.length;
    const score = Math.min(1.0, 0.5 + termCoverage * 0.5);
    return _cr(
        'executive_summary_substance', score >= 0.7, score,
        `Executive summary: ${length} chars, ${hits}/${SECURITY_TERMS.length} security terms present.`,
    );
}

function check_technology_stack(ctx) {
    const data = ctx.json_data || {};
    const ts = data.technology_stack || {};
    if (typeof ts !== 'object' || ts === null) {
        return _cr('technology_stack', false, 0.0, 'technology_stack is not an object.');
    }

    const langs = ts.languages || [];
    const fws = ts.frameworks || [];
    const arch = ts.architectural_pattern || '';
    const components = ts.critical_security_components || [];

    let score = 0.0;
    const issues = [];

    if (langs.length) score += 0.3; else issues.push('No languages listed');
    if (fws.length) score += 0.3; else issues.push('No frameworks listed');
    if (arch && arch.length > 20) score += 0.2; else issues.push('architectural_pattern missing or too brief');
    if (components.length) score += 0.2; else issues.push('No critical_security_components listed');

    return _cr('technology_stack', score >= 0.6, score,
        `${langs.length} language(s), ${fws.length} framework(s), ` +
        `arch pattern: ${!!arch}, ${components.length} security component(s).`,
        issues.map(i => `Fix: ${i}`));
}

function check_authentication(ctx) {
    const data = ctx.json_data || {};
    const auth = data.authentication || {};
    if (typeof auth !== 'object' || auth === null) {
        return _cr('authentication_analysis', false, 0.0, 'authentication field is not an object.');
    }

    let score = 0.0;
    const issues = [];

    const mechs = auth.mechanisms || [];
    if (mechs.length) score += 0.25; else issues.push('No auth mechanisms listed');

    const endpoints = auth.auth_endpoints || [];
    if (endpoints.length) score += 0.25; else issues.push('No auth endpoints listed');

    const analysis = auth.analysis || '';
    if (analysis.length >= MIN_ANALYSIS_CHARS) score += 0.3;
    else issues.push(`analysis too brief (${analysis.length} chars, need ${MIN_ANALYSIS_CHARS}+)`);

    const sessionLoc = auth.session_config_location || '';
    if (sessionLoc) score += 0.2; else issues.push('No session_config_location provided');

    return _cr('authentication_analysis', score >= 0.7, score,
        `${mechs.length} mechanism(s), ${endpoints.length} endpoint(s), ` +
        `analysis: ${analysis.length} chars, session_config: ${!!sessionLoc}.`,
        issues.map(i => `Fix: ${i}`));
}

function check_attack_surface(ctx) {
    const data = ctx.json_data || {};
    const surface = data.attack_surface || {};
    if (typeof surface !== 'object' || surface === null) {
        return _cr('attack_surface_populated', false, 0.0, 'attack_surface is not an object.');
    }

    const entries = surface.entry_points || [];
    if (!entries.length) {
        return _cr('attack_surface_populated', false, 0.0,
            'No entry points listed.',
            ['Populate entry_points array with network-accessible endpoints.']);
    }

    let complete = 0;
    for (const ep of entries) {
        if (typeof ep === 'object' && ep && ep.path && 'auth_required' in ep && ep.risk_level) {
            complete++;
        }
    }

    const completeness = entries.length ? complete / entries.length : 0;
    const score = Math.min(1.0, 0.4 + 0.3 * Math.min(entries.length, 10) / 10 + 0.3 * completeness);
    return _cr('attack_surface_populated', true, score,
        `${entries.length} entry point(s), ${complete}/${entries.length} with complete fields.`);
}

function check_unauth_endpoint_audit(ctx) {
    const data = ctx.json_data || {};
    const surface = data.attack_surface || {};
    const unauth = surface.unauthenticated_endpoints || [];

    if (!unauth.length) {
        const entries = surface.entry_points || [];
        const noAuth = entries.filter(e => typeof e === 'object' && e && e.auth_required === false);
        if (noAuth.length) {
            return _cr('unauth_endpoint_audit', false, 0.2,
                `${noAuth.length} entry point(s) with auth_required=false ` +
                `but unauthenticated_endpoints array is empty.`,
                ['Populate unauthenticated_endpoints with abuse scenarios.']);
        }
        return _cr('unauth_endpoint_audit', true, 0.7,
            'No unauthenticated endpoints found (all require auth).');
    }

    let withAbuse = 0;
    let withOperation = 0;
    for (const ep of unauth) {
        if (typeof ep === 'object' && ep) {
            if (ep.abuse_scenarios && ep.abuse_scenarios.length > 0) withAbuse++;
            if (ep.privileged_operation) withOperation++;
        }
    }

    const abuseRatio = unauth.length ? withAbuse / unauth.length : 0;
    const opRatio = unauth.length ? withOperation / unauth.length : 0;
    const score = Math.min(1.0, 0.4 + 0.3 * abuseRatio + 0.3 * opRatio);
    return _cr('unauth_endpoint_audit', score >= 0.7, score,
        `${unauth.length} unauth endpoint(s): ${withAbuse} with abuse scenarios, ` +
        `${withOperation} with privileged_operation.`);
}

function check_narrative_fields(ctx) {
    const data = ctx.json_data || {};
    const fields = ['data_security', 'infrastructure_security', 'codebase_overview'];
    let substantive = 0;
    const thin = [];

    for (const field of fields) {
        const content = data[field] || '';
        if (typeof content === 'string' && content.length >= MIN_ANALYSIS_CHARS) {
            substantive++;
        } else {
            thin.push(field);
        }
    }

    const score = fields.length ? substantive / fields.length : 0;
    return _cr('narrative_depth', score >= 0.6, score,
        `${substantive}/${fields.length} narrative fields have >=${MIN_ANALYSIS_CHARS} chars of content.`,
        thin.map(f => `Expand field: ${f}`));
}

function check_critical_file_paths(ctx) {
    const data = ctx.json_data || {};
    const cfp = data.critical_file_paths || {};
    if (typeof cfp !== 'object' || cfp === null) {
        return _cr('critical_file_paths', false, 0.0, 'critical_file_paths is not an object.');
    }

    let requiredPresent = 0;
    const allPaths = new Set();
    const issues = [];

    for (const cat of CRITICAL_FILE_PATH_CATEGORIES) {
        const paths = cfp[cat] || [];
        if (Array.isArray(paths) && paths.length) {
            requiredPresent++;
            for (const p of paths) allPaths.add(p);
        } else {
            issues.push(`Required category "${cat}" is empty`);
        }
    }

    for (const [, val] of Object.entries(cfp)) {
        if (Array.isArray(val)) {
            for (const p of val) allPaths.add(p);
        }
    }

    const reqScore = requiredPresent / CRITICAL_FILE_PATH_CATEGORIES.length;
    const pathScore = Math.min(allPaths.size / 10, 1.0);
    const score = 0.5 * reqScore + 0.5 * pathScore;

    return _cr('critical_file_paths', score >= 0.6, score,
        `${requiredPresent}/${CRITICAL_FILE_PATH_CATEGORIES.length} required categories populated, ` +
        `${allPaths.size} unique file paths total.`,
        issues);
}

function check_xss_sinks(ctx) {
    const data = ctx.json_data || {};
    const sinks = data.xss_sinks;

    if (sinks === undefined || sinks === null) {
        return _cr('xss_sinks_documented', false, 0.0,
            'xss_sinks field missing.',
            ['Add xss_sinks array (empty if none found).']);
    }

    if (!Array.isArray(sinks)) {
        return _cr('xss_sinks_documented', false, 0.0, 'xss_sinks is not an array.');
    }

    if (sinks.length === 0) {
        return _cr('xss_sinks_documented', true, 0.7,
            'xss_sinks is empty (valid if no web frontend / no sinks found).');
    }

    let complete = 0;
    for (const s of sinks) {
        if (typeof s === 'object' && s && s.file_path && s.sink_type && s.context) {
            complete++;
        }
    }

    const score = Math.min(1.0, 0.6 + 0.4 * (complete / sinks.length));
    return _cr('xss_sinks_documented', true, score,
        `${sinks.length} XSS sink(s), ${complete}/${sinks.length} with complete fields ` +
        `(file_path + sink_type + context).`);
}

function check_ssrf_sinks(ctx) {
    const data = ctx.json_data || {};
    const sinks = data.ssrf_sinks;

    if (sinks === undefined || sinks === null) {
        return _cr('ssrf_sinks_documented', false, 0.0,
            'ssrf_sinks field missing.',
            ['Add ssrf_sinks array (empty if none found).']);
    }

    if (!Array.isArray(sinks)) {
        return _cr('ssrf_sinks_documented', false, 0.0, 'ssrf_sinks is not an array.');
    }

    if (sinks.length === 0) {
        return _cr('ssrf_sinks_documented', true, 0.7,
            'ssrf_sinks is empty (valid if no outbound requests / no sinks found).');
    }

    let complete = 0;
    for (const s of sinks) {
        if (typeof s === 'object' && s && s.file_path && s.category) {
            complete++;
        }
    }

    const score = Math.min(1.0, 0.6 + 0.4 * (complete / sinks.length));
    return _cr('ssrf_sinks_documented', true, score,
        `${sinks.length} SSRF sink(s), ${complete}/${sinks.length} with complete fields ` +
        `(file_path + category).`);
}

function check_file_path_density(ctx) {
    const data = ctx.json_data || {};
    const allPaths = new Set();

    for (const catPaths of Object.values(data.critical_file_paths || {})) {
        if (Array.isArray(catPaths)) {
            for (const p of catPaths) { if (typeof p === 'string') allPaths.add(p); }
        }
    }
    for (const sink of (data.xss_sinks || [])) {
        if (typeof sink === 'object' && sink && sink.file_path) allPaths.add(sink.file_path);
    }
    for (const sink of (data.ssrf_sinks || [])) {
        if (typeof sink === 'object' && sink && sink.file_path) allPaths.add(sink.file_path);
    }

    const count = allPaths.size;
    if (count === 0) {
        return _cr('file_path_density', false, 0.0,
            'No file paths referenced in structured fields.',
            ['Populate critical_file_paths, xss_sinks, ssrf_sinks with file paths.']);
    } else if (count < 5) {
        return _cr('file_path_density', false, count / 10,
            `Only ${count} unique file path(s) — likely too few.`,
            ['A thorough analysis should reference 10+ distinct files.']);
    } else {
        const score = Math.min(1.0, 0.5 + 0.5 * Math.min(count, 20) / 20);
        return _cr('file_path_density', true, score,
            `${count} unique file paths across JSON fields.`);
    }
}

function check_file_paths_exist(ctx) {
    if (!ctx.target_path || ctx.suffix_index === null) return [];

    const data = ctx.json_data || {};
    const allPaths = new Set();

    for (const catPaths of Object.values(data.critical_file_paths || {})) {
        if (Array.isArray(catPaths)) {
            for (const p of catPaths) { if (typeof p === 'string') allPaths.add(p); }
        }
    }
    for (const sink of (data.xss_sinks || [])) {
        if (typeof sink === 'object' && sink && sink.file_path) allPaths.add(sink.file_path);
    }
    for (const sink of (data.ssrf_sinks || [])) {
        if (typeof sink === 'object' && sink && sink.file_path) allPaths.add(sink.file_path);
    }

    if (!allPaths.size) return [];

    let existing = 0;
    for (const p of allPaths) {
        if (path_in_index(p, ctx.suffix_index)) existing++;
    }
    const score = existing / allPaths.size;
    const missing = [...allPaths].filter(p => !path_in_index(p, ctx.suffix_index)).sort().slice(0, 10);
    return _cr('file_paths_exist', score >= 0.6, score,
        `${existing}/${allPaths.size} file paths exist in target.`,
        missing.map(p => `Not found: ${p}`));
}

// -- Judge Configuration -----------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `\
You are a senior security assessment quality evaluator. You evaluate the output
of an automated security code analysis agent whose mission is to produce
foundational intelligence for penetration testers.

The agent's deliverable is a structured JSON report with fields for: executive_summary,
technology_stack, authentication, data_security, attack_surface, infrastructure_security,
codebase_overview, critical_file_paths, xss_sinks, and ssrf_sinks.

## What Makes a Good Code Analysis Report

A HIGH-QUALITY report:
- Provides **specific, code-grounded findings** (file paths, line numbers, code snippets)
- Identifies **concrete attack surfaces** with endpoint details and HTTP methods
- Analyzes **authentication and authorization flows** with bypass scenarios
- Assesses **trust boundaries** and privilege escalation paths
- Flags **unauthenticated endpoints** performing privileged operations with abuse scenarios
- Documents **XSS and SSRF sinks** with exact locations
- Is **immediately actionable** for penetration testers — they can start testing from it
- Maintains **scope discipline** — only network-accessible components, not CLI/build tools
- Demonstrates **security expertise** in reasoning, not just listing components

A POOR report:
- Lists technologies without security analysis
- Gives generic OWASP-style advice without code-specific detail
- Misses major attack surfaces or authentication flows
- Includes out-of-scope components (CLI tools, build scripts) as entry points
- Has empty or placeholder fields
- Lacks file paths or line numbers
- Conflates architectural description with security analysis

## Scoring Rubric (per criterion)

5 = Exceptional: Thorough, specific, actionable, code-grounded. Senior pentester finds it highly useful.
4 = Good: Substantive analysis with specific findings. Minor gaps.
3 = Adequate: Covers major points but lacks depth/specificity. Pentester needs significant extra work.
2 = Below Expectations: Surface-level or generic. Missing key areas. Limited actionability.
1 = Poor: Minimal, boilerplate, or inaccurate. Not useful for a penetration test.

Evaluate honestly and critically. The purpose is to drive continuous improvement.
`;

const JUDGE_CRITERIA_PROMPT = `\
1. **Executive Summary Quality** (max 5):
   Does the executive summary provide a substantive, application-specific security
   posture assessment? Does it highlight the most critical attack surfaces and
   architectural security decisions? Is it written from an attacker perspective?

2. **Authentication Analysis Thoroughness** (max 5):
   Does the authentication object identify all auth mechanisms? List specific auth
   endpoints (login, logout, refresh, password reset)? Provide session_config_location
   with file/line references? Discuss bypass scenarios in the analysis field? Flag
   endpoints using elevated credentials without caller authentication?

3. **Attack Surface Completeness** (max 5):
   Are network-accessible entry_points comprehensively identified? Is scope discipline
   maintained (no CLI/build tools)? Are unauthenticated_endpoints populated with specific
   abuse_scenarios and privileged_operations? Are HTTP methods documented?

4. **Actionability for Penetration Testers** (max 5):
   Could a pentester start testing immediately from this report? Are findings specific
   enough (file paths, endpoints, parameters, payloads)? Are risk levels reasonable
   and differentiated? Are the attack_surface entries usable as test targets?

5. **Security Reasoning Depth** (max 5):
   Does the analysis go beyond component listing to reason about security implications?
   Are trust boundaries identified? Are data flow risks analyzed in data_security?
   Is reasoning code-grounded (citing specific files/code) rather than generic?

6. **Sink Analysis Quality** (max 5):
   Are XSS and SSRF sinks identified with precise locations (file_path + line_number)?
   Are they properly categorized by context/category? Is analysis focused on
   network-accessible sinks only? Are the sinks' relationships to user input traced
   in their descriptions?
`;

// -- Check List --------------------------------------------------------------

const _JSON_CHECKS = [
    check_schema_required_fields,
    check_executive_summary,
    check_technology_stack,
    check_authentication,
    check_attack_surface,
    check_unauth_endpoint_audit,
    check_narrative_fields,
    check_critical_file_paths,
    check_xss_sinks,
    check_ssrf_sinks,
    check_file_path_density,
    check_file_paths_exist,
];

// -- Registration ------------------------------------------------------------

register_agent(new AgentEvalConfig({
    agent_name: 'code-analysis',
    display_name: 'CODE ANALYSIS',
    deliverable_format: 'json',
    objective_checks_json: _JSON_CHECKS,
    judge_system_prompt: JUDGE_SYSTEM_PROMPT,
    judge_criteria_prompt: JUDGE_CRITERIA_PROMPT,
}));
