#!/usr/bin/env node
/**
 * check_skill_coverage.js — BlueTeam Skill / Validator Consistency Checker
 *
 * Parses every skill file's YAML front-matter `outputs:` block and compares
 * the listed .md filenames against the EXPECTED_PAIRS and OPTIONAL_PAIRS
 * lists in validate_reports.js.  Reports:
 *
 *   - EXPECTED_PAIRS entries with no skill claiming ownership (validator will
 *     require the file but no skill is told to produce it)
 *   - Skill outputs with no matching validator entry (skill produces a file
 *     the validator doesn't know about — either the validator needs updating
 *     or the output is intentionally unvalidated)
 *   - OPTIONAL_PAIRS entries with no skill claiming ownership (informational)
 *
 * Usage:
 *     node <BlueTeam>/scripts/check_skill_coverage.js
 *     node <BlueTeam>/scripts/check_skill_coverage.js --blueteam /path/to/BlueTeam
 *
 * Exit codes:
 *     0 — all EXPECTED_PAIRS entries have a skill owner; no orphaned outputs
 *     1 — one or more consistency issues found
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findBlueteamRoot(scriptPath) {
  return path.dirname(path.dirname(scriptPath));
}

function loadValidatorPairs(blueteamRoot) {
  const validator = path.join(blueteamRoot, 'scripts', 'validate_reports.py');
  if (!existsSync(validator)) {
    throw new Error(`validate_reports.py not found at ${validator}`);
  }

  const source = readFileSync(validator, 'utf-8');

  function extractPairs(listName) {
    const pattern = new RegExp(`${listName}\\s*:\\s*list\\[.*?\\]\\s*=\\s*\\[(.*?)\\]`, 's');
    const m = source.match(pattern);
    if (!m) return [];
    const block = m[1];
    const mdFiles = [];
    const re = /"([^"]+\.md)"/g;
    let match;
    while ((match = re.exec(block)) !== null) {
      mdFiles.push(match[1]);
    }
    return mdFiles;
  }

  const expected = extractPairs('EXPECTED_PAIRS');
  const optional = extractPairs('OPTIONAL_PAIRS');
  return [expected, optional];
}

function loadSkillOutputs(blueteamRoot) {
  const skillOutputs = {};
  let files;
  try {
    files = readdirSync(blueteamRoot).filter(f => f.endsWith('_skill.md')).sort();
  } catch {
    return skillOutputs;
  }

  for (const skillFile of files) {
    const fullPath = path.join(blueteamRoot, skillFile);
    const text = readFileSync(fullPath, 'utf-8');

    // Front-matter is between the first pair of --- delimiters
    const fmMatch = text.match(/^---\n(.*?)\n---/s);
    if (!fmMatch) continue;

    const frontMatter = fmMatch[1];

    // Find the outputs: block and extract artifact: values
    const outputsMatch = frontMatter.match(/\boutputs:\s*\n((?:[ \t]+.*\n)*)/);
    if (!outputsMatch) continue;

    const outputsBlock = outputsMatch[1];
    const artifacts = [];
    const re = /artifact:\s*(.+)/g;
    let m;
    while ((m = re.exec(outputsBlock)) !== null) {
      artifacts.push(m[1]);
    }

    const mdBasenames = artifacts
      .map(a => a.trim())
      .filter(a => a.endsWith('.md'))
      .map(a => path.basename(a));

    if (mdBasenames.length > 0) {
      skillOutputs[skillFile] = mdBasenames;
    }
  }

  return skillOutputs;
}

function main() {
  // Parse args
  let blueteamArg = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--blueteam' && i + 1 < args.length) {
      blueteamArg = args[i + 1];
      i++;
    }
  }

  const blueteamRoot = blueteamArg ? path.resolve(blueteamArg) : findBlueteamRoot(__filename);

  let expectedMds, optionalMds;
  try {
    [expectedMds, optionalMds] = loadValidatorPairs(blueteamRoot);
  } catch (e) {
    process.stderr.write(`ERROR: ${e.message}\n`);
    return 1;
  }

  const skillOutputs = loadSkillOutputs(blueteamRoot);

  // Build reverse map: md_basename -> [skill, ...]
  const mdToSkills = {};
  for (const [skill, mds] of Object.entries(skillOutputs)) {
    for (const md of mds) {
      if (!mdToSkills[md]) mdToSkills[md] = [];
      mdToSkills[md].push(skill);
    }
  }

  // All .md names claimed by any skill
  const allSkillMds = new Set(Object.keys(mdToSkills));

  const issues = [];

  console.log('='.repeat(70));
  console.log('BlueTeam — Skill / Validator Consistency Check');
  console.log(`BlueTeam root : ${blueteamRoot}`);
  console.log(`Skills found  : ${Object.keys(skillOutputs).length}`);
  console.log(`Expected pairs: ${expectedMds.length}`);
  console.log(`Optional pairs: ${optionalMds.length}`);
  console.log('='.repeat(70));

  // --- Check 1: EXPECTED_PAIRS entries with no skill owner ---
  console.log('\n[1] EXPECTED_PAIRS — checking each has a skill owner:');
  for (const md of expectedMds) {
    const owners = mdToSkills[md] || [];
    if (owners.length > 0) {
      console.log(`  OK   ${md}  (owned by: ${owners.join(', ')})`);
    } else {
      console.log(`  FAIL ${md}  — no skill claims this output`);
      issues.push(
        `EXPECTED '${md}' has no skill owner — ` +
        'validator will require this file but no skill is told to produce it'
      );
    }
  }

  // --- Check 2: Skill outputs not in any validator list ---
  console.log('\n[2] Skill outputs — checking each appears in validator lists:');
  const allValidatorMds = new Set([...expectedMds, ...optionalMds]);
  for (const [skill, mds] of Object.entries(skillOutputs).sort()) {
    for (const md of mds) {
      if (!allValidatorMds.has(md)) {
        console.log(`  WARN ${md}  (from ${skill}) — not in EXPECTED_PAIRS or OPTIONAL_PAIRS`);
        issues.push(
          `Skill output '${md}' (from ${skill}) is not listed in the validator — ` +
          'add it to EXPECTED_PAIRS or OPTIONAL_PAIRS in validate_reports.py, ' +
          'or remove the output from the skill if it is no longer produced'
        );
      } else {
        console.log(`  OK   ${md}  (from ${skill})`);
      }
    }
  }

  // --- Check 3: OPTIONAL_PAIRS entries with no skill owner (informational) ---
  console.log('\n[3] OPTIONAL_PAIRS — informational (no owner = gap, but not a hard failure):');
  for (const md of optionalMds) {
    const owners = mdToSkills[md] || [];
    if (owners.length > 0) {
      console.log(`  OK   ${md}  (owned by: ${owners.join(', ')})`);
    } else {
      console.log(`  INFO ${md}  — no skill claims this optional output`);
    }
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(70));
  if (issues.length > 0) {
    console.log(`RESULT: ${issues.length} consistency issue(s) found:\n`);
    for (let i = 0; i < issues.length; i++) {
      console.log(`  ${i + 1}. ${issues[i]}`);
    }
    console.log();
    return 1;
  } else {
    console.log('RESULT: All skill outputs and validator pairs are consistent.');
    return 0;
  }
}

process.exit(main());
