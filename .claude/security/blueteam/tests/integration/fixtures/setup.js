#!/usr/bin/env node
/**
 * Prepares a BlueTeam test fixture for skill regression testing.
 *
 * Usage:
 *   node setup.js basic_webapp [--output-dir PATH]
 *   node setup.js risk_acceptance_app [--output-dir PATH]
 */

import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TESTS_DIR = resolve(__dirname, '..');
const FIXTURES_DIR = join(TESTS_DIR, 'fixtures');

const KNOWN_FIXTURES = ['basic_webapp', 'risk_acceptance_app'];

function defaultOutputDir(fixtureName) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '').replace(/(\d{8})(\d{6})/, '$1_$2');
  return join(FIXTURES_DIR, 'tmp', `${fixtureName}_${ts}`);
}

function git(args, cwd) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'BlueTeam Test',
    GIT_AUTHOR_EMAIL: 'blueteam-test@example.com',
    GIT_COMMITTER_NAME: 'BlueTeam Test',
    GIT_COMMITTER_EMAIL: 'blueteam-test@example.com',
  };
  try {
    return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    console.error(`ERROR: git ${args.join(' ')} failed:\n${err.stderr || err.message}`);
    process.exit(1);
  }
}

function prepareFixture(fixtureName, destination) {
  const source = join(FIXTURES_DIR, fixtureName);
  if (!existsSync(source)) {
    console.error(`ERROR: Source fixture not found: ${source}`);
    process.exit(1);
  }

  if (existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true });
  }
  cpSync(source, destination, { recursive: true });

  git(['init'], destination);
  git(['config', 'user.email', 'blueteam-test@example.com'], destination);
  git(['config', 'user.name', 'BlueTeam Test'], destination);
  git(['add', '.'], destination);
  git(['commit', '-m', 'Initial commit \u2014 BlueTeam regression fixture'], destination);

  console.log(`Prepared ${fixtureName} fixture at: ${destination}`);
}

/**
 * Prepare a named fixture and return the path as a string.
 * Exported for programmatic use by run_tests.js.
 */
export function prepare(fixtureName, outputDir) {
  if (!KNOWN_FIXTURES.includes(fixtureName)) {
    console.error(`ERROR: Unknown fixture '${fixtureName}'. Known: ${KNOWN_FIXTURES.join(', ')}`);
    process.exit(1);
  }

  const destination = resolve(outputDir || defaultOutputDir(fixtureName));
  mkdirSync(dirname(destination), { recursive: true });

  prepareFixture(fixtureName, destination);
  return destination;
}

// CLI entry point
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'output-dir': { type: 'string' },
    },
    allowPositionals: true,
  });

  const fixtureName = positionals[0];
  if (!fixtureName || !KNOWN_FIXTURES.includes(fixtureName)) {
    console.error(`Usage: node setup.js <${KNOWN_FIXTURES.join('|')}> [--output-dir PATH]`);
    process.exit(1);
  }

  const path = prepare(fixtureName, values['output-dir']);
  console.log(path);
}
