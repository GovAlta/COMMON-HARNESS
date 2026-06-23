/**
 * Orchestrator: runs objective + subjective eval for any registered agent.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CheckResult, EvalContext, EvalReport } from './types.js';
import { parse_sections } from './parsing.js';
import { build_suffix_index } from './filetree.js';
import { build_report, report_to_dict, print_report } from './scoring.js';
import { SubjectiveEvaluator } from './subjective.js';
import { get_agent_config, list_agents } from './agents/index.js';

// -- Internal helpers --------------------------------------------------------

/**
 * Auto-detect markdown vs JSON.  Returns [fmt, json_data_or_null].
 * @param {string} content
 * @returns {[string, object|null]}
 */
function _detectFormat(content) {
    try {
        const data = JSON.parse(content);
        return ['json', data];
    } catch {
        return ['markdown', null];
    }
}

/**
 * Parse content and build EvalContext for check functions.
 * @param {string} content
 * @param {import('./agents/index.js').AgentEvalConfig} config
 * @param {string|null} targetPath
 * @returns {EvalContext}
 */
function _buildContext(content, config, targetPath) {
    const [fmt, jsonData] = _detectFormat(content);

    let sections = {};
    let rawSections = {};
    if (fmt === 'markdown') {
        [sections, rawSections] = parse_sections(content, config.expected_sections);
    }

    let suffixIndex = null;
    if (targetPath) {
        console.log(`Building file-tree suffix index for: ${targetPath}`);
        suffixIndex = build_suffix_index(targetPath);
        console.log(`Suffix index: ${suffixIndex.size} entries`);
    }

    return new EvalContext({
        raw_content: content,
        sections,
        raw_sections: rawSections,
        json_data: jsonData,
        target_path: targetPath,
        suffix_index: suffixIndex,
        fmt,
    });
}

/**
 * Run all objective checks for the detected format.
 * @param {EvalContext} ctx
 * @param {import('./agents/index.js').AgentEvalConfig} config
 * @returns {CheckResult[]}
 */
function _runObjective(ctx, config) {
    const checks = ctx.fmt === 'json'
        ? config.objective_checks_json
        : config.objective_checks_markdown;
    const results = [];
    for (const checkFn of checks) {
        try {
            results.push(...checkFn(ctx));
        } catch (e) {
            console.error(`Check ${checkFn.name} failed: ${e}`);
            results.push(new CheckResult({
                name: checkFn.name,
                passed: false, score: 0.0,
                details: `Check raised exception: ${e}`,
                category: 'objective',
            }));
        }
    }
    return results;
}

/**
 * Run LLM judge evaluation.
 * @param {string} content
 * @param {string} fmt
 * @param {import('./agents/index.js').AgentEvalConfig} config
 * @param {string|null} [modelOverride=null]
 * @returns {Promise<[CheckResult[], object|null]>}
 */
async function _runSubjective(content, fmt, config, modelOverride = null) {
    if (!config.judge_system_prompt || !config.judge_criteria_prompt) {
        console.log('No subjective criteria configured for this agent.');
        return [[], null];
    }

    const evaluator = new SubjectiveEvaluator({
        content,
        fmt,
        system_prompt: config.judge_system_prompt,
        criteria_prompt: config.judge_criteria_prompt,
        model: modelOverride || config.judge_model,
    });
    return await evaluator.evaluate();
}

// -- Public API --------------------------------------------------------------

/**
 * Full evaluation pipeline for any agent.  Callable from code or CLI.
 * @param {string} agentName
 * @param {string} deliverablePath
 * @param {string|null} [targetPath=null]
 * @param {boolean} [skipSubjective=false]
 * @param {string|null} [judgeModel=null]
 * @param {string|null} [outputPath=null]
 * @returns {Promise<EvalReport>}
 */
export async function run_eval(
    agentName,
    deliverablePath,
    targetPath = null,
    skipSubjective = false,
    judgeModel = null,
    outputPath = null,
) {
    const config = get_agent_config(agentName);

    console.log(`Loading deliverable: ${deliverablePath}`);
    const content = fs.readFileSync(deliverablePath, 'utf-8');

    if (!content.trim()) {
        throw new Error('Deliverable file is empty.');
    }

    // Objective
    console.log(`Running objective evaluation for ${config.display_name}...`);
    const ctx = _buildContext(content, config, targetPath);
    const objResults = _runObjective(ctx, config);
    const passed = objResults.filter(r => r.passed).length;
    console.log(`Objective: ${passed}/${objResults.length} checks passed`);

    // Subjective
    let subjResults = [];
    let rawJudge = null;
    if (!skipSubjective) {
        console.log('Running subjective evaluation (LLM judge)...');
        [subjResults, rawJudge] = await _runSubjective(
            content, ctx.fmt, config, judgeModel);
        if (subjResults.length) {
            const passedS = subjResults.filter(r => r.passed).length;
            console.log(`Subjective: ${passedS}/${subjResults.length} checks passed`);
        } else {
            console.warn('Subjective evaluation returned no results.');
        }
    } else {
        console.log('Skipping subjective evaluation (--skip-subjective)');
    }

    // Report
    const allChecks = [...objResults, ...subjResults];
    const report = build_report({
        agent_name: config.agent_name,
        deliverable_path: deliverablePath,
        target_path: targetPath,
        detected_format: ctx.fmt,
        checks: allChecks,
        raw_judge: rawJudge,
        objective_weight: config.objective_weight,
        subjective_weight: config.subjective_weight,
    });
    print_report(report);

    // Persist -- add tracking metadata
    const reportDict = report_to_dict(report);
    reportDict.deliverable_hash = createHash('sha256')
        .update(content, 'utf-8').digest('hex').slice(0, 8);
    reportDict.config_snapshot = {
        objective_weight: config.objective_weight,
        subjective_weight: config.subjective_weight,
        judge_model: judgeModel || config.judge_model,
        skip_subjective: skipSubjective,
    };
    if (!outputPath) {
        const base = path.basename(deliverablePath, path.extname(deliverablePath));
        const evalsDir = path.normalize(path.join(
            path.dirname(deliverablePath) || '.', '..', 'evals'));
        const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        outputPath = path.join(evalsDir, `eval_${base}_${ts}.json`);
    }
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(reportDict, null, 2), 'utf-8');
    console.log(`Evaluation report saved to: ${outputPath}`);

    return report;
}

// -- CLI helpers -------------------------------------------------------------

/**
 * Build argument spec for CLI parsing.
 * @param {string|null} [agentName=null]
 * @returns {{ description: string, args: object }}
 */
export function build_cli_parser(agentName = null) {
    return {
        description: agentName
            ? `Evaluate ${agentName} agent deliverable`
            : 'Evaluate a security pipeline agent deliverable',
        agentName,
    };
}

/**
 * Parse eval CLI args from process.argv.
 * @param {string[]} argv - The argv slice after agent name has been consumed
 * @returns {{ deliverable: string, target: string|null, skip_subjective: boolean, judge_model: string|null, output: string|null }}
 */
export function parse_eval_args(argv) {
    let deliverable = null;
    let target = null;
    let skipSubjective = false;
    let judgeModel = null;
    let output = null;

    const args = [...argv];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target' && i + 1 < args.length) {
            target = args[++i];
        } else if (args[i] === '--skip-subjective') {
            skipSubjective = true;
        } else if (args[i] === '--judge-model' && i + 1 < args.length) {
            judgeModel = args[++i];
        } else if ((args[i] === '--output' || args[i] === '-o') && i + 1 < args.length) {
            output = args[++i];
        } else if (!args[i].startsWith('-') && !deliverable) {
            deliverable = args[i];
        }
    }

    return { deliverable, target, skip_subjective: skipSubjective, judge_model: judgeModel, output };
}

/**
 * CLI entry point for a specific agent eval.
 * @param {string} agentName
 */
export async function cli_main(agentName) {
    const args = parse_eval_args(process.argv.slice(2));

    if (!args.deliverable) {
        console.error(`Usage: node cli.js ${agentName} <deliverable> [options]`);
        process.exit(1);
    }

    if (!fs.existsSync(args.deliverable)) {
        console.error(`Deliverable not found: ${args.deliverable}`);
        process.exit(1);
    }
    if (args.target && !fs.existsSync(args.target)) {
        console.error(`Target path not found: ${args.target}`);
        process.exit(1);
    }

    await run_eval(
        agentName,
        args.deliverable,
        args.target,
        args.skip_subjective,
        args.judge_model,
        args.output,
    );
}
