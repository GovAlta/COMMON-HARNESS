/**
 * Evaluation framework for security pipeline agent deliverables.
 */

export { CheckResult, EvalReport, EvalContext } from './types.js';
export { compute_scores, grade, build_report, report_to_dict, print_report } from './scoring.js';
export { parse_sections, extract_file_paths, extract_endpoints, count_term_hits } from './parsing.js';
export { build_suffix_index, path_in_index } from './filetree.js';
export { SubjectiveEvaluator } from './subjective.js';
export { run_eval } from './runner.js';

// Import agent modules to trigger registration
import './agents/code_analysis.js';
import './agents/poc_execution.js';
import './agents/recommendation.js';
