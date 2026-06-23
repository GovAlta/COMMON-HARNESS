#!/usr/bin/env node
/**
 * Security analysis pipeline using Claude agents.
 *
 * NOTE: Requires ClaudeCode to be installed locally, and for you to be
 * authenticated and authorized with your account!
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    code_analysis_output_schema,
    poc_output_schema,
    recommendation_output_schema,
    recon_output_schema,
} from './output_schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLAUDE_DIR = path.join(__dirname, '..', 'skills');
const DELIVERABLES_DIR = path.join(process.cwd(), 'deliverables');

const PIPELINE_ORDER = ['recon', 'code-analysis', 'poc', 'recommendation'];
const PHASE1_PARALLEL = new Set(['code-analysis', 'recon']);
// PHASE2_PARALLEL removed -- sast, dependency, secrets, infrastructure agents disabled

// -- Agent Configuration -----------------------------------------------------

class AgentConfig {
    constructor({
        md_file,
        tools,
        deliverable_pattern,
        model = 'claude-sonnet-4-6',
        effort = 'high',
        max_turns = 20,
        output_format = null,
        fallback_model = null,
        permission_mode = 'bypassPermissions',
        agents = null,
        max_thinking_tokens = null,
    }) {
        this.md_file = md_file;
        this.tools = tools;
        this.deliverable_pattern = deliverable_pattern;
        this.model = model;
        this.effort = effort;
        this.max_turns = max_turns;
        this.output_format = output_format;
        this.fallback_model = fallback_model;
        this.permission_mode = permission_mode;
        this.agents = agents;
        this.max_thinking_tokens = max_thinking_tokens;
    }
}

const AGENT_REGISTRY = {
    'code-analysis': new AgentConfig({
        md_file: '02-code-analysis-agent.md',
        tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep', 'Task', 'TodoWrite'],
        deliverable_pattern: 'code_analysis_deliverable_{identifier}.json',
        model: 'claude-opus-4-6',
        effort: 'high',
        max_turns: 30,
        output_format: code_analysis_output_schema,
    }),
    'poc': new AgentConfig({
        md_file: '03-poc-execution-agent.md',
        tools: ['Bash', 'WebFetch', 'WebSearch', 'Read', 'Write', 'TodoWrite'],
        deliverable_pattern: 'poc_testing_{identifier}.json',
        model: 'claude-opus-4-6',
        effort: 'high',
        max_turns: 100,
        output_format: poc_output_schema,
        permission_mode: 'default',
    }),
    'recon': new AgentConfig({
        md_file: '01-recon-agent.md',
        tools: ['Bash', 'WebFetch', 'WebSearch', 'Read', 'Write', 'Glob', 'TodoWrite'],
        deliverable_pattern: 'recon_deliverable_{identifier}.json',
        model: 'claude-opus-4-6',
        effort: 'high',
        max_turns: 50,
        output_format: recon_output_schema,
    }),
    'recommendation': new AgentConfig({
        md_file: '04-recommendation-agent.md',
        tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep', 'Task', 'TodoWrite'],
        deliverable_pattern: 'remediation_report_{identifier}.json',
        model: 'claude-opus-4-6',
        effort: 'high',
        max_turns: 100,
        output_format: recommendation_output_schema,
    }),
};

// -- Pipeline Configuration --------------------------------------------------

class PipelineConfig {
    constructor({
        target_path,
        agents_to_run,
        identifier,
        endpoint = null,
        domain = null,
        max_budget_usd = null,
        eval: runEval = false,
        eval_full = false,
    }) {
        this.target_path = target_path;
        this.agents_to_run = agents_to_run;
        this.identifier = identifier;
        this.endpoint = endpoint;
        this.domain = domain;
        this.max_budget_usd = max_budget_usd;
        this.eval = runEval;
        this.eval_full = eval_full;
    }
}

// -- Logging -----------------------------------------------------------------

function _log(level, msg) {
    const ts = new Date().toISOString();
    const line = `${ts} - ${level} - ${msg}`;
    console.log(line);
    // Also append to rotating log file
    try {
        const logsDir = './logs';
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        const dateStr = new Date().toISOString().slice(0, 10);
        fs.appendFileSync(
            path.join(logsDir, `claude_security_pipeline_${dateStr}.log`),
            line + '\n',
        );
    } catch { /* ignore log write errors */ }
}

const log = {
    info: (msg) => _log('INFO', msg),
    debug: (msg) => _log('DEBUG', msg),
    warn: (msg) => _log('WARNING', msg),
    error: (msg) => _log('ERROR', msg),
    critical: (msg) => _log('CRITICAL', msg),
};

function _makeStderrHandler(agentName) {
    return (line) => {
        log.debug(`[${agentName}:stderr] ${line.trimEnd()}`);
    };
}

/**
 * Recover structured JSON from an agent's free-text result.
 *
 * Why this exists: every red-team agent skill ends with a phrase like
 * `**X COMPLETE**\n\n```json\n{...}\n```` rather than populating the SDK's
 * structured_output field. Without this helper the orchestrator falls
 * through to writing the raw markdown to disk, breaking every downstream
 * consumer (HTML report generators, eval framework, kill-chain aggregation).
 *
 * Strategy:
 *   1. Look for ```json ... ``` fenced blocks; try parsing each one.
 *   2. If none parse, look for the first top-level `{ ... }` and try that.
 *   3. Return null if nothing parses — caller should fall back to raw text.
 */
function extractJsonFromText(text) {
    if (!text || typeof text !== 'string') return null;
    // Fenced ```json blocks (most common — every agent emits these)
    const fenceRe = /```(?:json)?\s*\n([\s\S]*?)\n```/gi;
    let match;
    while ((match = fenceRe.exec(text)) !== null) {
        const candidate = match[1].trim();
        if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
        try { return JSON.parse(candidate); } catch { /* try next fence */ }
    }
    // Fallback: first balanced top-level `{ ... }` by brace-matching
    const start = text.indexOf('{\n');
    if (start >= 0) {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try { return JSON.parse(text.slice(start, i + 1)); } catch { /* no go */ }
                    break;
                }
            }
        }
    }
    return null;
}

// -- Eval Integration --------------------------------------------------------

async function runEvalOnDeliverable(agentName, deliverablePath, targetPath, skipSubjective = true) {
    try {
        const { run_eval } = await import('../eval_framework/runner.js');
        const { list_agents } = await import('../eval_framework/agents/index.js');

        const available = list_agents();
        if (!available.includes(agentName)) {
            log.info(`[${agentName}:eval] No eval registered for agent '${agentName}', skipping evaluation`);
            return;
        }

        log.info(
            `[${agentName}:eval] Running evaluation on ${deliverablePath}` +
            `${skipSubjective ? ' (objective only)' : ' (objective + subjective)'}`
        );
        const report = await run_eval(agentName, deliverablePath, targetPath, skipSubjective);
        log.info(
            `[${agentName}:eval] Score: ${report.overall_score.toFixed(1)}/100 ` +
            `(objective: ${report.objective_score.toFixed(1)}` +
            `${report.subjective_score != null ? `, subjective: ${report.subjective_score.toFixed(1)}` : ''})`
        );
    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND') {
            log.warn(`[${agentName}:eval] Could not import eval_framework: ${e}`);
        } else {
            log.error(`[${agentName}:eval] Evaluation failed: ${e}`);
        }
    }
}

// -- Agent Runner ------------------------------------------------------------

async function runAgent(agentName, config, codeAnalysisDeliverable = null, reconDeliverable = null, pocDeliverable = null) {
    const agentCfg = AGENT_REGISTRY[agentName];
    const systemPromptPath = path.join(CLAUDE_DIR, agentCfg.md_file);

    if (!fs.existsSync(systemPromptPath)) {
        throw new Error(`Agent prompt file not found: ${systemPromptPath}`);
    }

    const systemPrompt = await readFile(systemPromptPath, 'utf-8');

    const deliverableFilename = agentCfg.deliverable_pattern.replace('{identifier}', config.identifier);
    const deliverablePath = path.join(DELIVERABLES_DIR, deliverableFilename);

    const promptLines = [
        `Target path: ${config.target_path}`,
        `Run identifier: ${config.identifier}`,
        `Deliverables directory: ${DELIVERABLES_DIR}`,
    ];
    if (codeAnalysisDeliverable && fs.existsSync(codeAnalysisDeliverable)) {
        promptLines.push(`Code analysis deliverable: ${codeAnalysisDeliverable}`);
    }
    if (reconDeliverable && fs.existsSync(reconDeliverable)) {
        promptLines.push(`Recon deliverable: ${reconDeliverable}`);
    }
    if (pocDeliverable && fs.existsSync(pocDeliverable)) {
        promptLines.push(`PoC deliverable: ${pocDeliverable}`);
    }
    if (config.domain && agentName === 'recon') {
        promptLines.push(`Target domain: ${config.domain}`);
    }
    if (config.endpoint && (agentName === 'poc' || agentName === 'recon')) {
        promptLines.push(`Target endpoint: ${config.endpoint}`);
    }
    promptLines.push(
        'IMPORTANT: Do not use the save_deliverable tool. ' +
        'Return your complete report as your final response text.'
    );
    const prompt = promptLines.join('\n');

    log.info(
        `[${agentName}] Starting agent ` +
        `(model=${agentCfg.model}, effort=${agentCfg.effort}, max_turns=${agentCfg.max_turns}, ` +
        `permission_mode=${agentCfg.permission_mode})`
    );
    log.debug(`[${agentName}] System prompt loaded from: ${systemPromptPath}`);

    try {
        const queryOpts = {
            tools: agentCfg.tools,
            allowedTools: agentCfg.tools,
            systemPrompt: systemPrompt,
            continueConversation: false,
            maxTurns: agentCfg.max_turns,
            model: agentCfg.model,
            cwd: process.cwd(),
            effort: agentCfg.effort,
            permissionMode: agentCfg.permission_mode,
            addDirs: [config.target_path],
        };

        if (agentCfg.fallback_model) queryOpts.fallbackModel = agentCfg.fallback_model;
        if (config.max_budget_usd != null) queryOpts.maxBudgetUsd = config.max_budget_usd;
        if (agentCfg.output_format) queryOpts.outputFormat = agentCfg.output_format;
        if (agentCfg.agents) queryOpts.agents = agentCfg.agents;
        if (agentCfg.max_thinking_tokens != null) queryOpts.maxThinkingTokens = agentCfg.max_thinking_tokens;

        const messages = query({ prompt, options: queryOpts });

        let success = false;

        for await (const message of messages) {
            if (message.type === 'result') {
                const costStr = message.total_cost_usd != null
                    ? `$${message.total_cost_usd.toFixed(4)}`
                    : 'unknown';
                log.info(
                    `[${agentName}] Done: subtype=${message.subtype}, ` +
                    `is_error=${message.is_error}, turns=${message.num_turns}, ` +
                    `session=${message.session_id}, cost=${costStr}`
                );
                if (message.is_error) {
                    log.error(`[${agentName}] Agent completed with error: ${JSON.stringify(message.result)}`);
                } else if (agentCfg.output_format != null && message.structured_output != null) {
                    await writeFile(deliverablePath, JSON.stringify(message.structured_output, null, 2), 'utf-8');
                    log.info(`[${agentName}] Deliverable written to: ${deliverablePath}`);
                    success = true;
                } else if (fs.existsSync(deliverablePath)) {
                    log.info(`[${agentName}] Agent-written deliverable found: ${deliverablePath}`);
                    success = true;
                } else if (message.result) {
                    // Agents commonly emit `**X COMPLETE**\n\n```json\n{...}\n```` instead of
                    // populating structured_output. Pull the JSON out of the fenced block so
                    // downstream tooling gets valid JSON, not markdown-wrapped text.
                    const extracted = extractJsonFromText(message.result);
                    if (extracted) {
                        await writeFile(deliverablePath, JSON.stringify(extracted, null, 2), 'utf-8');
                        log.info(`[${agentName}] Deliverable written (json extracted from result text): ${deliverablePath}`);
                    } else {
                        // No fenced JSON found — keep the raw text so nothing is lost.
                        await writeFile(deliverablePath, message.result, 'utf-8');
                        log.warn(`[${agentName}] Deliverable written as raw text (no JSON fence detected): ${deliverablePath}`);
                    }
                    success = true;
                } else {
                    log.error(`[${agentName}] Agent returned no result content`);
                }
            } else {
                log.info(`[${agentName}] ${JSON.stringify(message)}`);
            }
        }

        return success;

    } catch (e) {
        // Handle specific SDK error types by checking error properties/names
        if (e.name === 'CLINotFoundError' || (e.message && e.message.includes('CLI not found'))) {
            log.critical(`[${agentName}] Claude Code CLI not found: ${e}`);
        } else if (e.name === 'CLIConnectionError' || (e.message && e.message.includes('connection'))) {
            log.error(`[${agentName}] CLI connection error: ${e}`);
        } else if (e.exit_code !== undefined) {
            log.error(`[${agentName}] Process error (exit=${e.exit_code}): ${e.stderr || e.message}`);
        } else if (e.line !== undefined) {
            log.error(`[${agentName}] CLI output parse error: ${JSON.stringify(e.line)}`);
        } else {
            log.error(`[${agentName}] Unexpected error: ${e}`);
        }
        throw e;
    }
}

// -- Pipeline Orchestrator ---------------------------------------------------

async function runPipeline(config) {
    await mkdir(DELIVERABLES_DIR, { recursive: true });
    log.info(`Pipeline starting — target: ${config.target_path}, identifier: ${config.identifier}`);
    log.info(`Agents to run: ${JSON.stringify(config.agents_to_run)}`);

    let codeAnalysisDeliverable = null;
    let reconDeliverable = null;

    // Phase 1: CODE-ANALYSIS + RECON (parallel -- independent inputs)
    const phase1Agents = config.agents_to_run.filter(a => PHASE1_PARALLEL.has(a));
    if (phase1Agents.length) {
        log.info(`Running Phase 1 agents: ${JSON.stringify(phase1Agents)}`);
        const results = await Promise.all(
            phase1Agents.map(agent =>
                runAgent(agent, config).catch(err => err)
            )
        );
        for (let i = 0; i < phase1Agents.length; i++) {
            const agent = phase1Agents[i];
            const result = results[i];
            if (result instanceof Error) {
                log.error(`[${agent}] Agent raised an exception: ${result}`);
            } else if (!result) {
                log.error(`[${agent}] Agent reported failure; downstream agents will run without its output`);
            } else {
                const deliverablePath = path.join(
                    DELIVERABLES_DIR,
                    AGENT_REGISTRY[agent].deliverable_pattern.replace('{identifier}', config.identifier),
                );
                if (agent === 'code-analysis') {
                    codeAnalysisDeliverable = deliverablePath;
                } else if (agent === 'recon') {
                    reconDeliverable = deliverablePath;
                }
                if (config.eval) {
                    await runEvalOnDeliverable(
                        agent, deliverablePath, config.target_path,
                        !config.eval_full,
                    );
                }
            }
        }
    }

    // Backfill Phase-1 deliverable paths from disk when Phase 1 was skipped
    // (e.g. --agents poc,recommendation re-launch). Without this, downstream
    // agents lose the explicit pointers to upstream JSON and must self-discover.
    if (!codeAnalysisDeliverable) {
        const p = path.join(
            DELIVERABLES_DIR,
            AGENT_REGISTRY['code-analysis'].deliverable_pattern.replace('{identifier}', config.identifier),
        );
        if (fs.existsSync(p)) {
            codeAnalysisDeliverable = p;
            log.info(`Backfilled code-analysis deliverable from disk: ${p}`);
        }
    }
    if (!reconDeliverable) {
        const p = path.join(
            DELIVERABLES_DIR,
            AGENT_REGISTRY['recon'].deliverable_pattern.replace('{identifier}', config.identifier),
        );
        if (fs.existsSync(p)) {
            reconDeliverable = p;
            log.info(`Backfilled recon deliverable from disk: ${p}`);
        }
    }

    // Phase 3: POC-EXECUTION (consumes all upstream deliverables)
    let pocDeliverable = null;
    if (config.agents_to_run.includes('poc')) {
        const success = await runAgent(
            'poc', config, codeAnalysisDeliverable, reconDeliverable,
        );
        if (success) {
            pocDeliverable = path.join(
                DELIVERABLES_DIR,
                AGENT_REGISTRY['poc'].deliverable_pattern.replace('{identifier}', config.identifier),
            );
            if (config.eval) {
                await runEvalOnDeliverable(
                    'poc', pocDeliverable, config.target_path,
                    !config.eval_full,
                );
            }
        } else {
            log.error('poc agent failed; recommendation agent will run without its output');
        }
    }

    // Backfill PoC deliverable from disk when PoC phase was skipped in this
    // invocation (e.g. --agents recommendation re-launch) but a prior run wrote it.
    if (!pocDeliverable) {
        const p = path.join(
            DELIVERABLES_DIR,
            AGENT_REGISTRY['poc'].deliverable_pattern.replace('{identifier}', config.identifier),
        );
        if (fs.existsSync(p)) {
            pocDeliverable = p;
            log.info(`Backfilled poc deliverable from disk: ${p}`);
        }
    }

    // Phase 4: RECOMMENDATION (consumes poc deliverable, produces remediation plan)
    if (config.agents_to_run.includes('recommendation')) {
        const success = await runAgent(
            'recommendation', config,
            codeAnalysisDeliverable, reconDeliverable, pocDeliverable,
        );
        if (success) {
            const recommendationDeliverable = path.join(
                DELIVERABLES_DIR,
                AGENT_REGISTRY['recommendation'].deliverable_pattern.replace('{identifier}', config.identifier),
            );
            if (config.eval) {
                await runEvalOnDeliverable(
                    'recommendation', recommendationDeliverable, config.target_path,
                    !config.eval_full,
                );
            }
        } else {
            log.error('recommendation agent reported failure');
        }
    }

    log.info('Pipeline complete.');
}

// -- CLI Entry Point ---------------------------------------------------------

function parseArgs() {
    const argv = process.argv.slice(2);
    const args = {
        target: null,
        agents: 'all',
        identifier: null,
        endpoint: null,
        domain: null,
        max_budget_usd: null,
        eval: false,
        eval_full: false,
    };

    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === '--agents' && i + 1 < argv.length) {
            args.agents = argv[++i];
        } else if (arg === '--identifier' && i + 1 < argv.length) {
            args.identifier = argv[++i];
        } else if (arg === '--endpoint' && i + 1 < argv.length) {
            args.endpoint = argv[++i];
        } else if (arg === '--domain' && i + 1 < argv.length) {
            args.domain = argv[++i];
        } else if (arg === '--max-budget-usd' && i + 1 < argv.length) {
            args.max_budget_usd = parseFloat(argv[++i]);
        } else if (arg === '--eval') {
            args.eval = true;
        } else if (arg === '--eval-full') {
            args.eval_full = true;
        } else if (arg === '-h' || arg === '--help') {
            console.log(`Usage: node claude_sdk.js <target> [options]

Security analysis pipeline using Claude agents

Positional arguments:
  target                    Path to the target codebase to analyze

Options:
  --agents AGENTS           Comma-separated list of agents to run:
                            recon, code-analysis, poc, recommendation.
                            Use "all" to run the full pipeline (default: all)
  --identifier ID           Run identifier used in deliverable filenames
                            (auto-generated if omitted)
  --endpoint URL            Target endpoint URL or host for the POC and recon
                            agents (required when poc is in scope)
  --domain DOMAIN           Target domain for the recon agent (e.g. example.com).
                            Auto-derived from --endpoint if omitted.
  --max-budget-usd USD      Hard cap on spend per agent in USD (e.g. 10.0)
  --eval                    Run eval framework on each deliverable after agent
                            completes (objective checks only)
  --eval-full               Run eval framework with both objective and subjective
                            (LLM judge) checks
  -h, --help                Show this help message`);
            process.exit(0);
        } else if (!arg.startsWith('-') && args.target === null) {
            args.target = arg;
        } else {
            console.error(`Unknown argument: ${arg}`);
            process.exit(1);
        }
        i++;
    }

    return args;
}

async function main() {
    const args = parseArgs();

    if (!args.target) {
        console.error('Error: target argument is required. Use --help for usage.');
        process.exit(1);
    }

    const targetPath = path.resolve(args.target);
    if (!fs.existsSync(targetPath)) {
        console.error(`Error: Target path does not exist: ${targetPath}`);
        process.exit(1);
    }

    let agentsToRun;
    if (args.agents.trim().toLowerCase() === 'all') {
        agentsToRun = [...PIPELINE_ORDER];
    } else {
        const requested = args.agents.split(',').map(a => a.trim().toLowerCase());
        const unknown = requested.filter(a => !(a in AGENT_REGISTRY));
        if (unknown.length) {
            console.error(`Error: Unknown agent(s): ${JSON.stringify(unknown)}. Valid agents: ${JSON.stringify(Object.keys(AGENT_REGISTRY))}`);
            process.exit(1);
        }
        // Preserve pipeline order for the requested subset
        agentsToRun = PIPELINE_ORDER.filter(a => requested.includes(a));
    }

    if (agentsToRun.includes('poc') && !args.endpoint) {
        console.error('Error: --endpoint is required when the poc agent is in scope');
        process.exit(1);
    }

    // Domain resolution: explicit --domain takes precedence; fall back to --endpoint hostname
    let domain;
    if (args.domain) {
        domain = args.domain;
    } else if (args.endpoint) {
        try {
            const url = new URL(args.endpoint);
            domain = url.hostname || args.endpoint;
        } catch {
            domain = args.endpoint;
        }
    } else {
        domain = null;
    }

    if (agentsToRun.includes('recon') && !domain) {
        console.error('Error: --domain (or --endpoint) is required when the recon agent is in scope');
        process.exit(1);
    }

    let identifier;
    if (args.identifier) {
        identifier = args.identifier;
    } else {
        const targetName = path.basename(targetPath.replace(/[/\\]+$/, '')) || 'target';
        const safeName = targetName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
        identifier = `${safeName}_${dateStr}`;
    }

    const pipelineConfig = new PipelineConfig({
        target_path: targetPath,
        agents_to_run: agentsToRun,
        identifier,
        endpoint: args.endpoint,
        domain,
        max_budget_usd: args.max_budget_usd,
        eval: args.eval || args.eval_full,
        eval_full: args.eval_full,
    });

    await runPipeline(pipelineConfig);
}

await main();
