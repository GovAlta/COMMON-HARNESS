#!/usr/bin/env node
// Walk all candidate .md files in the HARNESS, invoke every yellow-team
// rule against each, and emit a per-file / per-rule findings count.
// Skips node_modules and the ASVS chapter quotations (external source text).
//
// Usage:  node .claude/scripts/_style_scan.mjs [--rule rule02] [--top 20]

import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')  // HARNESS/

const SKIP_DIR_RE = /(^|[\\/])(node_modules|asvs_chapters)([\\/]|$)/
const RULES = [
  'rule01_not_x_but_y',
  'rule02_em_dash',
  'rule03_tetracolon',
  'rule04_cinematic_sentences',
  'rule05_rhetorical_anchor',
  'rule06_banned_vocabulary',
  'rule07_rule_of_three',
  'rule08_participial_tail',
  'rule09_ensure_hedge',
  'rule10_intensifier',
  'rule11_decorations_emoji',
  'rule12_ai_smell',
]
const SCRIPTS_DIR = join(ROOT, '.claude/security/yellowteam/scripts')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (SKIP_DIR_RE.test(full)) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}

const args = process.argv.slice(2)
const onlyRule = args.includes('--rule') ? args[args.indexOf('--rule') + 1] : null
const top = args.includes('--top') ? parseInt(args[args.indexOf('--top') + 1], 10) : 30

const files = walk(ROOT)
const perFile = new Map()       // file → { ruleId: count }
const perRule = new Map()       // ruleId → total count

const tdir = mkdtempSync(join(tmpdir(), 'style-scan-'))
try {
  for (const rule of (onlyRule ? [onlyRule] : RULES)) {
    const scanner = join(SCRIPTS_DIR, rule + '.js')
    // The scanners take --target as a *single file* or directory. Walking
    // each file individually keeps the JSON output small and per-file.
    for (const file of files) {
      let out
      try {
        out = execSync(`node "${scanner}" --target "${file}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      } catch { continue }
      let findings
      try { findings = JSON.parse(out) } catch { continue }
      if (!Array.isArray(findings) || findings.length === 0) continue
      const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
      if (!perFile.has(rel)) perFile.set(rel, {})
      perFile.get(rel)[rule] = (perFile.get(rel)[rule] || 0) + findings.length
      perRule.set(rule, (perRule.get(rule) || 0) + findings.length)
    }
  }
} finally {
  rmSync(tdir, { recursive: true, force: true })
}

// Print per-rule totals
console.log('\n=== Findings by rule ===')
const ruleTotals = [...perRule.entries()].sort((a, b) => b[1] - a[1])
for (const [r, n] of ruleTotals) console.log(`  ${r.padEnd(32)} ${String(n).padStart(6)}`)
const grand = ruleTotals.reduce((s, [, n]) => s + n, 0)
console.log(`  ${'GRAND TOTAL'.padEnd(32)} ${String(grand).padStart(6)}`)

// Print top-N worst-offender files
console.log(`\n=== Top ${top} files by total findings ===`)
const fileTotals = [...perFile.entries()]
  .map(([f, m]) => [f, Object.values(m).reduce((s, n) => s + n, 0), m])
  .sort((a, b) => b[1] - a[1])
  .slice(0, top)
for (const [f, t, m] of fileTotals) {
  const breakdown = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r.replace('rule', 'R')}=${n}`).join(' ')
  console.log(`  ${String(t).padStart(5)}  ${f}`)
  console.log(`         ${breakdown}`)
}
console.log(`\nFiles scanned: ${files.length}.  Files with findings: ${perFile.size}.`)
