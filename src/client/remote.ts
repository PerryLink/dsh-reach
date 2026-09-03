/**
 * The client-side Remote face of the `reach` namespace: the hand-written
 * `TypertRemoteContribution` mounted through `ctx.remote.$mount`, plus the
 * declaration merging that types `ctx.remote.reach`. The descriptor list is
 * shared with the host `./typert` manifest (`../wire.ts`), so the two faces
 * can never drift.
 *
 * @module dsh-reach/client/remote
 */

import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { REACH_INVOCATIONS } from '../wire.ts'
import type { ReachConfigInput, ReachConfigResult, ReachStatus } from '../wire.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$reach {
    status: () => Promise<RemoteResult<ReachStatus>>
    config: (input: ReachConfigInput) => Promise<RemoteResult<ReachConfigResult>>
    relogin: () => Promise<RemoteResult<ReachConfigResult>>
    logout: () => Promise<RemoteResult<ReachConfigResult>>
  }
  interface TypertRemoteMap {
    'reach/status': () => Promise<RemoteResult<ReachStatus>>
    'reach/config': (input: ReachConfigInput) => Promise<RemoteResult<ReachConfigResult>>
    'reach/relogin': () => Promise<RemoteResult<ReachConfigResult>>
    'reach/logout': () => Promise<RemoteResult<ReachConfigResult>>
  }
  interface TypertRemoteNamespaceMap {
    reach: TypertRemoteNamespace$reach
  }
}

/** The client Remote contribution for the `reach` namespace. */
export const REACH_REMOTE = Object.freeze({
  package: 'dsh-reach',
  descriptors: REACH_INVOCATIONS,
} satisfies TypertRemoteContribution)
