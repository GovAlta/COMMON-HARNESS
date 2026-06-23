/**
 * Core data types for the evaluation framework.
 */

export class CheckResult {
    /**
     * @param {object} opts
     * @param {string} opts.name
     * @param {boolean} opts.passed
     * @param {number} opts.score        - 0.0 - 1.0
     * @param {string} opts.details
     * @param {string} opts.category     - 'objective' | 'subjective'
     * @param {string[]} [opts.suggestions]
     */
    constructor({ name, passed, score, details, category, suggestions = [] }) {
        this.name = name;
        this.passed = passed;
        this.score = score;
        this.details = details;
        this.category = category;
        this.suggestions = suggestions;
    }
}

export class EvalReport {
    /**
     * @param {object} opts
     * @param {string} opts.agent_name
     * @param {string} opts.deliverable_path
     * @param {string|null} opts.target_path
     * @param {string} opts.timestamp
     * @param {string} opts.detected_format    - 'markdown' | 'json'
     * @param {CheckResult[]} [opts.checks]
     * @param {number} [opts.objective_score]
     * @param {number|null} [opts.subjective_score]
     * @param {number} [opts.overall_score]
     * @param {string} [opts.summary]
     * @param {object|null} [opts.raw_judge_output]
     */
    constructor({
        agent_name,
        deliverable_path,
        target_path,
        timestamp,
        detected_format,
        checks = [],
        objective_score = 0.0,
        subjective_score = null,
        overall_score = 0.0,
        summary = '',
        raw_judge_output = null,
    }) {
        this.agent_name = agent_name;
        this.deliverable_path = deliverable_path;
        this.target_path = target_path;
        this.timestamp = timestamp;
        this.detected_format = detected_format;
        this.checks = checks;
        this.objective_score = objective_score;
        this.subjective_score = subjective_score;
        this.overall_score = overall_score;
        this.summary = summary;
        this.raw_judge_output = raw_judge_output;
    }
}

export class EvalContext {
    /**
     * Pre-parsed deliverable data passed to every objective check function.
     *
     * @param {object} opts
     * @param {string} opts.raw_content
     * @param {Object<string, string>} opts.sections
     * @param {Object<string, string>} opts.raw_sections
     * @param {object|null} opts.json_data
     * @param {string|null} opts.target_path
     * @param {Set<string>|null} opts.suffix_index
     * @param {string} opts.fmt
     */
    constructor({ raw_content, sections, raw_sections, json_data, target_path, suffix_index, fmt }) {
        this.raw_content = raw_content;
        this.sections = sections;
        this.raw_sections = raw_sections;
        this.json_data = json_data;
        this.target_path = target_path;
        this.suffix_index = suffix_index;
        this.fmt = fmt;
    }
}
