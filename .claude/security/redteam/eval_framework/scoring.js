/**
 * Scoring, grading, report building, and console output.
 */

import { CheckResult, EvalReport } from './types.js';

/**
 * @param {CheckResult[]} checks
 * @param {number} [objectiveWeight=0.4]
 * @param {number} [subjectiveWeight=0.6]
 * @returns {[number, number|null, number]} [objective_pct, subjective_pct_or_null, overall_pct]
 */
export function compute_scores(checks, objectiveWeight = 0.4, subjectiveWeight = 0.6) {
    const obj = checks.filter(c => c.category === 'objective');
    const subj = checks.filter(c => c.category === 'subjective');

    const objScore = obj.length > 0
        ? (obj.reduce((sum, c) => sum + c.score, 0) / obj.length * 100)
        : 0.0;
    const subjScore = subj.length > 0
        ? (subj.reduce((sum, c) => sum + c.score, 0) / subj.length * 100)
        : null;

    let overall;
    if (subjScore !== null) {
        overall = objScore * objectiveWeight + subjScore * subjectiveWeight;
    } else {
        overall = objScore;
    }

    return [objScore, subjScore, overall];
}

/**
 * @param {number} score
 * @returns {string}
 */
export function grade(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'ADEQUATE';
    if (score >= 40) return 'NEEDS IMPROVEMENT';
    return 'POOR';
}

/**
 * @param {object} opts
 * @param {string} opts.agent_name
 * @param {string} opts.deliverable_path
 * @param {string|null} opts.target_path
 * @param {string} opts.detected_format
 * @param {CheckResult[]} opts.checks
 * @param {object|null} [opts.raw_judge]
 * @param {number} [opts.objective_weight]
 * @param {number} [opts.subjective_weight]
 * @returns {EvalReport}
 */
export function build_report({
    agent_name,
    deliverable_path,
    target_path,
    detected_format,
    checks,
    raw_judge = null,
    objective_weight = 0.4,
    subjective_weight = 0.6,
}) {
    const [objScore, subjScore, overall] = compute_scores(
        checks, objective_weight, subjective_weight);
    const failed = checks.filter(c => !c.passed);

    let summary = `Grade: ${grade(overall)} (${overall.toFixed(1)}/100). `;
    summary += `Objective: ${objScore.toFixed(1)}/100. `;
    if (subjScore !== null) {
        summary += `Subjective: ${subjScore.toFixed(1)}/100. `;
    }
    if (failed.length > 0) {
        summary += `${failed.length} check(s) did not pass.`;
    }

    return new EvalReport({
        agent_name,
        deliverable_path,
        target_path,
        timestamp: new Date().toISOString(),
        detected_format,
        checks,
        objective_score: objScore,
        subjective_score: subjScore,
        overall_score: overall,
        summary,
        raw_judge_output: raw_judge,
    });
}

/**
 * @param {EvalReport} report
 * @returns {object}
 */
export function report_to_dict(report) {
    return {
        agent_name: report.agent_name,
        deliverable_path: report.deliverable_path,
        target_path: report.target_path,
        timestamp: report.timestamp,
        detected_format: report.detected_format,
        scores: {
            objective: Math.round(report.objective_score * 100) / 100,
            subjective: report.subjective_score !== null
                ? Math.round(report.subjective_score * 100) / 100
                : null,
            overall: Math.round(report.overall_score * 100) / 100,
        },
        grade: grade(report.overall_score),
        summary: report.summary,
        checks: report.checks.map(c => ({
            name: c.name,
            category: c.category,
            passed: c.passed,
            score: Math.round(c.score * 1000) / 1000,
            details: c.details,
            suggestions: c.suggestions,
        })),
        raw_judge_output: report.raw_judge_output,
    };
}

/**
 * Human-readable report to stdout.
 * @param {EvalReport} report
 */
export function print_report(report) {
    const title = report.agent_name.toUpperCase().replace(/-/g, ' ');
    console.log('\n' + '='.repeat(72));
    console.log(`  ${title} AGENT  —  EVALUATION REPORT`);
    console.log('='.repeat(72));
    console.log(`  Deliverable : ${report.deliverable_path}`);
    if (report.target_path) {
        console.log(`  Target      : ${report.target_path}`);
    }
    console.log(`  Format      : ${report.detected_format}`);
    console.log(`  Timestamp   : ${report.timestamp}`);
    console.log();

    const g = grade(report.overall_score);
    console.log('  +---------------------------------------+');
    console.log(`  |  OVERALL : ${report.overall_score.toFixed(1).padStart(5)} / 100  (${g.padStart(10).padEnd(19)}) |`);
    console.log(`  |  Objective  : ${report.objective_score.toFixed(1).padStart(5)} / 100              |`);
    if (report.subjective_score !== null) {
        console.log(`  |  Subjective : ${report.subjective_score.toFixed(1).padStart(5)} / 100              |`);
    }
    console.log('  +---------------------------------------+');
    console.log();
    console.log(`  ${report.summary}`);
    console.log();

    // Objective
    const objChecks = report.checks.filter(c => c.category === 'objective');
    if (objChecks.length > 0) {
        console.log('  -- Objective Checks --');
        for (const c of objChecks) {
            const icon = c.passed ? 'PASS' : 'FAIL';
            console.log(`    [${icon}] ${c.name}: ${Math.round(c.score * 100)}% — ${c.details}`);
            for (const s of c.suggestions.slice(0, 3)) {
                console.log(`           -> ${s}`);
            }
        }
        console.log();
    }

    // Subjective
    const subjChecks = report.checks.filter(c => c.category === 'subjective');
    if (subjChecks.length > 0) {
        console.log('  -- Subjective Checks (LLM Judge) --');
        for (const c of subjChecks) {
            const icon = c.passed ? 'PASS' : 'FAIL';
            console.log(`    [${icon}] ${c.name}: ${Math.round(c.score * 100)}%`);
            let detailPreview = c.details.slice(0, 250);
            if (c.details.length > 250) {
                detailPreview += '...';
            }
            for (const line of detailPreview.split('. ')) {
                if (line.trim()) {
                    console.log(`           ${line.trim()}.`);
                }
            }
            for (const s of c.suggestions.slice(0, 2)) {
                console.log(`           -> ${s}`);
            }
        }
        console.log();
    }

    // Judge extras
    if (report.raw_judge_output) {
        const priorities = report.raw_judge_output.improvement_priorities || [];
        if (priorities.length > 0) {
            console.log('  -- Top Improvement Priorities (from Judge) --');
            for (let i = 0; i < Math.min(priorities.length, 5); i++) {
                console.log(`    ${i + 1}. ${priorities[i]}`);
            }
            console.log();
        }

        const assessment = report.raw_judge_output.overall_assessment || '';
        if (assessment) {
            console.log('  -- Judge Overall Assessment --');
            for (const line of assessment.split('. ')) {
                if (line.trim()) {
                    console.log(`    ${line.trim()}.`);
                }
            }
            console.log();
        }
    }

    console.log('='.repeat(72));
}
