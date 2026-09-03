// check-credential-leak.mjs — scan the shipped surface (built lib/, the
// bundle patch, and docs/config files) for credential-like literals: API-key
// shapes, Telegram bot-token shapes, Bearer secrets, and iLink bot_token
// blobs with real values. A hit fails the release gate.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const PATTERNS = [
  { label: 'api key', regex: /sk-[A-Za-z0-9]{20,}/gu },
  { label: 'telegram bot token', regex: /\d{8,10}:[A-Za-z0-9_-]{30,}/gu },
  { label: 'bearer secret', regex: /Bearer\s+[A-Za-z0-9._-]{20,}/gu },
  { label: 'ilink bot_token blob', regex: /["']bot_token["']\s*:\s*["'][A-Za-z0-9_-]{20,}["']/gu },
]

const SCAN_ROOTS = ['lib', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'README.es.md', 'README.pt.md', 'README.hi.md', 'CHANGELOG.md', 'AGENTS.md', 'ARCHITECTURE.md', 'docs']

const collect = (dir) => {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(full)
    }
  }
  if (statSync(dir).isDirectory()) walk(dir)
  else out.push(dir)
  return out
}

const failures = []
for (const target of SCAN_ROOTS) {
  const full = path.join(root, target)
  let files
  try {
    files = collect(full)
  } catch {
    continue
  }
  for (const file of files) {
    // Source maps embed sources; scan them too but never the raw src/ tree.
    if (file.includes('node_modules')) continue
    const text = readFileSync(file, 'utf8')
    for (const { label, regex } of PATTERNS) {
      regex.lastIndex = 0
      const match = regex.exec(text)
      if (match) failures.push(`${path.relative(root, file)}: ${label} literal "${match[0].slice(0, 12)}…"`)
    }
  }
}
if (failures.length > 0) {
  console.error('credential leak detected:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('credential-leak: shipped surface clean')
