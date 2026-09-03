import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import {
  dingTalkSign,
  DingTalkAdapter,
  normalizeDingTalkEvent,
  webhookTransport,
  type DingTalkEvent,
  type DingTalkTransport,
} from '../src/adapters/dingtalk/dingtalk.ts'
import type { InboundMessage } from '../src/channel.ts'

const fakeCredentials = {
  readRecord: async () => ({ kind: 'grant', payload: { webhookUrl: 'http://127.0.0.1:1/robot/send', secret: 'SEC123' } }),
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as never

class FakeTransport implements DingTalkTransport {
  readonly id = 'fake'
  started = false
  stopped = false
  readonly sent: { chatId: string; text: string }[] = []
  private onEvent: ((event: DingTalkEvent) => void) | undefined
  private onDisconnected: (() => void) | undefined

  start(onEvent: (event: DingTalkEvent) => void, onDisconnected: () => void): void {
    this.started = true
    this.onEvent = onEvent
    this.onDisconnected = onDisconnected
  }
  stop(): void { this.stopped = true }
  async sendText(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text })
  }

  emit(event: DingTalkEvent): void { this.onEvent?.(event) }
  disconnect(): void { this.onDisconnected?.() }
}

function makeAdapter(): { adapter: DingTalkAdapter; transport: FakeTransport } {
  const transport = new FakeTransport()
  const adapter = new DingTalkAdapter({
    credentials: fakeCredentials,
    sessionKey: credentialKey('dsh-reach', 'dingtalk-webhook'),
    transport,
    log: () => {},
  })
  return { adapter, transport }
}

describe('dingtalk adapter (fake transport)', () => {
  it('restores the webhook grant and starts the transport', async () => {
    const { adapter, transport } = makeAdapter()
    const controller = new AbortController()
    adapter.start(controller.signal, () => {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.started).toBe(true)
    expect(adapter.grant().webhookUrl).toContain('/robot/send')
    expect(adapter.grant().secret).toBe('SEC123')
    controller.abort()
  })

  it('normalizes conversation events into dt:-prefixed inbound messages', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({ conversationId: 'cid1', senderStaffId: 's1', text: 'hello dingtalk' })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ sender: 'dt:cid1', chatId: 'dt:cid1' })
    controller.abort()
  })

  it('sends text through the transport', async () => {
    const { adapter, transport } = makeAdapter()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await adapter.send({ chatId: 'dt:cid1', parts: [{ type: 'text', text: 'hi' }] })
    expect(transport.sent).toEqual([{ chatId: 'dt:cid1', text: 'hi' }])
  })
})

describe('dingtalk normalization + signing', () => {
  it('normalizes conversation callback payloads', () => {
    expect(normalizeDingTalkEvent({ conversationId: 'cid1', senderStaffId: 's1', msgtype: 'text', text: { content: 'hello' } }))
      .toMatchObject({ conversationId: 'cid1', senderStaffId: 's1', text: 'hello' })
    expect(normalizeDingTalkEvent({ conversationId: 'cid2', msgtype: 'image' }))
      .toMatchObject({ conversationId: 'cid2', text: undefined })
    expect(normalizeDingTalkEvent({})).toBeUndefined()
    expect(normalizeDingTalkEvent(null)).toBeUndefined()
  })

  it('signs webhook requests with the documented HMAC-SHA256 scheme', () => {
    const timestamp = 1700000000000
    const hmac = createHmac('sha256', 'SEC123')
    hmac.update(`${timestamp}\nSEC123`)
    expect(dingTalkSign(timestamp, 'SEC123')).toBe(encodeURIComponent(hmac.digest('base64')))
  })
})

describe('dingtalk webhook transport (fake server)', () => {
  let server: http.Server
  let received: { url: string; body: unknown }[]
  let failWith: { errcode: number; errmsg: string } | undefined
  beforeEach(async () => {
    received = []
    failWith = undefined
    server = http.createServer((req, res) => {
      let body = ''
      void (async () => {
        for await (const chunk of req) body += String(chunk)
        received.push({ url: req.url ?? '', body: JSON.parse(body) as unknown })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(failWith ?? { errcode: 0, errmsg: 'ok' }))
      })().catch(() => {
        res.writeHead(500)
        res.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it('posts signed text messages to the webhook', async () => {
    const address = server.address() as AddressInfo
    const transport = webhookTransport(() => ({ webhookUrl: `http://127.0.0.1:${address.port}/robot/send?access_token=TOKEN`, secret: 'SEC123' }), () => {})
    await transport.sendText('dt:cid1', '你好钉钉')
    expect(received).toHaveLength(1)
    expect(received[0]?.url).toContain('/robot/send?access_token=TOKEN')
    const url = new URL(received[0]?.url ?? '', 'http://127.0.0.1')
    expect(url.searchParams.get('timestamp')).not.toBeNull()
    const sign = url.searchParams.get('sign')
    const timestamp = Number(url.searchParams.get('timestamp'))
    expect(sign).toBe(dingTalkSign(timestamp, 'SEC123'))
    expect(received[0]?.body).toEqual({ msgtype: 'text', text: { content: '你好钉钉' } })
  })

  it('surfaces errcode failures', async () => {
    failWith = { errcode: 310000, errmsg: 'keyword not in whitelist' }
    const address = server.address() as AddressInfo
    const transport = webhookTransport(() => ({ webhookUrl: `http://127.0.0.1:${address.port}/robot/send` }), () => {})
    await expect(transport.sendText('dt:cid1', 'x')).rejects.toThrow(/keyword not in whitelist/u)
  })
})
