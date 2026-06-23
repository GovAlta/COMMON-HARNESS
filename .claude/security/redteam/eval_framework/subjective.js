/**
 * LLM-as-judge subjective evaluator using Claude Agent SDK.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { CheckResult } from './types.js';

// -- JSON schema describing expected judge output ----------------------------

export const JUDGE_OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        criteria_scores: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    criterion:   { type: 'string' },
                    score:       { type: 'integer' },
                    max_score:   { type: 'integer' },
                    explanation: { type: 'string' },
                    strengths:   { type: 'array', items: { type: 'string' } },
                    weaknesses:  { type: 'array', items: { type: 'string' } },
                },
                required: ['criterion', 'score', 'max_score', 'explanation'],
            },
        },
        overall_assessment: { type: 'string' },
        improvement_priorities: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: ['criteria_scores', 'overall_assessment', 'improvement_priorities'],
};

/**
 * Best-effort extraction of a JSON object from model text.
 * Handles: pure JSON text, JSON in ```json fences, leading/trailing prose around JSON.
 * @param {string} text
 * @returns {object|null}
 */
function _tryParseJson(text) {
    if (!text) return null;

    // 1. Straight parse
    const stripped = text.trim();
    if (stripped.startsWith('{')) {
        try { return JSON.parse(stripped); } catch { /* continue */ }
    }

    // 2. Extract from markdown fences
    const fenceMatch = text.match(/```(?:json)?\s*\n(\{[\s\S]+?\})\s*\n```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
    }

    // 3. Find outermost { ... } block
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* continue */ }
    }

    return null;
}

/**
 * LLM-as-judge evaluator. Agent-agnostic: prompts come from config.
 */
export class SubjectiveEvaluator {
    /**
     * @param {object} opts
     * @param {string} opts.content
     * @param {string} opts.fmt
     * @param {string} opts.system_prompt
     * @param {string} opts.criteria_prompt
     * @param {string} [opts.model='claude-sonnet-4-6']
     * @param {number} [opts.max_turns=3]
     * @param {string} [opts.effort='high']
     */
    constructor({
        content,
        fmt,
        system_prompt,
        criteria_prompt,
        model = 'claude-sonnet-4-6',
        max_turns = 3,
        effort = 'high',
    }) {
        this.content = content;
        this.fmt = fmt;
        this.system_prompt = system_prompt;
        this.criteria_prompt = criteria_prompt;
        this.model = model;
        this.max_turns = max_turns;
        this.effort = effort;
    }

    /**
     * Build the evaluation prompt containing the deliverable and criteria.
     * @returns {string}
     */
    _buildPrompt() {
        let content = this.content;
        if (content.length > 100_000) {
            content = content.slice(0, 100_000) + '\n\n... [TRUNCATED FOR LENGTH]';
        }

        const block = this.fmt === 'json'
            ? `\`\`\`json\n${content}\n\`\`\``
            : `\`\`\`markdown\n${content}\n\`\`\``;

        return `Evaluate the following agent output against these criteria:

## Evaluation Criteria

${this.criteria_prompt}

---

## Agent Output to Evaluate

${block}

---

Evaluate each criterion. Be specific in your explanations — cite parts of the output
that support your score.

**CRITICAL**: Your response must be ONLY a single JSON object (no markdown fences,
no commentary before or after). The JSON must conform to this schema:

{
  "criteria_scores": [
    {
      "criterion": "<name>",
      "score": <1-5>,
      "max_score": 5,
      "explanation": "<why this score>",
      "strengths": ["..."],
      "weaknesses": ["..."]
    }
  ],
  "overall_assessment": "<paragraph>",
  "improvement_priorities": ["<most important first>", "..."]
}
`;
    }

    /**
     * Run the LLM judge and return [check_results, raw_judge_output].
     * @returns {Promise<[CheckResult[], object|null]>}
     */
    async evaluate() {
        const prompt = this._buildPrompt();
        console.log(`Subjective eval: sending to model=${this.model}`);

        try {
            const messages = query(prompt, {
                tools: [],
                allowedTools: [],
                systemPrompt: this.system_prompt,
                continueConversation: false,
                maxTurns: this.max_turns,
                model: this.model,
                cwd: process.cwd(),
                effort: this.effort,
                permissionMode: 'bypassPermissions',
            });

            let rawOutput = null;
            let resultText = null;
            let judgeError = false;

            for await (const message of messages) {
                if (message.type === 'result') {
                    const cost = message.total_cost_usd != null
                        ? `$${message.total_cost_usd.toFixed(4)}`
                        : '?';
                    console.log(
                        `Judge ResultMessage: is_error=${message.is_error}, ` +
                        `turns=${message.num_turns}, cost=${cost}, ` +
                        `has_structured=${message.structured_output != null}, ` +
                        `result_len=${message.result ? message.result.length : 0}`
                    );
                    if (message.is_error) {
                        console.error(`Judge error detail: ${JSON.stringify(message.result)}`);
                        judgeError = true;
                    } else {
                        if (message.structured_output != null) {
                            rawOutput = message.structured_output;
                        }
                        resultText = message.result;
                    }
                }
            }

            // Attempt to parse result_text if structured_output was empty
            if (rawOutput === null && resultText) {
                rawOutput = _tryParseJson(resultText);
            }

            if (judgeError || !rawOutput) {
                if (!judgeError) {
                    console.error(
                        'No parseable output from judge. ' +
                        `result_text preview: ${(resultText || '').slice(0, 300)}`
                    );
                }
                return [[], null];
            }

            // Convert to CheckResults
            const results = [];
            for (const item of (rawOutput.criteria_scores || [])) {
                const scoreRaw = item.score || 0;
                const maxScore = item.max_score || 5;
                const normalized = maxScore > 0 ? scoreRaw / maxScore : 0.0;
                const criterion = item.criterion || 'unknown';
                const safeName = 'judge_' + criterion.toLowerCase().replace(/\W+/g, '_').slice(0, 50);
                results.push(new CheckResult({
                    name: safeName,
                    passed: normalized >= 0.6,
                    score: normalized,
                    details: item.explanation || '',
                    category: 'subjective',
                    suggestions: item.weaknesses || [],
                }));
            }
            return [results, rawOutput];

        } catch (e) {
            console.error(`Subjective evaluation error: ${e}`);
            return [[], null];
        }
    }
}
