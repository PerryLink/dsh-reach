/**
 * WeCom (企业微信) group-robot channel adapter for `dsh-reach` — v2 drop-in
 * foundation. Outbound rides the group-robot webhook; inbound arrives on the
 * callback URL (AES-256-CBC encrypted XML, template-card button clicks
 * included), so this module ships the decrypt + parse helpers and the
 * `WeComTransport` seam — a callback ingress (the harness `webServer` seam)
 * can feed decrypted events in later. Real-device verification is pending
 * (documented).
 *
 * Credentials: the `dsh-reach/wecom-webhook` grant record
 * ({webhookUrl, encodingAESKey?}). Chat ids are channel-normalized as
 * `wc:<chatId>`.
 */

import crypto from 'node:crypto'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'

/** Transport seam: production = the webhook transport; tests = a fake. */
export interface WeComTransport {
  readonly id: string
  start(onEvent: (message: InboundMessage) => void, onDisconnected: () => void): void
  stop(): void
  sendText(chatId: string, text: string): Promise<void>
}

export interface WeComAdapterOptions {
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly transport: WeComTransport
  readonly log: (message: string) => void
}

/** Grant-record payload for the webhook + optional callback AES key. */
export interface WeComWebhookGrant {
  readonly webhookUrl: string
  readonly encodingAESKey: string | undefined
}

/**
 * AES-256-CBC decrypt of the WeCom callback frame (base64 input; key = the
 * base64 encodingAESKey, iv = its first 16 bytes; PKCS7 padding; frame =
 * random16 + msgLen(4, BE) + msg + receiveid). Returns the inner message.
 */
export function decryptWeCom(encrypted: string, encodingAESKey: string): string {
  const key = Buffer.from(encodingAESKey, 'base64')
  if (key.length !== 32) throw new Error('wecom: encodingAESKey must decode to 32 bytes')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const frame = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()])
  if (frame.length < 20) throw new Error('wecom: ciphertext too short')
  const pad = frame[frame.length - 1] ?? 0
  if (pad < 1 || pad > 16) throw new Error('wecom: invalid PKCS7 padding')
  const msgLen = frame.readUInt32BE(16)
  if (20 + msgLen > frame.length - pad) throw new Error('wecom: message length out of frame')
  return frame.subarray(20, 20 + msgLen).toString('utf8')
}

/** Decrypt the URL-verification `echostr` (same AES frame; the inner msg is the reply). */
export function decryptEchoStr(echostr: string, encodingAESKey: string): string {
  return decryptWeCom(echostr, encodingAESKey)
}

/**
 * Minimal WeCom callback XML parser: flattens every `<tag>value</tag>` pair
 * (CDATA unwrapped) into a string map; nested wrappers (`From`, `Attachment`)
 * contribute their leaf fields (`UserId`, `CallbackId`, `Value`) only.
 */
export function parseWeComXml(xml: string): Record<string, string> {
  const clean = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1').replace(/<\?xml[\s\S]*?\?>/u, '')
  const fields: Record<string, string> = {}
  for (const match of clean.matchAll(/<([A-Za-z_][\w.]*)>([^<]*)<\/\1>/gu)) {
    const value = match[2] ?? ''
    if (value !== '') fields[match[1] ?? ''] = value
  }
  return fields
}

/**
 * Normalize a decrypted WeCom callback XML body to an {@link InboundMessage}.
 * Text messages and template-card button clicks (`attachment` with
 * `Attachment.Actions.Value`) both become decision-shaped text inbound.
 */
export function normalizeWeComEvent(xml: string): InboundMessage | undefined {
  const fields = parseWeComXml(xml)
  const chatId = fields['ChatId']
  if (!chatId) return undefined
  const msgType = fields['MsgType']
  let text: string | undefined
  if (msgType === 'text') text = fields['Content']
  else if (msgType === 'attachment') text = fields['Value']
  if (!text) return undefined
  return {
    sender: `wc:${chatId}`,
    chatId: `wc:${chatId}`,
    parts: [{ type: 'text', text }],
    ...(fields['MsgId'] ? { upstreamId: fields['MsgId'] } : {}),
  }
}

export class WeComAdapter implements ChannelAdapter {
  readonly id = 'wecom'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: false }

  private phase: ChannelStatus['phase'] = 'unconfigured'
  private monitorRunning = false
  private lastError: string | undefined
  private webhookUrl = ''
  private readonly ready: Promise<void>

  constructor(private readonly options: WeComAdapterOptions) {
    this.ready = this.restore()
  }

  private async restore(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'grant') {
      const grant = record.payload as Partial<WeComWebhookGrant>
      if (typeof grant.webhookUrl === 'string' && grant.webhookUrl) this.webhookUrl = grant.webhookUrl
    }
    if (this.webhookUrl) this.phase = 'logged-out'
  }

  /** Current effective webhook url (post grant-restore). */
  webhook(): string {
    return this.webhookUrl
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
        (message) => {
          if (!signal.aborted) onMessage(message)
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
    if (!this.webhookUrl) throw new Error('wecom: set the dsh-reach/wecom-webhook grant record (webhookUrl + optional encodingAESKey)')
    this.phase = 'logged-in'
    return 'wecom-webhook'
  }

  async logout(): Promise<void> {
    this.options.transport.stop()
    this.phase = 'logged-out'
  }

  async typing(): Promise<void> {}
}

/**
 * Webhook transport (production): outbound `msgtype: text` posts to the
 * group-robot webhook (one robot = one group, so the chat id carries no
 * endpoint info). Inbound stays silent — feed decrypted callback bodies
 * through {@link normalizeWeComEvent} once a callback ingress is mounted
 * (TODO: webServer route + echostr verification via {@link decryptEchoStr}).
 */
export function webhookTransport(resolveGrant: () => { readonly webhookUrl: string }, log: (message: string) => void): WeComTransport {
  return {
    id: 'webhook',
    start() {
      log('wecom webhook transport started (outbound-only until a callback ingress is mounted)')
    },
    stop() {},
    async sendText(_chatId, text) {
      const res = await fetch(resolveGrant().webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
      })
      const parsed = await res.json() as { readonly errcode?: number; readonly errmsg?: string }
      if (parsed.errcode !== 0 && parsed.errcode !== undefined) {
        throw new Error(`wecom webhook: ${parsed.errmsg ?? `errcode ${parsed.errcode}`}`)
      }
    },
  }
}
