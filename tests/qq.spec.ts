import { describe, expect, it } from 'vitest'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import {
  normalizeQqEvent,
  parseQqChatId,
  QqAdapter,
  stripCqTags,
  type QqEvent,
  type QqTransport,
} from '../src/adapters/qq/qq.ts'
import type { InboundMessage } from '../src/channel.ts'

const fakeCredentials = {
  readRecord: async () => ({ kind: 'grant', payload: { appId: 'app1', clientSecret: 'secret1' } }),
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as never

class FakeTransport implements QqTransport {
  readonly id = 'fake'
  started = false
  stopped = false
  readonly sent: { chatId: string; text: string }[] = []
  private onEvent: ((event: QqEvent) => void) | undefined
  private onDisconnected: (() => void) | undefined

  start(onEvent: (event: QqEvent) => void, onDisconnected: () => void): void {
    this.started = true
    this.onEvent = onEvent
    this.onDisconnected = onDisconnected
  }
  stop(): void { this.stopped = true }
  async sendText(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text })
  }

  emit(event: QqEvent): void { this.onEvent?.(event) }
  disconnect(): void { this.onDisconnected?.() }
}

function makeAdapter(): { adapter: QqAdapter; transport: FakeTransport } {
  const transport = new FakeTransport()
  const adapter = new QqAdapter({
    credentials: fakeCredentials,
    sessionKey: credentialKey('dsh-reach', 'qq-app'),
    transport,
    log: () => {},
  })
  return { adapter, transport }
}

describe('qq adapter (fake transport)', () => {
  it('restores the app grant and starts the transport', async () => {
    const { adapter, transport } = makeAdapter()
    const controller = new AbortController()
    adapter.start(controller.signal, () => {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.started).toBe(true)
    expect(adapter.credentials()).toEqual({ appId: 'app1', clientSecret: 'secret1' })
    controller.abort()
  })

  it('normalizes transport events into inbound messages', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({ type: 'message', chatId: 'qq:OPENID1', text: 'hello qq' })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ sender: 'qq:OPENID1', chatId: 'qq:OPENID1' })
    expect(messages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'hello qq' })
    controller.abort()
  })

  it('sends text through the transport', async () => {
    const { adapter, transport } = makeAdapter()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await adapter.send({ chatId: 'qq:g:GROUP1', parts: [{ type: 'text', text: 'hi group' }] })
    expect(transport.sent).toEqual([{ chatId: 'qq:g:GROUP1', text: 'hi group' }])
  })

  it('marks the phase failed on transport disconnect', async () => {
    const { adapter, transport } = makeAdapter()
    const invalid: string[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, () => {}, () => invalid.push('x'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.disconnect()
    expect(invalid).toEqual(['x'])
    expect(adapter.status().phase).toBe('failed')
    controller.abort()
  })
})

describe('qq normalization helpers', () => {
  it('parses channel-normalized chat ids', () => {
    expect(parseQqChatId('qq:OPENID')).toEqual({ kind: 'dm', id: 'OPENID' })
    expect(parseQqChatId('qq:g:GROUP')).toEqual({ kind: 'group', id: 'GROUP' })
    expect(parseQqChatId('qq:c:CHANNEL')).toEqual({ kind: 'channel', id: 'CHANNEL' })
    expect(parseQqChatId('123456')).toBeUndefined()
    expect(parseQqChatId('dt:1')).toBeUndefined()
  })

  it('strips CQ mention tags from message content', () => {
    expect(stripCqTags('<@!12345> 你好 <@#hash>')).toBe('你好')
    expect(stripCqTags('plain text')).toBe('plain text')
  })

  it('normalizes C2C, group-@, and guild-channel dispatches', () => {
    expect(normalizeQqEvent({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { author: { user_openid: 'U1' }, content: 'hi' } }))
      .toMatchObject({ type: 'message', chatId: 'qq:U1', text: 'hi' })
    expect(normalizeQqEvent({ op: 0, t: 'GROUP_AT_MESSAGE_CREATE', d: { group_openid: 'G1', content: '<@!bot> hello' } }))
      .toMatchObject({ type: 'message', chatId: 'qq:g:G1', text: 'hello' })
    expect(normalizeQqEvent({ op: 0, t: 'AT_MESSAGE_CREATE', d: { channel_id: 'C1', content: 'hi' } }))
      .toMatchObject({ type: 'message', chatId: 'qq:c:C1', text: 'hi' })
  })

  it('drops non-dispatch frames and unsupported event types', () => {
    expect(normalizeQqEvent({ op: 1, t: 'C2C_MESSAGE_CREATE', d: { author: { user_openid: 'U1' }, content: 'hi' } })).toBeUndefined()
    expect(normalizeQqEvent({ op: 0, t: 'GUILD_CREATE', d: {} })).toBeUndefined()
    expect(normalizeQqEvent(null)).toBeUndefined()
    expect(normalizeQqEvent({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { author: {}, content: '' } })).toBeUndefined()
  })
})
