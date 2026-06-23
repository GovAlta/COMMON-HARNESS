#!/usr/bin/env node
/**
 * Universal CLI: node cli.js <command> [options]
 */

import fs from 'node:fs';

// Import the registry FIRST so AgentEvalConfig / register_agent are fully
// initialised, then import the agent submodules to trigger their top-level
// register_agent() calls. Reversing this order re-introduces the temporal
// dead zone bug — see eval_framework/agents/index.js for the explanation.
import { list_agents } from './agents/index.js';
import './agents/code_analysis.js';
import './agents/poc_execution.js';
import './agents/recommendation.js';

import { run_eval, parse_eval_args } from './runner.js';

function main() {
    const argv = process.argv.slice(2);

    if (argv.length < 1 || argv[0] === '-h' || argv[0] === '--help') {
        const agents = list_agents();
        console.log('Usage: node cli.js <command> [options]');
        console.log();
        console.log('Commands:');
        console.log(`  <agent> <deliverable>   Run evaluation (agents: ${agents.join(', ')})`);
        console.log('  history [agent]         View evaluation history and trends');
        console.log();
        console.log('Eval options:');
        console.log('  --target PATH           Target codebase for file-path checks');
        console.log('  --skip-subjective       Objective checks only (no LLM judge)');
        console.log('  --judge-model MODEL     Override judge model');
        console.log('  --output, -o PATH       Output path for JSON report');
        console.log();
        console.log('History options:');
        console.log('  --dir PATH              Directory with eval reports (default: deliverables/)');
        console.log('  --compare A B           Compare two runs by number');
        console.log('  --checks                Show per-check score trends');
        process.exit(0);
    }

    const command = argv[0];

    // -- history subcommand ---------------------------------------------------
    if (command === 'history') {
        import('./history.js').then(({ history_main }) => {
            history_main(argv.slice(1));
        });
        return;
    }

    // -- agent eval (default) -------------------------------------------------
    const agentName = argv[0];
    const restArgv = argv.slice(1);

    const available = list_agents();
    if (!available.includes(agentName)) {
        console.error(`Error: Unknown agent '${agentName}'.`);
        console.error(`Available agents: ${available.join(', ')}`);
        process.exit(1);
    }

    const args = parse_eval_args(restArgv);

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

    run_eval(
        agentName,
        args.deliverable,
        args.target,
        args.skip_subjective,
        args.judge_model,
        args.output,
    ).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

main();
