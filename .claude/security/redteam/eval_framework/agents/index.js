/**
 * Agent evaluation configuration and registry.
 */

import { CheckResult, EvalContext } from '../types.js';

export class AgentEvalConfig {
    /**
     * Everything needed to evaluate one agent's deliverable.
     *
     * @param {object} opts
     * @param {string} opts.agent_name
     * @param {string} opts.display_name
     * @param {string} opts.deliverable_format - 'markdown' | 'json'
     * @param {Object<string, string[]>} [opts.expected_sections]
     * @param {string[]} [opts.required_section_keys]
     * @param {Function[]} [opts.objective_checks_markdown]
     * @param {Function[]} [opts.objective_checks_json]
     * @param {string} [opts.judge_system_prompt]
     * @param {string} [opts.judge_criteria_prompt]
     * @param {string} [opts.judge_model]
     * @param {number} [opts.objective_weight]
     * @param {number} [opts.subjective_weight]
     */
    constructor({
        agent_name,
        display_name,
        deliverable_format,
        expected_sections = {},
        required_section_keys = [],
        objective_checks_markdown = [],
        objective_checks_json = [],
        judge_system_prompt = '',
        judge_criteria_prompt = '',
        judge_model = 'claude-sonnet-4-6',
        objective_weight = 0.4,
        subjective_weight = 0.6,
    }) {
        this.agent_name = agent_name;
        this.display_name = display_name;
        this.deliverable_format = deliverable_format;
        this.expected_sections = expected_sections;
        this.required_section_keys = required_section_keys;
        this.objective_checks_markdown = objective_checks_markdown;
        this.objective_checks_json = objective_checks_json;
        this.judge_system_prompt = judge_system_prompt;
        this.judge_criteria_prompt = judge_criteria_prompt;
        this.judge_model = judge_model;
        this.objective_weight = objective_weight;
        this.subjective_weight = subjective_weight;
    }
}

// -- Registry ----------------------------------------------------------------

const _AGENT_CONFIGS = {};

/**
 * @param {AgentEvalConfig} config
 */
export function register_agent(config) {
    _AGENT_CONFIGS[config.agent_name] = config;
}

/**
 * @param {string} agentName
 * @returns {AgentEvalConfig}
 */
export function get_agent_config(agentName) {
    if (!(agentName in _AGENT_CONFIGS)) {
        const available = Object.keys(_AGENT_CONFIGS);
        throw new Error(`Unknown agent '${agentName}'. Available: ${JSON.stringify(available)}`);
    }
    return _AGENT_CONFIGS[agentName];
}

/**
 * @returns {string[]}
 */
export function list_agents() {
    return Object.keys(_AGENT_CONFIGS);
}

// NOTE: Agent submodules (code_analysis.js, poc_execution.js, recommendation.js)
// self-register via register_agent() at module top-level. They MUST be imported
// by the entry point AFTER this file has fully evaluated — otherwise the
// `import { AgentEvalConfig } from './index.js'` in each submodule sees the
// class in its temporal dead zone and crashes. See eval_framework/cli.js for
// the correct evaluation order. Do not re-add the bottom imports here.
