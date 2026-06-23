#!/usr/bin/env node
// Run all 12 yellow-team rule scanners against a single file and print
// a one-line-per-rule summary. Exit 0 only when every rule returns [].
// Usage:  node .claude/scripts/_verify_file.mjs <file>

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SCRIPTS = join(ROOT, '.claude/security/yellowteam/scripts')

const file = process.argv[2]
if (!file) { console.error('usage: _verify_file.mjs <file>'); process.exit(2) }

const RULES = [1,2,3,4,5,6,7,8,9,10,11,12].map((n) => {
  const names = ['not_x_but_y','em_dash','tetracolon','cinematic_sentences','rhetorical_anchor',
    'banned_vocabulary','rule_of_three','participial_tail','ensure_hedge','intensifier',
    'decorations_emoji','ai_smell']
  const tag = String(n).padStart(2, '0')
  return { id: n, name: names[n-1], path: join(SCRIPTS, `rule${tag}_${names[n-1]}.js`) }
})

let total = 0
const detail = []
for (const r of RULES) {
  let out
  try {
    out = execSync(`node "${r.path}" --target "${file}"`, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], maxBuffer: 10*1024*1024 })
  } catch (e) {
    detail.push(`R${String(r.id).padStart(2,'0')} ${r.name.padEnd(22)} ERROR`)
    continue
  }
  let n = 0
  try { n = JSON.parse(out).length } catch { n = -1 }
  total += Math.max(n, 0)
  if (n > 0) detail.push(`R${String(r.id).padStart(2,'0')} ${r.name.padEnd(22)} ${n}`)
}
if (detail.length === 0) {
  console.log('CLEAN  ' + file)
  process.exit(0)
}
console.log(`DIRTY (${total}) ${file}`)
for (const d of detail) console.log('  ' + d)
process.exit(1)
