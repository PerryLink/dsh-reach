import { describe, expect, it } from 'vitest'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import {
  decisionTextFromButtonValue,
  FeishuAdapter,
  normalizeSdkEvent,
  parseTextContent,
  renderDecisionCard,
  type LarkEvent,
  type LarkTransport,
} from '../src/adapters/feishu/feishu.ts'
import type { InboundMessage } from '../src/channel.ts'

const fakeCredentials = {
  readRecord: async () => ({ kind: 'grant', payload: { appId: 'cli_test', appSecret: 'secret' } }),
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as never

class FakeTransport implements LarkTransport {
  readonly id = 'fake'
  started = false
  stopped = false
  readonly sent: { receiveIdType: string; receiveId: string; msgType: string; content: string }[] = []
  private onEvent: ((event: LarkEvent) => void) | undefined
  private onDisconnected: (() => void) | undefined

  start(onEvent: (event: LarkEvent) => void, onDisconnected: () => void): void {
    this.started = true
    this.onEvent = onEvent
    this.onDisconnected = onDisconnected
  }
  stop(): void { this.stopped = true }
  async sendMessage(receiveIdType: string, receiveId: string, msgType: string, content: string): Promise<void> {
    this.sent.push({ receiveIdType, receiveId, msgType, content })
  }
  async replyMessage(): Promise<void> {}

  emit(event: LarkEvent): void { this.onEvent?.(event) }
  disconnect(): void { this.onDisconnected?.() }
}

function makeAdapter(): { adapter: FeishuAdapter; transport: FakeTransport } {
  const transport = new FakeTransport()
  const adapter = new FeishuAdapter({
    appId: '',
    appSecret: '',
    requireMention: true,
    credentials: fakeCredentials,
    sessionKey: credentialKey('dsh-reach', 'feishu-app'),
    transport,
    log: () => {},
  })
  return { adapter, transport }
}

describe('feishu adapter (fake transport)', () => {
  it('restores app credentials from the grant record and starts the transport', async () => {
    const { adapter, transport } = makeAdapter()
    const controller = new AbortController()
    adapter.start(controller.signal, () => {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.started).toBe(true)
    expect(adapter.credentials().appId).toBe('cli_test')
    controller.abort()
  })

  it('normalizes text messages into inbound parts', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({
      type: 'message',
      chatId: 'oc_testchat',
      chatType: 'p2p',
      senderId: undefined,
      messageId: 'om_x',
      text: 'hello feishu',
      mentions: undefined,
      buttonValue: undefined,
      botMentioned: undefined,
    })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ sender: 'oc_testchat', chatId: 'oc_testchat' })
    controller.abort()
  })

  it('ignores group messages without an @-mention when requireMention is on', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({
      type: 'message',
      chatId: 'oc_group',
      chatType: 'group',
      senderId: undefined,
      messageId: 'om_y',
      text: 'nobody mentioned the bot',
      mentions: undefined,
      buttonValue: undefined,
      botMentioned: false,
    })
    expect(messages).toHaveLength(0)
    transport.emit({
      type: 'message',
      chatId: 'oc_group',
      chatType: 'group',
      senderId: undefined,
      messageId: 'om_z',
      text: '@bot hello',
      mentions: undefined,
      buttonValue: undefined,
      botMentioned: true,
    })
    expect(messages).toHaveLength(1)
    controller.abort()
  })

  it('maps card button values to decision-shaped inbound text', async () => {
    const { adapter, transport } = makeAdapter()
    const messages: InboundMessage[] = []
    const controller = new AbortController()
    adapter.start(controller.signal, (message) => messages.push(message), () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    transport.emit({
      type: 'card.action',
      chatId: 'oc_testchat',
      chatType: undefined,
      senderId: undefined,
      messageId: undefined,
      text: undefined,
      mentions: undefined,
      buttonValue: 'reach:P3:1',
      botMentioned: undefined,
    })
    expect(messages).toHaveLength(1)
    expect(messages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'P3=1' })
    controller.abort()
  })

  it('renders decision cards with button values and parses them back', () => {
    const card = renderDecisionCard(2, '权限卡', 'bash: run command')
    expect(card).toContain('reach:P2:1')
    expect(card).toContain('reach:P2:2')
    expect(decisionTextFromButtonValue('reach:P2:2')).toBe('P2=2')
    expect(decisionTextFromButtonValue('other')).toBeUndefined()
  })

  it('sends text through the transport as JSON content', async () => {
    const { adapter, transport } = makeAdapter()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await adapter.send({ chatId: 'oc_testchat', parts: [{ type: 'text', text: 'hi' }] })
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({ receiveIdType: 'chat_id', receiveId: 'oc_testchat', msgType: 'text' })
    expect(JSON.parse(transport.sent[0]?.content ?? '{}')).toEqual({ text: 'hi' })
  })
})

describe('feishu event normalization', () => {
  it('parses message events and text content', () => {
    const event = normalizeSdkEvent({
      header: { event_type: 'im.message.receive_v1' },
      event: {
        message: { chat_id: 'oc_x', chat_type: 'p2p', message_id: 'om_1', content: '{"text":"你好"}' },
      },
    })
    expect(event).toMatchObject({ type: 'message', chatId: 'oc_x', text: '你好' })
    expect(parseTextContent('plain')).toBe('plain')
    expect(parseTextContent('{"text":"json"}')).toBe('json')
  })

  it('parses card action events', () => {
    const event = normalizeSdkEvent({
      header: { event_type: 'card.action.trigger' },
      event: { message: { chat_id: 'oc_y' }, action: { value: 'reach:P1=1'.replace('=', ':') } },
    })
    expect(event).toMatchObject({ type: 'card.action', chatId: 'oc_y', buttonValue: 'reach:P1:1' })
  })
})
