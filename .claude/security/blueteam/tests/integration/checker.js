#!/usr/bin/env node
/**
 * Assertion checker for BlueTeam skill regression tests.
 *
 * Supported assertion types:
 *   file_exists       - path exists relative to fixture root
 *   file_missing      - path does NOT exist (useful for cleanup checks)
 *   json_valid        - file is valid JSON
 *   json_schema       - file validates against JSON schema (basic check)
 *   section_present   - markdown file contains a heading matching pattern
 *   text_present      - file contains all strings in 'patterns' list (case-insensitive by default)
 *   text_absent       - file does NOT contain any string in 'patterns' list
 *   json_field_exists - JSON path exists (dot notation, supports [*] for arrays)
 *   json_count_min    - JSON array at path has at least 'min' items
 *   json_count_max    - JSON array at path has at most 'max' items
 *   json_field_regex  - all values at JSON path match regex pattern
 *   html_element      - HTML file contains element matching CSS-like description (tag + optional text)
 *   html_tab_count    - HTML file contains at least N tab panel elements (id starting with 'panel-')
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Data classes
// ---------------------------------------------------------------------------

export class AssertionResult {
  constructor({ id, category, description, passed, message }) {
    this.id = id;
    this.category = category;
    this.description = description;
    this.passed = passed;
    this.message = message;
  }
}

export class CheckResult {
  constructor({ skillName, fixturePath }) {
    this.skillName = skillName;
    this.fixturePath = fixturePath;
    this.passed = [];
    this.failed = [];
    this.warnings = [];
    this.skipped = [];
  }

  get total() {
    return this.passed.length + this.failed.length + this.warnings.length + this.skipped.length;
  }
}

// ---------------------------------------------------------------------------
// JSON path helpers
// ---------------------------------------------------------------------------

function _resolveJsonPath(data, pathExpr) {
  const rawParts = pathExpr.split(/(\[\*\]|\[\d+\])/);
  const tokens = [];
  for (const part of rawParts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      const inner = part.slice(1, -1);
      tokens.push(inner === '*' ? null : parseInt(inner, 10));
    } else {
      for (const sub of part.split('.')) {
        if (sub) tokens.push(sub);
      }
    }
  }

  function walk(current, tokenList) {
    if (tokenList.length === 0) return [current];
    const token = tokenList[0];
    const rest = tokenList.slice(1);

    if (token === null) {
      // wildcard — iterate list
      if (!Array.isArray(current)) return [];
      const results = [];
      for (const item of current) {
        results.push(...walk(item, rest));
      }
      return results;
    } else if (typeof token === 'number') {
      if (!Array.isArray(current) || token >= current.length) return [];
      return walk(current[token], rest);
    } else {
      // string key
      if (current !== null && typeof current === 'object' && !Array.isArray(current) && token in current) {
        return walk(current[token], rest);
      } else if (Array.isArray(current)) {
        // implicit wildcard when navigating a list with a key
        const results = [];
        for (const item of current) {
          results.push(...walk(item, [token, ...rest]));
        }
        return results;
      }
      return [];
    }
  }

  return walk(data, tokens);
}

// ---------------------------------------------------------------------------
// Individual assertion checkers
// ---------------------------------------------------------------------------

function _checkFileExists(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (existsSync(target)) {
    return [true, `File exists: ${assertion.path}`];
  }
  return [false, `File not found: ${assertion.path}`];
}

function _checkFileMissing(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [true, `File correctly absent: ${assertion.path}`];
  }
  return [false, `File exists but should be absent: ${assertion.path}`];
}

function _checkJsonValid(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  try {
    JSON.parse(readFileSync(target, 'utf-8'));
    return [true, `Valid JSON: ${assertion.path}`];
  } catch (exc) {
    return [false, `Invalid JSON in ${assertion.path}: ${exc.message}`];
  }
}

function _checkJsonSchema(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  let data;
  try {
    data = JSON.parse(readFileSync(target, 'utf-8'));
  } catch (exc) {
    return [false, `Invalid JSON: ${exc.message}`];
  }

  const schema = assertion.schema;
  if (!schema) {
    return [true, 'No schema provided; JSON valid'];
  }

  // Basic check: verify required_keys exist at top level
  const requiredKeys = assertion.required_keys || [];
  const missing = requiredKeys.filter(k => !(k in data));
  if (missing.length > 0) {
    return [false, `Missing top-level keys: ${JSON.stringify(missing)}`];
  }
  return [true, 'Basic schema check passed'];
}

function _checkSectionPresent(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const pattern = assertion.pattern || '';
  const patternLower = pattern.toLowerCase();
  const content = readFileSync(target, 'utf-8');
  for (const line of content.split('\n')) {
    const stripped = line.trim();
    if (stripped.startsWith('#') && stripped.toLowerCase().includes(patternLower)) {
      return [true, `Section heading found matching '${pattern}': '${stripped}'`];
    }
  }
  return [false, `No heading matching '${pattern}' found in ${assertion.path}`];
}

function _checkTextPresent(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const patterns = assertion.patterns || [];
  const caseInsensitive = assertion.case_insensitive !== false;
  const content = readFileSync(target, 'utf-8');
  const searchContent = caseInsensitive ? content.toLowerCase() : content;
  const missing = [];
  for (const pat of patterns) {
    const searchPat = caseInsensitive ? pat.toLowerCase() : pat;
    if (!searchContent.includes(searchPat)) {
      missing.push(pat);
    }
  }
  if (missing.length === 0) {
    return [true, `All ${patterns.length} pattern(s) found in ${assertion.path}`];
  }
  return [false, `Pattern(s) not found in ${assertion.path}: ${JSON.stringify(missing)}`];
}

function _checkTextAbsent(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const patterns = assertion.patterns || [];
  const caseInsensitive = assertion.case_insensitive !== false;
  const content = readFileSync(target, 'utf-8');
  const searchContent = caseInsensitive ? content.toLowerCase() : content;
  const found = [];
  for (const pat of patterns) {
    const searchPat = caseInsensitive ? pat.toLowerCase() : pat;
    if (searchContent.includes(searchPat)) {
      found.push(pat);
    }
  }
  if (found.length === 0) {
    return [true, `None of ${patterns.length} pattern(s) found (correct) in ${assertion.path}`];
  }
  return [false, `Forbidden pattern(s) found in ${assertion.path}: ${JSON.stringify(found)}`];
}

function _loadJson(target) {
  try {
    const data = JSON.parse(readFileSync(target, 'utf-8'));
    return [data, null];
  } catch (exc) {
    return [null, `Invalid JSON: ${exc.message}`];
  }
}

function _checkJsonFieldExists(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const [data, err] = _loadJson(target);
  if (err) return [false, err];
  const fieldPath = assertion.field || '';
  const values = _resolveJsonPath(data, fieldPath);
  if (values.length > 0) {
    return [true, `Field '${fieldPath}' exists (${values.length} value(s))`];
  }
  return [false, `Field '${fieldPath}' not found in ${assertion.path}`];
}

function _checkJsonCountMin(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const [data, err] = _loadJson(target);
  if (err) return [false, err];
  const fieldPath = assertion.field || '';
  const minCount = assertion.min || 0;
  let values = _resolveJsonPath(data, fieldPath);
  if (values.length === 1 && Array.isArray(values[0])) {
    values = values[0];
  }
  const count = values.length;
  if (count >= minCount) {
    return [true, `Field '${fieldPath}' has ${count} item(s) (min ${minCount})`];
  }
  return [false, `Field '${fieldPath}' has ${count} item(s), expected at least ${minCount}`];
}

function _checkJsonCountMax(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const [data, err] = _loadJson(target);
  if (err) return [false, err];
  const fieldPath = assertion.field || '';
  const maxCount = assertion.max || 0;
  let values = _resolveJsonPath(data, fieldPath);
  if (values.length === 1 && Array.isArray(values[0])) {
    values = values[0];
  }
  const count = values.length;
  if (count <= maxCount) {
    return [true, `Field '${fieldPath}' has ${count} item(s) (max ${maxCount})`];
  }
  return [false, `Field '${fieldPath}' has ${count} item(s), expected at most ${maxCount}`];
}

function _checkJsonFieldRegex(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const [data, err] = _loadJson(target);
  if (err) return [false, err];

  const fieldPath = assertion.field || '';
  const idField = assertion.id_field || null;
  const pattern = assertion.pattern || '';
  const compiled = new RegExp(pattern);

  let values = _resolveJsonPath(data, fieldPath);
  if (values.length === 1 && Array.isArray(values[0])) {
    values = values[0];
  }

  if (values.length === 0) {
    return [false, `No values found at '${fieldPath}' in ${assertion.path}`];
  }

  // If id_field specified, extract that sub-field from each item
  if (idField) {
    const extracted = [];
    for (const item of values) {
      if (item !== null && typeof item === 'object' && idField in item) {
        extracted.push(item[idField]);
      }
    }
    if (extracted.length === 0) {
      return [false, `No items at '${fieldPath}' have field '${idField}'`];
    }
    values = extracted;
  }

  const mismatches = values.filter(v => !compiled.test(String(v))).map(v => String(v));
  if (mismatches.length === 0) {
    return [true, `All ${values.length} value(s) at '${fieldPath}' match pattern '${pattern}'`];
  }
  const sample = mismatches.slice(0, 5);
  return [false, `${mismatches.length} value(s) do not match '${pattern}': ${JSON.stringify(sample)}`];
}

function _checkHtmlElement(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const tag = assertion.tag || '';
  const text = assertion.text || null;
  const content = readFileSync(target, 'utf-8');
  const tagPattern = `<${tag}`;
  if (!content.toLowerCase().includes(tagPattern.toLowerCase())) {
    return [false, `No <${tag}> element found in ${assertion.path}`];
  }
  if (text) {
    if (!content.toLowerCase().includes(text.toLowerCase())) {
      return [false, `Element <${tag}> found but text '${text}' not present`];
    }
  }
  return [true, `Element <${tag}>${text ? ' with text' : ''} found`];
}

function _checkHtmlTabCount(assertion, fixtureRoot) {
  const target = join(fixtureRoot, assertion.path);
  if (!existsSync(target)) {
    return [false, `File not found: ${assertion.path}`];
  }
  const minTabs = assertion.min || 0;
  const content = readFileSync(target, 'utf-8');
  const count = content.split('id="panel-').length - 1;
  if (count >= minTabs) {
    return [true, `Found ${count} tab panel(s) (min ${minTabs})`];
  }
  return [false, `Found ${count} tab panel(s), expected at least ${minTabs}`];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const _CHECKERS = {
  file_exists: _checkFileExists,
  file_missing: _checkFileMissing,
  json_valid: _checkJsonValid,
  json_schema: _checkJsonSchema,
  section_present: _checkSectionPresent,
  text_present: _checkTextPresent,
  text_absent: _checkTextAbsent,
  json_field_exists: _checkJsonFieldExists,
  json_count_min: _checkJsonCountMin,
  json_count_max: _checkJsonCountMax,
  json_field_regex: _checkJsonFieldRegex,
  html_element: _checkHtmlElement,
  html_tab_count: _checkHtmlTabCount,
};

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

function _getActualSkillVersion(skillFile) {
  if (!skillFile) return 'unknown';
  if (!existsSync(skillFile)) return 'unknown';
  try {
    const content = readFileSync(skillFile, 'utf-8');
    const lines = content.split('\n');
    let inFrontmatter = false;
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (i === 0 && stripped === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (stripped === '---') {
          inFrontmatter = false;
          continue;
        }
        const m = stripped.match(/^version\s*:\s*(.+)$/i);
        if (m) {
          return m[1].trim().replace(/^["']|["']$/g, '');
        }
      }
      // Also look for heading-style version outside front matter
      const hm = stripped.match(/^#+\s*[Vv]ersion[:\s]+(\S+)/);
      if (hm) {
        return hm[1].trim();
      }
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function run_checks({ skillName, fixturePath, assertionsPath, skillFile = null }) {
  const result = new CheckResult({ skillName, fixturePath });
  const fixtureRoot = fixturePath;

  // Load YAML
  if (!existsSync(assertionsPath)) {
    const ar = new AssertionResult({
      id: 'INFRA-01',
      category: 'STABLE',
      description: 'Assertions file exists',
      passed: false,
      message: `Assertions file not found: ${assertionsPath}`,
    });
    result.failed.push(ar);
    return result;
  }

  const doc = yaml.load(readFileSync(assertionsPath, 'utf-8'));
  const assertionSkillVersion = String(doc.skill_version || 'unknown');
  const actualSkillVersion = _getActualSkillVersion(skillFile);

  const versionMismatch =
    assertionSkillVersion !== 'unknown' &&
    actualSkillVersion !== 'unknown' &&
    assertionSkillVersion !== actualSkillVersion;

  const assertions = doc.assertions || [];

  for (const a of assertions) {
    const aId = a.id || 'UNKNOWN';
    const category = a.category || 'BEHAVIORAL';
    const description = a.description || '';
    const aType = a.type || '';

    const checker = _CHECKERS[aType];
    if (!checker) {
      const ar = new AssertionResult({
        id: aId,
        category,
        description,
        passed: false,
        message: `Unknown assertion type: '${aType}'`,
      });
      result.skipped.push(ar);
      continue;
    }

    let passed, message;
    try {
      [passed, message] = checker(a, fixtureRoot);
    } catch (exc) {
      passed = false;
      message = `Checker raised exception: ${exc.message}`;
    }

    const ar = new AssertionResult({
      id: aId,
      category,
      description,
      passed,
      message,
    });

    if (passed) {
      result.passed.push(ar);
    } else if (versionMismatch && category !== 'STABLE') {
      result.warnings.push(ar);
    } else {
      result.failed.push(ar);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pretty printer
// ---------------------------------------------------------------------------

const _PASS = '\u2713';
const _FAIL = '\u2717';
const _WARN = '\u26A0';
const _SKIP = '\u25CB';

export function print_results(result) {
  const sep = '\u2500'.repeat(60);
  console.log(sep);
  console.log(`  Skill:   ${result.skillName}`);
  console.log(`  Fixture: ${result.fixturePath}`);
  console.log(sep);

  const allItems = [
    ...result.passed.map(r => [_PASS, r]),
    ...result.failed.map(r => [_FAIL, r]),
    ...result.warnings.map(r => [_WARN, r]),
    ...result.skipped.map(r => [_SKIP, r]),
  ];

  // Group by category
  const categories = ['STABLE', 'STRUCTURAL', 'BEHAVIORAL'];
  const grouped = Object.fromEntries(categories.map(c => [c, []]));
  const other = [];
  for (const [sym, ar] of allItems) {
    if (ar.category in grouped) {
      grouped[ar.category].push([sym, ar]);
    } else {
      other.push([sym, ar]);
    }
  }

  for (const cat of categories) {
    const items = grouped[cat];
    if (items.length === 0) continue;
    console.log(`\n  [${cat}]`);
    for (const [sym, ar] of items) {
      console.log(`    ${sym} ${ar.id}: ${ar.description}`);
      if ([_FAIL, _WARN, _SKIP].includes(sym)) {
        console.log(`       ${ar.message}`);
      }
    }
  }

  if (other.length > 0) {
    console.log('\n  [OTHER]');
    for (const [sym, ar] of other) {
      console.log(`    ${sym} ${ar.id}: ${ar.description}`);
    }
  }

  console.log();
  console.log(
    `  Totals \u2014 Passed: ${result.passed.length}  ` +
    `Failed: ${result.failed.length}  ` +
    `Warnings: ${result.warnings.length}  ` +
    `Skipped: ${result.skipped.length}  ` +
    `Total: ${result.total}`
  );

  const overall = result.failed.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\n  Overall: ${overall}`);
  console.log(sep);
}

export function print_diff_results(result) {
  print_results(result);
  if (result.failed.length > 0) {
    console.log('\n  --- Failure Details ---');
    for (const ar of result.failed) {
      console.log(`\n  ${_FAIL} ${ar.id} (${ar.category}): ${ar.description}`);
      console.log('    Expected: assertion to pass');
      console.log(`    Actual:   ${ar.message}`);
    }
  }
}
