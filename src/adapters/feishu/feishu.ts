/**
 * Feishu/Lark channel adapter for `dsh-reach`.
 *
 * Transport is isolated behind the `LarkTransport` interface so the adapter
 * logic (message normalization, @-mention gating, interactive card buttons →
 * decision-shaped inbound) is unit-testable with a fake transport; the SDK
 * implementation (`sdkTransport`) wraps @larksuiteoapi/node-sdk (WS long
 * connection, no public webhook) and is loaded lazily so tests never touch
 * the SDK. Real-device verification is pending (documented).
 */

import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'

/** Transport seam: production = the Lark WS SDK; tests = a fake. */
export interface LarkTransport {
  readonly id: string
  start(onEvent: (payload: LarkEvent) => void, onDisconnected: () => void): void
  stop(): void
  sendMessage(receiveIdType: string, receiveId: string, msgType: string, content: string): Promise<void>
  replyMessage(messageId: string, msgType: string, content: string): Promise<void>
}

/** The `im.message.receive_v1` v2 event shape we consume. */
export interface LarkEvent {
  readonly type: 'message' | 'card.action'
  readonly chatId: string | undefined
  readonly chatType: string | undefined
  readonly senderId: string | undefined
  readonly messageId: string | undefined
  readonly text: string | undefined
  readonly mentions: readonly string[] | undefined
  readonly buttonValue: string | undefined
  readonly botMentioned: boolean | undefined
}

export interface FeishuAdapterOptions {
  /** App credentials; the dsh-reach/feishu-app grant record overrides both. */
  readonly appId: string
  readonly appSecret: string
  readonly requireMention: boolean
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly transport: LarkTransport
  readonly log: (message: string) => void
}

/** Grant-record payload for the Feishu app credentials. */
export interface FeishuAppGrant {
  readonly appId: string
  readonly appSecret: string
}

/** Build an interactive card with decision buttons (values ride back as `reach:P{n}:<choice>`). */
export function renderDecisionCard(cardNumber: number, title: string, body: string): string {
  const buttons = [
    { text: { content: '允许一次' }, value: `reach:P${cardNumber}:1` },
    { text: { content: '拒绝' }, value: `reach:P${cardNumber}:2` },
  ]
  return JSON.stringify({
    schema: '2.0',
    header: { template: 'blue', title: { content: title } },
    body: { elements: [{ tag: 'div', text: { content: body } }] },
    actions: buttons.map((button) => ({ tag: 'button', text: button.text, value: button.value })),
  })
}

/** Parse a card-button value back into a decision-shaped inbound text. */
export function decisionTextFromButtonValue(value: string): string | undefined {
  const match = /^reach:P(\d+):(1|2)$/u.exec(value)
  if (!match) return undefined
  return `P${match[1]}=${match[2]}`
}

export class FeishuAdapter implements ChannelAdapter {
  readonly id = 'feishu'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: true }

  private phase: ChannelStatus['phase'] = 'unconfigured'
  private monitorRunning = false
  private lastError: string | undefined
  private appId: string
  private appSecret: string
  private readonly ready: Promise<void>

  constructor(private readonly options: FeishuAdapterOptions) {
    this.appId = options.appId
    this.appSecret = options.appSecret
    this.ready = this.restore()
  }

  private async restore(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'grant') {
      const grant = record.payload as Partial<FeishuAppGrant>
      if (typeof grant.appId === 'string' && grant.appId) this.appId = grant.appId
      if (typeof grant.appSecret === 'string' && grant.appSecret) this.appSecret = grant.appSecret
    }
    if (this.appId && this.appSecret) this.phase = 'logged-out'
  }

  /** Current effective app credentials (post grant-restore). */
  credentials(): { readonly appId: string; readonly appSecret: string } {
    return { appId: this.appId, appSecret: this.appSecret }
  }

  status(): ChannelStatus {
    return { phase: this.phase, accountId: undefined, userId: undefined, monitorRunning: this.monitorRunning, lastError: this.lastError }
  }

  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void {
    void this.ready.then(() => {
      if (signal.aborted || !this.appId || !this.appSecret) return
      this.monitorRunning = true
      this.phase = 'logged-in'
      this.options.transport.start(
      (event) => {
        if (signal.aborted) return
        if (event.type === 'card.action' && event.buttonValue !== undefined && event.chatId !== undefined) {
          const text = decisionTextFromButtonValue(event.buttonValue)
          if (text === undefined) return
          onMessage({ sender: event.chatId, chatId: event.chatId, parts: [{ type: 'text', text }] })
          return
        }
        if (event.type !== 'message' || event.chatId === undefined || event.text === undefined) return
        // Group chats: only answer @-mentions when requireMention is on.
        if (event.chatType === 'group' && this.options.requireMention && event.botMentioned !== true) return
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
      const content = JSON.stringify({ text: part.text })
      await this.options.transport.sendMessage('chat_id', request.chatId, 'text', content)
    }
  }

  /** Push an interactive decision card (cards capability; used by the bridge Phase 3). */
  async sendDecisionCard(chatId: string, cardNumber: number, title: string, body: string): Promise<void> {
    const content = renderDecisionCard(cardNumber, title, body)
    await this.options.transport.sendMessage('chat_id', chatId, 'interactive', content)
  }

  async login(): Promise<string> {
    await this.ready
    if (!this.appId || !this.appSecret) throw new Error('feishu: set the dsh-reach/feishu-app grant record (appId + appSecret)')
    this.phase = 'logged-in'
    return this.appId
  }

  async logout(): Promise<void> {
    this.options.transport.stop()
    this.phase = 'logged-out'
  }

  async typing(): Promise<void> {}
}

/**
 * SDK-backed transport: the Lark WS long-connection client. Loaded lazily so
 * the unit tests (fake transport) never import the SDK.
 */
export function sdkTransport(resolveCredentials: () => { readonly appId: string; readonly appSecret: string }, log: (message: string) => void): LarkTransport {
  let ws: { start: (options?: unknown) => void; close: () => void } | undefined
  return {
    id: 'sdk',
    start(onEvent, onDisconnected) {
      void import('@larksuiteoapi/node-sdk').then((sdk) => {
        const client = sdk as unknown as {
          Client: new (options: unknown) => {
            im: { v1: { message: { create: (body: unknown) => Promise<unknown> } } }
          }
          eventDispatcher: { register: (fn: (data: unknown) => void) => unknown }
          ws: { Client: new (options: unknown) => { start: (options?: unknown) => void; close: () => void } }
        }
        client.eventDispatcher.register((data: unknown) => {
          const event = normalizeSdkEvent(data)
          if (event !== undefined) onEvent(event)
        })
        const creds = resolveCredentials()
        ws = new client.ws.Client({ appId: creds.appId, appSecret: creds.appSecret, loggerLevel: 0 })
        try {
          ws.start()
          log('feishu ws client started')
        } catch (error: unknown) {
          onDisconnected()
          log(`feishu ws start failed: ${String(error)}`)
        }
      }, (error: unknown) => log(`feishu sdk import failed: ${String(error)}`))
    },
    stop() {
      ws?.close()
    },
    async sendMessage(receiveIdType, receiveId, msgType, content) {
      const sdk = await import('@larksuiteoapi/node-sdk')
      const lark = sdk as unknown as {
        Client: new (options: unknown) => { im: { v1: { message: { create: (body: unknown) => Promise<unknown> } } } }
      }
      const creds = resolveCredentials()
      await new lark.Client({ appId: creds.appId, appSecret: creds.appSecret }).im.v1.message.create({
        params: { receive_id_type: receiveIdType },
        data: { receive_id: receiveId, msg_type: msgType, content },
      })
    },
    async replyMessage(messageId, msgType, content) {
      const sdk = await import('@larksuiteoapi/node-sdk')
      const lark = sdk as unknown as {
        Client: new (options: unknown) => { im: { v1: { message: { reply: (body: unknown) => Promise<unknown> } } } }
      }
      const creds = resolveCredentials()
      await new lark.Client({ appId: creds.appId, appSecret: creds.appSecret }).im.v1.message.reply({
        path: { message_id: messageId },
        data: { msg_type: msgType, content },
      })
    },
  }
}

/** Map a raw SDK event payload to the normalized {@link LarkEvent}. */
export function normalizeSdkEvent(data: unknown): LarkEvent | undefined {
  const payload = (data as { event?: { message?: Record<string, unknown>; sender?: Record<string, unknown>; action?: Record<string, unknown> }; header?: { event_type?: string } }) ?? {}
  const type = payload.header?.event_type
  const message = payload.event?.message
  if (type === 'im.message.receive_v1') {
    const mentions = (message?.['mentions'] as { key?: string }[] | undefined) ?? []
    return {
      type: 'message',
      chatId: typeof message?.['chat_id'] === 'string' ? message['chat_id'] : undefined,
      chatType: typeof message?.['chat_type'] === 'string' ? message['chat_type'] : undefined,
      senderId: undefined,
      messageId: typeof message?.['message_id'] === 'string' ? message['message_id'] : undefined,
      text: parseTextContent(message?.['content']),
      mentions: undefined,
      buttonValue: undefined,
      botMentioned: mentions.some((mention) => mention.key === 'mention_all' || /_BOT_|bot/iu.test(mention.key ?? '')),
    }
  }
  if (type === 'card.action.trigger') {
    const action = payload.event?.action
    return {
      type: 'card.action',
      chatId: typeof message?.['chat_id'] === 'string' ? message['chat_id'] : undefined,
      chatType: undefined,
      senderId: undefined,
      messageId: undefined,
      text: undefined,
      mentions: undefined,
      buttonValue: typeof action?.['value'] === 'string' ? action['value'] : undefined,
      botMentioned: undefined,
    }
  }
  return undefined
}

/** Parse the JSON `{"text":"…"}` content of a Feishu message. */
export function parseTextContent(content: unknown): string | undefined {
  if (typeof content !== 'string') return undefined
  try {
    const parsed = JSON.parse(content) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text : undefined
  } catch {
    return content
  }
}
