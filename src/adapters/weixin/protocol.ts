/**
 * WeChat iLink HTTP API client.
 *
 * Ported from pan17/dsh-wechat 0.7.2 `dist/weixin/api.js` + `dist/utils/network.js`
 * (MIT), which adapt @tencent-weixin/openclaw-weixin api/api.ts and
 * wechat-opencode (MIT) — https://github.com/pan17/wechat-opencode.
 * Includes the openclaw-weixin PR #161 `-14` recovery contract.
 */

import crypto from 'node:crypto'

const CHANNEL_VERSION = '1.0.2'
const SESSION_EXPIRED_ERRCODE = -14

/** Thrown when the iLink gateway reports a dead server-side session. */
export class SessionTimeoutError extends Error {
  readonly code = 'SESSION_TIMEOUT'
  constructor(message = 'session timeout') {
    super(message)
    this.name = 'SessionTimeoutError'
  }
}

/** A parseable iLink business rejection returned inside an HTTP 200 body. */
export class IlinkApiError extends Error {
  readonly code = 'ILINK_API_ERROR'
  constructor(
    readonly endpoint: string,
    readonly ret: number | undefined,
    readonly errcode: number | undefined,
    readonly errmsg: string | undefined,
  ) {
    const status = ret !== undefined ? `ret=${ret}` : `errcode=${errcode}`
    super(`${endpoint}: ${status}${errmsg ? ` ${errmsg}` : ''}`)
    this.name = 'IlinkApiError'
  }
}

/** True for the real continuous-send-limit response: HTTP 200 + { ret: -2, errmsg: "prepare failed" }. */
export function isMessageLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const value = err as { name?: string; ret?: number; errcode?: number; errmsg?: string }
  return value.name === 'IlinkApiError'
    && (value.ret === -2 || value.errcode === -2)
    && typeof value.errmsg === 'string'
    && value.errmsg.trim().toLowerCase() === 'prepare failed'
}

function isSessionTimeoutApiBody(value: unknown): value is { errmsg?: string } {
  if (!value || typeof value !== 'object') return false
  const obj = value as { errcode?: number; ret?: number }
  return obj.errcode === SESSION_EXPIRED_ERRCODE || obj.ret === SESSION_EXPIRED_ERRCODE
}

/**
 * Detect undici's `InvalidArgumentError: invalid content-length header` by
 * walking the cause chain — the iLink gateway ships a malformed
 * Content-Length with HTTP 200 + `{"errcode":-14,...}` bodies.
 */
export function isSessionTimeoutContentLengthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  let current: unknown = err
  const seen = new Set<unknown>()
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const obj = current as { name?: string; code?: string; message?: string; cause?: unknown }
    if ((obj.name === 'InvalidArgumentError' || obj.code === 'UND_ERR_INVALID_ARG')
      && typeof obj.message === 'string' && /content-length/i.test(obj.message)) {
      return true
    }
    current = obj.cause
  }
  return false
}

/** Session timeout whether it arrived as JSON `-14` or the undici header fault. */
export function isSessionTimeoutError(err: unknown): boolean {
  if (isSessionTimeoutContentLengthError(err)) return true
  if (!err || typeof err !== 'object') return false
  const obj = err as { name?: string; code?: string }
  return obj.name === 'SessionTimeoutError' || obj.code === 'SESSION_TIMEOUT'
}

export const RETRYABLE_NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
])

/** Walk the cause chain for a known transient network-failure code. */
export function isRetryableNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  let current: unknown = err
  const seen = new Set<unknown>()
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const obj = current as { name?: string; code?: string; cause?: unknown }
    if (obj.name === 'AbortError') return false
    if (typeof obj.code === 'string' && RETRYABLE_NETWORK_ERROR_CODES.has(obj.code)) return true
    current = obj.cause
  }
  return false
}

export interface ApiPostOptions {
  readonly retries?: number
  readonly baseDelayMs?: number
  readonly abortSignal?: AbortSignal
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
  }
  if (token?.trim()) headers['Authorization'] = `Bearer ${token.trim()}`
  return headers
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface PostParams {
  readonly baseUrl: string
  readonly endpoint: string
  readonly body: Record<string, unknown>
  readonly token: string
  readonly timeoutMs?: number
  readonly options?: ApiPostOptions
}

export async function apiPost(params: PostParams): Promise<Record<string, unknown>> {
  const { baseUrl, endpoint, token } = params
  const url = `${baseUrl.replace(/\/$/, '')}/${endpoint}`
  const payload = { ...params.body, base_info: { channel_version: CHANNEL_VERSION } }
  const bodyStr = JSON.stringify(payload)
  const retries = params.options?.retries ?? 2
  const baseDelayMs = params.options?.baseDelayMs ?? 1000
  const timeoutMs = params.timeoutMs ?? 15_000
  const maxAttempts = retries + 1
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let externalAbortListener: (() => void) | undefined
    if (params.options?.abortSignal) {
      if (params.options.abortSignal.aborted) controller.abort()
      else {
        externalAbortListener = () => controller.abort()
        params.options?.abortSignal.addEventListener('abort', externalAbortListener, { once: true })
      }
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(token),
        body: bodyStr,
        signal: controller.signal,
      })
      clearTimeout(timer)
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
      const parsed = (text.trim() ? JSON.parse(text) : {}) as Record<string, unknown>
      if (isSessionTimeoutApiBody(parsed)) {
        throw new SessionTimeoutError(typeof parsed['errmsg'] === 'string' ? parsed['errmsg'] : 'session timeout')
      }
      return parsed
    } catch (err: unknown) {
      clearTimeout(timer)
      const error = err as { name?: string }
      // AbortError sentinel: the long-poll timed out, no messages.
      if (error?.name === 'AbortError') return { ret: 0, msgs: [] }
      // Session timeout: skip retries — the token is rejected server-side.
      if (isSessionTimeoutError(err)) {
        lastError = err
        break
      }
      lastError = err
      const isLastAttempt = attempt >= retries
      if (isLastAttempt || !isRetryableNetworkError(err)) break
      const delayMs = baseDelayMs * 2 ** attempt
      console.error(`apiPost ${endpoint} failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delayMs}ms: ${String(err)}`)
      await sleep(delayMs)
    } finally {
      if (externalAbortListener && params.options?.abortSignal) {
        params.options.abortSignal.removeEventListener('abort', externalAbortListener)
      }
    }
  }
  const cause = (lastError as { cause?: unknown } | undefined)?.cause
  if (cause !== undefined) {
    const wrapped = new Error(`${String((lastError as Error).message)}: ${String(cause)}`)
    ;(wrapped as { cause?: unknown }).cause = cause
    throw wrapped
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function apiGet(baseUrl: string, path: string): Promise<Record<string, unknown>> {
  const url = `${baseUrl.replace(/\/$/, '')}/${path}`
  const res = await fetch(url, { headers: buildHeaders(undefined) })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

function assertSendMessageAccepted(resp: Record<string, unknown>): void {
  if (isSessionTimeoutApiBody(resp)) {
    throw new SessionTimeoutError(typeof resp['errmsg'] === 'string' ? resp['errmsg'] : 'session timeout')
  }
  const rejected = (typeof resp['ret'] === 'number' && resp['ret'] !== 0)
    || (typeof resp['errcode'] === 'number' && resp['errcode'] !== 0)
  if (rejected) {
    throw new IlinkApiError(
      'ilink/bot/sendmessage',
      typeof resp['ret'] === 'number' ? resp['ret'] : undefined,
      typeof resp['errcode'] === 'number' ? resp['errcode'] : undefined,
      typeof resp['errmsg'] === 'string' ? resp['errmsg'] : undefined,
    )
  }
}

export interface GetUpdatesParams {
  readonly baseUrl: string
  readonly token: string
  readonly getUpdatesBuf: string
  readonly timeoutMs?: number
}

/** Long-poll getupdates: no internal retry — the monitor owns backoff. */
export async function getUpdates(params: GetUpdatesParams): Promise<Record<string, unknown>> {
  return apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getupdates',
    body: { get_updates_buf: params.getUpdatesBuf },
    token: params.token,
    timeoutMs: params.timeoutMs ?? 38_000,
    options: { retries: 0 },
  })
}

export interface SendMessageParams {
  readonly baseUrl: string
  readonly token: string
  readonly body: Record<string, unknown>
  readonly retries?: number
}

export async function sendMessage(params: SendMessageParams): Promise<void> {
  const resp = await apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: params.body,
    token: params.token,
    options: { retries: params.retries ?? 2 },
  })
  assertSendMessageAccepted(resp)
}

export async function sendTyping(params: { baseUrl: string; token: string; body: Record<string, unknown> }): Promise<void> {
  await apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendtyping',
    body: params.body,
    token: params.token,
    timeoutMs: 10_000,
  })
}

export async function getBotQrcode(params: { baseUrl: string; botType: string }): Promise<Record<string, unknown>> {
  return apiGet(params.baseUrl, `ilink/bot/get_bot_qrcode?bot_type=${params.botType}`)
}

export async function getQrcodeStatus(params: { baseUrl: string; qrcode: string }): Promise<Record<string, unknown>> {
  return apiGet(params.baseUrl, `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(params.qrcode)}`)
}

export async function notifyStart(params: {
  baseUrl: string
  token: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<void> {
  await apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/msg/notifystart',
    body: { base_info: { channel_version: CHANNEL_VERSION } },
    token: params.token,
    timeoutMs: params.timeoutMs ?? 10_000,
    options: {
      retries: 0,
      ...(params.abortSignal !== undefined ? { abortSignal: params.abortSignal } : {}),
    },
  })
}

export async function notifyStop(params: {
  baseUrl: string
  token: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<void> {
  await apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/msg/notifystop',
    body: { base_info: { channel_version: CHANNEL_VERSION } },
    token: params.token,
    timeoutMs: params.timeoutMs ?? 10_000,
    options: {
      retries: 0,
      ...(params.abortSignal !== undefined ? { abortSignal: params.abortSignal } : {}),
    },
  })
}

export async function getUploadUrl(params: {
  baseUrl: string
  token: string
  body: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  return apiPost({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    body: params.body,
    token: params.token,
  })
}
