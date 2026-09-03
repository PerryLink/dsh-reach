/**
 * Per-channel security for `dsh-reach`: owner pairing, fail-closed sender
 * allowlists, and a bounded audit tail.
 *
 * Defaults: empty allowlist denies everyone (fail-closed); the first sender
 * the operator pairs becomes the owner; unknown senders are audited and,
 * unless `denyUnauthorized`, receive one friendly notice.
 */

/** One audit entry (bounded tail, persisted through the settings namespace). */
export interface AuditEntry {
  readonly at: string
  readonly kind: 'inbound' | 'command' | 'decision' | 'auth' | 'ignored'
  readonly sender: string
  readonly detail: string
}

/** Owner/allowlist state (persisted through the settings namespace). */
export interface SecurityState {
  readonly owner: string | undefined
  readonly allowFrom: readonly string[]
}

export const AUDIT_TAIL_LIMIT = 200

/** Assert a sender is authorized: owner, allowlisted, or (bootstrap) first sender. */
export function isAuthorized(sender: string, state: SecurityState): boolean {
  return sender === state.owner || state.allowFrom.includes(sender)
}

/**
 * Bootstrap pair: when no owner exists and the allowlist is empty, the first
 * inbound sender becomes the owner (QR login plus one chat message is the
 * pairing flow). Returns the updated state, or the same reference when no
 * change applies.
 * @param sender - inbound sender id.
 * @param state - current security state.
 * @returns updated state.
 */
export function pairOwner(sender: string, state: SecurityState): SecurityState {
  if (state.owner !== undefined) return state
  return { owner: sender, allowFrom: state.allowFrom }
}

/** Append one entry to the bounded audit tail. */
export function appendAudit(tail: readonly AuditEntry[], entry: AuditEntry): readonly AuditEntry[] {
  const next = [...tail, entry]
  return next.length > AUDIT_TAIL_LIMIT ? next.slice(next.length - AUDIT_TAIL_LIMIT) : next
}
