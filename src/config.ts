/**
 * Loader config schema and explicit resolution for `dsh-reach`.
 *
 * Current-API notes (Schemastery 3.18, verified against the checkout):
 * - No `.nullable()` / `.optional()` builders exist; absent object keys pass
 *   through as `undefined`, so optional strings are plain `Schema.string()`
 *   (the type says string, runtime may omit it).
 * - Leaf defaults only: a `null` default never fills, so every default below
 *   is a leaf and `resolveConfig` carries the `??` chain for nested holes.
 * - Cross-field and bound checks throw in `resolveConfig` (fail loud); the
 *   loader's schema pass validates the shape itself.
 *
 * The same schema is registered as the `reach` settings namespace, so the
 * profile row and the settings page share one validated source of truth.
 */

import Schema from '@deepseek-ai/schemastery'

/** Decision-card timeout policy. */
export type ApprovalTimeoutMode = 'delegate' | 'reject' | 'wait'

/** Busy-agent inbound behavior. */
export type QueueMode = 'queue' | 'steer'

/** Raw loader config: every field optional; defaults land in {@link resolveConfig}. */
export interface Config {
  /** Push decision cards from ANY workspace/session to IM channels. */
  crossSessionNotify?: boolean
  /** Background task finished/errored notifications. */
  notifyTaskEvents?: boolean
  /** Decision-card soft timeout in seconds (0 = wait forever). */
  cardTimeoutSec?: number
  /** What a timed-out card does: delegate to the next answerer (GUI), reject, or keep waiting. */
  approvalOnTimeout?: ApprovalTimeoutMode
  /** Long reply chunk limit per channel message, in characters. */
  textChunkLimit?: number
  /** Silent mode: only final replies, no per-step streaming to IM. */
  silent?: boolean
  /** Default working directory for new IM sessions ('' = host cwd). */
  cwd?: string
  /** iLink gateway base URL. */
  baseUrl?: string
  /** iLink media CDN base URL. */
  cdnBaseUrl?: string
  /** iLink bot type. */
  botType?: string
  /** Sender allowlist (iLink user ids). Empty = fail-closed: no one is authorized until the owner pairs. */
  allowFrom?: string[]
  /** Busy-agent inbound behavior. */
  queueMode?: QueueMode
  /** Queued inbound message cap before the oldest is dropped. */
  maxQueue?: number
  /** Outbound message budget per window (the iLink send window). */
  sendBudget?: number
  /** Outbound budget window in seconds. */
  windowSec?: number
  /** Reject (never answer) unauthorized senders instead of a friendly notice. */
  denyUnauthorized?: boolean
  /** Optional decision auth code: replies must carry `:<code>` to take effect ('' = off). */
  authCode?: string
  /** Busy-task progress digest interval in seconds (0 = off). */
  digestSec?: number
  /** Optional bearer token for the local push API ('' = loopback-only, no token). */
  pushToken?: string
  /** Optional Telegram bot token (prefer the dsh-reach/telegram-token credential). */
  telegramToken?: string
}

/** Schemastery schema for the loader and the settings namespace. */
export const Config: Schema<Config> = Schema.object({
  crossSessionNotify: Schema.boolean().default(true),
  notifyTaskEvents: Schema.boolean().default(false),
  cardTimeoutSec: Schema.number().default(1800),
  approvalOnTimeout: Schema.union(['delegate', 'reject', 'wait'] as const).default('delegate'),
  textChunkLimit: Schema.number().default(4000),
  silent: Schema.boolean().default(false),
  cwd: Schema.string(),
  baseUrl: Schema.string(),
  cdnBaseUrl: Schema.string(),
  botType: Schema.string(),
  allowFrom: Schema.array(Schema.string()),
  queueMode: Schema.union(['queue', 'steer'] as const).default('queue'),
  maxQueue: Schema.number().default(50),
  sendBudget: Schema.number().default(10),
  windowSec: Schema.number().default(60),
  denyUnauthorized: Schema.boolean().default(false),
  authCode: Schema.string(),
  digestSec: Schema.number().default(300),
  pushToken: Schema.string(),
  telegramToken: Schema.string(),
})

/** Fully resolved config: every field present after {@link resolveConfig}. */
export interface ResolvedConfig {
  readonly crossSessionNotify: boolean
  readonly notifyTaskEvents: boolean
  readonly cardTimeoutSec: number
  readonly approvalOnTimeout: ApprovalTimeoutMode
  readonly textChunkLimit: number
  readonly silent: boolean
  readonly cwd: string
  readonly baseUrl: string
  readonly cdnBaseUrl: string
  readonly botType: string
  readonly allowFrom: readonly string[]
  readonly queueMode: QueueMode
  readonly maxQueue: number
  readonly sendBudget: number
  readonly windowSec: number
  readonly denyUnauthorized: boolean
  readonly authCode: string
  readonly digestSec: number
  readonly pushToken: string
  readonly telegramToken: string
}

const APPROVAL_TIMEOUT_MODES: readonly ApprovalTimeoutMode[] = ['delegate', 'reject', 'wait']
const QUEUE_MODES: readonly QueueMode[] = ['queue', 'steer']

/**
 * Fill defaults and enforce bounds; throws on out-of-range values so a bad
 * row never loads with silently clamped behavior.
 * @param config - raw loader config (defaults already applied by the schema pass).
 * @returns the resolved configuration.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const cardTimeoutSec = config.cardTimeoutSec ?? 1800
  if (cardTimeoutSec < 0) throw new TypeError('dsh-reach: cardTimeoutSec must be >= 0')
  const textChunkLimit = config.textChunkLimit ?? 4000
  if (textChunkLimit < 1 || textChunkLimit > 100000) {
    throw new TypeError('dsh-reach: textChunkLimit must be 1..100000')
  }
  const maxQueue = config.maxQueue ?? 50
  if (maxQueue < 1 || maxQueue > 1000) throw new TypeError('dsh-reach: maxQueue must be 1..1000')
  const sendBudget = config.sendBudget ?? 10
  if (sendBudget < 1 || sendBudget > 1000) throw new TypeError('dsh-reach: sendBudget must be 1..1000')
  const windowSec = config.windowSec ?? 60
  if (windowSec < 1 || windowSec > 86400) throw new TypeError('dsh-reach: windowSec must be 1..86400')
  const digestSec = config.digestSec ?? 300
  if (digestSec < 0 || digestSec > 86400) throw new TypeError('dsh-reach: digestSec must be 0..86400')
  const onTimeout = config.approvalOnTimeout ?? 'delegate'
  if (!APPROVAL_TIMEOUT_MODES.includes(onTimeout)) throw new TypeError(`dsh-reach: unknown approvalOnTimeout "${String(onTimeout)}"`)
  const queueMode = config.queueMode ?? 'queue'
  if (!QUEUE_MODES.includes(queueMode)) throw new TypeError(`dsh-reach: unknown queueMode "${String(queueMode)}"`)
  return {
    crossSessionNotify: config.crossSessionNotify ?? true,
    notifyTaskEvents: config.notifyTaskEvents ?? false,
    cardTimeoutSec,
    approvalOnTimeout: onTimeout,
    textChunkLimit,
    silent: config.silent ?? false,
    cwd: config.cwd ?? '',
    baseUrl: config.baseUrl ?? 'https://ilinkai.weixin.qq.com',
    cdnBaseUrl: config.cdnBaseUrl ?? 'https://novac2c.cdn.weixin.qq.com/c2c',
    botType: config.botType ?? '3',
    allowFrom: Object.freeze([...(config.allowFrom ?? [])]),
    queueMode,
    maxQueue,
    sendBudget,
    windowSec,
    denyUnauthorized: config.denyUnauthorized ?? false,
    authCode: config.authCode ?? '',
    digestSec,
    pushToken: config.pushToken ?? '',
    telegramToken: config.telegramToken ?? '',
  }
}
