import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import crypto from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import {
  decryptEchoStr,
  decryptWeCom,
  normalizeWeComEvent,
  parseWeComXml,
  WeComAdapter,
  webhookTransport,
  type WeComTransport,
} from '../src/adapters/wecom/wecom.ts'
import type { InboundMessage } from '../src/channel.ts'

const KEY = Buffer.alloc(32, 'k').toString('base64')

/** Mirror of the WeCom encryptor (random16 + len + msg + corpid, PKCS7, AES-CBC). */
function encryptWeCom(msg: string, encodingAESKey: string): string {
  const key = Buffer.from(encodingAESKey, 'base64')
  const random = crypto.randomBytes(16)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(Buffer.byteLength(msg))
  const body = Buffer.concat([random, len, Buffer.from(msg), Buffer.from('corpid')])
  const pad = 16 - (body.length % 16)
  const padded = Buffer.concat([body, Buffer.alloc(pad, pad)])
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

const fakeCredentials = {
  readRecord: async () => ({ kind: 'grant', payload: { webhookUrl: 'http://127.0.0.1:1/cgi-bin/webhook/send', encodingAESKey: KEY } }),
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as never

class FakeTransport implements WeComTransport {
  readonly id = 'fake'
  started = false
  stopped = false
  readonly sent: { chatId: string; text: string }[] = []
  private onEvent: ((message: InboundMessage) => void) | undefined
  private onDisconnected: (() => void) | undefined

  start(onEvent: (message: InboundMessage) => void, onDisconnected: () => void): void {
    this.started = true
    this.onEvent = onEvent
    this.onDisconnected = onDisconnected
  }
  stop(): void { this.stopped = true }
  async sendText(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text })
  }

  emit(message: InboundMessage): void { this.onEvent?.(message) }
  disconnect(): void { this.onDisconnected?.() }
}

function makeAdapter(): { adapter: WeComAdapter; transport: FakeTransport } {
  const transport = new FakeTransport()
  const adapter = new WeComAdapter({
    credentials: fakeCredentials,
    sessionKey: credentialKey('dsh-reach', 'wecom-webhook'),
    transport,
    log: () => {},
  })
  return { adapter, transport }
}

describe('wecom crypto', () => {
  it('decrypts the AES-256-CBC frame and extracts the inner message', () => {
    const encrypted = encryptWeCom('hello wecom', KEY)
    expect(decryptWeCom(encrypted, KEY)).toBe('hello wecom')
    expect(decryptEchoStr(encrypted, KEY)).toBe('hello wecom')
  })

  it('fails loud on bad keys, short frames, and bad padding', () => {
    const shortKey = Buffer.alloc(16, 'a').toString('base64')
    expect(() => decryptWeCom(encryptWeCom('x', KEY), shortKey)).toThrow(/32 bytes/u)
    expect(() => decryptWeCom('AAAA', KEY)).toThrow()
    const badPad = Buffer.concat([Buffer.alloc(32, 1), Buffer.alloc(16, 17)])
    const key = Buffer.from(KEY, 'base64')
    const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
    cipher.setAutoPadding(false)
    const forged = Buffer.concat([cipher.update(badPad), cipher.final()]).toString('base64')
    expect(() => decryptWeCom(forged, KEY)).toThrow(/padding/u)
  })
})

describe('wecom xml parsing + normalization', () => {
  it('flattens CDATA-wrapped tags and skips nested wrappers', () => {
    const fields = parseWeComXml('<xml><MsgType><![CDATA[text]]></MsgType><ChatId>wr123</ChatId><From><UserId>u1</UserId></From></xml>')
    expect(fields).toEqual({ MsgType: 'text', ChatId: 'wr123', UserId: 'u1' })
  })

  it('normalizes text messages to wc:-prefixed inbound', () => {
    const message = normalizeWeComEvent('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content><ChatId>wr123</ChatId><MsgId>m1</MsgId></xml>')
    expect(message).toMatchObject({ sender: 'wc:wr123', chatId: 'wc:wr123', upstreamId: 'm1' })
    expect(message?.parts[0]).toMatchObject({ type: 'text', text: '你好' })
  })

  it('normalizes template-card button clicks into decision-shaped text', () => {
    const xml = '<xml><MsgType><![CDATA[attachment]]></MsgType><ChatId>wr123</ChatId><MsgId>m2</MsgId><Attachment><CallbackId>cb1</CallbackId><Actions><Value>P1=1</Value></Actions></Attachment></xml>'
    expect(normalizeWeComEvent(xml)?.parts[0]).toMatchObject({ type: 'text', text: 'P1=1' })
  })

  it('drops payloads without a chat id or content', () => {
    expect(normalizeWeComEvent('<xml><MsgType><![CDATA[event]]></MsgType><ChatId>wr123</ChatId></xml>')).toBeUndefined()
    expect(normalizeWeComEvent('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[]]></Content><ChatId>wr123</ChatId></xml>')).toBeUndefined()
    expect(normalizeWeComEvent('<xml><MsgType><![CDATA[text]]></MsgType><Content>x</Content></xml>')).toBeUndefined()
  })
})

describe('wecom adapter (fake transport)', () => {
  it('restores the webhook grant and starts the transport', async () => {
    const { adapter, transport } = makeAdapter()
    const controller = new AbortController()
    adapter.start(controller.signal, () => {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.started).toBe(true)
    expect(adapter.webhook()).toContain('/cgi-bin/webhook/send')
    controller.abort()
  })

  it('passes inbound messages through the transport seam', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({ sender: 'wc:wr123', chatId: 'wc:wr123', parts: [{ type: 'text', text: 'hi' }] })
    expect(messages).toHaveLength(1)
    controller.abort()
  })

  it('sends text through the transport', async () => {
    const { adapter, transport } = makeAdapter()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await adapter.send({ chatId: 'wc:wr123', parts: [{ type: 'text', text: 'hi' }] })
    expect(transport.sent).toEqual([{ chatId: 'wc:wr123', text: 'hi' }])
  })
})

describe('wecom webhook transport (fake server)', () => {
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

  it('posts text messages to the group-robot webhook', async () => {
    const address = server.address() as AddressInfo
    const transport = webhookTransport(() => ({ webhookUrl: `http://127.0.0.1:${address.port}/cgi-bin/webhook/send?key=KEY1` }), () => {})
    await transport.sendText('wc:wr123', '你好企微')
    expect(received).toHaveLength(1)
    expect(received[0]?.url).toContain('/cgi-bin/webhook/send?key=KEY1')
    expect(received[0]?.body).toEqual({ msgtype: 'text', text: { content: '你好企微' } })
  })

  it('surfaces errcode failures', async () => {
    failWith = { errcode: 93000, errmsg: 'invalid webhook url' }
    const address = server.address() as AddressInfo
    const transport = webhookTransport(() => ({ webhookUrl: `http://127.0.0.1:${address.port}/cgi-bin/webhook/send` }), () => {})
    await expect(transport.sendText('wc:wr123', 'x')).rejects.toThrow(/invalid webhook url/u)
  })
})
