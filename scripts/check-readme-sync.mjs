// check-readme-sync.mjs — the five READMEs must exist and carry the same
// version header and the canonical install line (the CI 标配 README 声明).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version

const files = ['README.md', 'README.zh.md', 'README.es.md', 'README.pt.md', 'README.hi.md']
const failures = []
for (const file of files) {
  const full = path.join(root, file)
  if (!existsSync(full)) {
    failures.push(`${file} missing`)
    continue
  }
  const text = readFileSync(full, 'utf8')
  if (!text.includes(`# dsh-reach`)) failures.push(`${file} missing the # dsh-reach heading`)
  if (!text.includes(`dsh1024 plugin --profile web add dsh-reach`)) failures.push(`${file} missing the dsh1024 install line`)
  if (!text.includes(`${version}`)) failures.push(`${file} missing the ${version} version stamp`)
}
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`readme-sync: ${files.length} READMEs aligned on v${version}`)
