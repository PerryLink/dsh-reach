// check-contract-drift.mjs — assert the host contracts `dsh-reach` depends on
// still export the required faces. Runs against the installed published peers
// (plain Node, no checkout paths): a drifting shape fails loud here before a
// user's profile load does.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const CHECKS = [
  {
    label: 'approval waterfall service',
    module: '@deepseek-ai/dsh-user-approval',
    exports: ['ApprovalService', 'ApprovalRequestId'],
    methods: [['ApprovalService', 'request']],
  },
  {
    label: 'user-questions service',
    module: '@deepseek-ai/dsh-user-questions',
    exports: ['UserQuestionService', 'UserQuestionError'],
    methods: [['UserQuestionService', 'ask']],
  },
  {
    label: 'commands registry',
    module: '@deepseek-ai/dsh-commands',
    exports: ['CommandRuntime'],
    methods: [['CommandRuntime', 'register'], ['CommandRuntime', 'find'], ['CommandRuntime', 'execute']],
  },
  {
    label: 'credentials seam',
    module: '@deepseek-ai/dsh-credentials',
    // readRecord/modifyRecord/deleteRecord are ABSTRACT on the base provider;
    // the concrete provider implements them, so only the seam identity is
    // asserted here.
    exports: ['CredentialProvider', 'credentialKey'],
  },
  {
    label: 'workspace registry',
    module: '@deepseek-ai/dsh-workspace',
    exports: ['WorkspaceRegistry'],
    methods: [['WorkspaceRegistry', 'list'], ['WorkspaceRegistry', 'create']],
  },
  {
    label: 'session identity',
    module: '@deepseek-ai/dsh-session',
    exports: ['SessionId'],
  },
  {
    label: 'tool DSL',
    module: '@deepseek-ai/dsh-tools',
    exports: ['defineTool'],
  },
  {
    label: 'typert remote base',
    module: '@deepseek-ai/dsh-typert-protocol',
    exports: ['TypertRemoteService'],
  },
  {
    label: 'llm message factory',
    module: '@deepseek-ai/dsh-llm',
    exports: ['createUserMessage'],
  },
  {
    label: 'settings seam',
    module: '@deepseek-ai/dsh-settings',
    exports: ['default', 'SettingsConflictError'],
  },
]

const failures = []
for (const check of CHECKS) {
  let mod
  try {
    mod = require(check.module)
  } catch (error) {
    failures.push(`${check.label}: cannot import ${check.module}: ${String(error)}`)
    continue
  }
  for (const name of check.exports) {
    if (mod[name] === undefined) failures.push(`${check.label}: missing export ${name}`)
  }
  for (const [cls, method] of check.methods ?? []) {
    const target = mod[cls]
    if (target !== undefined && typeof target?.prototype?.[method] !== 'function') {
      failures.push(`${check.label}: ${cls}.prototype.${method} is not a function`)
    }
  }
}
if (failures.length > 0) {
  console.error('contract drift detected:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`contract-drift: ${CHECKS.length} seams verified against the published peers`)
