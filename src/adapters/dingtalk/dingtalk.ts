/**
 * DingTalk group-robot channel adapter for `dsh-reach` — v2 drop-in
 * foundation. Outbound rides the custom-bot webhook (HMAC-SHA256 signing when
 * a secret is configured); inbound webhook-only robots receive through the
 * conversation callback URL, which needs a public ingress (the harness
 * `webServer` seam), so the `DingTalkTransport` seam carries inbound events
 * and a stream/app transport can drop in later. Real-device verification is
 * pending (documented).
 *
 * Credentials: the `dsh-reach/dingtalk-webhook` grant record
 * ({webhookUrl, secret?}). Chat ids are channel-normalized as
 * `dt:<conversationId>`.
 */

import crypto from 'node:crypto'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'

/** Transport seam: production = the webhook transport; tests = a fake. */
export interface DingTalkTransport {
  readonly id: string
  start(onEvent: (event: DingTalkEvent) => void, onDisconnected: () => void): void
  stop(): void
  sendText(chatId: string, text: string): Promise<void>
}

/** Normalized inbound event (conversation callback body, decoded). */
export interface DingTalkEvent {
  readonly conversationId: string | undefined
  readonly senderStaffId: string | undefined
  readonly text: string | undefined
}

export interface DingTalkAdapterOptions {
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly transport: DingTalkTransport
  readonly log: (message: string) => void
}

/** Grant-record payload for the webhook + optional signing secret. */
export interface DingTalkWebhookGrant {
  readonly webhookUrl: string
  readonly secret: string | undefined
}

/** Sign one webhook request: base64(HmacSHA256(`${timestamp}\n${secret}`)). */
export function dingTalkSign(timestamp: number, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(`${timestamp}\n${secret}`)
  return encodeURIComponent(hmac.digest('base64'))
}

/**
 * Normalize a conversation-callback payload to a {@link DingTalkEvent}. The
 * callback body shape: `{conversationId, senderStaffId, msgtype, text:
 * {content}, at: {...}}`.
 */
export function normalizeDingTalkEvent(payload: unknown): DingTalkEvent | undefined {
  const body = payload as {
    readonly conversationId?: string
    readonly senderStaffId?: string
    readonly msgtype?: string
    readonly text?: { readonly content?: string }
  } | null
  if (!body || typeof body.conversationId !== 'string') return undefined
  const text = body.msgtype === 'text' && typeof body.text?.content === 'string' ? body.text.content : undefined
  return {
    conversationId: body.conversationId,
    senderStaffId: typeof body.senderStaffId === 'string' ? body.senderStaffId : undefined,
    text,
  }
}

export class DingTalkAdapter implements ChannelAdapter {
  readonly id = 'dingtalk'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: false }

  private phase: ChannelStatus['phase'] = 'unconfigured'
  private monitorRunning = false
  private lastError: string | undefined
  private webhookUrl = ''
  private secret: string | undefined
  private readonly ready: Promise<void>

  constructor(private readonly options: DingTalkAdapterOptions) {
    this.ready = this.restore()
  }

  private async restore(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'grant') {
      const grant = record.payload as Partial<DingTalkWebhookGrant>
      if (typeof grant.webhookUrl === 'string' && grant.webhookUrl) this.webhookUrl = grant.webhookUrl
      if (typeof grant.secret === 'string' && grant.secret) this.secret = grant.secret
    }
    if (this.webhookUrl) this.phase = 'logged-out'
  }

  /** Current effective grant (post restore): webhook + optional signing secret. */
  grant(): { readonly webhookUrl: string; readonly secret?: string } {
    return { webhookUrl: this.webhookUrl, ...(this.secret ? { secret: this.secret } : {}) }
  }

  status(): ChannelStatus {
    return { phase: this.phase, accountId: undefined, userId: undefined, monitorRunning: this.monitorRunning, lastError: this.lastError }
  }

  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void {
    void this.ready.then(() => {
      if (signal.aborted || !this.webhookUrl) return
      this.monitorRunning = true
      this.phase = 'logged-in'
      this.options.transport.start(
        (event) => {
          if (signal.aborted || event.conversationId === undefined || event.text === undefined) return
          onMessage({ sender: `dt:${event.conversationId}`, chatId: `dt:${event.conversationId}`, parts: [{ type: 'text', text: event.text }] })
        },
        () => {
          this.phase = 'failed'
          this.lastError = 'callback disconnected'
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
    if (!this.webhookUrl) throw new Error('dingtalk: set the dsh-reach/dingtalk-webhook grant record (webhookUrl + optional secret)')
    this.phase = 'logged-in'
    return 'dingtalk-webhook'
  }

  async logout(): Promise<void> {
    this.options.transport.stop()
    this.phase = 'logged-out'
  }

  async typing(): Promise<void> {}
}

/**
 * Webhook transport (production): outbound `msgtype: text` posts to the
 * robot webhook (signed when a secret is set). Inbound stays silent — the
 * conversation callback needs a public ingress (TODO: webServer route).
 */
export function webhookTransport(resolveGrant: () => { readonly webhookUrl: string; readonly secret?: string }, log: (message: string) => void): DingTalkTransport {
  return {
    id: 'webhook',
    start() {
      log('dingtalk webhook transport started (outbound-only until a callback ingress is mounted)')
    },
    stop() {},
    async sendText(_chatId, text) {
      const grant = resolveGrant()
      const base = new URL(grant.webhookUrl)
      if (grant.secret) {
        const timestamp = Date.now()
        base.searchParams.set('timestamp', String(timestamp))
        base.searchParams.set('sign', dingTalkSign(timestamp, grant.secret))
      }
      const res = await fetch(base.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
      })
      const parsed = await res.json() as { readonly errcode?: number; readonly errmsg?: string }
      if (parsed.errcode !== 0 && parsed.errcode !== undefined) {
        throw new Error(`dingtalk webhook: ${parsed.errmsg ?? `errcode ${parsed.errcode}`}`)
      }
    },
  }
}
