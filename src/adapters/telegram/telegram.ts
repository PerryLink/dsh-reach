/**
 * Telegram channel adapter for `dsh-reach`: fetch-based Bot API long
 * polling, zero SDK dependencies. Validates the `ChannelAdapter` contract
 * for a second channel (interactive inline buttons are a follow-up TODO;
 * cards remain text on this channel for now).
 *
 * Token resolution: the credentials grant record
 * `dsh-reach/telegram-token` wins; the row config `telegramToken` is the
 * fallback for quick setups (documented as less private than credentials).
 */

import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'

/** Bot API base; `REACH_TG_BASE` lets tests point at a fake server. */
function apiBase(): string {
  return process.env['REACH_TG_BASE'] ?? 'https://api.telegram.org'
}

export interface TelegramAdapterOptions {
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly configuredToken: string
  readonly log: (message: string) => void
}

interface TelegramUpdate {
  readonly update_id: number
  readonly message?: {
    readonly chat?: { readonly id: number }
    readonly from?: { readonly id: number }
    readonly text?: string
  }
  readonly callback_query?: {
    readonly message?: { readonly chat?: { readonly id: number } }
    readonly data?: string
  }
}

export class TelegramAdapter implements ChannelAdapter {
  readonly id = 'telegram'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: true, cards: false }

  private token: string | undefined
  private phase: ChannelStatus['phase'] = 'unconfigured'
  private accountId: string | undefined
  private monitorRunning = false
  private lastError: string | undefined
  private offset = 0
  /** Settles when the token restore (credentials read) completed. */
  private readonly ready: Promise<void>

  constructor(private readonly options: TelegramAdapterOptions) {
    this.ready = this.restoreToken()
  }

  private async restoreToken(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'api-key' && record.key) {
      this.token = record.key
      this.phase = 'logged-in'
      void this.getMe().then((username) => { this.accountId = username }).catch(() => {})
      return
    }
    if (this.options.configuredToken) {
      this.token = this.options.configuredToken
      this.phase = 'logged-in'
      void this.getMe().then((username) => { this.accountId = username }).catch(() => {})
      return
    }
    this.phase = 'unconfigured'
  }

  private async call(method: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    const token = this.token
    if (!token) throw new Error('telegram: no token configured')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const parsed = (await res.json()) as { ok: boolean; description?: string; result?: Record<string, unknown> }
      if (!parsed.ok) {
        if (res.status === 401 || res.status === 409) {
          this.phase = 'failed'
          this.lastError = parsed.description ?? `HTTP ${res.status}`
        }
        throw new Error(`telegram ${method}: ${parsed.description ?? `HTTP ${res.status}`}`)
      }
      return parsed.result ?? {}
    } finally {
      clearTimeout(timer)
    }
  }

  private async getMe(): Promise<string> {
    const result = await this.call('getMe', {})
    return typeof result['username'] === 'string' ? result['username'] : ''
  }

  status(): ChannelStatus {
    return {
      phase: this.phase,
      accountId: this.accountId,
      userId: undefined,
      monitorRunning: this.monitorRunning,
      lastError: this.lastError,
    }
  }

  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void {
    void this.ready.then(() => {
      if (!this.token || signal.aborted) return
      this.monitorRunning = true
      void this.run(signal, onMessage, onSessionInvalid).finally(() => {
        this.monitorRunning = false
      })
    })
  }

  private async run(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): Promise<void> {
    try {
      await this.call('deleteWebhook', {}, 10_000)
    } catch {
      // best effort: another poller may already own updates
    }
    while (!signal.aborted) {
      try {
        const result = await this.call('getUpdates', {
          timeout: 25,
          offset: this.offset,
          allowed_updates: ['message', 'callback_query'],
        }, 30_000)
        // `call()` already unwraps the Telegram `ok.result` envelope.
        const updates = result as unknown as TelegramUpdate[] | undefined
        for (const update of updates ?? []) {
          this.offset = update.update_id + 1
          const chat = update.message?.chat ?? update.callback_query?.message?.chat
          if (!chat) continue
          const chatId = String(chat.id)
          const text = update.message?.text ?? update.callback_query?.data
          if (text === undefined) continue
          this.phase = 'logged-in'
          this.lastError = undefined
          onMessage({ sender: chatId, chatId, parts: [{ type: 'text', text }] })
        }
      } catch (error: unknown) {
        if (signal.aborted) return
        const message = String(error)
        if (this.phase === 'failed') {
          this.options.log(`telegram session invalid: ${message}`)
          onSessionInvalid()
          return
        }
        this.options.log(`telegram getUpdates error: ${message}`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }

  async send(request: OutboundRequest): Promise<void> {
    await this.ready
    for (const part of request.parts) {
      if (part.type !== 'text') continue
      const chunks = chunkFor(part.text, 4000)
      for (const chunk of chunks) {
        await this.call('sendMessage', { chat_id: request.chatId, text: chunk })
      }
    }
  }

  async login(): Promise<string> {
    await this.ready
    if (!this.token) throw new Error('telegram: set telegramToken in the reach config row (or the dsh-reach/telegram-token credential)')
    const username = await this.getMe()
    this.phase = 'logged-in'
    this.accountId = username
    return username
  }

  async logout(): Promise<void> {
    await this.ready
    await this.options.credentials.deleteRecord(this.options.sessionKey)
    this.token = undefined
    this.accountId = undefined
    this.phase = 'logged-out'
  }

  async typing(chatId: string): Promise<void> {
    await this.ready
    await this.call('sendChatAction', { chat_id: chatId, action: 'typing' }, 10_000)
  }
}

/** Split text into telegram-sized chunks (4096 chars) on newline boundaries. */
function chunkFor(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut <= 0) cut = limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks
}
