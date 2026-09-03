/**
 * QQ official-bot channel adapter for `dsh-reach` (q.qq.com OpenAPI) — the
 * v2 drop-in foundation. REST + websocket through Node built-ins (fetch +
 * the global WebSocket), zero SDK dependencies; the `QqTransport` seam keeps
 * the adapter logic unit-testable with a fake transport, mirroring the
 * feishu adapter layout. Real-device verification is pending (documented).
 *
 * Credentials: the `dsh-reach/qq-app` grant record ({appId, clientSecret}).
 * Chat ids are channel-normalized: `qq:<openid>` (DM), `qq:g:<group_openid>`
 * (group), `qq:c:<channel_id>` (guild channel) — routing and endpoint choice
 * both read the prefix.
 */

import crypto from 'node:crypto'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'

/** OpenAPI base; `REACH_QQ_BASE` lets tests point at a fake server. */
function apiBase(): string {
  return process.env['REACH_QQ_BASE'] ?? 'https://api.sgroup.qq.com'
}

/** Transport seam: production = the REST+websocket client; tests = a fake. */
export interface QqTransport {
  readonly id: string
  start(onEvent: (event: QqEvent) => void, onDisconnected: () => void): void
  stop(): void
  sendText(chatId: string, text: string): Promise<void>
}

/** Normalized event the adapter consumes (chat id already `qq:`-prefixed). */
export interface QqEvent {
  readonly type: 'message'
  readonly chatId: string | undefined
  readonly text: string | undefined
}

export interface QqAdapterOptions {
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly transport: QqTransport
  readonly log: (message: string) => void
}

/** Grant-record payload for the QQ app credentials. */
export interface QqAppGrant {
  readonly appId: string
  readonly clientSecret: string
}

/** Chat-id prefix → the message-send endpoint segment. */
export type QqChatKind = 'dm' | 'group' | 'channel'

/** Decode a `qq:`-prefixed chat id into its target kind and platform id. */
export function parseQqChatId(chatId: string): { kind: QqChatKind; id: string } | undefined {
  if (chatId.startsWith('qq:g:')) return { kind: 'group', id: chatId.slice('qq:g:'.length) }
  if (chatId.startsWith('qq:c:')) return { kind: 'channel', id: chatId.slice('qq:c:'.length) }
  if (chatId.startsWith('qq:')) return { kind: 'dm', id: chatId.slice('qq:'.length) }
  return undefined
}

/** Strip CQ-style mention tags (`<@!123>`, `<@#hash>`) from QQ message content. */
export function stripCqTags(content: string): string {
  return content.replace(/<@(![^>]*|#[^>]*)>/gu, '').trim()
}

/**
 * Normalize a websocket dispatch frame (`{op, t, d}`) to a {@link QqEvent}.
 * Handles C2C (DM), group-@, and guild-channel message creates; other event
 * types pass through as `undefined`.
 */
export function normalizeQqEvent(data: unknown): QqEvent | undefined {
  const frame = data as { readonly op?: number; readonly t?: string; readonly d?: Record<string, unknown> } | null
  if (!frame || frame.op !== 0 || frame.d === undefined) return undefined
  const d = frame.d
  const content = typeof d['content'] === 'string' ? stripCqTags(d['content']) : undefined
  if (content === undefined || content === '') return undefined
  if (frame.t === 'C2C_MESSAGE_CREATE') {
    const author = d['author'] as { readonly user_openid?: string } | undefined
    if (typeof author?.user_openid !== 'string') return undefined
    return { type: 'message', chatId: `qq:${author.user_openid}`, text: content }
  }
  if (frame.t === 'GROUP_AT_MESSAGE_CREATE' && typeof d['group_openid'] === 'string') {
    return { type: 'message', chatId: `qq:g:${d['group_openid']}`, text: content }
  }
  if (frame.t === 'AT_MESSAGE_CREATE' && typeof d['channel_id'] === 'string') {
    return { type: 'message', chatId: `qq:c:${d['channel_id']}`, text: content }
  }
  return undefined
}

export class QqAdapter implements ChannelAdapter {
  readonly id = 'qq'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: false }

  private phase: ChannelStatus['phase'] = 'unconfigured'
  private monitorRunning = false
  private lastError: string | undefined
  private appId = ''
  private clientSecret = ''
  private readonly ready: Promise<void>

  constructor(private readonly options: QqAdapterOptions) {
    this.ready = this.restore()
  }

  private async restore(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'grant') {
      const grant = record.payload as Partial<QqAppGrant>
      if (typeof grant.appId === 'string' && grant.appId) this.appId = grant.appId
      if (typeof grant.clientSecret === 'string' && grant.clientSecret) this.clientSecret = grant.clientSecret
    }
    if (this.appId && this.clientSecret) this.phase = 'logged-out'
  }

  /** Current effective app credentials (post grant-restore). */
  credentials(): { readonly appId: string; readonly clientSecret: string } {
    return { appId: this.appId, clientSecret: this.clientSecret }
  }

  status(): ChannelStatus {
    return { phase: this.phase, accountId: this.appId || undefined, userId: undefined, monitorRunning: this.monitorRunning, lastError: this.lastError }
  }

  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void {
    void this.ready.then(() => {
      if (signal.aborted || !this.appId || !this.clientSecret) return
      this.monitorRunning = true
      this.phase = 'logged-in'
      this.options.transport.start(
        (event) => {
          if (signal.aborted || event.chatId === undefined || event.text === undefined) return
          onMessage({ sender: event.chatId, chatId: event.chatId, parts: [{ type: 'text', text: event.text }] })
        },
        () => {
          this.phase = 'failed'
          this.lastError = 'ws disconnected'
          onSessionInvalid()
        },
      )
    })
  }

  async send(request: OutboundRequest): Promise<void> {
    for (const part of request.parts) {
      if (part.type !== 'text') continue
      await this.options.transport.sendText(request.chatId, part.text)
    }
  }

  async login(): Promise<string> {
    await this.ready
    if (!this.appId || !this.clientSecret) throw new Error('qq: set the dsh-reach/qq-app grant record (appId + clientSecret)')
    this.phase = 'logged-in'
    return this.appId
  }

  async logout(): Promise<void> {
    this.options.transport.stop()
    this.phase = 'logged-out'
  }

  async typing(): Promise<void> {}
}

/** Intents for the foundation: DIRECT_MESSAGE + GROUP_AND_C2C_EVENT. */
const INTENTS = (1 << 12) | (1 << 25)

interface WsFrame {
  readonly op: number
  readonly d?: unknown
  readonly s?: number
  readonly t?: string
}

/**
 * REST+websocket transport (production). Token = `POST /app/getAppAccessToken`
 * (appId + clientSecret); gateway URL = `GET /gateway`; the websocket then
 * authenticates with `QQBot <token>`, heartbeats per the hello interval, and
 * reconnects on session invalidation. Loaded lazily by callers, never by
 * tests (the fake transport replaces it).
 */
export function restTransport(resolveApp: () => { readonly appId: string; readonly clientSecret: string }, log: (message: string) => void): QqTransport {
  let token: string | undefined
  let ws: WebSocket | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let seq: number | null = null
  let stopped = false

  async function accessToken(): Promise<string> {
    if (token) return token
    const { appId, clientSecret } = resolveApp()
    const res = await fetch(`${apiBase()}/app/getAppAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret }),
    })
    const parsed = await res.json() as { readonly access_token?: string }
    if (typeof parsed.access_token !== 'string' || parsed.access_token === '') {
      throw new Error(`qq getAppAccessToken: HTTP ${res.status}`)
    }
    token = parsed.access_token
    return token
  }

  async function call(method: string, path: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `QQBot ${await accessToken()}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`qq ${path}: HTTP ${res.status}`)
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = undefined
  }

  async function open(onEvent: (event: QqEvent) => void, onDisconnected: () => void): Promise<void> {
    const current = await accessToken()
    const gateway = await fetch(`${apiBase()}/gateway`, { headers: { Authorization: `QQBot ${current}` } })
    const parsed = await gateway.json() as { readonly url?: string }
    if (typeof parsed.url !== 'string') throw new Error('qq gateway: no url')
    const socket = new WebSocket(parsed.url)
    ws = socket
    socket.addEventListener('message', (raw: MessageEvent<string>) => {
      const frame = JSON.parse(raw.data) as WsFrame
      if (frame.op === 10) {
        const interval = (frame.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval ?? 41250
        stopHeartbeat()
        heartbeatTimer = setInterval(() => {
          socket.send(JSON.stringify({ op: 1, d: seq }))
        }, interval)
        heartbeatTimer.unref?.()
        socket.send(JSON.stringify({ op: 2, d: { token: `QQBot ${current}`, intents: INTENTS, shard: [0, 1] } }))
        return
      }
      if (frame.op === 11) return
      if (frame.op === 0) {
        if (typeof frame.s === 'number') seq = frame.s
        const event = normalizeQqEvent(frame)
        if (event !== undefined) onEvent(event)
        return
      }
      if (frame.op === 7 || frame.op === 9) {
        log(`qq session invalid (op ${frame.op}) — reconnecting`)
        stopHeartbeat()
        socket.close()
      }
    })
    socket.addEventListener('close', () => {
      if (ws === socket) ws = undefined
      stopHeartbeat()
      if (!stopped) {
        log('qq websocket closed — reconnecting')
        onDisconnected()
      }
    })
    socket.addEventListener('error', () => {
      stopHeartbeat()
      socket.close()
    })
  }

  return {
    id: 'rest',
    start(onEvent, onDisconnected) {
      stopped = false
      void open(onEvent, onDisconnected).catch((error: unknown) => {
        log(`qq transport start failed: ${String(error)}`)
        onDisconnected()
      })
    },
    stop() {
      stopped = true
      stopHeartbeat()
      ws?.close()
      ws = undefined
    },
    async sendText(chatId, text) {
      const target = parseQqChatId(chatId)
      if (!target) throw new Error(`qq: unknown chat id "${chatId}"`)
      // TODO(real-device): group sends need a monotonic msg_seq; the constant
      // keeps the foundation sendable but drops dedupe (per-message msg_id).
      const body = target.kind === 'group'
        ? { msg_type: 0, content: text, msg_seq: 1, msg_id: crypto.randomUUID() }
        : { msg_type: 0, content: text, msg_id: crypto.randomUUID() }
      const path = target.kind === 'dm' ? `/v2/users/${target.id}/messages`
        : target.kind === 'group' ? `/v2/groups/${target.id}/messages`
        : `/channels/${target.id}/messages`
      await call('POST', path, body)
    },
  }
}
