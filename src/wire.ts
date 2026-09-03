/**
 * Wire vocabulary + zod v4 codecs for the `reach` Remote namespace, plus the
 * invocation descriptors shared verbatim by the host `./typert` manifest and
 * the client Remote contribution (`src/client/remote.ts`) so the two faces
 * can never drift.
 */

import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

export const reachStatusSchema = z.object({
  phase: z.enum(['unconfigured', 'logged-out', 'waiting-scan', 'scanned', 'logged-in', 'failed']),
  accountId: z.string().optional(),
  userId: z.string().optional(),
  monitorRunning: z.boolean(),
  lastError: z.string().optional(),
  pendingCards: z.number(),
  outboundQueue: z.number(),
  silent: z.boolean(),
  crossSessionNotify: z.boolean(),
  notifyTaskEvents: z.boolean(),
  queueMode: z.enum(['queue', 'steer']),
})

export type ReachStatus = z.infer<typeof reachStatusSchema>

export const reachConfigSchema = z.object({
  crossSessionNotify: z.boolean().optional(),
  notifyTaskEvents: z.boolean().optional(),
  silent: z.boolean().optional(),
  queueMode: z.enum(['queue', 'steer']).optional(),
  allowFrom: z.array(z.string()).optional(),
})

export type ReachConfigInput = z.infer<typeof reachConfigSchema>

export const reachConfigResultSchema = z.object({ ok: z.boolean(), reason: z.string().optional() })
export type ReachConfigResult = z.infer<typeof reachConfigResultSchema>

/** Frozen source position both faces carry (diagnostics only). */
const SOURCE = Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 })

/** The `reach/status` invocation descriptor. */
export const REACH_STATUS_DESCRIPTOR = Object.freeze({
  id: 'dsh-reach#reach/status',
  service: 'reach',
  namespace: 'reach',
  method: 'status',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-reach/types#ReachStatus',
    schema: reachStatusSchema,
  }),
  sourceLocation: SOURCE,
} as const) satisfies InvocationDescriptor

/** The `reach/config` invocation descriptor. */
export const REACH_CONFIG_DESCRIPTOR = Object.freeze({
  id: 'dsh-reach#reach/config',
  service: 'reach',
  namespace: 'reach',
  method: 'config',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([Object.freeze({
    name: 'input',
    wire: 'input',
    source: 'json',
    codec: Object.freeze({
      mode: 'strict',
      typeSymbol: 'dsh-reach/types#ReachConfigInput',
      schema: reachConfigSchema,
    }),
  } satisfies InvocationDescriptor['parameters'][number])]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-reach/types#ReachConfigResult',
    schema: reachConfigResultSchema,
  }),
  sourceLocation: SOURCE,
} as const) satisfies InvocationDescriptor

/** The `reach/relogin` invocation descriptor. */
export const REACH_RELOGIN_DESCRIPTOR = Object.freeze({
  id: 'dsh-reach#reach/relogin',
  service: 'reach',
  namespace: 'reach',
  method: 'relogin',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-reach/types#ReachConfigResult',
    schema: reachConfigResultSchema,
  }),
  sourceLocation: SOURCE,
} as const) satisfies InvocationDescriptor

/** The `reach/logout` invocation descriptor. */
export const REACH_LOGOUT_DESCRIPTOR = Object.freeze({
  id: 'dsh-reach#reach/logout',
  service: 'reach',
  namespace: 'reach',
  method: 'logout',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-reach/types#ReachConfigResult',
    schema: reachConfigResultSchema,
  }),
  sourceLocation: SOURCE,
} as const) satisfies InvocationDescriptor

/**
 * The invocation descriptors the host `./typert` manifest and the client
 * Remote contribution share as the exact same object list.
 */
export const REACH_INVOCATIONS = Object.freeze([
  REACH_STATUS_DESCRIPTOR,
  REACH_CONFIG_DESCRIPTOR,
  REACH_RELOGIN_DESCRIPTOR,
  REACH_LOGOUT_DESCRIPTOR,
])
