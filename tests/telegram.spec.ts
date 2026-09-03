import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { TelegramAdapter } from '../src/adapters/telegram/telegram.ts'
import type { InboundMessage } from '../src/channel.ts'

/** Scripted fake Telegram Bot API server. */
class FakeTelegram {
  private readonly received: { path: string; body: unknown }[] = []
  readonly server = http.createServer((req, res) => {
    let body = ''
    void (async () => {
      for await (const chunk of req) body += String(chunk)
      const parsed = body ? JSON.parse(body) as Record<string, unknown> : {}
      this.received.push({ path: req.url ?? '', body: parsed })
      const method = (req.url ?? '').split('/').pop()?.split('?')[0]
      const respond = (payload: unknown): void => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (method === 'getMe') return respond({ ok: true, result: { username: 'reach_bot' } })
      if (method === 'sendMessage') return respond({ ok: true, result: { message_id: 1 } })
      if (method === 'deleteWebhook') return respond({ ok: true, result: true })
      if (method === 'getUpdates') return respond({ ok: true, result: this.updates() })
      if (method === 'sendChatAction') return respond({ ok: true, result: true })
      respond({ ok: false, description: 'unknown method' })
    })().catch(() => {
      res.writeHead(500)
      res.end()
    })
  })

  private queued: unknown[] = []
  queue(updates: unknown[]): void {
    this.queued = updates
  }
  private updates(): unknown[] {
    const next = this.queued
    this.queued = []
    return next
  }

  url(): string {
    const address = this.server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}`
  }

  calls(pathPart: string): { path: string; body: unknown }[] {
    return this.received.filter((entry) => entry.path.includes(pathPart))
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())))
  }
}

const fakeCredentials = {
  readRecord: async () => undefined,
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as never

function makeAdapter(token: string): TelegramAdapter {
  return new TelegramAdapter({
    credentials: fakeCredentials,
    sessionKey: credentialKey('dsh-reach', 'telegram-token'),
    configuredToken: token,
    log: () => {},
  })
}

describe('telegram adapter (fake Bot API server)', () => {
  let server: FakeTelegram
  beforeEach(async () => {
    server = new FakeTelegram()
    await new Promise<void>((resolve) => server.server.listen(0, '127.0.0.1', resolve))
    process.env['REACH_TG_BASE'] = server.url()
  })
  afterEach(async () => {
    delete process.env['REACH_TG_BASE']
    await server.close()
  })

  it('polls getUpdates and normalizes text messages', async () => {
    const adapter = makeAdapter('tok')
    server.queue([{ update_id: 7, message: { chat: { id: 12345 }, from: { id: 12345 }, text: 'hello' } }])
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 600))
    controller.abort()
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ sender: '12345', chatId: '12345' })
    expect(messages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'hello' })
    expect(server.calls('deleteWebhook').length).toBe(1)
  })

  it('sends text messages through sendMessage', async () => {
    const adapter = makeAdapter('tok')
    await adapter.login()
    await adapter.send({ chatId: '12345', parts: [{ type: 'text', text: 'hi' }] })
    const sends = server.calls('sendMessage')
    expect(sends).toHaveLength(1)
    expect(sends[0]?.body).toMatchObject({ chat_id: '12345', text: 'hi' })
    expect(adapter.status().accountId).toBe('reach_bot')
  })

  it('is unconfigured without a token', () => {
    const adapter = new TelegramAdapter({
      credentials: fakeCredentials,
      sessionKey: credentialKey('dsh-reach', 'telegram-token'),
      configuredToken: '',
      log: () => {},
    })
    expect(adapter.status().phase).toBe('unconfigured')
  })

  it('sends typing actions', async () => {
    const adapter = makeAdapter('tok')
    await adapter.typing('12345')
    expect(server.calls('sendChatAction').length).toBe(1)
  })
})
