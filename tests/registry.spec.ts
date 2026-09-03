import { describe, expect, it, vi } from 'vitest'
import { ChannelRegistry, type ChannelRegistration } from '../src/registry.ts'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, OutboundRequest } from '../src/channel.ts'

function fakeAdapter(id: string): ChannelAdapter {
  return {
    id,
    capabilities: { text: true, image: false, file: false, voice: false, typing: false, cards: false } as ChannelCapabilities,
    status: (): ChannelStatus => ({ phase: 'unconfigured', accountId: undefined, userId: undefined, monitorRunning: false, lastError: undefined }),
    start: () => {},
    send: async (_request: OutboundRequest) => {},
    login: async () => id,
    logout: async () => {},
    typing: async () => {},
  }
}

function entry(id: string, priority: number, ownsChatId: (chatId: string) => boolean, startMonitor?: ChannelRegistration['startMonitor']): ChannelRegistration {
  return { id, adapter: fakeAdapter(id), priority, ownsChatId, ...(startMonitor ? { startMonitor } : {}) }
}

describe('channel registry', () => {
  it('resolves chat ids by priority, first predicate match wins', () => {
    const registry = new ChannelRegistry()
    registry.registerChannel(entry('catch-all', 0, () => true))
    registry.registerChannel(entry('feishu', 2, (chatId) => chatId.startsWith('oc_')))
    registry.registerChannel(entry('qq', 3, (chatId) => chatId.startsWith('qq:')))
    expect(registry.resolve('qq:OPENID')?.id).toBe('qq')
    expect(registry.resolve('oc_test')?.id).toBe('feishu')
    expect(registry.resolve('anything')?.id).toBe('catch-all')
    expect(registry.resolve('dt:1')?.id).toBe('catch-all')
  })

  it('rejects duplicate channel ids', () => {
    const registry = new ChannelRegistry()
    registry.registerChannel(entry('qq', 3, () => false))
    expect(() => registry.registerChannel(entry('qq', 3, () => false))).toThrow(/already registered/u)
  })

  it('unregister removes the channel and returns routing to the next match', () => {
    const registry = new ChannelRegistry()
    registry.registerChannel(entry('catch-all', 0, () => true))
    const dispose = registry.registerChannel(entry('qq', 3, (chatId) => chatId.startsWith('qq:')))
    expect(registry.resolve('qq:1')?.id).toBe('qq')
    dispose()
    expect(registry.resolve('qq:1')?.id).toBe('catch-all')
    dispose() // idempotent
    expect(registry.resolve('qq:1')?.id).toBe('catch-all')
  })

  it('watch fires add/remove events and unsubscribes cleanly', () => {
    const registry = new ChannelRegistry()
    const events: [string, string][] = []
    const stop = registry.watch((watched, event) => events.push([watched.id, event]))
    const dispose = registry.registerChannel(entry('qq', 3, () => false))
    dispose()
    expect(events).toEqual([['qq', 'add'], ['qq', 'remove']])
    stop()
    registry.registerChannel(entry('feishu', 2, () => false))
    expect(events).toHaveLength(2)
  })

  it('startMonitor is stored on the entry (the bridge owns invocation)', () => {
    const dispose = vi.fn()
    const monitor = (): () => void => dispose
    const registry = new ChannelRegistry()
    registry.registerChannel(entry('qq', 3, () => false, monitor))
    expect(registry.get('qq')?.startMonitor).toBe(monitor)
    expect(registry.get('nope')).toBeUndefined()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('list returns priority order', () => {
    const registry = new ChannelRegistry()
    registry.registerChannel(entry('a', 0, () => false))
    registry.registerChannel(entry('c', 5, () => false))
    registry.registerChannel(entry('b', 3, () => false))
    expect(registry.list().map((channel) => channel.id)).toEqual(['c', 'b', 'a'])
  })

  it('startMonitor-typed inbound flows through the registry seam type', () => {
    const registry = new ChannelRegistry()
    const messages: InboundMessage[] = []
    registry.registerChannel(entry('qq', 3, () => false, (handleInbound) => {
      handleInbound({ sender: 'qq:a', chatId: 'qq:a', parts: [{ type: 'text', text: 'hi' }] })
      return () => {}
    }))
    const monitor = registry.get('qq')?.startMonitor
    monitor?.((message) => messages.push(message))
    expect(messages).toHaveLength(1)
    expect(messages[0]?.chatId).toBe('qq:a')
  })
})
