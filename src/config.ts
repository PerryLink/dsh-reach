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
 */

import Schema from '@deepseek-ai/schemastery'

/** Raw loader config: every field optional; defaults land in {@link resolveConfig}. */
export interface Config {
  /** Push decision cards from ANY workspace/session to IM channels. */
  crossSessionNotify?: boolean
  /** Background task finished/errored notifications. */
  notifyTaskEvents?: boolean
  /** Soft timeout for decision cards in seconds (0 = wait forever). */
  cardTimeoutSec?: number
  /** Long reply chunk limit per channel message, in characters. */
  textChunkLimit?: number
  /** Silent mode: only final replies, no per-step streaming to IM. */
  silent?: boolean
  /** Default working directory for new IM sessions ('' = host cwd). */
  cwd?: string
}

/** Schemastery schema for the loader; invalid values fail the profile load loudly. */
export const Config: Schema<Config> = Schema.object({
  crossSessionNotify: Schema.boolean().default(true),
  notifyTaskEvents: Schema.boolean().default(false),
  cardTimeoutSec: Schema.number().default(1800),
  textChunkLimit: Schema.number().default(4000),
  silent: Schema.boolean().default(false),
  cwd: Schema.string(),
})

/** Fully resolved config: every field present after {@link resolveConfig}. */
export interface ResolvedConfig {
  readonly crossSessionNotify: boolean
  readonly notifyTaskEvents: boolean
  readonly cardTimeoutSec: number
  readonly textChunkLimit: number
  readonly silent: boolean
  readonly cwd: string
}

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
  return {
    crossSessionNotify: config.crossSessionNotify ?? true,
    notifyTaskEvents: config.notifyTaskEvents ?? false,
    cardTimeoutSec,
    textChunkLimit,
    silent: config.silent ?? false,
    cwd: config.cwd ?? '',
  }
}
