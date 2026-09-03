/**
 * WeChat iLink long-poll monitor loop.
 *
 * Ported from pan17/dsh-wechat 0.7.2 `dist/weixin/monitor.js` (MIT), which
 * ports wechat-opencode (MIT) — https://github.com/pan17/wechat-opencode.
 *
 * Recovery contract modeled on Tencent/openclaw-weixin PR #161: on
 * `errcode -14` (or the undici content-length fault) the monitor calls
 * `notifyStart` to rebuild the server-side session, then retries within
 * seconds on success or backs off exponentially up to a 5-minute ceiling,
 * surfacing a "consider re-scanning" hint after 6 consecutive failures.
 */

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000
const MAX_CONSECUTIVE_FAILURES = 3
const BACKOFF_DELAY_MS = 30_000
const RETRY_DELAY_MS = 2_000
const SESSION_EXPIRED_ERRCODE = -14
const NOTIFY_START_TIMEOUT_MS = 10_000
const RECOVERY_INITIAL_BACKOFF_MS = 5_000
const RECOVERY_MAX_BACKOFF_MS = 5 * 60_000
const RECOVERY_BACKOFF_GROWTH = 2
const RECOVERY_RETRY_AFTER_SUCCESS_MS = 5_000
const RESCAN_HINT_AFTER_FAILURES = 6

/** Raw iLink update message (transport shape, normalized by the adapter). */
export type RawUpdate = Record<string, unknown>

export interface SyncBufStore {
  load(): string
  save(buf: string): void
  clear(): void
}

export interface MonitorOptions {
  readonly baseUrl: string
  readonly token: string
  readonly syncBuf: SyncBufStore
  readonly abortSignal: AbortSignal
  readonly longPollTimeoutMs?: number
  readonly log: (message: string) => void
  readonly onMessage: (message: RawUpdate) => void
  readonly onSessionInvalid?: () => void
  readonly onSessionRecovered?: () => void
  readonly onSessionGiveUp?: () => void
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })
}

/**
 * Run the long-poll loop until the abort signal fires. Never rejects on
 * transport errors: every failure path recovers or backs off internally.
 */
export async function startMonitor(options: MonitorOptions): Promise<void> {
  const { baseUrl, token, syncBuf, abortSignal, log, onMessage } = options
  let getUpdatesBuf = syncBuf.load()
  if (getUpdatesBuf) log(`Resuming from previous sync buf (${getUpdatesBuf.length} bytes)`)
  else log('No previous sync buf, starting fresh')
  let nextTimeoutMs = options.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS
  let consecutiveFailures = 0
  let recoveryBackoffMs = RECOVERY_INITIAL_BACKOFF_MS
  let consecutiveNotifyStartFailures = 0
  const resetRecoveryState = (): void => {
    recoveryBackoffMs = RECOVERY_INITIAL_BACKOFF_MS
    consecutiveNotifyStartFailures = 0
  }
  const tryRecover = async (): Promise<boolean> => {
    log('Session timeout suspected — calling notifyStart to rebuild the server-side session...')
    try {
      const { notifyStart } = await import('./protocol.ts')
      await notifyStart({ baseUrl, token, timeoutMs: NOTIFY_START_TIMEOUT_MS, abortSignal })
      log('notifyStart succeeded; server session rebuilt.')
      return true
    } catch (error: unknown) {
      if (abortSignal.aborted) return false
      log(`notifyStart failed: ${String(error)}`)
      return false
    }
  }
  const applyRecoveryOutcome = async (recovered: boolean): Promise<void> => {
    if (recovered) {
      resetRecoveryState()
      try {
        await sleep(RECOVERY_RETRY_AFTER_SUCCESS_MS, abortSignal)
      } catch {
        return
      }
      return
    }
    consecutiveNotifyStartFailures++
    const waitMs = recoveryBackoffMs
    recoveryBackoffMs = Math.min(recoveryBackoffMs * RECOVERY_BACKOFF_GROWTH, RECOVERY_MAX_BACKOFF_MS)
    if (consecutiveNotifyStartFailures >= RESCAN_HINT_AFTER_FAILURES) {
      log(`notifyStart has failed ${consecutiveNotifyStartFailures} consecutive times (current backoff ${waitMs / 1000}s). If this persists, please re-scan the QR code for a fresh bot_token.`)
      if (consecutiveNotifyStartFailures === RESCAN_HINT_AFTER_FAILURES) options.onSessionGiveUp?.()
    } else {
      log(`notifyStart failed; backing off ${waitMs / 1000}s before retrying.`)
    }
    try {
      await sleep(waitMs, abortSignal)
    } catch {
      return
    }
  }
  while (!abortSignal.aborted) {
    try {
      const { getUpdates } = await import('./protocol.ts')
      const resp = await getUpdates({ baseUrl, token, getUpdatesBuf, timeoutMs: nextTimeoutMs })
      if (typeof resp['longpolling_timeout_ms'] === 'number' && resp['longpolling_timeout_ms'] > 0) {
        nextTimeoutMs = resp['longpolling_timeout_ms']
      }
      const isApiError = (resp['ret'] !== undefined && resp['ret'] !== 0)
        || (resp['errcode'] !== undefined && resp['errcode'] !== 0)
      if (isApiError) {
        const isSessionExpired = resp['errcode'] === SESSION_EXPIRED_ERRCODE || resp['ret'] === SESSION_EXPIRED_ERRCODE
        if (isSessionExpired) {
          options.onSessionInvalid?.()
          const recovered = await tryRecover()
          if (abortSignal.aborted) return
          await applyRecoveryOutcome(recovered)
          continue
        }
        consecutiveFailures++
        log(`getUpdates failed: ret=${String(resp['ret'])} errcode=${String(resp['errcode'])} errmsg=${String(resp['errmsg'] ?? '')} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          log(`${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off ${BACKOFF_DELAY_MS / 1000}s`)
          consecutiveFailures = 0
          await sleep(BACKOFF_DELAY_MS, abortSignal)
        } else {
          await sleep(RETRY_DELAY_MS, abortSignal)
        }
        continue
      }
      consecutiveFailures = 0
      resetRecoveryState()
      options.onSessionRecovered?.()
      if (typeof resp['get_updates_buf'] === 'string' && resp['get_updates_buf'] !== '') {
        syncBuf.save(resp['get_updates_buf'])
        getUpdatesBuf = resp['get_updates_buf']
      }
      for (const msg of (resp['msgs'] as unknown[] | undefined) ?? []) {
        onMessage(msg as RawUpdate)
      }
    } catch (err: unknown) {
      if (abortSignal.aborted) return
      const { isSessionTimeoutError } = await import('./protocol.ts')
      if (isSessionTimeoutError(err)) {
        options.onSessionInvalid?.()
        const recovered = await tryRecover()
        if (abortSignal.aborted) return
        await applyRecoveryOutcome(recovered)
        continue
      }
      consecutiveFailures++
      log(`getUpdates error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`)
      try {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          log(`${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off ${BACKOFF_DELAY_MS / 1000}s`)
          consecutiveFailures = 0
          await sleep(BACKOFF_DELAY_MS, abortSignal)
        } else {
          await sleep(RETRY_DELAY_MS, abortSignal)
        }
      } catch {
        return
      }
    }
  }
}
