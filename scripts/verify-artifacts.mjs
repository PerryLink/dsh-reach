// Verify the built artifacts after `pnpm run build`: syntax-check the node
// bundle, import the ESM host face under plain Node, and assert the entry
// contract. Guards against TypeScript-only syntax leaking into shipped
// output. (The client bundle and Typert manifest checks land with those
// faces in Phase 1.)
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const required = ['lib/index.js', 'lib/types/index.d.ts']
for (const rel of required) {
  if (!existsSync(path.join(root, rel))) throw new Error(`missing artifact: ${rel}`)
}

// 1. Syntax-check the node bundle (plain Node parse; no execution).
execFileSync(process.execPath, ['--check', path.join(root, 'lib/index.js')], { stdio: 'inherit' })

// 2. The ESM host face must import under plain Node (no tsx, no checkout paths).
const index = await import(pathToFileURL(path.join(root, 'lib/index.js')).href)
if (typeof index.apply !== 'function' || index.name !== 'reach') {
  throw new Error('lib/index.js exports an unexpected plugin face')
}
if ('default' in index) {
  throw new Error('lib/index.js must not carry a default export (Loader unwraps exports.default ?? exports)')
}

console.log('artifacts OK: syntax + ESM import + entry contract')
