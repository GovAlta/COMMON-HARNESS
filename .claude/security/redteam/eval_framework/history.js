/**
 * Evaluation history tracking -- load, compare, and display eval runs over time.
 */

import fs from 'node:fs';
import path from 'node:path';

// -- Filename -> agent name inference (for pre-refactor reports) -------------

const _FILENAME_AGENT_MAP = {
    code_analysis: 'code-analysis',
    sast_analysis: 'sast',
    dependency_analysis: 'dependency',
    secrets_analysis: 'secrets',
    infrastructure_analysis: 'infrastructure',
    poc_testing: 'poc',
    poc_execution: 'poc',
    recommendation: 'recommendation',
};

/**
 * Infer agent name from eval report filename for older reports.
 * @param {string} filename
 * @returns {string|null}
 */
function _inferAgentFromFilename(filename) {
    const base = path.basename(filename);
    const m = base.match(/^eval_([a-z_]+?)_(?:deliverable|report)/);
    if (m) {
        return _FILENAME_AGENT_MAP[m[1]] || null;
    }
    return null;
}

// -- Loading -----------------------------------------------------------------

/**
 * Load all eval_*.json reports from directory, optionally filtered by agent.
 * Returns a list of parsed report dicts sorted by timestamp (oldest first).
 * Each dict is augmented with `_source_file` and `_agent_name` keys.
 *
 * @param {string} [directory='evals']
 * @param {string|null} [agentName=null]
 * @returns {object[]}
 */
export function load_eval_reports(directory = 'evals', agentName = null) {
    let files;
    try {
        files = fs.readdirSync(directory)
            .filter(f => f.startsWith('eval_') && f.endsWith('.json'))
            .map(f => path.join(directory, f));
    } catch {
        return [];
    }

    const reports = [];
    for (const fpath of files) {
        let data;
        try {
            data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
        } catch {
            continue;
        }

        const resolvedAgent = data.agent_name || _inferAgentFromFilename(fpath);
        data._agent_name = resolvedAgent;
        data._source_file = fpath;

        if (agentName && resolvedAgent !== agentName) {
            continue;
        }

        reports.push(data);
    }

    reports.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    return reports;
}

/**
 * Return {agent_name: run_count} for all agents found in directory.
 * @param {string} [directory='evals']
 * @returns {Object<string, number>}
 */
export function list_agents_in_history(directory = 'evals') {
    const reports = load_eval_reports(directory);
    const counts = {};
    for (const r of reports) {
        const agent = r._agent_name || 'unknown';
        counts[agent] = (counts[agent] || 0) + 1;
    }
    return counts;
}

// -- Formatting helpers ------------------------------------------------------

function _fmtScore(val) {
    if (val == null) return '  —  ';
    return val.toFixed(1).padStart(5);
}

function _fmtDelta(val) {
    if (val == null) return '   —  ';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}`.padStart(6);
}

function _shortTimestamp(ts) {
    return ts.replace('T', ' ').slice(0, 16);
}

function _shortHash(h) {
    if (!h) return '   —    ';
    return h.slice(0, 8);
}

// -- History table -----------------------------------------------------------

/**
 * Render a chronological history table as a string.
 * @param {object[]} reports
 * @param {string|null} [agentName=null]
 * @returns {string}
 */
export function format_history_table(reports, agentName = null) {
    if (!reports.length) {
        const label = agentName ? ` for ${agentName}` : '';
        return `  No evaluation runs found${label}.\n`;
    }

    const lines = [];
    const display = (agentName || reports[0]._agent_name || 'unknown').toUpperCase().replace(/-/g, ' ');
    lines.push('');
    lines.push(`  ${display} — Evaluation History (${reports.length} runs)`);
    lines.push('');

    lines.push(
        `  ${'#'.padStart(3)}  ${'Timestamp'.padEnd(18)}  ${'Hash'.padEnd(10)}  ` +
        `${'Obj'.padStart(5)}  ${'Subj'.padStart(5)}  ${'Overall'.padStart(7)}  ` +
        `${'Grade'.padEnd(19)}  ${'Delta'.padStart(6)}`
    );
    lines.push('  ' + '-'.repeat(98));

    let prevOverall = null;
    let bestIdx = 0, bestScore = -1.0;
    let worstIdx = 0, worstScore = 999.0;

    for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        const num = i + 1;
        const scores = r.scores || {};
        const obj = scores.objective;
        const subj = scores.subjective;
        const overall = scores.overall || 0.0;
        const gradeStr = r.grade || '?';
        const ts = _shortTimestamp(r.timestamp || '?');
        const dhash = _shortHash(r.deliverable_hash);

        let deltaStr;
        if (prevOverall !== null) {
            deltaStr = _fmtDelta(overall - prevOverall);
        } else {
            deltaStr = '   —  ';
        }

        lines.push(
            `  ${String(num).padStart(3)}  ${ts.padEnd(18)}  ${dhash.padEnd(10)}  ` +
            `${_fmtScore(obj)}  ${_fmtScore(subj)}  ${overall.toFixed(1).padStart(7)}  ` +
            `${gradeStr.padEnd(19)}  ${deltaStr}`
        );

        if (overall >= bestScore) { bestScore = overall; bestIdx = num; }
        if (overall <= worstScore) { worstScore = overall; worstIdx = num; }

        prevOverall = overall;
    }

    lines.push('');
    const firstOverall = (reports[0].scores || {}).overall || 0;
    const lastOverall = (reports[reports.length - 1].scores || {}).overall || 0;
    const trend = lastOverall - firstOverall;
    lines.push(
        `  Best: #${bestIdx} (${bestScore.toFixed(1)})  ` +
        `Worst: #${worstIdx} (${worstScore.toFixed(1)})  ` +
        `Trend: ${_fmtDelta(trend).trim()} over ${reports.length} runs`
    );
    lines.push('');
    return lines.join('\n');
}

// -- Two-run comparison ------------------------------------------------------

/**
 * Detailed per-check comparison between two runs.
 * @param {object} reportA
 * @param {object} reportB
 * @param {number} idxA
 * @param {number} idxB
 * @returns {string}
 */
export function format_comparison(reportA, reportB, idxA, idxB) {
    const lines = [];

    const scoresA = reportA.scores || {};
    const scoresB = reportB.scores || {};
    const overallA = scoresA.overall || 0;
    const overallB = scoresB.overall || 0;

    lines.push('');
    lines.push(`  Comparing Run #${idxA} → Run #${idxB}`);
    lines.push('');
    lines.push(
        `  Overall: ${overallA.toFixed(1)} → ${overallB.toFixed(1)} ` +
        `(${_fmtDelta(overallB - overallA).trim()})`
    );

    const objA = scoresA.objective;
    const objB = scoresB.objective;
    if (objA != null && objB != null) {
        lines.push(
            `  Objective: ${objA.toFixed(1)} → ${objB.toFixed(1)} ` +
            `(${_fmtDelta(objB - objA).trim()})`
        );
    }

    const subjA = scoresA.subjective;
    const subjB = scoresB.subjective;
    if (subjA != null && subjB != null) {
        lines.push(
            `  Subjective: ${subjA.toFixed(1)} → ${subjB.toFixed(1)} ` +
            `(${_fmtDelta(subjB - subjA).trim()})`
        );
    }
    lines.push('');

    // Per-check comparison
    const checksA = {};
    for (const c of (reportA.checks || [])) checksA[c.name] = c;
    const checksB = {};
    for (const c of (reportB.checks || [])) checksB[c.name] = c;

    const allNamesSet = new Map();
    for (const name of [...Object.keys(checksA), ...Object.keys(checksB)]) {
        if (!allNamesSet.has(name)) allNamesSet.set(name, true);
    }
    const allNames = [...allNamesSet.keys()];

    if (!allNames.length) {
        lines.push('  No checks to compare.');
        return lines.join('\n');
    }

    const nameWidth = Math.max(...allNames.map(n => n.length));
    lines.push(
        `  ${'Check'.padEnd(nameWidth)}  ` +
        `${('#' + idxA).padStart(6)}  ${('#' + idxB).padStart(6)}  ${'Delta'.padStart(6)}`
    );
    lines.push('  ' + '-'.repeat(nameWidth + 26));

    let largestGainName = '';
    let largestGainVal = 0.0;
    let largestDropName = '';
    let largestDropVal = 0.0;

    for (const name of allNames) {
        const ca = checksA[name];
        const cb = checksB[name];
        const scoreA = ca ? ca.score : null;
        const scoreB = cb ? cb.score : null;

        let aStr, bStr, deltaStr;
        if (scoreA != null && scoreB != null) {
            const delta = scoreB - scoreA;
            const deltaPct = delta * 100;
            if (Math.abs(delta) < 0.005) {
                deltaStr = '    — ';
            } else {
                deltaStr = `${deltaPct >= 0 ? '+' : ''}${Math.round(deltaPct)}%`.padStart(6);
            }
            aStr = `${Math.round(scoreA * 100)}%`.padStart(5);
            bStr = `${Math.round(scoreB * 100)}%`.padStart(5);

            if (delta > largestGainVal) { largestGainVal = delta; largestGainName = name; }
            if (delta < largestDropVal) { largestDropVal = delta; largestDropName = name; }
        } else if (scoreA != null) {
            aStr = `${Math.round(scoreA * 100)}%`.padStart(5);
            bStr = '  —  ';
            deltaStr = '  new ';
        } else if (scoreB != null) {
            aStr = '  —  ';
            bStr = `${Math.round(scoreB * 100)}%`.padStart(5);
            deltaStr = '  new ';
        } else {
            continue;
        }

        lines.push(
            `  ${name.padEnd(nameWidth)}  ${aStr.padStart(6)}  ${bStr.padStart(6)}  ${deltaStr}`
        );
    }

    // Mark largest gain/drop
    if (largestGainName && largestGainVal > 0.01) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(largestGainName) &&
                !lines[i].trim().startsWith('Check') && !lines[i].trim().startsWith('-')) {
                lines[i] = lines[i] + '  \u2605';
                break;
            }
        }
    }
    if (largestDropName && largestDropVal < -0.01) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(largestDropName) &&
                !lines[i].trim().startsWith('Check') && !lines[i].trim().startsWith('-')) {
                lines[i] = lines[i] + '  \u25BC';
                break;
            }
        }
    }

    lines.push('');
    const legendParts = [];
    if (largestGainName) legendParts.push(`\u2605 = largest gain (${largestGainName})`);
    if (largestDropName) legendParts.push(`\u25BC = largest drop (${largestDropName})`);
    if (legendParts.length) {
        lines.push('  ' + legendParts.join('  '));
        lines.push('');
    }

    return lines.join('\n');
}

// -- Per-check trends --------------------------------------------------------

/**
 * Show per-check scores across all runs with trend indicators.
 * @param {object[]} reports
 * @returns {string}
 */
export function format_check_trends(reports) {
    if (!reports.length) return '  No runs to show trends for.\n';

    const allNames = [];
    const seen = new Set();
    for (const r of reports) {
        for (const c of (r.checks || [])) {
            if (!seen.has(c.name)) {
                allNames.push(c.name);
                seen.add(c.name);
            }
        }
    }

    if (!allNames.length) return '  No checks found.\n';

    const lines = [];
    lines.push('');
    lines.push(`  Per-Check Trends (${reports.length} runs)`);
    lines.push('');

    const nameWidth = Math.max(...allNames.map(n => n.length));
    let header = `  ${'Check'.padEnd(nameWidth)}`;
    for (let i = 1; i <= reports.length; i++) {
        header += `  ${('#' + i).padStart(5)}`;
    }
    header += `  ${'Avg'.padStart(5)}  ${'Trend'.padStart(5)}`;
    lines.push(header);
    lines.push('  ' + '-'.repeat(nameWidth + 8 * reports.length + 16));

    for (const name of allNames) {
        let row = `  ${name.padEnd(nameWidth)}`;
        const scores = [];
        for (const r of reports) {
            const checkMap = {};
            for (const c of (r.checks || [])) checkMap[c.name] = c;
            const c = checkMap[name];
            if (c != null) {
                scores.push(c.score);
                row += `  ${(Math.round(c.score * 100) + '%').padStart(5)}`;
            } else {
                row += `  ${'—'.padStart(5)}`;
            }
        }

        // Average
        if (scores.length) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            row += `  ${(Math.round(avg * 100) + '%').padStart(5)}`;
        } else {
            row += `  ${'—'.padStart(5)}`;
        }

        // Trend indicator
        if (scores.length >= 2) {
            const delta = scores[scores.length - 1] - scores[0];
            if (delta > 0.05) row += '    \u2191';
            else if (delta < -0.05) row += '    \u2193';
            else row += '    \u2014';
        } else {
            row += '     ';
        }

        lines.push(row);
    }

    lines.push('');
    lines.push('  \u2191 = improving   \u2193 = declining   \u2014 = stable');
    lines.push('');
    return lines.join('\n');
}

// -- All-agents summary ------------------------------------------------------

/**
 * Summary table across all agents.
 * @param {string} [directory='evals']
 * @returns {string}
 */
export function format_all_agents_summary(directory = 'evals') {
    const agentCounts = list_agents_in_history(directory);
    if (!Object.keys(agentCounts).length) {
        return `  No evaluation reports found in ${directory}/\n`;
    }

    const lines = [];
    lines.push('');
    lines.push('  Evaluation History — All Agents');
    lines.push('');
    lines.push(
        `  ${'Agent'.padEnd(25)}  ${'Runs'.padStart(5)}  ${'Latest Score'.padStart(12)}  ` +
        `${'Latest Grade'.padEnd(19)}  ${'Trend'.padStart(6)}`
    );
    lines.push('  ' + '-'.repeat(75));

    for (const agent of Object.keys(agentCounts).sort()) {
        const count = agentCounts[agent];
        const reports = load_eval_reports(directory, agent);
        if (!reports.length) continue;

        const latest = reports[reports.length - 1];
        const latestScore = (latest.scores || {}).overall || 0;
        const latestGrade = latest.grade || '?';

        let trendStr;
        if (reports.length >= 2) {
            const firstScore = (reports[0].scores || {}).overall || 0;
            trendStr = _fmtDelta(latestScore - firstScore);
        } else {
            trendStr = '   —  ';
        }

        lines.push(
            `  ${agent.padEnd(25)}  ${String(count).padStart(5)}  ` +
            `${latestScore.toFixed(1).padStart(11)}  ${latestGrade.padEnd(19)}  ${trendStr}`
        );
    }

    lines.push('');
    return lines.join('\n');
}

// -- Public CLI entry point --------------------------------------------------

/**
 * Handle the `history` subcommand.
 * argv is the argument list *after* "history" has been consumed.
 * @param {string[]} argv
 */
export function history_main(argv) {
    let agent = null;
    let dir = 'evals';
    let compare = null;
    let checks = false;

    // Simple arg parsing
    const args = [...argv];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--dir' && i + 1 < args.length) {
            dir = args[++i];
        } else if (args[i] === '--compare' && i + 2 < args.length) {
            compare = [parseInt(args[i + 1], 10), parseInt(args[i + 2], 10)];
            i += 2;
        } else if (args[i] === '--checks') {
            checks = true;
        } else if (!args[i].startsWith('-')) {
            agent = args[i];
        }
    }

    // No agent specified: show all-agents summary
    if (agent === null && !compare && !checks) {
        console.log(format_all_agents_summary(dir));
        return;
    }

    const reports = load_eval_reports(dir, agent);

    if (compare) {
        const [idxA, idxB] = compare;
        if (idxA < 1 || idxA > reports.length || idxB < 1 || idxB > reports.length) {
            console.log(`  Error: Run numbers must be between 1 and ${reports.length}.`);
            return;
        }
        console.log(format_comparison(reports[idxA - 1], reports[idxB - 1], idxA, idxB));
    } else if (checks) {
        console.log(format_check_trends(reports));
    } else {
        console.log(format_history_table(reports, agent));
    }
}
